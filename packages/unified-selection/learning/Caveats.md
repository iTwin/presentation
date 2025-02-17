# Caveats

There are now 3 selection-related APIs named very similarly:

- [SelectionSet](https://www.itwinjs.org/reference/core-frontend/selectionset/selectionset/) (accessed through `IModelConnection.selectionSet` in iTwin.js apps).
- Deprecated [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) (accessed through `Presentation.selection` in iTwin.js apps).
- `SelectionStorage` from this package.

Not only they're named similarly, but also work very similarly as well. And to make matters worse, they're all somewhat synchronized.

`SelectionStorage` and the deprecated [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) act as a single global storage of what's currently selected in the application. It allows selecting any ECInstance (model, category, graphical element or even an ECClass!) and can be used without a viewport. The deprecated [SelectionManager](https://www.itwinjs.org/reference/presentation-frontend/unifiedselection/selectionmanager/) APIs now use `SelectionStorage` under the hood.

The [SelectionSet](https://www.itwinjs.org/reference/core-frontend/selectionset/selectionset/), on the other hand, is what the tools (the ones used in the viewport) think is selected. It's like a viewport-specific selection which doesn't necessarily have to match the global selection, similar how the tree component maintains it's list of selected nodes. It only maintains graphical elements and only makes sense in a context of a viewport (or multiple of them, since [SelectionSets](https://www.itwinjs.org/reference/core-frontend/selectionset/selectionset/) are shared across all viewports associated with the same [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/)).

When [unified selection is synchronized with IModelConnection](./SyncWithIModelConnection.md), we start synchronizing the two sets so picking an element in iModel's viewport puts it into global selection (after going through all the [selection scopes](./SelectionScopes.md) processing) and putting something into unified selection gets selected in the [SelectionSet](https://www.itwinjs.org/reference/core-frontend/selectionset/selectionset/) so it can be used by tools in the viewport.

Generally, if an application uses unified selection, it should be interacting with `SelectionStorage` and related APIs.
