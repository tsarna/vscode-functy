import * as path from 'path';
import * as vscode from 'vscode';
import { cwdFor, outputChannel, runFunc, runFuncty } from './config';
import {
  JsonDiagnostic,
  JsonDiagnostics,
  JsonRange,
  parseDiagnostics,
  tokenizeArgs,
  zeroBased,
} from './protocol';

export { tokenizeArgs };

/** Convert a 1-based functy range to a 0-based vscode.Range (start of file if absent). */
function rangeFrom(loc: JsonRange | undefined): vscode.Range {
  if (!loc) {
    return new vscode.Range(0, 0, 0, 0);
  }
  const z = zeroBased(loc);
  return new vscode.Range(z.line, z.column, z.endLine, z.endColumn);
}

/** Build a vscode.Diagnostic from a functy report entry. */
function toDiagnostic(d: JsonDiagnostic): vscode.Diagnostic {
  const message = d.detail ? `${d.summary}\n\n${d.detail}` : d.summary;
  const diag = new vscode.Diagnostic(
    rangeFrom(d.location),
    message,
    d.severity === 'warning'
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Error,
  );
  diag.source = 'functy';
  return diag;
}

/**
 * Apply a diagnostics report to the collection: clear the checked file, then set
 * the fresh diagnostics grouped by their own source file (usually just the
 * checked one). Location paths are resolved relative to `baseDir` when given.
 * Returns the number of diagnostics applied.
 */
function applyReport(
  report: JsonDiagnostics,
  defaultUri: vscode.Uri,
  diagnostics: vscode.DiagnosticCollection,
  baseDir?: string,
): number {
  const byUri = new Map<string, vscode.Diagnostic[]>();
  for (const d of report.diagnostics) {
    const targetUri = d.location
      ? vscode.Uri.file(baseDir ? path.resolve(baseDir, d.location.file) : d.location.file)
      : defaultUri;
    const key = targetUri.toString();
    const arr = byUri.get(key) ?? [];
    arr.push(toDiagnostic(d));
    byUri.set(key, arr);
  }

  diagnostics.delete(defaultUri);
  for (const [key, arr] of byUri) {
    diagnostics.set(vscode.Uri.parse(key), arr);
  }
  return report.diagnostics.length;
}

/** The workspace folder of the active editor, or the first workspace folder. */
function activeWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const f = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (f) {
      return f;
    }
  }
  return vscode.workspace.workspaceFolders?.[0];
}

/** Run the active document via `functy run --json`, optionally with a chosen entry + args. */
async function runProgram(
  diagnostics: vscode.DiagnosticCollection,
  opts: { func?: string; args?: string[] } = {},
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'functy') {
    vscode.window.showErrorMessage('functy: no active .cty file to run.');
    return;
  }
  await editor.document.save();

  const uri = editor.document.uri;
  const file = uri.fsPath;
  const fn = opts.func ?? runFunc();
  const args = ['run', '--func', fn, '--json', file];
  if (opts.args && opts.args.length > 0) {
    args.push('--', ...opts.args);
  }

  const out = outputChannel();
  out.clear();
  out.show(true);
  out.appendLine(`$ functy ${args.join(' ')}`);

  let res;
  try {
    // With --json, the entry function's result + program output go to stdout;
    // any diagnostics go to stderr as a machine-readable report.
    res = await runFuncty(args, { cwd: cwdFor(uri) });
  } catch (err) {
    vscode.window.showErrorMessage(`functy: ${(err as Error).message}`);
    return;
  }

  if (res.stdout.trim()) {
    out.appendLine(res.stdout.replace(/\n$/, ''));
  }

  if (res.code === 0) {
    diagnostics.delete(uri);
    out.appendLine('\n[exit 0]');
    return;
  }

  const report = parseDiagnostics(res.stderr);
  if (report) {
    const n = applyReport(report, uri, diagnostics);
    out.appendLine(`\n[exit ${res.code}] — ${n} diagnostic${n === 1 ? '' : 's'} (see Problems)`);
  } else {
    // Not a JSON report (unexpected) — surface the raw stderr.
    if (res.stderr.trim()) {
      out.appendLine(res.stderr.replace(/\n$/, ''));
    }
    out.appendLine(`\n[exit ${res.code}]`);
  }
}

/** Run the active document's entry function via `functy run --json`. */
export function runFile(diagnostics: vscode.DiagnosticCollection): Promise<void> {
  return runProgram(diagnostics);
}

/** Prompt for an entry function and arguments, then run. */
export async function runFileWithArgs(diagnostics: vscode.DiagnosticCollection): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'functy') {
    vscode.window.showErrorMessage('functy: no active .cty file to run.');
    return;
  }

  const func = await vscode.window.showInputBox({
    title: 'functy: Run with Arguments (1/2)',
    prompt: 'Entry function to call',
    value: runFunc(),
    ignoreFocusOut: true,
  });
  if (func === undefined) {
    return; // cancelled
  }

  const argStr = await vscode.window.showInputBox({
    title: 'functy: Run with Arguments (2/2)',
    prompt: 'Arguments as HCL expressions, space-separated (e.g. 2 3 or "alice")',
    placeHolder: '2 3',
    ignoreFocusOut: true,
  });
  if (argStr === undefined) {
    return; // cancelled
  }

  await runProgram(diagnostics, {
    func: func.trim() || runFunc(),
    args: tokenizeArgs(argStr),
  });
}

