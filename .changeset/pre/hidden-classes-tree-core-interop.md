---
"@itwin/presentation-core-interop": minor
---

`createECSchemaProvider`: Implement `ECSchemaProvider.getHiddenClassesTree`.

Trees are cached per selected class and shared between all callers, including concurrent ones. Failed computations aren't cached, so the next request retries them.

The class hierarchy and hidden classes trees are cached for the provider's lifetime. Create one provider per iModel and share it between consumers. After schema changes, recreate the provider and consumers holding it.
