---
"@itwin/presentation-hierarchies-react": major
---

Tree rendering components now build on the StrataKit design system (with MUI) instead of iTwinUI.

As a result, the package now declares `@stratakit/foundations@^1.0.0`, `@stratakit/mui@^1.0.0` and `@mui/material@^9.4.0` as optional peer dependencies. Applications that use these components must add the three packages to their own `dependencies`; libraries that re-export the components should forward them as peer dependencies.
