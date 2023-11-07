---
"@itwin/presentation-components": minor
---

Added `usePresentationTree` and `PresentationTree` for using presentation data with `ControlledTree`. This is a replacement for `usePresentationTreeNodeLoader` which is not fully compatible with React 18 and now is deprecated.

Old API:

```tsx
function Tree(props) {
  const { nodeLoader } = usePresentationTreeNodeLoader({ imodel: props.imodel, ruleset: TREE_RULESET, pagingSize: PAGING_SIZE });
  const eventHandler = useUnifiedSelectionTreeEventHandler({ nodeLoader });
  const treeModel = useTreeModel(nodeLoader.modelSource);

  return <ControlledTree width={200} height={400} model={treeModel} nodeLoader={nodeLoader} eventsHandler={eventHandler} selectionMode={SelectionMode.Single} />;
}
```

New API:

```tsx
function Tree(props) {
  const state = usePresentationTree({
    imodel: props.imodel,
    ruleset: TREE_RULESET,
    pagingSize: PAGING_SIZE,
    eventHandlerFactory: useCallback((handlerProps: TreeEventHandlerProps) => new UnifiedSelectionTreeEventHandler({ nodeLoader: handlerProps.nodeLoader }), []),
  });
  if (!state) {
    return null;
  }

  return <PresentationTree width={200} height={400} state={state} selectionMode={SelectionMode.Single} />;
}
```
