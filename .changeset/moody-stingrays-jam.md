---
"@itwin/presentation-components": minor
---

Refactored `@beta` `NavigationPropertyEditorContext` API and made it `@public`. The changes:

- `NavigationPropertyEditorContextProps` has been renamed to `NavigationPropertyEditorContext`.
- Previously `@beta` `navigationPropertyEditorContext` is now not exported anymore. Instead, the context should be set up using newly introduced `NavigationPropertyEditorContextProvider` and retrieved using the new `useNavigationPropertyEditorContext` hook.
