---
"@itwin/presentation-components": major
---

Tree: Show the size of filtered tree hierarchy level while building a filter.

Includes breaking `@beta` API change in `PresentationTreeRenderer` - instead of taking `IModelConnection`, `TreeModelSource` and `ITreeNodeLoader` as 3 separate props, it now takes a single `AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>` prop. Implementing the feature required adding an `IPresentationTreeDataProvider` to props, however requesting a single, more specific, node loader instead of 4 different props that are tightly coupled was a much cleaner solution, especially since using `PresentationTreeRenderer` with node loaders other than `AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>` made little sense.

Generally, reacting to the change is as simple as removing `imodel` and `modelSource` from the list of props, passed to `PresentationTreeRenderer`. In case the type of `nodeLoader` prop doesn't match, we recommend using the new `usePresentationTreeState` for creating one. Or, if the tree is not based on presentation rules, not using the `PresentationTreeRenderer` at all and instead switching to `TreeRenderer` from `@itwin/components-react` package.
