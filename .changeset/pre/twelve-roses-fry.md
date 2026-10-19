---
"@itwin/presentation-hierarchies-react": minor
---

Tree nodes expose their errors through a `TreeNode.errors: ErrorInfo[]` attribute instead of separate info child nodes. Both internal errors and custom errors provided through the `getTreeNodeErrors` callback of `useTree` (and its variants) are combined in this attribute.
