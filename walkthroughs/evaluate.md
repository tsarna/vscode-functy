## Evaluate an expression

functy is value-oriented, so evaluating a snippet is a first-class move.

1. Select an expression in the editor — for example `add(2, 3)` or `greet("there")`.
2. Run **Evaluate Selection** (also on the right-click menu).

The result appears **inline** after the line and in the *functy* output channel. It's
evaluated with `functy eval` against the current file, so the file's functions and
constants are in scope.

For an interactive loop, use **functy: Start REPL** and **Send Selection to REPL**.
