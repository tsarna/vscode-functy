import * as vscode from 'vscode';
import { cwdFor, functyPath } from './config';

let replTerminal: vscode.Terminal | undefined;

/** Clear our reference when the REPL terminal is closed by the user. */
export function registerReplLifecycle(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => {
      if (t === replTerminal) {
        replTerminal = undefined;
      }
    }),
  );
}

/** Double-quote a command-line token (robust across bash/zsh/pwsh/cmd for paths). */
function dq(s: string): string {
  return `"${s}"`;
}

/**
 * Get the existing REPL terminal, or create one running `functy repl [file]`.
 * The command runs in a shell (so PATH resolves `functy`), but on POSIX it is
 * `exec`'d so the shell is replaced by the REPL and the terminal ends when the
 * REPL exits rather than dropping the user at a leftover prompt.
 */
function ensureRepl(loadFile?: vscode.Uri): vscode.Terminal {
  // Reuse only a live REPL; if its process already exited, start fresh.
  if (replTerminal && replTerminal.exitStatus === undefined) {
    return replTerminal;
  }
  if (replTerminal) {
    replTerminal.dispose();
    replTerminal = undefined;
  }

  const term = vscode.window.createTerminal({
    name: 'functy REPL',
    cwd: loadFile?.scheme === 'file' ? cwdFor(loadFile) : undefined,
  });
  replTerminal = term;

  let cmd = `${dq(functyPath())} repl`;
  if (loadFile?.scheme === 'file') {
    cmd += ` ${dq(loadFile.fsPath)}`;
  }
  // `exec` (POSIX) replaces the shell so the terminal closes with the REPL.
  term.sendText(process.platform === 'win32' ? cmd : `exec ${cmd}`);
  return term;
}

/** Command: start a fresh functy REPL, loading the active .cty file if there is one. */
export async function startRepl(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const file = editor?.document.languageId === 'functy' ? editor.document.uri : undefined;
  if (editor && file) {
    await editor.document.save();
  }
  // "Start" means fresh: replace any existing REPL so it reflects the current file.
  if (replTerminal) {
    replTerminal.dispose();
    replTerminal = undefined;
  }
  ensureRepl(file).show();
}

/** Command: send the selection (or the current line) to the functy REPL. */
export async function sendToRepl(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'functy') {
    vscode.window.showErrorMessage('functy: no active .cty file.');
    return;
  }
  const sel = editor.selection;
  const text = (
    sel.isEmpty ? editor.document.lineAt(sel.active.line).text : editor.document.getText(sel)
  ).trim();
  if (!text) {
    return;
  }

  // Creating the REPL loads the active file; save it first so its context is current.
  if (!replTerminal) {
    await editor.document.save();
  }
  const term = ensureRepl(editor.document.uri);
  term.show(true); // keep focus in the editor
  term.sendText(text, true);
}
