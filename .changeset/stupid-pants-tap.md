---
"@itwin/presentation-hierarchies": minor
---

**BREAKING:** Added a required `HierarchyProvider.hierarchyChanged` attribute.

The attribute is of type `Event` and should be raised by the provider whenever the underlying data source changes in a way that affects the resulting hierarchy. This moves the responsibility of data source change tracking from the consumers using the provider to the provider itself. All provider implementations delivered by this package have been updated to raise this event when necessary.
