---
"@itwin/presentation-components": major
---

Removed deprecated APIs.

Removed deprecated exports:
- `PresentationTreeNodeLoaderProps` - use `usePresentationTreeState` instead.
- `PresentationTreeNodeLoaderResult` - use `usePresentationTreeState` instead.
- `usePresentationTreeNodeLoader` - use `usePresentationTreeState` instead.
- `useRulesetRegistration` - use `Presentation.presentation.rulesets().add(ruleset)` directly.
- `useUnifiedSelectionTreeEventHandler` - use `usePresentationTreeState` with `UsePresentationTreeProps.eventHandlerFactory`, or manually create and dispose `UnifiedSelectionTreeEventHandler`.

Removed deprecated members:
- `ContentDataProvider.getFieldByPropertyRecord` - use `ContentDataProvider.getFieldByPropertyDescription` instead.
- `IContentDataProvider.getFieldByPropertyRecord` - use `IContentDataProvider.getFieldByPropertyDescription` instead.
- `IPresentationTreeDataProvider.getNodeKey` - use `isPresentationTreeNodeItem` and `PresentationTreeNodeItem.key` to get the `NodeKey`.
- `PresentationTreeDataProvider.getNodeKey` - use `isPresentationTreeNodeItem` and `PresentationTreeNodeItem.key` to get the `NodeKey`.
- `PresentationTreeDataProviderDataSourceEntryPoints.getNodesCount` - the entry point is not used anymore, its usage has been replaced by `getNodesIterator`.
- `UnifiedSelectionTreeEventHandler.getNodeKey` - use `isPresentationTreeNodeItem` and `PresentationTreeNodeItem.key` to get the `NodeKey`.
