---
"@itwin/presentation-hierarchies": major
---

**Breaking:** `createInstanceKeysFilteredQuery` now correctly appends `IdSet` bindings in both positional and named binding formats, using the `IdSet` virtual table instead of `InVirtualSet`.

Consumers that provide their own `LimitingECSqlQueryExecutor` or `imodelAccess` may now receive named bindings (`Record<string, ECSqlBinding>`) through the public `createQueryReader` path.

To migrate, update custom query reader / executor implementations to handle both positional bindings (`ECSqlBinding[]`) and named bindings (`Record<string, ECSqlBinding>`), or use the default implementation provided by the `@itwin/presentation-core-interop` package, `createECSqlQueryExecutor` function.
