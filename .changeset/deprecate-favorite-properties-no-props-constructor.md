---
"@itwin/presentation-components": minor
---

`FavoritePropertiesDataProvider`: Deprecated creating the provider without props or without an `activeScopeProvider`.

Always create the provider with props that include an `activeScopeProvider`. Creating it without props (or without `activeScopeProvider`) makes the provider rely on the deprecated `Presentation.selection.scopes` global from `@itwin/presentation-frontend`. The `activeScopeProvider` prop will be made required in the next major release.

Migration example:

```ts
// Before (deprecated)
const provider = new FavoritePropertiesDataProvider();

// After
const provider = new FavoritePropertiesDataProvider({
  activeScopeProvider: () => ({ id: "element" }),
});
```
