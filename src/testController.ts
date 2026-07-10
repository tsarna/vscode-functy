import * as path from 'path';
import * as vscode from 'vscode';
import { cwdFor, runFuncty } from './config';
import { escapeRegex, JsonRange, zeroBased } from './protocol';
import { symbolsForDocument, symbolsForPath } from './symbolsClient';

/** Shape of `functy test --json` output. */
interface JsonReport {
  tests: JsonTest[];
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    deselected: number;
  };
}
interface JsonTest {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  location?: JsonRange;
  skip_reason?: string;
  failure?: {
    message: string;
    detail?: string;
    location?: JsonRange;
  };
}

function rangeFrom(loc: JsonRange | undefined): vscode.Range | undefined {
  if (!loc) {
    return undefined;
  }
  const z = zeroBased(loc);
  return new vscode.Range(z.line, z.column, z.endLine, z.endColumn);
}

export function createTestController(context: vscode.ExtensionContext): vscode.TestController {
  const controller = vscode.tests.createTestController('functy', 'functy');
  context.subscriptions.push(controller);

  /** Get or create the file-level TestItem for a .cty document. */
  function fileItem(uri: vscode.Uri): vscode.TestItem {
    const id = uri.toString();
    let item = controller.items.get(id);
    if (!item) {
      item = controller.createTestItem(id, vscode.workspace.asRelativePath(uri), uri);
      item.canResolveChildren = false;
      controller.items.add(item);
    }
    return item;
  }

  /**
   * Sync a file's TestItems from its `test` symbols (from `functy symbols`). IDs
   * embed the line so two tests with the same description don't collapse into one.
   */
  function updateFileTests(uri: vscode.Uri, tests: { name: string; range: JsonRange }[]): void {
    if (tests.length === 0) {
      controller.items.delete(uri.toString());
      return;
    }
    const file = fileItem(uri);
    const seen = new Set<string>();
    for (const t of tests) {
      const z = zeroBased(t.range);
      const id = `${uri.toString()}::${z.line}:${t.name}`;
      let item = file.children.get(id);
      if (!item) {
        item = controller.createTestItem(id, t.name, uri);
        file.children.add(item);
      } else {
        item.label = t.name;
      }
      item.range = new vscode.Range(z.line, z.column, z.endLine, z.endColumn);
      seen.add(id);
    }
    const stale: string[] = [];
    file.children.forEach((c) => {
      if (!seen.has(c.id)) {
        stale.push(c.id);
      }
    });
    stale.forEach((id) => file.children.delete(id));
  }

  /** Discover tests in an open (possibly unsaved) document via its buffer. */
  async function discoverInDocument(document: vscode.TextDocument): Promise<void> {
    const syms = await symbolsForDocument(document);
    updateFileTests(
      document.uri,
      syms.filter((s) => s.kind === 'test'),
    );
  }

  /** Discover tests in a file on disk. */
  async function discoverInFileUri(uri: vscode.Uri): Promise<void> {
    if (uri.scheme !== 'file') {
      return;
    }
    const dir = cwdFor(uri) ?? path.dirname(uri.fsPath);
    const syms = await symbolsForPath(dir, uri.fsPath);
    updateFileTests(
      uri,
      syms.filter((s) => s.kind === 'test'),
    );
  }

  // Lazy full-workspace discovery: one `functy symbols .` per folder.
  controller.resolveHandler = async (item) => {
    if (item) {
      return;
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const cwd = folder.uri.fsPath;
      const syms = await symbolsForPath(cwd, '.');
      const byFile = new Map<string, { name: string; range: JsonRange }[]>();
      for (const s of syms) {
        if (s.kind !== 'test') {
          continue;
        }
        const abs = path.resolve(cwd, s.range.file);
        const arr = byFile.get(abs) ?? [];
        arr.push(s);
        byFile.set(abs, arr);
      }
      for (const [abs, tests] of byFile) {
        updateFileTests(vscode.Uri.file(abs), tests);
      }
    }
  };

  // Discover in open editors now, and keep in sync (debounced on change, since
  // each discovery spawns functy).
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'functy') {
      void discoverInDocument(doc);
    }
  }
  const debounce = new Map<string, NodeJS.Timeout>();
  const scheduleDoc = (document: vscode.TextDocument) => {
    const key = document.uri.toString();
    const prev = debounce.get(key);
    if (prev) {
      clearTimeout(prev);
    }
    debounce.set(
      key,
      setTimeout(() => {
        debounce.delete(key);
        void discoverInDocument(document);
      }, 400),
    );
  };
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === 'functy') {
        void discoverInDocument(doc);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'functy') {
        scheduleDoc(e.document);
      }
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.cty');
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate((uri) => void discoverInFileUri(uri)),
    watcher.onDidChange((uri) => {
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      if (open) {
        void discoverInDocument(open);
      } else {
        void discoverInFileUri(uri);
      }
    }),
    watcher.onDidDelete((uri) => controller.items.delete(uri.toString())),
  );

  async function runRequest(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const run = controller.createTestRun(request);

    // Collect the leaf test items to run.
    const leaves: vscode.TestItem[] = [];
    const collect = (item: vscode.TestItem) => {
      if (item.children.size > 0) {
        item.children.forEach(collect);
      } else {
        leaves.push(item);
      }
    };
    if (request.include) {
      request.include.forEach(collect);
    } else {
      controller.items.forEach(collect);
    }
    const excluded = new Set((request.exclude ?? []).map((i) => i.id));
    const toRun = leaves.filter((t) => !excluded.has(t.id));

    // Group by file.
    const byFile = new Map<string, { uri: vscode.Uri; items: vscode.TestItem[] }>();
    for (const t of toRun) {
      if (!t.uri) {
        continue;
      }
      const key = t.uri.toString();
      const g = byFile.get(key) ?? { uri: t.uri, items: [] };
      g.items.push(t);
      byFile.set(key, g);
    }

    for (const { uri, items } of byFile.values()) {
      if (token.isCancellationRequested) {
        break;
      }
      items.forEach((i) => run.started(i));

      const fileNode = controller.items.get(uri.toString());
      const totalInFile = fileNode ? fileNode.children.size : items.length;
      const partial = items.length < totalInFile;

      const args = ['test', '--json'];
      if (partial) {
        const alt = items.map((i) => escapeRegex(i.label)).join('|');
        args.push('--run', `^(${alt})$`);
      }
      args.push(uri.fsPath);

      let report: JsonReport | undefined;
      let stdout = '';
      try {
        const res = await runFuncty(args, { cwd: cwdFor(uri), token });
        stdout = res.stdout;
        // The --json report goes to stderr (functy 0.8.1+); stdout carries any
        // println()/program output from the tests, which must not corrupt parsing.
        report = JSON.parse(res.stderr) as JsonReport;
      } catch (err) {
        const message = new vscode.TestMessage(
          stdout.trim() || `functy test failed: ${(err as Error).message}`,
        );
        items.forEach((i) => run.errored(i, message));
        continue;
      }

      const results = new Map<string, JsonTest>();
      for (const t of report.tests) {
        results.set(t.name, t);
      }

      // The Test Results view renders as a terminal and needs CRLF line endings.
      const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

      // Surface any println()/program output the tests produced (stdout in 0.8.1+).
      if (stdout.trim()) {
        run.appendOutput(crlf(stdout.replace(/\n$/, '') + '\n'));
      }

      for (const item of items) {
        const t = results.get(item.label);
        if (!t) {
          // Not in the report — most likely a compilation failure (empty tests).
          // The test report carries no diagnostics; run "functy: Check File" for them.
          run.errored(
            item,
            new vscode.TestMessage(
              'test did not run (compilation failed?) — run "functy: Check File" for diagnostics',
            ),
          );
          run.appendOutput(crlf(`⨯ ${item.label}: did not run\n`), undefined, item);
          continue;
        }
        const ms = t.duration_ms.toFixed(2);
        if (t.status === 'passed') {
          run.passed(item, t.duration_ms);
          run.appendOutput(crlf(`✔ ${item.label} (${ms} ms)\n`), undefined, item);
        } else if (t.status === 'skipped') {
          run.skipped(item);
          const reason = t.skip_reason ? ` — ${t.skip_reason}` : '';
          run.appendOutput(crlf(`⊘ ${item.label} — skipped${reason}\n`), undefined, item);
        } else {
          const detail = t.failure?.detail
            ? `${t.failure.message}\n\n${t.failure.detail}`
            : t.failure?.message ?? 'test failed';
          const msg = new vscode.TestMessage(detail);
          const range = rangeFrom(t.failure?.location);
          if (range) {
            msg.location = new vscode.Location(uri, range);
          }
          run.failed(item, msg, t.duration_ms);
          run.appendOutput(
            crlf(`✘ ${item.label} (${ms} ms): ${t.failure?.message ?? 'test failed'}\n`),
            range ? new vscode.Location(uri, range) : undefined,
            item,
          );
        }
      }
    }

    run.end();
  }

  /**
   * Dispatch a run: a normal one-shot, or — for a continuous run — re-run the
   * affected tests whenever a `.cty` file is saved, until the run is cancelled.
   * `functy test` reads files from disk, so watching disk changes (saves) is the
   * correct trigger, and per-file test runs mean a file's own change is enough.
   */
  async function runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    if (!request.continuous) {
      await runRequest(request, token);
      return;
    }

    const wanted = request.include ? new Set(request.include.map((i) => i.id)) : undefined;
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.cty');

    const onChange = async (uri: vscode.Uri) => {
      if (token.isCancellationRequested) {
        return;
      }
      // Refresh discovery for the changed file, then re-run its tests.
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      if (open) {
        await discoverInDocument(open);
      } else {
        await discoverInFileUri(uri);
      }
      const fileNode = controller.items.get(uri.toString());
      if (!fileNode) {
        return;
      }
      const items: vscode.TestItem[] = [];
      fileNode.children.forEach((c) => {
        if (!wanted || wanted.has(c.id) || wanted.has(fileNode.id)) {
          items.push(c);
        }
      });
      if (items.length > 0) {
        await runRequest(new vscode.TestRunRequest(items, request.exclude, request.profile), token);
      }
    };

    watcher.onDidChange(onChange);
    watcher.onDidCreate(onChange);
    token.onCancellationRequested(() => watcher.dispose());
    context.subscriptions.push(watcher);
  }

  controller.createRunProfile(
    'Run',
    vscode.TestRunProfileKind.Run,
    runHandler,
    true,
    undefined,
    true, // supportsContinuousRun
  );

  return controller;
}
