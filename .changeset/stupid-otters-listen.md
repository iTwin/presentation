---
"@itwin/presentation-hierarchies-react": minor
---

Exposed `RootErrorRenderer`, which takes `renderRootError` property to render custom root error messages.
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

Custom error message example:

```ts
<TreeRenderer
    {...treeProps}
    rootErrorRenderer={(rootErrorRendererProps) => (
        <RootErrorRenderer
            {...rootErrorRendererProps}
            renderRootError={(rootErrorProps) => {
                return <>My error</>;
            }}
        />
    )}
/>
```
