---
"@itwin/unified-selection": minor
---

Added optional `componentId` to `ComputeSelectionProps`. This id is used as part of a `restartToken` when executing ECSQL queries inside the function. Restart token is used to cancel duplicate queries. The provided `componentId` should be unique and not shared across different components.
