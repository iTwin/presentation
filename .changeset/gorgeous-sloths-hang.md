---
"@itwin/presentation-components": minor
---

Instance filter builder / dialog: Promoted some `@internal` APIs to `@beta`:

- `useInstanceFilterPropertyInfos` - a hook for creating a property list based on supplied `Descriptor`. The property list is necessary for rendering the `PropertyFilterBuilder` component (`@itwin/component-react` package).
- `PresentationInstanceFilter.fromComponentsPropertyFilter` - for adding presentation data to `PropertyFilter` built by `usePropertyFilterBuilder` (`@itwin/component-react` package).
- `PresentationInstanceFilter.toComponentsPropertyFilter` - for stripping out presentation data from filter for usage with `usePropertyFilterBuilder` (`@itwin/component-react` package).
- `PresentationFilterBuilderValueRenderer` - a custom renderer for property value input. It renders unique values selector for `Equal` / `NotEqual` rules and handles numeric values' unit conversion on top of the general value input.
- `PresentationInstanceFilterPropertyInfo` - a data structure defining a property used in instance filter.
