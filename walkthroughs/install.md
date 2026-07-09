## Install the functy CLI

This extension drives the **`functy`** command-line tool (version **0.8.1 or newer**).

Install it with Go:

```
go install github.com/tsarna/functy/cmd/functy@latest
```

…or download a binary from the [releases page](https://github.com/tsarna/functy/releases).

Make sure `functy` is on your `PATH`, or set the **`functy.path`** setting to point
at the binary. The extension warns on startup if it can't find `functy` or the
version is too old.
