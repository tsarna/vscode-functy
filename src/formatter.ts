import * as vscode from 'vscode';
import { cwdFor, runFuncty } from './config';

/**
 * Document formatter backed by `functy fmt -` (stdin -> stdout). On a parse
 * error the CLI writes nothing to stdout and exits non-zero; in that case we
 * return no edits so the document is left untouched rather than blanked.
 */
export const formattingProvider: vscode.DocumentFormattingEditProvider = {
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
  ): Promise<vscode.TextEdit[]> {
    let res;
    try {
      res = await runFuncty(['fmt', '-'], {
        cwd: cwdFor(document.uri),
        stdin: document.getText(),
      });
    } catch (err) {
      vscode.window.showErrorMessage(`functy: ${(err as Error).message}`);
      return [];
    }

    if (res.code !== 0 || res.stdout.length === 0) {
      // Parse error (or empty output) — do not touch the document.
      return [];
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    );
    return [vscode.TextEdit.replace(fullRange, res.stdout)];
  },
};
