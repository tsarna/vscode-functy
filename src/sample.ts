import * as vscode from 'vscode';

const SAMPLE = `// A tiny functy program to explore. Try the walkthrough commands on it:
// Run File, Check File, Evaluate Selection, and the Testing panel.

const greeting = "world"

func add(a: number, b: number) -> number {
    return a + b
}

func greet(name: string = greeting) -> string {
    return "hello \${name}"
}

func main() -> number {
    return add(2, 3)
}

test "add sums two numbers" {
    assert(add(2, 3) == 5)
}

test "greet uses the default" {
    assert(greet() == "hello world")
}
`;

/**
 * Open a ready-made sample `.cty` file. When a workspace is open, write it there
 * (once; never overwriting an existing file) so Run/Check/Test have a real file
 * to work with; otherwise open it as an untitled document.
 */
export async function openSample(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    const uri = vscode.Uri.joinPath(folder.uri, 'functy-example.cty');
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(SAMPLE, 'utf8'));
    }
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    return;
  }
  const doc = await vscode.workspace.openTextDocument({ language: 'functy', content: SAMPLE });
  await vscode.window.showTextDocument(doc);
}
