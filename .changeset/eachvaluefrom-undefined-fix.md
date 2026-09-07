---
"@itwin/presentation-shared": patch
---

Fix `eachValueFrom` dropping legitimately emitted `undefined` values when they're buffered before the consumer requests them.
