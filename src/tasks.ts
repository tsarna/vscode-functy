import * as vscode from 'vscode';
import { functyPath } from './config';

interface FunctyTaskDefinition extends vscode.TaskDefinition {
  /** The functy subcommand: check, test, or fmt. */
  command: string;
  /** Extra arguments appended after the subcommand. */
  args?: string[];
}

function task(
  scope: vscode.WorkspaceFolder,
  name: string,
  args: string[],
  group?: vscode.TaskGroup,
): vscode.Task {
  const def: FunctyTaskDefinition = { type: 'functy', command: args[0], args: args.slice(1) };
  const exec = new vscode.ProcessExecution(functyPath(), args, { cwd: scope.uri.fsPath });
  const t = new vscode.Task(def, scope, name, 'functy', exec, []);
  if (group) {
    t.group = group;
  }
  return t;
}

/** Register the functy task provider (check / test / fmt over the workspace). */
export function registerTasks(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider('functy', {
      provideTasks(): vscode.Task[] {
        const tasks: vscode.Task[] = [];
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
          tasks.push(
            task(folder, 'check', ['check', '.'], vscode.TaskGroup.Build),
            task(folder, 'test', ['test'], vscode.TaskGroup.Test),
            task(folder, 'fmt (check)', ['fmt', '-l', '.']),
            task(folder, 'fmt (write)', ['fmt', '-w', '.']),
          );
        }
        return tasks;
      },
      resolveTask(t: vscode.Task): vscode.Task | undefined {
        const def = t.definition as FunctyTaskDefinition;
        if (!def.command) {
          return undefined;
        }
        const args = [def.command, ...(def.args ?? [])];
        const scope =
          t.scope && typeof t.scope === 'object' ? (t.scope as vscode.WorkspaceFolder) : undefined;
        const exec = new vscode.ProcessExecution(
          functyPath(),
          args,
          scope ? { cwd: scope.uri.fsPath } : undefined,
        );
        return new vscode.Task(
          def,
          t.scope ?? vscode.TaskScope.Workspace,
          t.name || def.command,
          'functy',
          exec,
          [],
        );
      },
    }),
  );
}
