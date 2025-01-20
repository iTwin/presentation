---
"@itwin/presentation-hierarchies-react": minor
---

Changed how tree state hooks access unified selection storage.

- The tree state hooks that hook into unified selection system now accept a `selectionStorage` prop. At the moment the prop is optional, but will be made required in the next major release of the package.
- The `UnifiedSelectionProvider` React context provider is now deprecated. The context is still used by tree state hooks if the selection storage is not provided through prop.

Example of how to migrate to the new API:

```tsx
const selectionStorage = createStorage();

// before
function MyTreeComponent() {
  // the hook takes selection storage from context, set up by the App component
  const treeState = useUnifiedSelectionTree({ ... });
  // ...
}
function App() {
  return (
    <UnifiedSelectionProvider storage={selectionStorage}>
      <MyTreeComponent />
    </UnifiedSelectionProvider>
  );
}

// after
function MyTreeComponent({ selectionStorage }: { selectionStorage: SelectionStorage }) {
  // the hook takes selection storage from props
  const treeState = useUnifiedSelectionTree({ selectionStorage, ... });
  // ...
}
function App() {
  return (
    <MyTreeComponent selectionStorage={selectionStorage} />
  );
}
```
