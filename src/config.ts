import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

/** Result of running the functy binary. */
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** The configured path to the functy binary (setting `functy.path`). */
export function functyPath(): string {
  return vscode.workspace.getConfiguration('functy').get<string>('path', 'functy');
}

/** The entry function used by the Run command (setting `functy.runFunc`). */
export function runFunc(): string {
  return vscode.workspace.getConfiguration('functy').get<string>('runFunc', 'main');
}

/** Whether to type-check a document automatically on save (setting `functy.checkOnSave`). */
export function checkOnSave(): boolean {
  return vscode.workspace.getConfiguration('functy').get<boolean>('checkOnSave', true);
}

/** Working directory for a run: the document's workspace folder, else its own directory. */
export function cwdFor(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder) {
    return folder.uri.fsPath;
  }
  if (uri.scheme === 'file') {
    return path.dirname(uri.fsPath);
  }
  return undefined;
}

/** The shared output channel for functy command output. */
let channel: vscode.OutputChannel | undefined;
export function outputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('functy');
  }
  return channel;
}

/**
 * Run the functy binary with the given args. Optionally feed `stdin`. When a
 * cancellation `token` is given, the child is killed if the token fires (so a
 * hung test/run can be stopped from the UI). Never rejects for a non-zero exit —
 * inspect `code`. Rejects only if the binary cannot be spawned at all.
 */
export function runFuncty(
  args: string[],
  opts: { cwd?: string; stdin?: string; token?: vscode.CancellationToken } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(functyPath(), args, { cwd: opts.cwd });
    let stdout = '';
    let stderr = '';

    const cancelSub = opts.token?.onCancellationRequested(() => child.kill());

    child.on('error', (err: NodeJS.ErrnoException) => {
      cancelSub?.dispose();
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `Could not find the functy binary (${functyPath()}). ` +
              `Install it with 'go install github.com/tsarna/functy/cmd/functy@latest' ` +
              `or set the 'functy.path' setting.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      cancelSub?.dispose();
      resolve({ code: code ?? 0, stdout, stderr });
    });

    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }
  });
}
