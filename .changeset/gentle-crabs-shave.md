---
"@itwin/presentation-shared": major
"@itwin/presentation-core-interop": major
---

`EC.RelationshipConstraintMultiplicity`: Changed `upperLimit` type from `number` to `number | "unbounded"`.

Previously, `createECSchemaProvider` from `@itwin/presentation-core-interop` reported an unbounded (`*`) upper limit as `0`, which silently made the natural `upperLimit > 1` check treat many-valued relationships as single-valued. The limit is now an explicit `"unbounded"` value that consumers must handle:

```ts
const isManyValued = constraint.multiplicity.upperLimit === "unbounded" || constraint.multiplicity.upperLimit > 1;
```
