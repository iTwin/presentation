---
"@itwin/unified-selection": patch
---

`computeSelection`: Yield transient element IDs as selectable instance keys with the `TRANSIENT_ELEMENT_CLASSNAME` class name, instead of silently dropping them. This ensures transient selections are preserved in the computed selection result.
