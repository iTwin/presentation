---
"@itwin/presentation-components": minor
---

`PresentationPropertyDataProvider`: add `propertiesMergeMode` property (`"union" | "intersection"`, defaults to `"union"`) and export the `PropertiesMergeMode` type. When set to `"intersection"`, only properties common to all selected element classes are displayed in the property grid; otherwise properties from all selected classes are shown.
