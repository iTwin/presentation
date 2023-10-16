---
"@itwin/presentation-components": minor
---

Promoted some `internal` APIs to `beta` that might be required to build filters using presentation data:

- `usePropertyInfos` - for getting property list based on supplied Descriptor.
- `PresentationFilterBuilderValueRenderer` - custom renderer for value input. It renders unique values selector for `Equal`/`NotEqual` rules and handles units.
- `createPresentationInstanceFilter` - for adding presentation data to `PropertyFilter`.
- `convertPresentationFilterToPropertyFilter` - for stripping out presentation data from filter for usage with `usePropertyFilterBuilder`.
- `InstanceFilterPropertyInfo` - data structure defining property used in filter.
