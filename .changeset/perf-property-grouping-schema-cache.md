---
"@itwin/presentation-core-interop": patch
"@itwin/presentation-hierarchies": patch
---

Fixed a performance regression that made property grouping of large hierarchies dramatically slower.

`createECSchemaProvider` now caches resolved schemas, so repeated `getSchema`/`getClass` calls no longer trigger a new native schema view request each time. A cached schema is reused until the underlying schema view becomes outdated, at which point it is refreshed on next access. In addition, property grouping now resolves each properties class once instead of once per grouped node.
