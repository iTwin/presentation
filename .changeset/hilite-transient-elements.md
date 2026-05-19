---
"@itwin/unified-selection": patch
---

`HiliteSetProvider`: Fix transient elements not being included in the hilite set and causing an error. Transient element keys are now correctly recognized and emitted without querying the iModel for class hierarchy information.
