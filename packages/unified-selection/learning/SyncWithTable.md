# Table selection synchronization with unified selection

Table is a component that displays data in a table layout. In the context of [EC](https://www.itwinjs.org/bis/guide/intro/overview/) it's used to display _ECInstance_ properties - one column per property, one row per _ECInstance_.

The rules for interacting with unified selection are:

- when unified selection changes at the 0th level, we load properties for selected _ECInstances_,
- when unified selection changes at the 1st level, we highlight rows that represent selected _ECInstances_,
- when a row is selected, we add the _ECInstance_ it represents to unified selection at the 1st level.

In short, this is similar to how _Component B_ works in the [selection levels example](./SelectionLevels.md).

## Reference

The `@itwin/presentation-components` package delivers [usePresentationTableWithUnifiedSelection](https://www.itwinjs.org/reference/presentation-components/table/usepresentationtablewithunifiedselection/) hook to make setting up Table components to work with Unified Selection easier. The hook uses the general [usePresentationTable](https://www.itwinjs.org/reference/presentation-components/table/usepresentationtable/), but updates the [UsePresentationTableProps.keys](https://www.itwinjs.org/reference/presentation-components/table/usepresentationtableprops/) prop every time Unified Selection changes.

The key to integrating the hook with this package is to provide a value for the `selectionStorage` prop. The prop is currently optional for backwards compatibility reasons, but is required to avoid using the deprecated `SelectionManager`.
