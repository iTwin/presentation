---
"@itwin/presentation-hierarchies-react": patch
---

Added `activeDescription` optional property to TreeItemAction interface, which when provided a value will display a dot above the button indicating an active state. The provided value is used to set accesible description and should explain why the action item is active.

Renamed `createFilterAction` to `useFilterAction`.
