---
"@itwin/presentation-hierarchies-react": minor
---

Updated tree node rename UI to show input in popover instead of inline. Additionally added ability to show hint for supported characters and validate new label.

**Breaking changes**

- `getEditingProps` callback was changed to require `onLabelChanged`. If node does not support renaming `getEditingProps` should return `undefined`.
