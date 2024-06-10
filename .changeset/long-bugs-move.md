---
"@itwin/presentation-shared": minor
---

Added support for nested concatenated values by adding `ConcatenatedValue` to the `ConcatenatedValuePart` union. In addition:

- A type guard `ConcatenatedValuePart.isConcatenatedValue` has been added to distinguish it from other types of `ConcatenatedValuePart`.
- `ConcatenatedValue.serialize` has been modified to handle the new type of part seamlessly, so the `partFormatter` prop function receives the same 3 types of `ConcatenatedValuePart`, expanded from nested `ConcatenatedValue` if necessary.

The change makes combining multiple concatenated values easier, e.g. now you can do this:

```ts
const value: ConcatenatedValue = [createConcatenatedValueX(), { type: "String", value: " - " }, createConcatenatedValueY()];
```
