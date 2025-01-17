---
"@itwin/presentation-components": minor
---

Added `activeScopeProvider` prop to `FavoritePropertiesDataProvider` constructor.

The new prop is an function that returns the active scope. When not provided, the provider uses the old way of getting the active scope - `SelectionScopesManager`, accessed through `Presentation.selection.scopes` global from `@itwin/presentation-frontend` package. The selection APIs in that package are about to be deprecated and this change makes the provider ready for that. The `activeScopeProvider` prop will be made required in the next major release of this package.

In addition, the `FavoritePropertiesDataProvider` now uses `@itwin/unified-selection` package for adjusting selection based on selection scope. This change does not affect the results.