/**
 * Type-check a document via `functy check --json` and update the Problems panel.
 * When `silent` (e.g. an automatic on-save check), failures to spawn and parse
 * are swallowed and the "check passed" status is suppressed, so it never nags.
 */
export async function checkDocument(
  uri: vscode.Uri,
  diagnostics: vscode.DiagnosticCollection,
  opts: { silent?: boolean } = {},
): Promise<void> {
  let res;
  try {
    res = await runFuncty(['check', '--json', uri.fsPath], { cwd: cwdFor(uri) });
  } catch (err) {
    if (!opts.silent) {
      vscode.window.showErrorMessage(`functy: ${(err as Error).message}`);
    }
    return;
  }

  // The --json report goes to stderr (consistent across check/test/run in functy 0.8.1+).
  const report = parseDiagnostics(res.stderr);
  if (!report) {
    if (opts.silent) {
      return;
    }
    // Should not happen — the report is always well-formed — but fail loudly if it does.
    const out = outputChannel();
    out.clear();
    out.appendLine(res.stderr || res.stdout || 'functy check produced no output');
    out.show(true);
    vscode.window.showErrorMessage('functy: could not parse check output.');
    return;
  }

  const n = applyReport(report, uri, diagnostics);
  if (n === 0 && !opts.silent) {
    vscode.window.setStatusBarMessage('functy: check passed', 3000);
  }
}

/** The Check File command: type-check the active document, with UI feedback. */
export async function checkFile(diagnostics: vscode.DiagnosticCollection): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'functy') {
    vscode.window.showErrorMessage('functy: no active .cty file to check.');
    return;
  }
  await editor.document.save();
  await checkDocument(editor.document.uri, diagnostics, { silent: false });
}

/**
 * Live single-buffer check via `functy check --json - --filename`, feeding the
 * unsaved document text on stdin (no disk write). Silent: used for on-type
 * diagnostics, so spawn/parse failures are swallowed. Only the buffer is checked,
 * so cross-file references are not resolved.
 */
export async function checkBuffer(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
): Promise<void> {
  const uri = document.uri;
  let res;
  try {
    res = await runFuncty(['check', '--json', '-', '--filename', uri.fsPath], {
      cwd: cwdFor(uri),
      stdin: document.getText(),
    });
  } catch {
    return;
  }
  const report = parseDiagnostics(res.stderr);
  if (report) {
    applyReport(report, uri, diagnostics);
  }
}

/** Check every .cty file under the workspace and populate the Problems panel. */
export async function checkWorkspace(diagnostics: vscode.DiagnosticCollection): Promise<void> {
  const folder = activeWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('functy: no workspace folder open.');
    return;
  }
  const cwd = folder.uri.fsPath;
  const out = outputChannel();
  out.clear();
  out.appendLine(`$ functy check --json . (in ${cwd})`);

  let res;
  try {
    res = await runFuncty(['check', '--json', '.'], { cwd });
  } catch (err) {
    vscode.window.showErrorMessage(`functy: ${(err as Error).message}`);
    return;
  }

  const report = parseDiagnostics(res.stderr);
  if (!report) {
    out.appendLine(res.stderr || res.stdout || 'functy check produced no output');
    out.show(true);
    vscode.window.showErrorMessage('functy: could not parse check output.');
    return;
  }

  // Replace the whole collection with the workspace-wide result.
  diagnostics.clear();
  const n = applyReport(report, folder.uri, diagnostics, cwd);
  if (n === 0) {
    vscode.window.showInformationMessage('functy: workspace check passed.');
  } else {
    vscode.window.showWarningMessage(
      `functy: ${n} problem${n === 1 ? '' : 's'} found (see the Problems panel).`,
    );
  }
}

/** Format every .cty file under the workspace in place via `functy fmt -w`. */
export async function formatWorkspace(): Promise<void> {
  const folder = activeWorkspaceFolder();
  if (!folder) {
    vscode.window.showErrorMessage('functy: no workspace folder open.');
    return;
  }
  const cwd = folder.uri.fsPath;
  const out = outputChannel();
  out.clear();
  out.appendLine(`$ functy fmt -w . (in ${cwd})`);

  let res;
  try {
    res = await runFuncty(['fmt', '-w', '.'], { cwd });
  } catch (err) {
    vscode.window.showErrorMessage(`functy: ${(err as Error).message}`);
    return;
  }

  if (res.code === 0) {
    vscode.window.showInformationMessage('functy: workspace formatted.');
  } else {
    out.appendLine(res.stderr.replace(/\n$/, ''));
    out.show(true);
    vscode.window.showErrorMessage('functy: format failed (see the functy output channel).');
  }
}
