import * as vscode from 'vscode';
import { cwdFor, runFuncty } from './config';

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
interface JsonRange {
  file: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
}

/**
 * Matches a `test "<description>"` declaration at the start of a line, capturing
 * the (possibly escaped) description. The opening brace may be on this line or a
 * following one, so it is not required here.
 */
const TEST_RE = /^[ \t]*test[ \t]+"((?:[^"\\]|\\.)*)"/;
/** A line whose first non-space is a `//` or `#` line comment. */
const LINE_COMMENT_RE = /^[ \t]*(\/\/|#)/;
/** Opens a heredoc: `<<TAG` or `<<-TAG`, capturing the terminator tag. */
const HEREDOC_OPEN_RE = /<<-?([A-Za-z_]\w*)/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Drop a trailing `//` or `#` line comment (best-effort; ignores strings). */
function stripLineComment(line: string): string {
  const slash = line.indexOf('//');
  const hash = line.indexOf('#');
  const idx = [slash, hash].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  return idx === undefined ? line : line.slice(0, idx);
}

/** Decode a functy/HCL double-quoted string body (handles common escapes). */
function unescape(s: string): string {
  return s.replace(/\\(["\\nrt])/g, (_m, c) => {
    switch (c) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return c;
    }
  });
}

function rangeFrom(loc: JsonRange | undefined): vscode.Range | undefined {
  if (!loc) {
    return undefined;
  }
  return new vscode.Range(
    Math.max(0, loc.line - 1),
    Math.max(0, loc.column - 1),
    Math.max(0, loc.end_line - 1),
    Math.max(0, loc.end_column - 1),
  );
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
   * (Re)discover the `test "…"` blocks in a document's text. Scans line by line,
   * tracking block-comment and heredoc regions so a `test "…"` inside a comment
   * or a heredoc/string body is not mistaken for a real declaration.
   */
  function discoverInText(uri: vscode.Uri, text: string): void {
    const file = fileItem(uri);
    const seen = new Set<string>();
    const lines = text.split(/\r?\n/);

    let inBlockComment = false;
    let heredocTag: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      if (heredocTag) {
        if (new RegExp(`^[ \\t]*${heredocTag}[ \\t]*$`).test(line)) {
          heredocTag = null;
        }
        continue;
      }
      if (inBlockComment) {
        const end = line.indexOf('*/');
        if (end < 0) {
          continue;
        }
        // Blank out everything up to and including the close so the rest is scanned.
        line = ' '.repeat(end + 2) + line.slice(end + 2);
        inBlockComment = false;
      }

      const m = LINE_COMMENT_RE.test(line) ? null : TEST_RE.exec(line);
      if (m) {
        const name = unescape(m[1]);
        const id = `${uri.toString()}::${name}`;
        let test = file.children.get(id);
        if (!test) {
          test = controller.createTestItem(id, name, uri);
          file.children.add(test);
        }
        test.range = new vscode.Range(i, 0, i, m[0].length);
        seen.add(id);
      }

      // Update multi-line state from this line for subsequent lines. An unterminated
      // block comment (last `/*` with no following `*/`) opens a region; a heredoc
      // introducer opens one until its tag reappears alone on a line. Ignore a
      // trailing `//`/`#` line comment so its contents can't spuriously open either.
      const code = stripLineComment(line);
      const openBlock = code.lastIndexOf('/*');
      if (openBlock >= 0 && code.indexOf('*/', openBlock) < 0) {
        inBlockComment = true;
      } else {
        const h = HEREDOC_OPEN_RE.exec(code);
        if (h) {
          heredocTag = h[1];
        }
      }
    }
    // Drop tests that no longer exist.
    const stale: string[] = [];
    file.children.forEach((c) => {
      if (!seen.has(c.id)) {
        stale.push(c.id);
      }
    });
    stale.forEach((id) => file.children.delete(id));

    if (file.children.size === 0) {
      controller.items.delete(file.id);
    }
  }

  async function discoverInFile(uri: vscode.Uri): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      discoverInText(uri, Buffer.from(bytes).toString('utf8'));
    } catch {
      /* unreadable — ignore */
    }
  }

  // Lazy full-workspace discovery.
  controller.resolveHandler = async (item) => {
    if (item) {
      return; // file items resolve their children eagerly at discovery time
    }
    const uris = await vscode.workspace.findFiles('**/*.cty', '**/node_modules/**');
    await Promise.all(uris.map(discoverInFile));
  };

  // Keep discovery in sync with open editors.
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'functy') {
      discoverInText(doc.uri, doc.getText());
    }
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === 'functy') {
        discoverInText(doc.uri, doc.getText());
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'functy') {
        discoverInText(e.document.uri, e.document.getText());
      }
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.cty');
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(discoverInFile),
    watcher.onDidChange((uri) => {
      // Prefer the open-document version if any (it's more current).
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      if (open) {
        discoverInText(uri, open.getText());
      } else {
        void discoverInFile(uri);
      }
    }),
    watcher.onDidDelete((uri) => controller.items.delete(uri.toString())),
  );

  async function runHandler(
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

  controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, runHandler, true);

  return controller;
}
