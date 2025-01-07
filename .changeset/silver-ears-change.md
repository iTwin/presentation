---
"@itwin/presentation-hierarchies-react": patch
"@itwin/unified-selection": patch
"@itwin/presentation-hierarchies": patch
"@itwin/presentation-components": patch
---

Polyfill `Symbol.dispose` and `Symbol.asyncDispose` to make sure that code using the upcoming JS recource management API works in all environments.
