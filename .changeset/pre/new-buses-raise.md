---
"@itwin/presentation-hierarchies-react": major
---

Improve custom errors rendering API:

- Separated the `ChildrenLoad` error from the `Generic` error. All expected tree errors have a dedicated type, and the `Generic` error can be used to handle custom errors encountered outside of the tree.
- Exposed `ErrorItemRenderer` that renders all error types supported by the tree.
- Updated `TreeErrorRenderer` to pass all props necessary to render `ErrorItemRenderer` into the `renderError` callback.

These changes make it easier to customize only some types of errors and leave default handling for others.

Example:
```tsx
<StrataKitTreeRenderer
  {...treeProps}
  errorRenderer={(errorProps) => {
    return (
      <TreeErrorRenderer
        {...errorProps}
        renderError={(errorItemProps) => {
          if (errorItemProps.error.type === "Generic") {
            return <ErrorRegion.Item message="Custom error" messageId={errorItemProps.treeNode.id} />;
          }
          return <ErrorItemRenderer {...errorItemProps} />;
        }}
      />
    );
  }}
/>
```
