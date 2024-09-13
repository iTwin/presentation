---
"@itwin/presentation-shared": patch
---

Fix `ECSql.createConcatenatedValueStringSelector` not casting property value to string. This could cause ECSQL query execution to fail when more than one selector is used.
