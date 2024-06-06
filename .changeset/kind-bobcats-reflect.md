---
"@itwin/presentation-core-interop": patch
---

Avoid repeated schema requests from `SchemaContext` - otherwise we're downloading the same schema from the backend multiple times.
