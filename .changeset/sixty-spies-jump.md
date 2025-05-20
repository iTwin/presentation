---
"@itwin/presentation-hierarchies-react": major
---

- `UseTree` and `useUnifiedSelectionTree` now return `RootErrorRendererProps` or `TreeRendererProps`, which are needed to render components.

- `UseTree` and `useUnifiedSelectionTree` now return `IsReloading` instead of `IsLoading` which is only set to true when tree structure is reloading. For initial loading `TreeRendererProps` are set to `undefined`

New workflow usage example:

```ts
function myComponent () {
    const useTreeResult = useIModelUnifiedSelectionTree({...});

    // handle posible root errors with our provided component
    // or your own custom implementation
    if (treeProps.rootErrorRendererProps) {
      return <StrataKitRootErrorRenderer {...useTreeResult.rootErrorRendererProps} />;
    }

    // Handle loading
    if (!treeProps.treeRendererProps) {
      return (
        <MyLoadingComponent />
      );
    }

    return <StrataKitTreeRenderer {...useTreeResult.treeProps} />;
}
```

- Errors are no longer defined as children of `PresentationHierarchyNode` instead are now included as `error` atribute to better reflect UI.
