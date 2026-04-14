/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  collect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.BasicProviderImports
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createHiliteSetProvider } from "@itwin/unified-selection";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.IModelProviderImports
import { createIModelHiliteSetProvider } from "@itwin/unified-selection";
import { createIModelKey } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
import { createStorage, Selectables } from "@itwin/unified-selection";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Unified selection", () => {
  describe("Learning snippets", () => {
    describe("Hilite sets", () => {
      beforeAll(async () => {
        await initialize();
      });

      afterAll(async () => {
        await terminate();
      });

      it("Basic hilite set provider", async () => {
        const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
          const modelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
          const elementKey = insertPhysicalElement({
            imodel,
            userLabel: "test element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
          return { modelKey, categoryKey, elementKey };
        });

        const getIModelConnection = () => imodelConnection;
        const selectables = Selectables.create([keys.elementKey]);

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.BasicProvider
        const schemaProvider = createECSchemaProvider(getIModelConnection().schemaContext);
        const hiliteProvider = createHiliteSetProvider({
          imodelAccess: {
            ...schemaProvider,
            ...createCachingECClassHierarchyInspector({ schemaProvider }),
            ...createECSqlQueryExecutor(getIModelConnection()),
          },
        });
        const hiliteSetIterator = hiliteProvider.getHiliteSet({ selectables });
        // __PUBLISH_EXTRACT_END__

        const hiliteSet = await collect(hiliteSetIterator);
        expect(hiliteSet).toEqual([{ elements: [keys.elementKey.id], models: [], subCategories: [] }]);
      });

      it("iModel hilite set provider", async () => {
        const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
          const modelKey = insertPhysicalModelWithPartition({ imodel, codeValue: "test model" });
          const categoryKey = insertSpatialCategory({ imodel, codeValue: "test category" });
          const elementKey = insertPhysicalElement({
            imodel,
            userLabel: "test element",
            modelId: modelKey.id,
            categoryId: categoryKey.id,
          });
          return { modelKey, categoryKey, elementKey };
        });

        const selectionStorage = createStorage();
        selectionStorage.addToSelection({
          imodelKey: createIModelKey(imodelConnection),
          source: "test",
          selectables: [keys.elementKey],
        });

        function getIModelByKey(imodelKey: string) {
          if (imodelKey === createIModelKey(imodelConnection)) {
            return {
              ...createECSqlQueryExecutor(imodelConnection),
              ...createCachingECClassHierarchyInspector({
                schemaProvider: createECSchemaProvider(imodelConnection.schemaContext),
              }),
              key: imodelKey,
            };
          }
          throw new Error(`Unknown iModel key: ${imodelKey}`);
        }

        // __PUBLISH_EXTRACT_START__ Presentation.UnifiedSelection.HiliteSets.IModelProvider
        // Note the use of `using` keyword here. The caching provider registers a selection change listener and should be disposed, in case
        // its lifetime is shorter than that of `SelectionStorage`, to unregister the listener. The `using` keyword ensures that the provider
        // is disposed when it goes out of scope.
        using selectionHiliteProvider = createIModelHiliteSetProvider({
          selectionStorage,
          // this is called to get iModel accessor based on the iModel key
          imodelProvider: (imodelKey) => getIModelByKey(imodelKey),
        });
        const hiliteSetIterator = selectionHiliteProvider.getCurrentHiliteSet({
          imodelKey: createIModelKey(imodelConnection),
        });
        // __PUBLISH_EXTRACT_END__

        const hiliteSet = await collect(hiliteSetIterator);
        expect(hiliteSet).toEqual([{ elements: [keys.elementKey.id], models: [], subCategories: [] }]);
      });
    });
  });
});
