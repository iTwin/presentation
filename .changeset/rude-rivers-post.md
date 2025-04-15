---
"@itwin/presentation-hierarchies-react": minor
---

Exposed `TreeErrorRenderer`, which takes `renderError` property to render custom error messages.
`TreeRenderer` now takes `errorRenderer` to render a custom error display component.

Custom error display component example:

```ts
<TreeRenderer
    {...treeProps}
    errorRenderer={(errorsRendererProps) => (
        <MyErrorRenderer {...errorsRendererProps} />
    )}
/>
```

Custom error message example:

```ts
<TreeRenderer
    {...treeProps}
    errorRenderer={(errorsRendererProps) => (
        <TreeErrorRenderer
            {...errorsRendererProps}
            renderError={(errorProps) => {
                return <unstable_ErrorRegion.Item message={...} />;
            }}
        />
    )}
/>
```
