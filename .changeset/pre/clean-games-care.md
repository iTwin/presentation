---
"@itwin/presentation-hierarchies": major
"@itwin/presentation-hierarchies-react": patch
---

Change `HierarchyProvider.hierarchyChanged` argument to be required.

This simplifies the API for users of `HierarchyProvider`, as they no longer need to check for `undefined` when handling hierarchy changes.

For implementors of custom `HierarchyProvider`, this change means that they must always provide an even argument when raising the `hierarchyChanged` event. Since all members of the argument type are optional, it's okay to raise the even with an empty object, e.g.: `this.hierarchyChanged.raiseEvent({})`.
