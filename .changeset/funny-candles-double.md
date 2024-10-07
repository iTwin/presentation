---
"@itwin/unified-selection": patch
---

Fix provider returned by `createHiliteSetProvider` in some cases not caching class hierarchy check results, resulting in duplicate checks for the same classes.
