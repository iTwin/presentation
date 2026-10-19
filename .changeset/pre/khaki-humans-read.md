---
"@itwin/presentation-hierarchies-react": major
---

Tree node rename UI shows the label editor in a popover, with support for a hint describing allowed characters and validation of the new label.

Example:
```tsx
type TreeRendererProps = ComponentProps<typeof StrataKitTreeRenderer>;

const getEditingProps = useCallback<Required<TreeRendererProps>["getEditingProps"]>((node) => {
  return {
    onLabelChanged: (newLabel: string) => {
      // Handle label change
    },
    labelValidationHint: `Allowed are A to Z, 0 to 9, "-" and "_"`,
    validate: (newLabel: string) => /^[A-Za-z0-9\- ]+$/.test(newLabel),
  };
}, []);

return <StrataKitTreeRenderer {...treeProps} getEditingProps={getEditingProps} />;
```

**Breaking changes**

- `getEditingProps` callback was changed to require `onLabelChanged`. If node does not support renaming `getEditingProps` should return `undefined`.
