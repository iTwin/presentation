---
"@itwin/presentation-hierarchies-react": minor
---

Fixed tree state hooks not returning root nodes when hierarchy provider doesn't raise the `onHierarchyChanged` event upon setting a hierarchy filter.

Callback `onPerformanceMeasured` now provides a state property which tells if request was completed or debounced.
