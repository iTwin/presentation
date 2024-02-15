---
"@itwin/presentation-components": minor
---

- Change `PresentationTreeProps.treeRenderer` type to make it more compatible with `PresentationTreeRenderer`.

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

- Removed `nodeRenderer` props from `PresentationTreeRendererProps`. It was always overriding passed `nodeRenderer`.
