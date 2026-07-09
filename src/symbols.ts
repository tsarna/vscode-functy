import * as vscode from 'vscode';

/**
 * Blank out comments, string interiors, and heredoc bodies line by line while
 * preserving every character position (blanked spans become spaces of equal
 * length). The result lets us detect declarations and match braces without being
 * fooled by `{`/keywords that live inside a comment or string. Column and line
 * indices in the cleaned text map 1:1 onto the original.
 */
interface CleanState {
  inBlock: boolean;
  heredocTag: string | null;
}

function cleanLine(line: string, state: CleanState): string {
  if (state.heredocTag !== null) {
    if (line.trim() === state.heredocTag) {
      state.heredocTag = null;
    }
    return ' '.repeat(line.length);
  }

  let out = '';
  let k = 0;
  while (k < line.length) {
    if (state.inBlock) {
      const end = line.indexOf('*/', k);
      if (end < 0) {
        out += ' '.repeat(line.length - k);
        k = line.length;
      } else {
        out += ' '.repeat(end + 2 - k);
        k = end + 2;
        state.inBlock = false;
      }
      continue;
    }

    const two = line.substr(k, 2);
    if (two === '//') {
      out += ' '.repeat(line.length - k);
      break;
    }
    if (line[k] === '#') {
      out += ' '.repeat(line.length - k);
      break;
    }
    if (two === '/*') {
      out += '  ';
      k += 2;
      state.inBlock = true;
      continue;
    }
    if (line[k] === '"') {
      out += ' ';
      k++;
      while (k < line.length) {
        if (line[k] === '\\') {
          out += k + 1 < line.length ? '  ' : ' ';
          k += 2;
          continue;
        }
        if (line[k] === '"') {
          out += ' ';
          k++;
          break;
        }
        out += ' ';
        k++;
      }
      continue;
    }
    const hd = /^<<-?([A-Za-z_]\w*)/.exec(line.slice(k));
    if (hd) {
      out += ' '.repeat(hd[0].length);
      k += hd[0].length;
      state.heredocTag = hd[1];
      continue;
    }
    out += line[k];
    k++;
  }
  return out;
}

/** Net brace depth change on a cleaned line. */
function braceDelta(clean: string): number {
  let d = 0;
  for (const ch of clean) {
    if (ch === '{') {
      d++;
    } else if (ch === '}') {
      d--;
    }
  }
  return d;
}

/**
 * Find the line index where the block opened at `startLine` closes (depth returns
 * to zero). Falls back to the last line if the block is unterminated.
 */
function blockEndLine(clean: string[], startLine: number): number {
  let depth = 0;
  let started = false;
  for (let i = startLine; i < clean.length; i++) {
    for (const ch of clean[i]) {
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') {
        depth--;
      }
    }
    if (started && depth <= 0) {
      return i;
    }
  }
  return clean.length - 1;
}

/** Decode a functy/HCL double-quoted string body (common escapes only). */
function unescape(s: string): string {
  return s.replace(/\\(["\\nrt])/g, (_m, c) => {
    switch (c) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return c;
    }
  });
}

const FUNC_RE = /^(\s*)func\s+([A-Za-z_]\w*)/;
const CONST_RE = /^(\s*)const\s+([A-Za-z_]\w*)/;
const VAR_RE = /^(\s*)var\s+([A-Za-z_]\w*)/;
const TYPE_RE = /^(\s*)type\s+([A-Za-z_]\w*)/;
const TEST_RE = /^(\s*)test\s+/;

function symbol(
  name: string,
  detail: string,
  kind: vscode.SymbolKind,
  range: vscode.Range,
  selection: vscode.Range,
): vscode.DocumentSymbol {
  return new vscode.DocumentSymbol(name, detail, kind, range, selection);
}

export const symbolProvider: vscode.DocumentSymbolProvider = {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const lines = document.getText().split(/\r?\n/);
    const state: CleanState = { inBlock: false, heredocTag: null };
    const clean = lines.map((l) => cleanLine(l, state));

    const symbols: vscode.DocumentSymbol[] = [];
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
      const c = clean[i];
      const original = lines[i];

      // Only top-level declarations (depth 0 before this line's braces) are surfaced.
      if (depth === 0) {
        // Locate the name *after* the keyword so short names (e.g. `f`) don't
        // match a letter inside the keyword itself.
        const nameRange = (afterKeyword: number, name: string): vscode.Range => {
          const start = original.indexOf(name, afterKeyword);
          const col = start >= 0 ? start : afterKeyword;
          return new vscode.Range(i, col, i, col + name.length);
        };

        let m: RegExpExecArray | null;
        if ((m = FUNC_RE.exec(c))) {
          const name = m[2];
          const end = blockEndLine(clean, i);
          const nameStart = original.indexOf(name, m[1].length + 4);
          const sig = signatureAfter(c, original, (nameStart >= 0 ? nameStart : m[1].length + 4) + name.length);
          symbols.push(
            symbol(
              name,
              sig,
              vscode.SymbolKind.Function,
              new vscode.Range(i, 0, end, lines[end].length),
              nameRange(m[1].length + 4, name),
            ),
          );
        } else if ((m = TEST_RE.exec(c))) {
          const desc = /^(\s*)test\s+"((?:[^"\\]|\\.)*)"/.exec(original);
          const name = desc ? unescape(desc[2]) : 'test';
          const end = blockEndLine(clean, i);
          const q = original.indexOf('"');
          const sel =
            q >= 0
              ? new vscode.Range(i, q, i, original.indexOf('"', q + 1) + 1 || original.length)
              : new vscode.Range(i, 0, i, original.length);
          symbols.push(
            symbol(
              name,
              'test',
              vscode.SymbolKind.Method,
              new vscode.Range(i, 0, end, lines[end].length),
              sel,
            ),
          );
        } else if ((m = CONST_RE.exec(c))) {
          symbols.push(
            symbol(
              m[2],
              'const',
              vscode.SymbolKind.Constant,
              new vscode.Range(i, 0, i, original.length),
              nameRange(m[1].length + 5, m[2]),
            ),
          );
        } else if ((m = VAR_RE.exec(c))) {
          symbols.push(
            symbol(
              m[2],
              'var',
              vscode.SymbolKind.Variable,
              new vscode.Range(i, 0, i, original.length),
              nameRange(m[1].length + 3, m[2]),
            ),
          );
        } else if ((m = TYPE_RE.exec(c))) {
          symbols.push(
            symbol(
              m[2],
              'type',
              vscode.SymbolKind.Interface,
              new vscode.Range(i, 0, i, original.length),
              nameRange(m[1].length + 4, m[2]),
            ),
          );
        }
      }

      depth += braceDelta(c);
      if (depth < 0) {
        depth = 0;
      }
    }

    return symbols;
  },
};

/**
 * Best-effort function signature for the outline detail: the text from after the
 * name up to the body's opening brace, but only when that brace is on the same
 * line (multi-line signatures are left blank to avoid a giant detail string).
 */
function signatureAfter(clean: string, original: string, from: number): string {
  const brace = clean.indexOf('{', from);
  if (brace < 0) {
    return '';
  }
  return original.slice(from, brace).replace(/\s+/g, ' ').trim();
}
