---
"@itwin/presentation-components": minor
---

Promoted some instance filtering - related `internal` APIs to `beta`:

- `useInstanceFilterPropertyInfos` - for creating a property list based on supplied `Descriptor`. The property list is necessary for rendering the `PropertyFilterBuilder` component from `@itwin/component-react` package.
- `PresentationFilterBuilderValueRenderer` - a custom renderer for property value input. It renders unique values selector for `Equal` / `NotEqual` rules and handles unit conversion on top of the general value input.
- `PresentationInstanceFilter.fromComponentsPropertyFilter` - for adding presentation data to `PropertyFilter` built by `usePropertyFilterBuilder`.
- `PresentationInstanceFilter.toComponentsPropertyFilter` - for stripping out presentation data from filter for usage with `usePropertyFilterBuilder`.
- `PresentationInstanceFilterPropertyInfo` - data structure defining a property used in instance filter.

Also, moved a couple of beta APIs to a common namespace to make them more discoverable:

- `convertToInstanceFilterDefinition` -> `PresentationInstanceFilter.toInstanceFilterDefinition`,
- `isPresentationInstanceFilterConditionGroup` -> `PresentationInstanceFilter.isConditionGroup`.
