---
"@itwin/unified-selection": minor
---

Make `imodelKey` prop optional when calling `SelectionStorage` methods.

While the package is designed to work with iModels' selection as the first class citizen, it can be used in other contexts as well. In those cases, the `imodelKey` prop is not relevant and should not be required. This change makes it optional and defaults to an empty string when not supplied.
