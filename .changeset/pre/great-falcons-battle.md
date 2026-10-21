---
"@itwin/presentation-shared": major
---

`ECSqlBinding`: The `idset` binding's `value` is now `readonly Id64String[]` (previously `Id64String[]`). This is non-breaking for consumers who only define bindings, but breaking for code that reads `idset` binding values and passes them to APIs expecting a mutable array (e.g., custom `ECSqlQueryExecutor` implementations).

Migration example:

```ts
// Before
binder.bindIdSet(key, OrderedId64Iterable.sortArray(binding.value));

// After
binder.bindIdSet(key, OrderedId64Iterable.sortArray([...binding.value]));
```
