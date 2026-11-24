---
"@itwin/presentation-hierarchies-react": minor
---

`StrataKitTreeRenderer`: Added `scrollToNode` method to the renderer ref (`StrataKitTreeRendererAttributes`). It accepts a `nodePredicate` to identify an already loaded target node and scrolls the node into view. If the node is under a collapsed parent or deep in the hierarchy, all its collapsed ancestors are expanded first. An optional `onComplete` callback is called with the target node once it's scrolled into view. Returns `"node-not-found"` if no node matches the predicate, `"success"` otherwise.

```tsx
const treeRef = useRef<StrataKitTreeRendererAttributes>(null);
// ...
treeRef.current?.scrollToNode({ nodePredicate: (node) => node.id === newNodeId });
```
