import * as vscode from 'vscode';
import {
  checkBuffer,
  checkDocument,
  checkFile,
  checkWorkspace,
  formatWorkspace,
  runFile,
  runFileWithArgs,
} from './commands';
import { checkOnSave, checkOnType } from './config';
import { evaluateSelection, registerEvaluate } from './evaluate';
import { formattingProvider } from './formatter';
import { registerReplLifecycle, sendToRepl, startRepl } from './repl';
import { openSample } from './sample';
import { symbolProvider } from './symbols';
import { registerTasks } from './tasks';
import { createTestController } from './testController';
import { checkBinaryVersion } from './version';

const CHECK_ON_TYPE_DEBOUNCE_MS = 350;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('functy');
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand('functy.run', () => runFile(diagnostics)),
    vscode.commands.registerCommand('functy.runWithArgs', () => runFileWithArgs(diagnostics)),
    vscode.commands.registerCommand('functy.check', () => checkFile(diagnostics)),
    vscode.commands.registerCommand('functy.checkWorkspace', () => checkWorkspace(diagnostics)),
    vscode.commands.registerCommand('functy.formatWorkspace', () => formatWorkspace()),
    vscode.commands.registerCommand('functy.evaluateSelection', () => evaluateSelection()),
    vscode.commands.registerCommand('functy.formatDocument', () =>
      vscode.commands.executeCommand('editor.action.formatDocument'),
    ),
    vscode.commands.registerCommand('functy.startRepl', () => startRepl()),
    vscode.commands.registerCommand('functy.sendToRepl', () => sendToRepl()),
    vscode.commands.registerCommand('functy.openSample', () => openSample()),
    vscode.languages.registerDocumentFormattingEditProvider('functy', formattingProvider),
    vscode.languages.registerDocumentSymbolProvider('functy', symbolProvider),
  );
  registerReplLifecycle(context);
  registerEvaluate(context);
  registerTasks(context);

  // --- Diagnostics lifecycle -------------------------------------------------
  // checkOnType (opt-in): live single-buffer diagnostics as you type, debounced,
  //   fed to `functy check --json -` on stdin (no save). Cross-file references are
  //   not resolved (single buffer), which is why it is opt-in.
  // Otherwise: check/run diagnostics are one-shot and go stale on edit, so clear
  //   them on change; a fresh set comes from checkOnSave or manual Check/Run.
  const debounce = new Map<string, NodeJS.Timeout>();
  const cancelPending = (key: string) => {
    const t = debounce.get(key);
    if (t) {
      clearTimeout(t);
      debounce.delete(key);
    }
  };

  const checkOpenBuffers = () => {
    if (!checkOnType()) {
      return;
    }
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'functy') {
        void checkBuffer(doc, diagnostics);
      }
    }
  };
  checkOpenBuffers();

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === 'functy' && checkOnType()) {
        void checkBuffer(doc, diagnostics);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId !== 'functy' || e.contentChanges.length === 0) {
        return;
      }
      const key = e.document.uri.toString();
      if (checkOnType()) {
        cancelPending(key);
        debounce.set(
          key,
          setTimeout(() => {
            debounce.delete(key);
            void checkBuffer(e.document, diagnostics);
          }, CHECK_ON_TYPE_DEBOUNCE_MS),
        );
      } else {
        diagnostics.delete(e.document.uri); // stale
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.languageId === 'functy') {
        cancelPending(doc.uri.toString());
        diagnostics.delete(doc.uri);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      // On-type already keeps diagnostics current; only save-check when it's off.
      if (doc.languageId === 'functy' && checkOnSave() && !checkOnType()) {
        void checkDocument(doc.uri, diagnostics, { silent: true });
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('functy.checkOnType')) {
        checkOpenBuffers();
      }
    }),
  );

  createTestController(context);

  // Verify the functy binary on startup, and again if its path is reconfigured.
  void checkBinaryVersion();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('functy.path')) {
        void checkBinaryVersion();
      }
    }),
  );
}

export function deactivate(): void {}
