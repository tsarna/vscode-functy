# Changelog

## 0.1.0

Initial release. Requires functy 0.8.1+ (the `--json` reports for check, run,
and test are read from stderr, leaving stdout free for `println()` output).

- Syntax highlighting for functy `.cty` files (statement keywords, function
  declarations, type annotations, and shared HCL-style expression syntax:
  strings with `${}`/`%{}` interpolation, heredocs, numbers, operators, and
  function calls).
- Language configuration: `//` and `#` line comments, `/* */` block comments,
  bracket matching, auto-closing pairs, and indentation rules.
- Snippets for `func`, `if`, `for`, `while`, `switch`, `try`/`catch`, `test`,
  `var`, `const`, and `type`.
- Commands: **Run File** (`functy run`) and **Check File** (`functy check`).
- Document formatter backed by `functy fmt` (supports format-on-save).
- Native Test Explorer integration driven by `functy test --json`, showing
  `println()` output and per-test results, with run cancellation. Test discovery
  skips `test "…"` inside comments and heredocs and allows the brace on the next
  line.
- Type-check on save (`functy.checkOnSave`, default on); check/run diagnostics
  clear when the file is edited so they never go stale.
- Document symbols / Outline for `func`, `const`, `var`, `type`, and `test`
  declarations (comment/heredoc-aware, top-level only).
- On activation (and when `functy.path` changes), warn if the functy binary is
  missing or older than 0.8.1.
- REPL integration: **functy: Start REPL** (opens `functy repl`, loading the
  active file) and **functy: Send Selection to REPL** (sends the selection, or
  the current line, to the REPL).
- **functy: Evaluate Selection** — evaluate the selection (or current line) via
  `functy eval` and show the result inline and in the output channel.
- **functy: Run with Arguments…** — prompt for an entry function and arguments,
  then run.
- Task provider (`functy` tasks: check, test, fmt over the workspace) and
  **Check Workspace** / **Format Workspace** commands (`functy check --json .`,
  `functy fmt -w .`).
- **functy.checkOnType** (opt-in, default off) — live type-checking of the
  unsaved buffer as you type, via `functy check --json -`. Supersedes
  check-on-save when enabled.
- Continuous test run: the Test Explorer's Run profile supports continuous mode,
  re-running the affected tests when their `.cty` file is saved.
- **Get Started walkthrough** and a **functy: Open Sample File** command that drops
  a small example `.cty` into the workspace.
- Outline and test discovery are now backed by `functy symbols --json` (authoritative
  parser output) instead of regex scanners: correct signatures and ranges, duplicate
  test names are distinct items, and the formatter shows a hint when a file doesn't
  parse. Requires functy with the `symbols` command.
