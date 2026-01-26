/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.BasicProviderImports
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createHiliteSetProvider } from "@itwin/unified-selection";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.CachingProviderImports
import { createCachingHiliteSetProvider } from "@itwin/unified-selection";
import { createIModelKey } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { createStorage, Selectables } from "@itwin/unified-selection";
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Unified selection", () => {
  describe("Learning snippets", () => {
    describe("Hilite sets", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("Basic hilite set provider", async function () {
        const { imodel, elementKey } = await buildIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const elementKey = insertPhysicalElement({ builder, userLabel: "test element", modelId: modelKey.id, categoryId: categoryKey.id });
          return { modelKey, categoryKey, elementKey };
        });

        function getSchemaContext(iModelConnection: IModelConnection) {
          const schemas = new SchemaContext();
          schemas.addLocater(new ECSchemaRpcLocater(iModelConnection.getRpcProps()));
          return schemas;
        }

        const selectables = [elementKey];

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.BasicProvider
        // Components may want to get a hilite set for arbitrary set of Selectables - use `createHiliteSetProvider` for that.
        // iModel's schema context should be shared between all components using the iModel (implementation
        // of the getter is outside the scope of this example)
        const imodelSchemaContext: SchemaContext = getSchemaContext(imodel);

        const hiliteProvider = createHiliteSetProvider({
          imodelAccess: {
            ...createECSchemaProvider(imodelSchemaContext),
            ...createECSqlQueryExecutor(imodel),
          },
        });
        const hiliteSet = await hiliteProvider.getHiliteSet({ selectables });
        // __PUBLISH_EXTRACT_END__

        expect(hiliteSet.elements?.size).to.eq(1);
        expect(hiliteSet.elements?.has(elementKey.id)).to.be.true;
      });

      it("Caching hilite set provider", async function () {
        const { imodel, elementKey } = await buildIModel(this, async (builder) => {
          const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ builder, codeValue: "test category" });
          const elementKey = insertPhysicalElement({ builder, userLabel: "test element", modelId: modelKey.id, categoryId: categoryKey.id });
          return { modelKey, categoryKey, elementKey };
        });

        const selectionStorage = createStorage();
        selectionStorage.addToSelection({ imodelKey: createIModelKey(imodel), source: "test", selectables: [elementKey] });

        function getIModelByKey(imodelKey: string) {
          if (imodelKey === createIModelKey(imodel)) {
            return {
              ...createECSqlQueryExecutor(imodel),
              key: imodelKey,
            };
          }
          throw new Error(`Unknown iModel key: ${imodelKey}`);
        }

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.CachingProvider
        // Some others may want to get a hilite set for _current_ selection for specific iModel in storage - use `createCachingHiliteSetProvider`
        // for that. It's recommended to keep a single instance of this provider per application as it caches hilite sets per each iModel's selection.
        // Note the use of `using` keyword here. The caching provider registers a selection change listener and should be disposed, in case
        // its lifetime is shorter than that of `SelectionStorage`, to unregister the listener. The `using` keyword ensures that the provider
        // is disposed when it goes out of scope.
        using selectionHiliteProvider = createCachingHiliteSetProvider({
          selectionStorage,
          // this is called to get iModel access based on the iModel key, used to get hilite set for that iModel (see below)
          imodelProvider: (imodelKey) => getIModelByKey(imodelKey),
        });
        const selectionHiliteSet = selectionHiliteProvider.getHiliteSet({ imodelKey: createIModelKey(imodel) });
        // __PUBLISH_EXTRACT_END__

        const hiliteSet = await selectionHiliteSet;
        expect(hiliteSet.elements?.size).to.eq(1);
        expect(hiliteSet.elements?.has(elementKey.id)).to.be.true;
      });
    });
  });
});
