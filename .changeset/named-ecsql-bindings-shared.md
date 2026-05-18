---
"@itwin/presentation-shared": major
---

`ECSqlQueryDef.bindings`: Added support for named bindings via `Record<string, ECSqlBinding>` in addition to the existing positional `ECSqlBinding[]` format.

This change is non-breaking for consumers who define queries (the type is widened). However, it is **breaking** for code that handles `ECSqlQueryDef` bindings directly (e.g., custom `ECSqlQueryExecutor` implementations), since `bindings` is now a union type. Consumers should update to the latest `@itwin/presentation-core-interop` version, which handles both binding formats.
