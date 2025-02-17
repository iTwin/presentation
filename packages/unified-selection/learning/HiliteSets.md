# Hilite sets

> **Note:** hilite = highlight

`@itwin/core-frontend` contains a concept called the [HiliteSet](https://www.itwinjs.org/reference/core-frontend/selectionset/hiliteset/). This concept is tightly related to unified selection, because, generally, we want selected elements to be highlighted in the application's graphics views. The `HiliteSet` object contains IDs of 3 types of elements: [GeometricModel](https://www.itwinjs.org/reference/core-backend/models/geometricmodel/), [SubCategory](https://www.itwinjs.org/reference/core-backend/imodels/subcategory/) and [GeometricElement](https://www.itwinjs.org/reference/core-backend/elements/geometricelement/). On the other hand, the unified selection API allows selecting other kinds of elements too, so IDs of these elements need to be mapped to the supported ones. The rules are as follows:

- for `BisCore.Subject` return IDs of all geometric models that are recursively under that Subject,
- for `BisCore.Model` just return its ID,
- for `BisCore.PhysicalPartition` just return ID of a model that models it,
- for `BisCore.Category` return IDs of all its _SubCategories_,
- for `BisCore.SubCategory` just return its ID,
- for `BisCore.GeometricElement` return ID of its own and all its child elements recursively.

So for example when unified selection contains a Subject, the hilite set for it will contain all models under that Subject, it's child Subjects, their child Subjects, etc. Given such hilite set, the viewport component hilites all elements in those models.

The `@itwin/unified-selection` package delivers APIs for creating a `HiliteSet` or retrieving it for _current_ selection in a `SelectionStorage`:

```ts
// Components may want to get a hilite set for arbitrary set of Selectables - use `createHiliteSetProvider` for that.
import { IModelConnection } from "@itwin/core-frontend";
import { createECSqlQueryExecutor, createECSchemaProvider } from "@itwin/presentation-core-interop";
import { createHiliteSetProvider } from "@itwin/unified-selection";

const imodel: IModelConnection; // initialized elsewhere

// iModel's schema context should be shared between all components using the iModel (implementation
// of the getter is outside the scope of this example)
const imodelSchemaContext: SchemaContext = getSchemaContext(iModelConnection);

const hiliteProvider = createHiliteSetProvider({
  imodelAccess: {
    ...createECSchemaProvider(imodelSchemaContext),
    ...createECSqlQueryExecutor(imodel),
  },
});
const hiliteSet = await hiliteProvider.getHiliteSet({ selectables });

// Some others may want to get a hilite set for _current_ selection for specific iModel in storage - use `createCachingHiliteSetProvider`
// for that. It's recommended to keep a single instance of this provider per application as it caches hilite sets per each iModel's selection.
import { createCachingHiliteSetProvider } from "@itwin/unified-selection";
import { createIModelKey } from "@itwin/presentation-core-interop";

// Note the use of `using` keyword here. The caching provider registers a selection change listener and should be disposed, in case
// its lifetime is shorter than that of `SelectionStorage`, to unregister the listener. The `using` keyword ensures that the provider
// is disposed when it goes out of scope.
using selectionHiliteProvider = createCachingHiliteSetProvider({
  selectionStorage,
  // this is called to get iModel access based on the iModel key, used to get hilite set for that iModel (see below)
  imodelProvider: (imodelKey) => getIModelByKey(imodelKey),
});
const selectionHiliteSet = await selectionHiliteProvider.getHiliteSet({ imodelKey: createIModelKey(imodel) });
```

See [iModel selection synchronization with unified selection](./SyncWithIModelConnection.md) for an example of how to easily enable automatic synchronization of iModel's hilite set with a `SelectionStorage`.
