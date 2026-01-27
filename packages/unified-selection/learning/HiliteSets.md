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

The `@itwin/unified-selection` package delivers APIs for creating a `HiliteSet` or retrieving it for _current_ selection in a `SelectionStorage`.

- The first option is to use a provider that can create a hilite set from arbitrary selection. This is done via the `createHiliteSetProvider` function:

   <!-- [[include: [Presentation.UnifiedSelection.HiliteSets.BasicProviderImports, Presentation.UnifiedSelection.HiliteSets.BasicProvider], ts]] -->
   <!-- BEGIN EXTRACTION -->

  ```ts
  import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
  import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
  import { createHiliteSetProvider } from "@itwin/unified-selection";

  const schemaProvider = createECSchemaProvider(getIModelConnection().schemaContext);
  const hiliteProvider = createHiliteSetProvider({
    imodelAccess: {
      ...schemaProvider,
      ...createCachingECClassHierarchyInspector({ schemaProvider }),
      ...createECSqlQueryExecutor(imodel),
    },
  });
  const hiliteSetIterator = hiliteProvider.getHiliteSet({ selectables });
  ```

   <!-- END EXTRACTION -->

- The second option is to use an iModel-specific provider that retrieves the hilite set for iModel's current selection and caches it until selection changes. This is done via the `createIModelHiliteSetProvider` function:

   <!-- [[include: [Presentation.UnifiedSelection.HiliteSets.IModelProviderImports, Presentation.UnifiedSelection.HiliteSets.IModelProvider], ts]] -->
   <!-- BEGIN EXTRACTION -->

  ```ts
  import { createIModelHiliteSetProvider } from "@itwin/unified-selection";
  import { createIModelKey } from "@itwin/presentation-core-interop";

  // Note the use of `using` keyword here. The caching provider registers a selection change listener and should be disposed, in case
  // its lifetime is shorter than that of `SelectionStorage`, to unregister the listener. The `using` keyword ensures that the provider
  // is disposed when it goes out of scope.
  using selectionHiliteProvider = createIModelHiliteSetProvider({
    selectionStorage,
    // this is called to get iModel accessor based on the iModel key
    imodelProvider: (imodelKey) => getIModelByKey(imodelKey),
  });
  const hiliteSetIterator = selectionHiliteProvider.getCurrentHiliteSet({ imodelKey: createIModelKey(imodel) });
  ```

   <!-- END EXTRACTION -->

See [iModel selection synchronization with unified selection](./SyncWithIModelConnection.md) for an example of how to easily enable automatic synchronization of iModel's hilite set with a `SelectionStorage`.
