---
"@itwin/presentation-hierarchies-react": major
---

Unified selection API cleanup.

- Remove deprecated `UnifiedSelectionProvider`.
- Make `selectionStorage` prop required for unified selection - enabled tree state hooks (`useUnifiedSelectionTree` and `useIModelUnifiedSelectionTree`).

Previously, the `selectionStorage` prop was optional, and if not provided, the hooks used unified selection React context (provided by `UnifiedSelectionProvider`) as fallback. Finally, if the context was not provided either, the hooks acted as regular non-unified selection hooks.

This didn't make much sense, as the hooks were designed to work with unified selection, as their name suggests. So it makes sense to require the selection storage to be provided to them, and at that point the context becomes redundant.
