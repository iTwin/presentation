---
"@itwin/presentation-components": major
---

**Breaking:** `FavoritePropertiesDataProvider` constructor now requires `FavoritePropertiesDataProviderProps` with `activeScopeProvider`.

The constructor argument has been changed from optional to required, and `activeScopeProvider` within `FavoritePropertiesDataProviderProps` has been made required. Previously, when `activeScopeProvider` was not provided, the provider fell back to the deprecated `SelectionScopesManager` from `@itwin/presentation-frontend` package to determine the active scope. Consumers must now supply the `activeScopeProvider` callback explicitly.

Before:

```ts
const provider = new FavoritePropertiesDataProvider();
```

After:

```ts
const provider = new FavoritePropertiesDataProvider({
  activeScopeProvider: () => ({ id: "element" }),
});
```
