## Open a sample file

functy source files use the **`.cty`** extension. Open the **Open Sample** button on
the left to drop a small example into your workspace:

```
const greeting = "world"

func add(a: number, b: number) -> number {
    return a + b
}

test "add sums two numbers" {
    assert(add(2, 3) == 5)
}
```

You'll get syntax highlighting, an **Outline** view, snippets (type `func`, `test`,
`for`…), and the rest of the features below.
