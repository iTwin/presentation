---
"@itwin/unified-selection": minor
---

Switched from `ECSchemaProvider` to `ECClassHierarchyInspector`, where appropriate.

Some of the APIs were accepting `ECSchemaProvider` as a parameter and used it to only inspect class hierarchy. This change switches them to accept `ECClassHierarchyInspector` instead - this reduces the surface area of the API and makes it more clear that only class hierarchy is being inspected, while also possibly improving performance.

This is a breaking change for the following APIs:

- `createHiliteSetProvider` prop `imodelAccess`.
- `createCachingHiliteSetProvider` prop `imodelProvider`.
- `enableUnifiedSelectionSyncWithIModel` prop `imodelAccess`.

Migration example:

```ts
import { createECSqlQueryExecutor, createECSchemaProvider } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createHiliteSetProvider } from "@itwin/unified-selection";

// before:
const hiliteProvider = createHiliteSetProvider({
  imodelAccess:  {
    ...createECSqlQueryExecutor(imodel),
    ...createECSchemaProvider(MyAppFrontend.getSchemaContext(imodel)),
  },
});

// after:
const hiliteProvider = createHiliteSetProvider({
  imodelAccess:  {
    ...createECSqlQueryExecutor(imodel),
    ...createCachingECClassHierarchyInspector({
        schemaProvider: createECSchemaProvider(MyAppFrontend.getSchemaContext(imodel)),
        cacheSize: 100,
    }),
  },
});
```
