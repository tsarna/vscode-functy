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
