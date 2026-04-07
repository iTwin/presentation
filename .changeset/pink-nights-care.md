---
"@itwin/presentation-testing": patch
---

Updated `buildTestIModel` to use more generic context instead of referencing `Mocha.Context` directly. This allows to pass in `Mocha.Context` and custom context that matches expected shape.
