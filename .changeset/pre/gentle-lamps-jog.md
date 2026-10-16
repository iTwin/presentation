---
"@itwin/presentation-hierarchies-react": major
---

Renamed `GenericErrorInfo.type` value from `"Unknown"` to `"Generic"`. This type is meant for consumer-defined errors that originate outside the tree, so `"Generic"` better reflects its purpose. Update any custom errors and `error.type` checks to use `"Generic"` instead of `"Unknown"`.
