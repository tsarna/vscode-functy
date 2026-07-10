import * as vscode from 'vscode';
import { cwdFor, runFuncty } from './config';

/** A 1-based source range, as emitted by functy's `--json` reports. */
export interface JsonRange {
  file: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
}

/** One symbol from `functy symbols --json`. */
export interface FunctySymbol {
  kind: 'func' | 'const' | 'var' | 'type' | 'test';
  name: string;
  detail?: string;
  doc?: string;
  range: JsonRange;
}

interface SymbolsReport {
  symbols: FunctySymbol[];
}

function parse(stdout: string): FunctySymbol[] {
  try {
    const rep = JSON.parse(stdout) as SymbolsReport;
    return Array.isArray(rep.symbols) ? rep.symbols : [];
  } catch {
    return [];
  }
}

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
    // `symbols` is JSON-only (no --json flag); it reads stdin via `-`.
    const res = await runFuncty(['symbols', '-', '--filename', filename], {
      cwd: cwdFor(uri),
      stdin: document.getText(),
    });
    return parse(res.stdout);
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
    const res = await runFuncty(['symbols', pathArg], { cwd });
    return parse(res.stdout);
  } catch {
    return [];
  }
}
