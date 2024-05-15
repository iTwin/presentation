---
"@itwin/presentation-components": minor
---

Moved `@itwin/itwinui-react` from direct dependencies to peer. Technically this is a breaking change but `@itwin/presentation-components` had requirement to be used with `@itwin/itwinui-react` >3.0.0 since 5.0.0 so all consumers of >5.0.0 should already have dependency on `@itwin/itwinui-react` >3.0.0.
