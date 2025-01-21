---
"@itwin/presentation-components": minor
---

Changed how unified selection-enabled components access unified selection storage.

- Added `selectionStorage` prop to `usePresentationTableWithUnifiedSelection` and `usePropertyDataProviderWithUnifiedSelection`.

  When the prop is provided, the hooks will use the provided selection storage instead of `Presentation.selection` global storage from `@itwin/presentation-frontend` package. This makes the dependencies clear and hooks ready for deprecation of the selection APIs in the `@itwin/presentation-frontend` package. At the moment the prop is optional, but will be made required in the next major release of the package.

- Deprecated `UnifiedSelectionContext`, `UnifiedSelectionContextProvider`, `UnifiedSelectionContextProviderProps`, `UnifiedSelectionState` and `useUnifiedSelectionContext`. All of them are being replaced by the APIs in the new `@itwin/unified-selection-react` package, which now is an optional peer dependency of this package.

  One of the property renderers - `InstanceKeyValueRenderer` was relying on the deprecated context to access unified selection storage. It now prefers the context provided with `UnifiedSelectionContextProvider` from `@itwin/unified-selection-react` package. If the context is not provided, the renderer falls back to the deprecated context.
