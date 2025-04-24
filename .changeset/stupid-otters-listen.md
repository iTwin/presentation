---
"@itwin/presentation-hierarchies-react": minor
---

`TreeRenderer` now takes `rootErrorRenderer` to render a custom root error display component.

Custom error display component example:

```ts
<TreeRenderer
    {...treeProps}
    rootErrorRenderer={(rootErrorRendererProps) => (
        <MyRootErrorRenderer {...rootErrorRendererProps} />
    )}
/>
```
