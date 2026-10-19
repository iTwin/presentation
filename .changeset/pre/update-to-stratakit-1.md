---
"@itwin/presentation-hierarchies-react": major
---

The StrataKit-based tree components now rely on `@stratakit/foundations@^1.0.0`, `@stratakit/mui@^1.0.0` and `@mui/material@^9.4.0`, which are declared as optional peer dependencies. Applications that use these components must add the three packages to their own `dependencies`; libraries that re-export the components should forward them as peer dependencies.
