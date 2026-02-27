---
"@itwin/presentation-hierarchies-react": major
---

Reworked `localization` to use `i18next`-compatible approach. Instead of passing a `localizedStrings` object into `LocalizationContextProvider`, the package now delivers an English locale JSON file and resolves strings through a `getLocalizedString` function at runtime.

**Breaking changes**

- `LocalizationContextProvider` no longer accepts a `localizedStrings` object. It now requires a `localization` prop — an object with a `getLocalizedString(key: string): string` method (compatible with `Localization` from @itwin/core-common).
- `LOCALIZATION_NAMESPACES` must be registered with your localization provider during app initialization to make localized strings available.
