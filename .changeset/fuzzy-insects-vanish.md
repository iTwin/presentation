---
"@itwin/presentation-components": minor
---

Simplify / clarify `PresentationTree` and `PresentationTreeRenderer` APIs.

- Change `PresentationTreeProps.treeRenderer` type to make it compatible with what `PresentationTreeRenderer` expects.

  Before:

  ```tsx
  return <PresentationTree
    {...props}
    state={state}
    treeRenderer={(treeProps) => <PresentationTreeRenderer {...treeProps} nodeLoader={state.nodeLoader} />}
  />;
  ```

  After:

  ```tsx
  return <PresentationTree
    {...props}
    state={state}
    treeRenderer={(treeProps) => <PresentationTreeRenderer {...treeProps} />}
  />;
  ```

- Removed `nodeRenderer` prop from `PresentationTreeRendererProps`. The prop is not used by `PresentationTreeRenderer` as it always uses its own `PresentationTreeNodeRenderer` to render nodes.
