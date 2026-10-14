---
"@itwin/presentation-hierarchies-react": minor
---

`TreeNode` now supports multiple errors via `errors: ErrorInfo[]`, allowing both internal errors and custom errors provided through `getTreeNodeErrors` to be combined and displayed.

**Breaking changes:**

- `TreeNode.error?: ErrorInfo` replaced by `TreeNode.errors: ErrorInfo[]`.
- `UseTreeProps.getTreeNodeError` renamed to `getTreeNodeErrors` and now returns `ErrorInfo[]` instead of `ErrorInfo | undefined`.
- `ErrorItemRendererProps` now provides `treeNode` without `errors` and `error` instead of `errorNode`.
- `TreeErrorRenderer`'s `renderError` callback is now called once per error (instead of once per node), receiving the updated `ErrorItemRendererProps`.
- `scrollToNode` callback in `ErrorItemRendererProps` now receives `Omit<TreeNode, "errors">` instead of `TreeNode`.
