---
"@itwin/presentation-components": minor
---

Start using new features available in `@itwin/presentation-frontend` `4.5` release.

- Added support for `FavoritePropertiesDataFiltererProps.isFavorite` to return `Promise<boolean>` in addition to already supported `boolean`.
- Added `PresentationPropertyDataProvider.isFieldFavoriteAsync` in favor of now deprecated `isFieldFavorite`.
- Added `PresentationPropertyDataProvider.sortFieldsAsync` in favor of now deprecated `sortFields`.
- Added `PresentationTreeDataProviderDataSourceEntryPoints.getNodesIterator` in favor of now deprecated `getNodesAndCount`.

In all of the above cases the deprecated overrides are still being used, if supplied.
