import * as vscode from 'vscode';
import { FunctySymbol, JsonRange, zeroBased } from './protocol';
import { symbolsForDocument } from './symbolsClient';

const KIND: Record<FunctySymbol['kind'], vscode.SymbolKind> = {
  func: vscode.SymbolKind.Function,
  const: vscode.SymbolKind.Constant,
  var: vscode.SymbolKind.Variable,
  type: vscode.SymbolKind.Interface,
  test: vscode.SymbolKind.Method,
};

/** Convert a 1-based functy range to a 0-based vscode.Range. */
function toRange(r: JsonRange): vscode.Range {
  const z = zeroBased(r);
  return new vscode.Range(z.line, z.column, z.endLine, z.endColumn);
}

/**
 * Outline / document symbols backed by `functy symbols --json` — authoritative
 * kind, name, signature, and full range straight from the parser (parse errors
 * are tolerated, so it keeps working mid-edit). The selection range is the name
 * token, located on the definition's first line.
 */
export const symbolProvider: vscode.DocumentSymbolProvider = {
  async provideDocumentSymbols(
    document: vscode.TextDocument,
  ): Promise<vscode.DocumentSymbol[]> {
    const symbols = await symbolsForDocument(document);
    return symbols.map((s) => {
      const range = toRange(s.range);
      const line = document.lineAt(range.start.line).text;
      const col = line.indexOf(s.name, range.start.character);
      const selection =
        col >= 0
          ? new vscode.Range(range.start.line, col, range.start.line, col + s.name.length)
          : new vscode.Range(range.start, range.start);
      return new vscode.DocumentSymbol(s.name, s.detail ?? s.kind, KIND[s.kind], range, selection);
    });
  },
};
