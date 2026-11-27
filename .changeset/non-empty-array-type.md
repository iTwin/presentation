---
"@itwin/presentation-shared": minor
---

Added `NonEmptyArray<T>` type for arrays that are guaranteed to have at least one element.

`DeepReadonly` now preserves tuple lengths and element positions. For example, `DeepReadonly<[string, number]>` resolves to `readonly [string, number]`, and `DeepReadonly<NonEmptyArray<T>>` retains its required first element.
