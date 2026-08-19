---
"@itwin/presentation-core-interop": minor
"@itwin/presentation-hierarchies": major
"@itwin/presentation-shared": major
---

`ECSchemaProvider`: Added a `classDerivesFrom` method for checking whether one ECClass is the same as, or derives from, another. `createECSchemaProvider` (in `@itwin/presentation-core-interop`) implements it using the class hierarchy information it already loads, so the answer is returned synchronously once the hierarchy has been loaded and no additional round-trips to the iModel are needed.

Also, `ECClassHierarchyInspector` and `createCachingECClassHierarchyInspector` have been deprecated. Because `ECSchemaProvider` now exposes `classDerivesFrom` directly, a separate class hierarchy inspector is no longer needed when setting up iModel access:

```ts
// Before:
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";

const schemaProvider = createECSchemaProvider(imodel);
const imodelAccess = {
...schemaProvider,
...createCachingECClassHierarchyInspector({ schemaProvider }),
...createECSqlQueryExecutor(imodel),
};

// After:
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";

const imodelAccess = {
...createECSchemaProvider(imodel), // now also provides `classDerivesFrom`
...createECSqlQueryExecutor(imodel),
};
```

**Breaking changes:**

- `ECSchemaProvider` now requires a `classDerivesFrom` method. Objects created via `createECSchemaProvider` get it automatically, so most consumers don't need to change anything. Only custom, hand-written `ECSchemaProvider` implementations need to add the method.

- Renamed the `classHierarchyInspector` prop to `imodelAccess` on `createClassBasedInstanceLabelSelectClauseFactory`, `createBisInstanceLabelSelectClauseFactory` (both in `@itwin/presentation-shared`) and `createPredicateBasedHierarchyDefinition` (in `@itwin/presentation-hierarchies`). The prop's type is unchanged, so the value passed to it doesn't need to change - only the prop name:

    ```ts
    // Before:
    const classHierarchyInspector = createCachingECClassHierarchyInspector({ schemaProvider: createECSchemaProvider(imodel) });
    createPredicateBasedHierarchyDefinition({ classHierarchyInspector, hierarchy });

    // After:
    const imodelAccess = createECSchemaProvider(imodel);
    createPredicateBasedHierarchyDefinition({ imodelAccess, hierarchy });
    ```
