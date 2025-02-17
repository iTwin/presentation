# Tree selection synchronization with unified selection

Tree components show a hierarchy of nodes. In case of unified selection-enabled tree, the nodes are expected to represent some kind of _ECInstance_ (a _Model_, _Element_ or basically anything from the [EC world](https://www.itwinjs.org/bis/guide/intro/overview/)).

The rules for interacting with unified selection are very simple in this case:

- when unified selection changes, we mark nodes as selected if _ECInstances_ they represent are in the unified selection storage,
- when a node is selected, we add _ECInstance_ represented by the node to unified selection storage.

In short, this is similar to how _Component A_ works in the [selection levels example](./SelectionLevels.md).

## Reference

The `@itwin/presentation-hierarchies-react` package delivers two React hooks that integrate the trees with unified selection, in addition to going general tree state management: `useUnifiedSelectionTree` and `useIModelUnifiedSelectionTree`.

The key to integrating the hook with this package is providing the `selectionStorage` prop.

See [the package's README](https://www.npmjs.com/package/@itwin/presentation-hierarchies-react) for more details.
