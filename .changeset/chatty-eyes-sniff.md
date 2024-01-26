---
"@itwin/presentation-components": minor
---

Instance filter builder / dialog: Added `GenericInstanceFilter` data structure that has all the data needed to convert an instance filter to `ECSQL`, `ECExpression` or other formats.

The new data structure can be created from `PresentationInstanceFilter` using the `GenericInstanceFilter.fromPresentationInstanceFilter` call:

```tsx
// Create state for `PropertyFilterBuilderRenderer`.
const { rootGroup, actions, buildFilter } = usePropertyFilterBuilder();
// Build a properties filter by calling `buildFilter`. This data structure has no metadata about the properties.
const componentsFilter: PropertyFilter = buildFilter();
// Create `PresentationInstanceFilter` from a `Descriptor` and `PropertyFilter`. The presentation filter contains properties'
// metadata (taken from descriptor), but it's not placed in a convenient way for consumers' use.
const presentationFilter: PresentationInstanceFilter = PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, componentsFilter);
// Create `GenericInstanceFilter` from the `PresentationInstanceFilter`. The result has all the necessary information to
// build a filter (ECSQL, ECExpression, etc.) structured in a convenient way.
const genericFilter: GenericInstanceFilter = GenericInstanceFilter.fromPresentationInstanceFilter(presentationFilter);
```
