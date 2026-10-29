---
"@itwin/unified-selection": patch
---

`SelectionStorage`: Fixed `getSelectionLevels` sorting levels lexicographically instead of numerically (e.g. returning `[10, 2]` instead of `[2, 10]`).
