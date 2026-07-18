import * as vscode from 'vscode';
import { FunctySymbol, JsonRange, groupByNamespace, zeroBased } from './protocol';
import { symbolsForDocument } from './symbolsClient';

const KIND: Record<string, vscode.SymbolKind | undefined> = {
  func: vscode.SymbolKind.Function,
  // An extern is a function declaration too — bodiless, describing one the HOST
  // provides. It carries a signature like any func, so symbolDetail tags it.
  extern: vscode.SymbolKind.Function,
  const: vscode.SymbolKind.Constant,
  var: vscode.SymbolKind.Variable,
  type: vscode.SymbolKind.Interface,
  test: vscode.SymbolKind.Method,
  namespace: vscode.SymbolKind.Namespace,
};

/**
 * Map a functy symbol kind to a vscode.SymbolKind, tolerating one we don't know.
 *
 * This must never return undefined. `new vscode.DocumentSymbol(...)` validates
 * its arguments and throws on a missing kind, and a throw here takes down the
 * whole outline for the file — so a newer functy emitting a kind this extension
 * predates would blank the Outline view entirely rather than degrade. The
 * fallback keeps an unknown declaration visible, just generically typed.
 */
function symbolKind(kind: string): vscode.SymbolKind {
  return KIND[kind] ?? vscode.SymbolKind.Object;
}

/** Convert a 1-based functy range to a 0-based vscode.Range. */
function toRange(r: JsonRange): vscode.Range {
  const z = zeroBased(r);
  return new vscode.Range(z.line, z.column, z.endLine, z.endColumn);
}

/**
 * The outline's secondary text: the signature when there is one, else the kind.
 *
 * Two tags are prefixed because VS Code renders neither on its own and both
 * change what the declaration *is*:
 *   - `private` — a namespace-local declaration; the leading `_` alone is easy to
 *     miss in a long list.
 *   - `extern` — a declaration of a function the HOST provides. It carries a
 *     signature just like a `func`, so without this tag it would be
 *     indistinguishable from one that is actually defined in the file.
 */
function symbolDetail(s: FunctySymbol): string {
  const base = s.detail ?? s.kind;
  const tags = [s.private ? 'private' : null, s.kind === 'extern' ? 'extern' : null].filter(
    Boolean,
  );
  return tags.length ? `${tags.join(' ')} ${base}` : base;
}

/**
 * Nest each namespace's declarations under it (grouping by {@link groupByNamespace}),
 * so breadcrumbs and sticky scroll carry the namespace while you scroll through a
 * function body — the fact that matters, since a namespace changes the registered
 * name of every function in the file. Files with no namespace declaration stay
 * flat, exactly as before.
 *
 * The only vscode-specific part: a parent's range must CONTAIN its children's, or
 * the tree renders wrong. A namespace declaration's own range is just its line, so
 * the node is widened to span the declarations it takes as children.
 */
function nest(
  symbols: FunctySymbol[],
  built: vscode.DocumentSymbol[],
): vscode.DocumentSymbol[] {
  return groupByNamespace(symbols).map(({ index, children }) => {
    const parent = built[index];
    for (const c of children) {
      const child = built[c];
      parent.children.push(child);
      if (child.range.end.isAfter(parent.range.end)) {
        parent.range = new vscode.Range(parent.range.start, child.range.end);
      }
    }
    return parent;
  });
}

/**
 * Outline / document symbols backed by `functy symbols --json` — authoritative
 * kind, name, signature, and full range straight from the parser (parse errors
 * are tolerated, so it keeps working mid-edit). The selection range is the name
 * token, located on the definition's first line.
 *
 * The label is the *bare* name (`name`), not the qualified one: the namespace is
 * already the node you are sitting under, so repeating it on every entry is noise.
 * Private declarations are shown — an outline should reflect the whole file — and
 * marked in the detail text.
 */
export const symbolProvider: vscode.DocumentSymbolProvider = {
  async provideDocumentSymbols(
    document: vscode.TextDocument,
  ): Promise<vscode.DocumentSymbol[]> {
    const symbols = await symbolsForDocument(document);
    const built = symbols.map((s) => {
      const range = toRange(s.range);
      const line = document.lineAt(range.start.line).text;
      const col = line.indexOf(s.name, range.start.character);
      const selection =
        col >= 0
          ? new vscode.Range(range.start.line, col, range.start.line, col + s.name.length)
          : new vscode.Range(range.start, range.start);
      return new vscode.DocumentSymbol(
        s.name,
        symbolDetail(s),
        symbolKind(s.kind),
        range,
        selection,
      );
    });
    return nest(symbols, built);
  },
};
