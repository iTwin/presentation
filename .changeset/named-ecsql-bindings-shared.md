---
"@itwin/presentation-shared": major
---

**Breaking:** `ECSqlQueryDef.bindings` is now `ECSqlBinding[] | Record<string, ECSqlBinding>` (previously `ECSqlBinding[]`). This is non-breaking for consumers who only define queries, but breaking for code that reads or forwards bindings (e.g., custom `ECSqlQueryExecutor` implementations) because it must now handle both formats.

Migration example:

```ts
// Before
function handleBindings(bindings: ECSqlBinding[]) {
  bindings.forEach((b, i) => bind(i + 1, b));
}

// After
function handleBindings(bindings: ECSqlBinding[] | Record<string, ECSqlBinding>) {
  const entries: Array<[string | number, ECSqlBinding]> = Array.isArray(bindings)
    ? bindings.map((b, i) => [i + 1, b])
    : Object.entries(bindings);
  for (const [key, b] of entries) {
    bind(key, b);
  }
}
```

Alternatively, update to the latest `@itwin/presentation-core-interop` which handles both binding formats out of the box.
