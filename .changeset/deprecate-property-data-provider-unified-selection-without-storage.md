---
"@itwin/presentation-components": minor
---

`usePropertyDataProviderWithUnifiedSelection`: Deprecated using the hook without a `selectionStorage` prop.

Always use the hook with a `selectionStorage` prop provided. Without it, the hook relies on the deprecated `SelectionManager` from `@itwin/presentation-frontend`. The `selectionStorage` prop will be made required in the next major release.

Migration example:

```tsx
// Before (deprecated)
const { isOverLimit } = usePropertyDataProviderWithUnifiedSelection({ dataProvider });

// After
const { isOverLimit } = usePropertyDataProviderWithUnifiedSelection({ dataProvider, selectionStorage });
```
