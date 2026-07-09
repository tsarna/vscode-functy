import * as vscode from 'vscode';
import { cwdFor, outputChannel, runFuncty } from './config';

/** Inline "⟹ result" shown after the evaluated line; cleared when the user moves on. */
const decorationType = vscode.window.createTextEditorDecorationType({
  after: { margin: '0 0 0 1.5rem' },
});
let decoratedEditor: vscode.TextEditor | undefined;

function clearDecoration(): void {
  decoratedEditor?.setDecorations(decorationType, []);
  decoratedEditor = undefined;
}

/** Collapse a value to a single, length-bounded line for the inline hint. */
function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > 100 ? flat.slice(0, 99) + '…' : flat;
}

function show(editor: vscode.TextEditor, line: number, text: string, isError: boolean): void {
  clearDecoration();
  const end = editor.document.lineAt(line).range.end;
  editor.setDecorations(decorationType, [
    {
      range: new vscode.Range(end, end),
      renderOptions: {
        after: {
          contentText: `  ⟹  ${text}`,
          color: new vscode.ThemeColor(isError ? 'errorForeground' : 'editorCodeLens.foreground'),
          fontStyle: 'italic',
        },
      },
    },
  ]);
  decoratedEditor = editor;
}

/** One entry of a functy `--json` diagnostics report. */
interface JsonDiag {
  severity: string;
  summary: string;
  detail?: string;
}

/** Command: evaluate the selection (or current line) via `functy eval` and show the result. */
export async function evaluateSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'functy') {
    vscode.window.showErrorMessage('functy: no active .cty file.');
    return;
  }
  const sel = editor.selection;
  const range = sel.isEmpty ? editor.document.lineAt(sel.active.line).range : sel;
  const expr = editor.document.getText(range).trim();
  if (!expr) {
    return;
  }

  // Evaluate against the on-disk file so its functions/consts are in scope.
  await editor.document.save();
  const uri = editor.document.uri;
  const args = ['eval', '--json', expr];
  if (uri.scheme === 'file') {
    args.push(uri.fsPath);
  }

  let res;
  try {
    res = await runFuncty(args, { cwd: cwdFor(uri) });
  } catch (err) {
    vscode.window.showErrorMessage(`functy: ${(err as Error).message}`);
    return;
  }

  const out = outputChannel();
  const line = range.end.line;

  if (res.code === 0) {
    const result = res.stdout.replace(/\n$/, '').trim() || 'null';
    out.appendLine(`⟹ ${expr}`);
    out.appendLine(result);
    show(editor, line, oneLine(result), false);
    return;
  }

  // Error: the --json report is on stderr. Surface the first diagnostic.
  let message = res.stderr.trim();
  try {
    const parsed = JSON.parse(res.stderr) as { diagnostics: JsonDiag[] };
    const d = parsed.diagnostics?.[0];
    if (d) {
      message = d.detail ? `${d.summary} — ${d.detail}` : d.summary;
    }
  } catch {
    /* not JSON (e.g. an old functy without `eval`); show raw stderr */
  }
  out.appendLine(`⟹ ${expr}`);
  out.appendLine(`error: ${message}`);
  out.show(true);
  show(editor, line, `error: ${oneLine(message)}`, true);
}

/** Register listeners that clear the inline result when the user edits or moves the cursor. */
export function registerEvaluate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    decorationType,
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === decoratedEditor) {
        clearDecoration();
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (decoratedEditor && e.document === decoratedEditor.document) {
        clearDecoration();
      }
    }),
  );
}
