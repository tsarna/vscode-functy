# vscode-functy — Future Work

Designed-but-unimplemented enhancements to the functy VSCode extension, recorded with
rationale so they can be picked up without re-deriving the strategy. Nothing here is a
commitment. Shipped features live in `README.md` / `CHANGELOG.md`; this file is a map of
what's left.

## Strategy: the LSP dividing line

The one rule that shapes everything below: **decide each feature by whether a future
language server will subsume it.**

- **LSP will subsume** (do *not* build client-side versions — brittle *and* thrown away
  when the server lands): live diagnostics beyond check-on-save, hover, go-to-definition,
  completion, signature help, semantic tokens, rename, a semantic outline.
- **LSP will never touch** (permanent value — safe to build now): REPL integration,
  Evaluate Selection, Run-with-arguments, the binary version check, tasks / workspace
  commands, the Test Explorer, a walkthrough, continuous test run.

So the sequencing is: do the *orthogonal* non-LSP features now, ship a solid release, then
pivot to the LSP for the semantic tier — and never hand-roll the semantic features in the
client. The one deliberate exception already shipped is the **document-symbol outline**: a
regex/line-scan implementation, cheap and standalone, that the LSP will later improve.

## Near-term, no server needed (orthogonal to the LSP)

- **Walkthrough (Get Started).** First-run guide: install functy, open a `.cty`, run / check /
  test. Onboarding for the HCL/Terraform crowd new to functy.

## Live diagnostics: why not a daemon (it's the LSP)

`functy.checkOnType` (opt-in) type-checks the unsaved buffer live via
`functy check --json -`, spawning one debounced process per typing pause. Two facts
shape its scope, both verified against the CLI:

- **Single-buffer checking is not a cross-file hazard.** `check` parses and type-checks
  but does not *evaluate* function bodies (they are lazy cty functions), so a body calling
  a function or referencing a variable defined in a sibling file produces **no** error.
  Only top-level `const`/`var` initializers are eagerly evaluated, so only those surface a
  cross-file reference as an error — a narrow case. (The existing check-on-save runs the
  same single-file `check`, so it has the identical profile.)
- **It mostly catches parse and top-level errors, not in-body type errors** — because
  bodies aren't analyzed at check time. So it's live *syntax* feedback plus declaration
  checking, not full semantic analysis.

Given that, it is opt-in purely on cost grounds (a process per edit pause). Two "faster"
designs were considered and rejected:

- **A long-running `functy check --watch` reading framed buffers** saves only process-startup
  milliseconds, still analyzes each buffer the same shallow way, and adds a framing protocol
  and lifecycle management. Low ROI.
- **A stateful, project-warm server** (whole project parsed, edited buffer swapped in,
  incremental re-analysis) is what would deliver *deep* live diagnostics (in-body type errors,
  and the data behind hover/definition/completion) — but maintaining server-side document state
  and streaming updates is ~80% of the LSP's engine. At that point, build the **LSP** (below).

So: keep spawn-per-check as the pragmatic pre-LSP option; treat "want deep, warm, incremental
diagnostics" as the trigger to build the language server, not a bespoke daemon.

## The LSP (the big investment)

The highest-leverage upgrade, and cheaper than a from-scratch LSP because **the server is
Go, reusing functy's own parser / type checker / `Format` / `help`·`doc` reflection** — it
is largely a *protocol adapter over existing semantic APIs*, not a reimplementation.

- **Distribution.** Add a `functy lsp --stdio` subcommand to the CLI users already install,
  and make the extension an LSP client via `vscode-languageclient`. No separate per-platform
  server binary to build or ship. Extension-side wiring is ~1 day; grammar, snippets,
  language-config, and the Test Explorer all stay.
