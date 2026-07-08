---
"@itwin/presentation-content": patch
---

Convert ECExpression instance filters and calculated property values into ECSQL instead of passing them through unchanged. The generated ECSQL uses bracket-quoted identifiers and parameterizes literals, so `CalculatedFieldDeclaration` now carries an optional `bindings` map with the values referenced by its `expression`.
