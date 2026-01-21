---
"@itwin/presentation-hierarchies-react": major
---

Updated tree node rename UI to show input in popover instead of inline. Additionally added ability to show hint for supported characters and validate new label.

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
