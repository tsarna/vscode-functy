# functy for VS Code

Language support for [functy](https://github.com/tsarna/functy) — a small
imperative language whose statement layer is functy's own
(`func`/`var`/`if`/`for`/`return`) and whose expressions are real HCL
expressions. functy source files use the `.cty` extension.

## Features

- **Syntax highlighting** — statement keywords, function declarations, type
  annotations, and shared HCL-style expression syntax (strings with `${}` /
  `%{}` interpolation, heredocs, numbers, operators, and function calls).
- **Editing** — `//` and `#` line comments, `/* */` block comments, bracket
  matching, auto-closing pairs, and indentation.
- **Outline** — `func`, `const`, `var`, `type`, and `test` declarations appear in
  the Outline view, breadcrumbs, sticky scroll, and "Go to Symbol" (⇧⌘O).
- **Snippets** — `func`, `funcret`, `if`, `ifelse`, `forin`, `forc`, `while`,
  `switch`, `trycatch`, `test`, `var`, `const`, `type`.
- **Commands** — **functy: Run File** (`functy run`) and **functy: Check File**
  (`functy check`), with output in the *functy* output channel. Errors (including
  runtime errors) land in the Problems panel at their source location.
- **Check on save** — `.cty` files are type-checked on save by default (a
  side-effect-free `functy check`); toggle with **functy.checkOnSave**. For live
  checking as you type, enable **functy.checkOnType** (opt-in).
- **Workspace** — **functy: Check Workspace** and **functy: Format Workspace**
  commands, plus a `functy` task provider (check / test / fmt) for `tasks.json`.
- **Get Started** — a walkthrough (Help → Welcome) and **functy: Open Sample File**
  to try everything on a ready-made example.
- **REPL** — **functy: Start REPL** opens `functy repl` with the active file
  loaded; **functy: Send Selection to REPL** (also on the editor context menu)
  sends the selection, or the current line, to the running REPL.
- **Evaluate Selection** — **functy: Evaluate Selection** evaluates the selection
  (or current line) via `functy eval` and shows the result inline.
- **Run with Arguments** — **functy: Run with Arguments…** prompts for an entry
  function and arguments, then runs.
- **Formatting** — Format Document / format-on-save backed by `functy fmt`.
- **Testing** — co-located `test "…" { … }` blocks appear in the native Test
  Explorer, run via `functy test --json`. `println()` output and per-test results
  show in the Test Results view; a running test can be cancelled. Continuous run
  re-runs the affected tests when their file is saved.

## Requirements

The extension shells out to the `functy` binary, and requires **functy 0.9.0 or
newer** (it relies on `eval`, `symbols`, `check --json -`, and the `--json`
reports). It warns on startup if the binary is missing or too old. Install it
with:

```
go install github.com/tsarna/functy/cmd/functy@latest
```

By default the extension runs `functy` from your `PATH`. Point it elsewhere
with the **functy.path** setting.

## Settings

| Setting | Default | Description |
|---|---|---|
| `functy.path` | `functy` | Path to the functy binary (a single executable, not a command line). |
| `functy.runFunc` | `main` | Entry function invoked by **Run File**. |
| `functy.checkOnSave` | `true` | Type-check `.cty` files on save (side-effect-free). |

Format-on-save uses the standard `editor.formatOnSave` setting.

## License

MIT © Tyler C. Sarna
