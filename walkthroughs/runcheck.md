## Run and check

- **Run File** calls the entry function (`main` by default) with `functy run` and
  shows the result in the *functy* output channel. Use **Run with Arguments…** to pass
  arguments, or change the entry with the `functy.runFunc` setting.
- **Check File** type-checks with `functy check` and reports any problems in the
  Problems panel, at their exact source location.

Files are type-checked automatically on **save** (`functy.checkOnSave`). For live
checking as you type, enable **`functy.checkOnType`**.

Across a whole project, use **functy: Check Workspace** and **functy: Format
Workspace**.
