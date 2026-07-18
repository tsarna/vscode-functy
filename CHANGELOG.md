# Changelog

## 0.2.0

Tracks functy **0.10** (namespaces, `_` visibility, extern declarations) and
**0.11** (defaulted optional attributes, execution limits).

The minimum functy version is **unchanged at 0.9.0**. Nothing the extension calls
requires a newer binary — every 0.10/0.11 addition below is either static
(highlighting, snippets) or arrives through optional `symbols --json` fields that
an older functy simply omits. The one exception is opt-in and documented as such:
`functy.maxSteps`.

### Added

- **`functy.maxSteps`** — functy 0.11's per-invocation step budget, surfaced as a
  setting and passed as `--max-steps` to run, test, eval, check, and the REPL, so
  a runaway `while` in a `.cty` file aborts with an error instead of wedging the
  editor's functy process. Unset by default, and *unset means the flag is never
  passed* — `--max-steps` does not exist before 0.11, and an older binary would
  reject it and fail every command. `0` is a real value (disables the limit), which
  is why the unset state is `null` rather than `0`.
- **Extern declarations in the Outline.** `symbols --json` reports `kind: "extern"`
  for a bodiless declaration in a `//functy:extern` file; it now maps to a function
  symbol and is tagged `extern` in the detail text. An extern carries a signature
  exactly like a `func`, so without the tag it would read as a function actually
  defined in the file — which is the one thing an extern is not.
- **Highlighting for the 0.10/0.11 syntax:**
  - `//functy:extern` and other `functy:` file directives now scope the directive
    name as a keyword instead of rendering as an undifferentiated comment. An
    extern file is declared by nothing but that line. Host directives
    (`//vinculum:cache 5m`) still fall through to the generic directive rule.
  - `error`, functy's built-in error type, highlights as a type in an annotation
    (`catch e: error`). The call form `error("boom")` is excluded, so it stays
    scoped as the built-in function it is.
  - An optional parameter's `?` (`func parsetime(format?, s: string)`) is scoped as
    an optional marker rather than the ternary operator, and a variadic `*args` as
    a variadic marker rather than multiplication.
- **Snippets** for `extern` (a full extern file) and `externfunc`, `optional` and
  `object` (0.11's `optional(T, default)`), `tryfinally`, `defer`, and `throw`.

- **Namespace support**, tracking functy's `namespace` / `_` visibility feature.
  All of it degrades cleanly against an older binary: the highlighting and word
  selection are static, and the outline's namespace data comes from optional
  `symbols --json` fields that a functy predating namespaces simply omits.
  - **Outline** — a namespaced file's declarations nest under its `namespace` node,
    so breadcrumbs and sticky scroll carry the namespace while you scroll through a
    function body. Namespace-local (`_`-prefixed) declarations are listed — an
    outline should reflect the whole file — and marked *private* in the detail text.
  - **Highlighting** — the `namespace foo::bar` declaration, and qualified calls
    (`acme::math::double(21)`), where the namespace path and the called function are
    now scoped separately. A qualified call to a name that happens to match a
    built-in (`acme::text::assert(...)`) is no longer miscolored as that built-in —
    it isn't one: a namespace's own function shadows the built-in inside it.
  - **Word selection** — a qualified name counts as one word, so double-click, ⌘D,
    and word motions treat `acme::math::double` as a unit instead of three fragments.
  - **Snippets** — `namespace`, and `_func` for a namespace-local function.
  - `functy.runFunc` may now be a qualified name (`acme::math::main`).

### Fixed

- **`eval` was listed as a built-in function** and highlighted as one. There is no
  such built-in in functy — the real set is `assert`, `skip`, `error`, `cond`,
  `switch`, `try`, `can`, `typeof`, `typekind`, `doc`, and `help`. (The `functy
  eval` *subcommand*, which Evaluate Selection drives, is unrelated and unaffected.)
- **Warnings from `functy run` reached the Problems panel.** A successful run
  (exit 0) had its diagnostics deleted without parsing stderr, so a warning-only
  report — which functy can now produce, e.g. a namespaced function shadowing a
  built-in — was silently dropped. The report is now parsed regardless of exit code.

### Changed

- An unrecognized symbol `kind` from a newer functy no longer blanks the Outline
  view. It previously indexed a total record and yielded `undefined` where a
  `vscode.SymbolKind` was required, which threw and took down the whole outline for
  the file; unknown kinds now fall back to a generic symbol.

## 0.1.0

Initial release. Requires **functy 0.9.0 or newer** — the extension drives the
`functy` binary and relies on its `eval`, `symbols`, `check --json -`, and the
`--json` reports (which go to stderr, leaving stdout free for `println()`
output).

- Syntax highlighting for functy `.cty` files (statement keywords, function
  declarations, type annotations, and shared HCL-style expression syntax:
  strings with `${}`/`%{}` interpolation, heredocs, numbers, operators, and
  function calls).
- Language configuration: `//` and `#` line comments, `/* */` block comments,
  bracket matching, auto-closing pairs, and indentation rules.
- Snippets for `func`, `if`, `for`, `while`, `switch`, `try`/`catch`, `test`,
  `var`, `const`, and `type`.
- **Run File** (`functy run`) and **Run with Arguments…** (prompt for an entry
  function and arguments); output in the *functy* channel, runtime errors in the
  Problems panel.
- **Check File**, **Check Workspace** (`functy check --json .`), and type-check
  on save (`functy.checkOnSave`, default on); check/run diagnostics clear when
  the file is edited so they never go stale. Opt-in **functy.checkOnType**
  (default off) checks the unsaved buffer live as you type via
  `functy check --json -`, superseding check-on-save when enabled.
- **Evaluate Selection** — evaluate the selection (or current line) via
  `functy eval` and show the result inline and in the output channel.
- Document formatter backed by `functy fmt` (supports format-on-save), plus
  **Format Workspace** (`functy fmt -w .`); a hint appears when a file doesn't
  parse.
- Native Test Explorer integration driven by `functy test --json`, showing
  `println()` output and per-test results, with run cancellation. Continuous run
  re-runs the affected tests when their `.cty` file is saved.
- Outline / document symbols for `func`, `const`, `var`, `type`, and `test`
  declarations, and Test Explorer discovery — both backed by `functy symbols`
  for authoritative names, signatures, and ranges (comment/heredoc-aware;
  duplicate test names stay distinct).
- REPL integration: **Start REPL** (opens `functy repl`, loading the active
  file) and **Send Selection to REPL** (sends the selection, or the current
  line, to the REPL).
- `functy` task provider (check / test / fmt over the workspace) for
  `tasks.json`.
- **Get Started** walkthrough and an **Open Sample File** command that drops a
  small example `.cty` into the workspace.
- On activation (and when `functy.path` changes), warns via
  `functy version --json` if the binary is missing or older than 0.9.0.
