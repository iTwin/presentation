---
"@itwin/presentation-core-interop": patch
"@itwin/presentation-hierarchies": patch
---

Fixed a performance regression that made property grouping of large hierarchies dramatically slower.

`createECSchemaProvider` now caches resolved schemas and the `EC.Class` objects built from them, so repeated `getSchema`/`getClass` calls and `EC.Property.class` accesses no longer trigger a new native schema view request or rebuild the class each time. Cached schemas are reused until the underlying schema view becomes outdated, at which point they are refreshed on next access. In addition, property grouping now resolves each properties class once instead of once per grouped node.
