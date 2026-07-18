/**
 * The functy CLI `--json` wire contract and the pure helpers that operate on it.
 *
 * This module deliberately imports **nothing from `vscode`** so its logic can be
 * unit-tested under a plain Node test runner (the vscode API is only available
 * inside the extension host). The vscode-facing modules import these types and
 * helpers and adapt them to `vscode.Range`, `vscode.Diagnostic`, etc.
 */

/** A 1-based source range, as emitted by functy's `--json` reports. */
export interface JsonRange {
  file: string;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
}

/** One entry of a functy `--json` diagnostics report (check / run). */
export interface JsonDiagnostic {
  severity: 'error' | 'warning';
  summary: string;
  detail?: string;
  location?: JsonRange;
}

export interface JsonDiagnostics {
  diagnostics: JsonDiagnostic[];
}

/**
 * One symbol from `functy symbols --json`.
 *
 * `kind` is open-ended by design: a newer functy may emit a kind this extension
 * has never heard of, and that must never break the outline. Consumers resolve it
 * through a lookup with a fallback rather than a total record — see symbols.ts.
 */
export type FunctySymbolKind =
  | 'func'
  | 'extern'
  | 'const'
  | 'var'
  | 'type'
  | 'test'
  | 'namespace';

export interface FunctySymbol {
  kind: FunctySymbolKind | (string & {});
  /** The bare declared name, as written (may start with `_`). */
  name: string;
  /**
   * The declaration's namespace, e.g. "acme::math". Absent in the global
   * namespace, and absent entirely from a functy older than namespaces.
   */
  namespace?: string;
  /**
   * The name a function is callable under, e.g. "acme::math::double". Absent in
   * the global namespace, where it would merely repeat `name`.
   */
  qualified?: string;
  /** True for a `_`-prefixed declaration: namespace-local, never seen by the host. */
  private?: boolean;
  detail?: string;
  doc?: string;
  range: JsonRange;
}

export interface SymbolsReport {
  symbols: FunctySymbol[];
}

/**
 * Group symbols under the namespace that governs them, as parent/child indices
 * into `symbols` — the pure half of building a nested outline.
 *
 * A namespace owns every declaration that follows it. A well-formed file has at
 * most one, as its first declaration, so this is normally a single root; but
 * `symbols --json` is best-effort on a file mid-edit and can report a misplaced or
 * duplicate namespace, and grouping by position degrades sensibly rather than
 * dropping declarations. With no namespace at all, everything stays a root — which
 * is every file today, and any file compiled by a functy predating namespaces.
 *
 * Returns the root indices in order, each with the indices of its children.
 */
export function groupByNamespace(
  symbols: FunctySymbol[],
): { index: number; children: number[] }[] {
  const roots: { index: number; children: number[] }[] = [];
  let current: { index: number; children: number[] } | undefined;
  symbols.forEach((s, i) => {
    if (s.kind === 'namespace') {
      current = { index: i, children: [] };
      roots.push(current);
    } else if (current) {
      current.children.push(i);
    } else {
      roots.push({ index: i, children: [] }); // before any namespace
    }
  });
  return roots;
}

/** 0-based, non-negative coordinates derived from a 1-based {@link JsonRange}. */
export interface ZeroBasedRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

/**
 * Parse a functy `--json` diagnostics report; null if the text isn't a valid
 * report (unparseable, or missing the `diagnostics` array).
 */
export function parseDiagnostics(text: string): JsonDiagnostics | null {
  try {
    const parsed = JSON.parse(text) as JsonDiagnostics;
    return Array.isArray(parsed.diagnostics) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Parse `functy symbols --json` output. Returns [] on any failure (unparseable,
 * or missing the `symbols` array) — callers treat an empty result as "no symbols
 * right now", which keeps the outline/tests resilient mid-edit.
 */
export function parseSymbols(text: string): FunctySymbol[] {
  try {
    const rep = JSON.parse(text) as SymbolsReport;
    return Array.isArray(rep.symbols) ? rep.symbols : [];
  } catch {
    return [];
  }
}

/**
 * Splice `--max-steps N` in after the subcommand, or return `args` untouched when
 * `n` is null.
 *
 * `null` — not 0 — is the "unset" value, because 0 is meaningful to functy: it
 * *disables* the limit. Unset must mean "don't pass the flag at all", since
 * `--max-steps` arrived in functy 0.11 and an older binary (still supported, see
 * MIN_VERSION) would reject an unknown flag and fail every command.
 *
 * The flag goes after the subcommand rather than before it: it is a root
 * persistent flag, so that position is valid for every subcommand, and it keeps
 * the flag ahead of `run`'s `--` argument separator.
 */
export function withMaxSteps(args: string[], n: number | null): string[] {
  if (n === null || args.length === 0) {
    return args;
  }
  return [args[0], '--max-steps', String(n), ...args.slice(1)];
}

/** Extract the `x.y.z` core from a version string (dropping any `-rc.N` suffix). */
export function coreVersion(v: string): string | null {
  const m = /(\d+\.\d+\.\d+)/.exec(v);
  return m ? m[1] : null;
}

/** Compare dotted numeric versions: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Split an argument string into argv tokens, respecting double-quoted spans (so
 * an HCL string argument like `"hello world"` stays one token, quotes preserved
 * because functy evaluates each argument as an HCL expression).
 */
export function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inQuote = false;
  let started = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuote) {
      if (ch === '\\' && i + 1 < input.length) {
        cur += ch + input[++i];
      } else {
        cur += ch;
        if (ch === '"') {
          inQuote = false;
        }
      }
    } else if (ch === '"') {
      cur += ch;
      inQuote = true;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(cur);
        cur = '';
        started = false;
      }
    } else {
      cur += ch;
      started = true;
    }
  }
  if (started) {
    tokens.push(cur);
  }
  return tokens;
}

/** Escape a string for safe interpolation into a regular expression. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a 1-based functy {@link JsonRange} to 0-based, non-negative
 * coordinates. vscode-facing callers build a `vscode.Range` from the result.
 */
export function zeroBased(loc: JsonRange): ZeroBasedRange {
  return {
    line: Math.max(0, loc.line - 1),
    column: Math.max(0, loc.column - 1),
    endLine: Math.max(0, loc.end_line - 1),
    endColumn: Math.max(0, loc.end_column - 1),
  };
}
