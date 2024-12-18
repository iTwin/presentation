---
"@itwin/presentation-core-interop": minor
---

Add a `createIModelKey` function to safely create an identifier for an `IModel` in different situations.

Example:

```ts
import { IModelConnection } from "@itwin/core-frontend";
import { createIModelKey } from "@itwin/presentation-core-interop";

IModelConnection.onOpen.addListener((imodel: IModelConnection) => {
  const key = createIModelKey(imodel);
  console.log(`IModel opened: "${key}"`);
});
```
