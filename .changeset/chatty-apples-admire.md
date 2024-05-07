---
"@itwin/presentation-core-interop": patch
---

Fixed `createECSchemaProvider` to create a provider that returns `undefined` instead of throwing, when the requested schema is not found.
