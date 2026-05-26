---
"@itwin/presentation-shared": minor
---

**Breaking:** Add `version` property to `EC.Schema` interface. Any code that manually implements the `EC.Schema` interface must now provide a `version: { read: number; write: number; minor: number }` object matching the EC schema version format `"read.write.minor"`.

Consumers who obtain `EC.Schema` objects exclusively through `createECSchemaProvider` from `@itwin/presentation-core-interop` are unaffected — upgrading to the latest `@itwin/presentation-core-interop` is sufficient.

Migration example for custom `EC.Schema` implementations:

```ts
// Before
const schema: EC.Schema = {
  name: "MySchema",
  getClass: async () => undefined,
  getCustomAttributes: async () => new Map(),
};

// After
const schema: EC.Schema = {
  name: "MySchema",
  version: { read: 1, write: 0, minor: 0 },
  getClass: async () => undefined,
  getCustomAttributes: async () => new Map(),
};
```
