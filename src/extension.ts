import * as vscode from 'vscode';
import { checkDocument, checkFile, runFile } from './commands';
import { checkOnSave } from './config';
import { formattingProvider } from './formatter';
import { symbolProvider } from './symbols';
import { createTestController } from './testController';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('functy');
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand('functy.run', () => runFile(diagnostics)),
    vscode.commands.registerCommand('functy.check', () => checkFile(diagnostics)),
    vscode.commands.registerCommand('functy.formatDocument', () =>
      vscode.commands.executeCommand('editor.action.formatDocument'),
    ),
    vscode.languages.registerDocumentFormattingEditProvider('functy', formattingProvider),
    vscode.languages.registerDocumentSymbolProvider('functy', symbolProvider),
  );

  // Diagnostics from check/run are computed one-shot and become stale as soon as
  // the text changes (their ranges no longer line up). Clear them on edit; a fresh
  // set is produced on the next save (if checkOnSave) or manual Check/Run.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'functy' && e.contentChanges.length > 0) {
        diagnostics.delete(e.document.uri);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.languageId === 'functy') {
        diagnostics.delete(doc.uri);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'functy' && checkOnSave()) {
        void checkDocument(doc.uri, diagnostics, { silent: true });
      }
    }),
  );

  createTestController(context);
}

export function deactivate(): void {}
