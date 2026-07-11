# Changelog

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
