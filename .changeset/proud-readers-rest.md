---
"@itwin/presentation-components": minor
---

`PresentationInstanceFilterDialog` now invokes `onApply` callback with only selected classes.
Added `createInstanceFilterDefinition` that creates `InstanceFilterDefinition` from `PresentationInstanceFilterInfo`. Created definition can be passes to `PresentationManager` in order to filter results.
