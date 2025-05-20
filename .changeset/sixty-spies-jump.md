---
"@itwin/presentation-hierarchies-react": major
---

**Breaking changes** to tree state hooks `useTree`, `useUnifiedSelectionTree`, `useIModelTree`, `useIModelUnifiedSelectionTree`:
- All tree rendering props have been moved under `treeRendererProps`. The value can be passed to `<StrataKitTreeRenderer />` component.
- In case an error occurs while loading the root hierarchy level, instead of `treeRendererProps`, the `rootErrorRendererProps` are set, which can be passed to `<StrataKitRootErrorRenderer />` component to render the error state.
- The `isLoading` attribute has been renamed to `isReloading`.
- Errors are no longer defined as children of `PresentationHierarchyNode` and instead are now included as `error` attribute for more fluent API.

When rendering tree state, the recommended order of checks is:
1. If `rootErrorRendererProps` is defined, there was an error - render error state.
2. If `treeRendererProps` is not defined, the component is doing the initial load - render loading state.
3. If `treeRendererProps` is defined, the hierarchy is loaded - render the tree component. 
   
   The `isReloading` attribute may also be set at the same time, indicating that the hierarchy is being reloaded in the background. Consumers may want to render an overlay in this case, or not render the tree at all.

Example:

```ts
function MyComponent () {
    const useTreeResult = useIModelUnifiedSelectionTree({...});

    // handle possible root errors with our provided component or your own custom implementation
    if (treeProps.rootErrorRendererProps) {
      return <StrataKitRootErrorRenderer {...useTreeResult.rootErrorRendererProps} />;
    }

    // handle loading state
    if (!treeProps.treeRendererProps) {
      return <MyLoadingComponent />;
    }

    // handle loaded hierarchy
    return <StrataKitTreeRenderer {...useTreeResult.treeProps} />;
}
