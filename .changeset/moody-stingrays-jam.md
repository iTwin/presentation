---
"@itwin/presentation-components": minor
---

Refactored `@beta` `NavigationPropertyEditorContext` API and made it `@public`. The changes:

- `NavigationPropertyEditorContextProps` has been renamed to `NavigationPropertyEditorContextProviderProps`.
- Previously `@beta` `navigationPropertyEditorContext` is now not exported anymore. Instead, the context should be set up using newly introduced `NavigationPropertyEditorContextProvider`.