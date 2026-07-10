import * as vscode from 'vscode';
import { cwdFor, runFuncty } from './config';
import { FunctySymbol, parseSymbols } from './protocol';

// Re-exported so existing importers can keep sourcing these from symbolsClient.
export type { FunctySymbol, JsonRange } from './protocol';

/**
 * Symbols for a single document, checked from its (possibly unsaved) buffer via
 * `functy symbols --json - --filename`. Returns [] on any failure — callers treat
 * an empty result as "no symbols right now".
 */
export async function symbolsForDocument(
  document: vscode.TextDocument,
): Promise<FunctySymbol[]> {
  const uri = document.uri;
  const filename = uri.scheme === 'file' ? uri.fsPath : 'buffer.cty';
  try {
    const res = await runFuncty(['symbols', '--json', '-', '--filename', filename], {
      cwd: cwdFor(uri),
      stdin: document.getText(),
    });
    return parseSymbols(res.stdout);
  } catch {
    return [];
  }
}

/**
 * Symbols under a path (a file, or a directory / "." for a whole tree), run with
 * the given working directory. Ranges use paths relative to `cwd` for a directory
 * scan, so callers resolve them against `cwd`.
 */
export async function symbolsForPath(cwd: string, pathArg: string): Promise<FunctySymbol[]> {
  try {
    const res = await runFuncty(['symbols', '--json', pathArg], { cwd });
    return parseSymbols(res.stdout);
  } catch {
    return [];
  }
}
