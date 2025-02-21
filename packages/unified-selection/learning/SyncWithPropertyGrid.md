# Property grid integration with unified selection

Property grid is a component that can show multiple categorized property label - value pairs. In the context of [EC](https://www.itwinjs.org/bis/guide/intro/overview/), it shows properties of one _ECInstance_. It can also show properties of multiple _ECInstances_ by merging them into one before displaying.

The property grid has no way to change the selection and merely reacts to unified selection changes by displaying properties of _ECInstances_ that got selected during the last selection change (no matter the selection level).

In short, this is similar to how _Component C_ works in the [selection levels example](./SelectionLevels.md).

## Reference

The `@itwin/presentation-components` package delivers [usePropertyDataProviderWithUnifiedSelection](https://www.itwinjs.org/reference/presentation-components/propertygrid/usepropertydataproviderwithunifiedselection/) React hook to make setting up Property Grid components to work with Unified Selection easier. The hook takes an [IPresentationPropertyDataProvider](https://www.itwinjs.org/reference/presentation-components/propertygrid/ipresentationpropertydataprovider/) and updates its `keys` prop whenever Unified Selection changes.

The key to integrating the hook with this package is to provide a value for the `selectionStorage` prop. The prop is currently optional for backwards compatibility reasons, but is required to avoid using the deprecated `SelectionManager`.
