---
"@itwin/presentation-components": minor
---

Start using new features available in `@itwin/presentation-frontend` `4.5` release.

- Added support for `FavoritePropertiesDataFiltererProps.isFavorite` to return `Promise<boolean>` in addition to already supported `boolean`.
- Added support for `PresentationPropertyDataProvider.isFieldFavorite` to return `Promise<boolean>` in addition to already supported `boolean`.
- Added support for `PresentationPropertyDataProvider.sortFields` to return a `Promise<void>`.
- Deprecated `PresentationTreeDataProviderDataSourceEntryPoints.getNodesAndCount` in favor of `getNodesIterator`. The deprecated override is still used, if supplied.
