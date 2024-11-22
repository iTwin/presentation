---
"@itwin/presentation-hierarchies-react": minor
"@itwin/presentation-hierarchies": minor
---

Unify hierarchy updates' handling.

Previously, we'd only raise the `HierarchyProvider.hierarchyChanged` event on data source changes. The tree state hooks would listen to this event and trigger a hierarchy update. However, there are a few other reasons for the hierarchy to change - changing formatter or active hierarchy filter. In those situations the event was not raised, but tree state hooks still had to trigger hierarchy update. So we ended up with a mix of event-driven and manual hierarchy updates.

With this change we're clearly stating that a hierarchy provider should trigger its `hierarchyChanged` event whenever something happens that causes the hierarchy to change. That means, the event will be raised when formatter or hierarchy filter is set, and tree state hooks can initiate hierarchy reload from a single place - the `hierarchyChanged` event listener.

To let event listeners know what caused the hierarchy change, the event now has event arguments, which should be set by the hierarchy provider when raising the event. This allows listeners to customize hierarchy reload logic - for example, our tree state hooks always keep existing tree state except when a new hierarchy filter is set, in which case the existing state is discarded.
