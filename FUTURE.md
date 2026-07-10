# vscode-functy — Future Work

Designed-but-unimplemented enhancements to the functy VSCode extension, with enough
rationale to pick them up without re-deriving the strategy. Nothing here is a commitment.
Shipped features live in `README.md` / `CHANGELOG.md`; **this file is a map of what's
left**, not a changelog.

## Strategy: the LSP dividing line

The rule that shapes everything below: **decide each feature by whether a future language
server will subsume it.**

- **LSP will subsume** — do *not* build client-side versions (brittle *and* thrown away
  when the server lands): live diagnostics beyond check-on-save, hover, go-to-definition,
  completion, signature help, semantic tokens, rename, a semantic outline.
- **LSP will never touch** — permanent value, safe to build now: REPL integration,
  Evaluate Selection, Run-with-arguments, the version check, tasks / workspace commands,
  the Test Explorer, the walkthrough, continuous test run.

The orthogonal non-LSP features have shipped. The next big investment is the LSP; until
then, only *new* non-LSP ideas land here. The one deliberate exception already shipped is
the document-symbol **outline** — backed by `functy symbols`, which the LSP will later
serve in-process.

## Testing

**In place:** unit tests (`node --test` + `tsx`, run in CI) over the vscode-free
`src/protocol.ts` — the functy `--json` wire contract and pure helpers (version gating,
`tokenizeArgs`, `escapeRegex`, range conversion, diagnostics/symbols JSON parsing). These
lock the CLI-integration seams that have actually regressed (e.g. the `symbols --json`
contract that once emptied the outline and Test Explorer). Keep pure, host-independent
logic in `protocol.ts` so it stays testable without the extension host.

**To do:**

- **Integration tests via `@vscode/test-electron`** for the flows that need a real host:
  test discovery → run (pass/fail/skip mapping), diagnostics landing in the Problems
  panel from a check, the document-symbol outline populating, and format-on-save. Heaviest
  value-per-test but requires the Electron download in CI (a separate job / cached
  download). Fixtures: a small `.cty` workspace with passing/failing/skipped tests and a
  deliberate type error.
- **A stub `functy` for hermetic integration tests** — a tiny script on `PATH` emitting
  canned `--json` for each subcommand, so host-level tests don't depend on a real functy
  build. Decide per-flow whether to stub or to require a real binary (some flows, like
  format, are only meaningful against the real formatter).
- **LSP tests, when that lands** — protocol-level tests against `functy lsp --stdio`
  (initialize, diagnostics on change, symbols, formatting) live better on the functy side;
  the client wiring gets a thin integration check here.

## The LSP (the big investment)

The highest-leverage upgrade, and cheaper than a from-scratch LSP because **the server is
Go, reusing functy's own parser / type checker / `Format` / `help`·`doc` reflection** — it
is largely a *protocol adapter over existing semantic APIs*, not a reimplementation.

- **Distribution.** Add a `functy lsp --stdio` subcommand to the CLI users already install,
  and make the extension an LSP client via `vscode-languageclient`. No separate
  per-platform server binary. Extension-side wiring is ~1 day; grammar, snippets,
  language-config, and the Test Explorer all stay.
- **Phasing.**
  - **Phase 0 (~1–2 wks): scaffold + live diagnostics + document symbols + formatting.**
    Reuses `loadProgram` → `hcl.Diagnostics`, the `Result` symbol maps, and `functy.Format`.
    Replaces on-save-CLI check with live, in-process diagnostics, and is the cheapest way
    to **de-risk the one real unknown** (below) — worth starting early.
  - **Phase 1 (~1–2 wks): hover + go-to-definition (top-level).** Reuses doc-comment
    metadata and `Result` `DefRange`s.
  - **Phase 2 (~2–4 wks): completion, signature help, references, document highlight.**
  - **Phase 3 (~2–4 wks): rename, semantic tokens, inlay hints (inferred types),
    workspace symbols.**
- **The linchpin / main unknown.** Everything positional (hover, definition, references,
  signature help) hinges on **position → AST-node resolution** plus static **scope**
  resolution for locals. HCL expressions already carry ranges and the compiler already
  resolves scope to compile; the open question is how much is *exposed statically* for a
  read-only query vs. needs threading position info through functy's own statement AST. If
  it's mostly there, the semantic tier is quick; if not, the bulk of the work is a small
  parser/AST change **inside functy** (which also sharpens `check`'s error precision, so
  it's not wasted). Spiking Phase 0 answers this early.
- **Sequencing caveat.** Defer any feature tied to *unshipped* language design —
  cross-file go-to-definition, namespacing / imports, first-class-function completion —
  until those land, or it will be reworked.
- **What the LSP replaces here.** Check-on-save and the run/check diagnostics plumbing
  (LSP gives live diagnostics); optionally the formatter and the client-side outline. The
  Test Explorer stays CLI-driven — LSP does not run tests; the VSCode Testing API is
  separate.

## Live diagnostics: why not a daemon (it's the LSP)

`functy.checkOnType` (opt-in) type-checks the unsaved buffer live via `functy check --json -`,
one debounced process per typing pause. It's opt-in purely on cost grounds — single-buffer
`check` parses and type-checks but does **not** evaluate function bodies (lazy cty
functions), so it catches parse + top-level errors, not in-body type errors, and cross-file
references are a non-issue except for eagerly-evaluated top-level initializers.

Two "faster" designs were considered and **rejected**: a long-running `check --watch` over
framed buffers saves only startup milliseconds while adding a framing protocol; a stateful,
project-warm server that would deliver *deep* live diagnostics (in-body type errors, and the
data behind hover/definition/completion) is ~80% of the LSP's engine. So: keep
spawn-per-check as the pragmatic pre-LSP option, and treat "want deep, warm, incremental
diagnostics" as the trigger to build the **LSP**, not a bespoke daemon.

## Remaining functy CLI dependency (pre-LSP bridge)

The JSON-emitting CLIs this extension relies on — `check --json -`, `eval --json`,
`version --json`, `symbols --json` — have shipped and are adopted (see `README.md`). One is
still wanted:

- **`functy doc --json <name>` / `help --json <name>`** → **pre-LSP hovers** (spawn on
  hover, cached). Deferred: a client-side hover is exactly the semantic feature we leave to
  the LSP (see *Explicitly not doing*), so this waits for the language server.

## Minor hardening backlog

- **`functy.path` must be a bare executable** — a value with arguments (e.g. `go run …`)
  breaks `spawn`; documented in the setting description, and a bad value surfaces as the
  version check's "could not find the binary" warning. Left as-is.
- **Untitled / unsaved `.cty` buffers** — Run/Check `save()` first, which prompts (standard
  flow). `checkOnType` already checks the unsaved buffer via stdin. Left as-is.

## Explicitly not doing (until the LSP)

Client-side, regex/heuristic implementations of **go-to-definition, hover, or completion**.
These are exactly what the language server does well, and a hand-rolled version would be
both brittle and thrown away. Wait for the LSP.
