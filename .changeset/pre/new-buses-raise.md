---
"@itwin/presentation-hierarchies-react": major
---

Improve custom errors rendering API:

- Separated `ChildrenLoad` error from the `Unknown` error. All expected tree errors have dedicated type and `Unknown` error can be used to handle custom errors encountered outside of tree.
- Exposed `ErrorItemRenderer` that renders all error types supported by the tree.
- Updated `TreeErrorRenderer` to pass all props necessary to render `ErrorItemRenderer` into `renderError` callback.

These changes makes it easier to customize only some types of errors and leave default handling for others.

Example:
```tsx
<StrataKitTreeRenderer
  {...treeProps}
  errorRenderer={(errorProps) => {
    return (
      <TreeErrorRenderer
        {...errorProps}
        renderError={(errorItemProps) => {
          if (errorItemProps.errorItem.errorNode.error.type === "Unknown") {
            return <ErrorRegion.Item message="Custom error" messageId={errorItemProps.errorItem.errorNode.id} />;
          }
          return <ErrorItemRenderer {...errorItemProps} />;
        }}
    />);
  }}
/>
```
