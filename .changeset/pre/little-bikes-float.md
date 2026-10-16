---
"@itwin/presentation-shared": patch
---

`createHiddenClassesTree`: Fixed directly selecting a hidden class incorrectly including descendants that inherit its hidden state. The selected class itself remains included, and explicit descendant overrides are preserved.
