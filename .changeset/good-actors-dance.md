---
"@itwin/presentation-hierarchies-react": patch
---

Replaced `TreeNodeRenderer.getIcon` prop with `getDecorations` prop.

The `getIcon` prop took either an icon URI, or a `ReactElement`. The new `getDecorations` prop allows passing multiple React elements, allowing consumers to render not just the icon, but also addition components like a tag or a color swatch. Migration:

```ts
// previously, when `getIcon` returned a `ReactElement`:
function myGetIcon(node: PresentationHierarchyNode): React.ReactElement {
  // implementation...
}
<TreeNodeRenderer getIcon={myGetIcon} />

// now:
<TreeNodeRenderer getDecorations={[myGetIcon]} />

// previously, when `getIcon` returned an icon URI:
function myGetIconUri(node: PresentationHierarchyNode): string {
  // implementation...
}
<TreeNodeRenderer getIcon={myGetIconUri} />

// now:
<TreeNodeRenderer getDecorations={[(node) => <Icon href={myGetIconUri(node)} />]} />
```
