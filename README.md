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
  Namespace-local (`_`-prefixed) declarations are listed too, marked *private*.
- **Namespaces** — a namespaced file's declarations nest under its `namespace`
  node, so breadcrumbs and sticky scroll keep telling you which namespace you are
  editing (`math.cty > acme::math > double`) — the fact that matters, since a
  namespace changes the registered name of every function in the file. The
  `namespace` declaration and qualified calls (`acme::math::double(21)`) are
  highlighted, and a qualified name selects as a single word (double-click, ⌘D,
  word motions).
- **Snippets** — `namespace`, `func`, `_func`, `funcret`, `if`, `ifelse`, `forin`,
  `forc`, `while`, `switch`, `trycatch`, `test`, `var`, `const`, `type`.
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
reports). It warns on startup if the binary is missing or too old.

The namespace features degrade cleanly rather than requiring a newer binary: the
syntax highlighting and word selection are static, and the outline's namespace and
*private* markers come from optional `symbols --json` fields that an older functy
simply omits. They light up once the binary supports namespaces.

Install it on macOS with [Homebrew](https://brew.sh):

```
brew install tsarna/tap/functy
```

…or on any platform with Go:

```
go install github.com/tsarna/functy/cmd/functy@latest
```

By default the extension runs `functy` from your `PATH`. Point it elsewhere
with the **functy.path** setting.

## Settings

| Setting | Default | Description |
|---|---|---|
| `functy.path` | `functy` | Path to the functy binary (a single executable, not a command line). |
| `functy.runFunc` | `main` | Entry function invoked by **Run File**. May be qualified (`acme::math::main`); a bare name is resolved if it is unambiguous across namespaces. |
| `functy.checkOnSave` | `true` | Type-check `.cty` files on save (side-effect-free). |
| `functy.checkOnType` | `false` | Type-check the unsaved buffer live as you type (debounced). Supersedes check-on-save when enabled. |
| `functy.maxSteps` | *(unset)* | Steps one function invocation may take before a runaway loop is aborted, passed as `--max-steps`. Unset uses functy's own default; `0` disables the limit. **Needs functy 0.11.0+** — the flag is only passed when you set this. |

Format-on-save uses the standard `editor.formatOnSave` setting.

## License

MIT © Tyler C. Sarna
