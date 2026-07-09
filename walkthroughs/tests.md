## Run tests

Co-located `test "…" { … }` blocks show up in VS Code's native **Testing** panel.

```
test "add sums two numbers" {
    assert(add(2, 3) == 5)
}
```

Open the Testing panel to run them individually or all at once — pass/fail/skip
results, any `println()` output, and failure locations are surfaced there. Turn on
**continuous run** to re-run tests automatically when you save.

You can also run `functy test` from the terminal, or as a VS Code task (the extension
contributes `functy` check / test / fmt tasks).
