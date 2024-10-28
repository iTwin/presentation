---
"@itwin/presentation-components": minor
"@itwin/presentation-testing": minor
---

Define `type` and `exports` attributes in `package.json`.

The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.