- **Phasing.**
  - **Phase 0 (~1–2 wks): scaffold + live diagnostics + document symbols + formatting.**
    Reuses `loadProgram` → `hcl.Diagnostics`, the `Result` symbol maps, and `functy.Format`.
    Already replaces on-save-CLI check with live, in-process diagnostics. Also the cheapest
    way to **de-risk the one real unknown** (below), so worth starting relatively early.
  - **Phase 1 (~1–2 wks): hover + go-to-definition (top-level).** Reuses doc-comment metadata
    and `Result` `DefRange`s.
  - **Phase 2 (~2–4 wks): completion, signature help, references, document highlight.**
  - **Phase 3 (~2–4 wks): rename, semantic tokens, inlay hints (inferred types), workspace
    symbols.**
- **The linchpin / main unknown.** Everything positional (hover, definition, references,
  signature help) hinges on **position → AST-node resolution** plus static **scope**
  resolution for locals. HCL expressions already carry ranges and the compiler already does
  scope resolution to compile; the open question is how much is *exposed statically* for a
  read-only query vs. needs threading position info through functy's own statement AST. If
  it's mostly there, the semantic tier is quick; if not, the bulk of the work is a small
  parser/AST change **inside functy** (which also sharpens `check`'s error precision, so it's
  not wasted). Spiking Phase 0 answers this early.
- **Sequencing caveat.** Defer any feature tied to *unshipped* language design —
  cross-file go-to-definition, namespacing / imports, first-class-function completion — until
  those land, or it will be reworked.
- **What the LSP replaces here.** Check-on-save and the run/check diagnostics plumbing (LSP
  gives live diagnostics); optionally the formatter and the client-side outline. The Test
  Explorer stays CLI-driven — LSP does not run tests; the VSCode Testing API is separate.

## Dependencies on functy CLI additions (pre-LSP bridge)

A few small JSON-emitting CLI additions (tracked in functy's own `FUTURE.md`, "Machine-readable
CLI surfaces for editor tooling") remove heuristics this extension hand-rolls and extend the
non-LSP runway.

Shipped and adopted:

- **`functy check --json -` (stdin + `--filename`)** — powers `functy.checkOnType` (live,
  on-type diagnostics on the unsaved buffer, no save). Also `check .` / no-args directory
  discovery backs the **Check Workspace** command.
- **`functy eval --json`** — backs **Evaluate Selection** (one-shot expression eval with a
  reliable exit status and stderr-only diagnostics).
- **`functy version --json`** — available for version gating (though the activation check
  parses the plain-text `version` output on purpose, to detect binaries too old to have any
  `--json`).

Still wanted:

- **`functy symbols --json` / `outline --json`** → replace **both** the regex document-symbol
  outline (`src/symbols.ts`) **and** the regex test discovery (`src/testController.ts`) with
  authoritative parser output (correct names, ranges, comment/heredoc handling for free).
- **`functy doc --json <name>` / `help --json <name>`** → **pre-LSP hovers** (spawn-on-hover,
  cached), a stepping stone toward the LSP hover.

## Minor hardening backlog

Small correctness/UX items, not blocking:

- **Duplicate test descriptions collapse to one Test item** — the item id and the result map
  are keyed by name, so a second `test "same name"` silently shadows the first. Disambiguate
  (append an occurrence index) once discovery moves to `symbols --json`.
- **Untitled / unsaved `.cty` buffers** — Run/Check `save()` first, which prompts. Confirm the
  flow isn't surprising; a stdin-based check (above) would remove the need to save.
- **Formatter is a silent no-op on a parse error** — correct (it must not blank the document),
  but gives no hint why nothing happened; consider a subtle status message.
- **`functy.path` must be a bare executable** — a value with arguments (e.g. `go run …`) breaks
  `spawn`. Documented in the setting description; could validate and warn.
- **Test discovery brace-on-next-line / string edge cases** — the line scanner is a heuristic;
  `symbols --json` would retire it entirely.

## Explicitly not doing (until the LSP)

Client-side, regex/heuristic implementations of **go-to-definition, hover, or completion**.
These are exactly what the language server does well, and a hand-rolled version would be both
brittle and thrown away. Wait for the LSP.
