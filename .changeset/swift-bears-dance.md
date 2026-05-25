---
"@itwin/presentation-shared": minor
---

`TypedPrimitiveValue`: The `type` fields now use `Extract<PrimitiveValueType, ...>` to stay in sync with `PrimitiveValueType`. Additionally, the `koqName` property is now available for `"Integer"` and `"Long"` typed values, not just `"Double"`.
