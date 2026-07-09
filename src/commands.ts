import * as vscode from 'vscode';
import { cwdFor, outputChannel, runFunc, runFuncty } from './config';

/** A 1-based source range, as emitted by functy's `--json` reports. */
interface JsonRange {
  file: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
}

/** One entry of a functy `--json` diagnostics report (check / run). */
interface JsonDiagnostic {
  severity: 'error' | 'warning';
  summary: string;
  detail?: string;
  location?: JsonRange;
}

interface JsonDiagnostics {
  diagnostics: JsonDiagnostic[];
}

/** Convert a 1-based functy range to a 0-based vscode.Range (start of file if absent). */
function rangeFrom(loc: JsonRange | undefined): vscode.Range {
  if (!loc) {
    return new vscode.Range(0, 0, 0, 0);
  }
  return new vscode.Range(
    Math.max(0, loc.line - 1),
    Math.max(0, loc.column - 1),
    Math.max(0, loc.end_line - 1),
    Math.max(0, loc.end_column - 1),
  );
}

/** Parse a functy `--json` diagnostics report; null if the text isn't a valid report. */
function parseReport(text: string): JsonDiagnostics | null {
  try {
    const parsed = JSON.parse(text) as JsonDiagnostics;
    return Array.isArray(parsed.diagnostics) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Apply a diagnostics report to the collection: clear the checked file, then set
 * the fresh diagnostics grouped by their own source file (usually just the
 * checked one). Returns the number of diagnostics applied.
 */
function applyReport(
  report: JsonDiagnostics,
  defaultUri: vscode.Uri,
  diagnostics: vscode.DiagnosticCollection,
): number {
  const byUri = new Map<string, vscode.Diagnostic[]>();
  for (const d of report.diagnostics) {
    const targetUri = d.location ? vscode.Uri.file(d.location.file) : defaultUri;
    const message = d.detail ? `${d.summary}\n\n${d.detail}` : d.summary;
    const diag = new vscode.Diagnostic(
      rangeFrom(d.location),
      message,
      d.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error,
    );
    diag.source = 'functy';
    const key = targetUri.toString();
    const arr = byUri.get(key) ?? [];
    arr.push(diag);
    byUri.set(key, arr);
  }

  diagnostics.delete(defaultUri);
  for (const [key, arr] of byUri) {
    diagnostics.set(vscode.Uri.parse(key), arr);
  }
  return report.diagnostics.length;
}

/**
 * Split an argument string into argv tokens, respecting double-quoted spans (so
 * an HCL string argument like `"hello world"` stays one token, quotes preserved
 * because functy evaluates each argument as an HCL expression).
 */
export function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inQuote = false;
  let started = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      if (ch === '\\' && i + 1 < input.length) {
        cur += ch + input[++i];
      } else {
        cur += ch;
        if (ch === '"') {
          inQuote = false;
        }
      }
    } else if (ch === '"') {
      cur += ch;
      inQuote = true;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(cur);
        cur = '';
        started = false;
      }
    } else {
      cur += ch;
      started = true;
    }
  }
  if (started) {
    tokens.push(cur);
  }
  return tokens;
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

  const report = parseReport(res.stderr);
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
  const report = parseReport(res.stderr);
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
