/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { expect } from "chai";
import sinon from "sinon";
import { StandaloneDb } from "@itwin/core-backend";
import { createHierarchyProvider } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.RegisterTxnListeners.Imports
import { BriefcaseDb } from "@itwin/core-backend";
import { registerTxnListeners } from "@itwin/presentation-core-interop";
import { HierarchyProvider } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { setupOutputFileLocation } from "@itwin/presentation-testing";
import { getFullSchemaXml } from "presentation-test-utilities";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("registerTxnListeners", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
        sinon.restore();
      });

      it("triggers given callback on iModel changes", async function () {
        const testIModel = StandaloneDb.createEmpty(setupOutputFileLocation(`${this.test!.fullTitle()}.bim`), {
          rootSubject: { name: "Test iModel" },
          allowEdit: JSON.stringify({ txns: true }),
        });
        function getIModel() {
          return testIModel;
        }

        const hierarchyChangedSpy = sinon.spy();
        const testHierarchyProvider = createHierarchyProvider(({ hierarchyChanged }) => ({
          async *getNodes() {},
          notifyDataSourceChanged: () => hierarchyChanged.raiseEvent({}),
        }));
        testHierarchyProvider.hierarchyChanged.addListener(hierarchyChangedSpy);
        function getHierarchyProvider() {
          return testHierarchyProvider;
        }

        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.RegisterTxnListeners.Example
        const imodel: BriefcaseDb = getIModel();
        const provider: HierarchyProvider & { notifyDataSourceChanged: () => void } = getHierarchyProvider();

        // register the listeners
        const unregister = registerTxnListeners(imodel.txns, () => {
          // notify provided about the changed data
          provider.notifyDataSourceChanged();
          // the provider is expected to raise `hierarchyChanged` event, which in turn
          // should trigger an update in the UI that uses this provider
        });

        // clean up on iModel close
        imodel.onClosed.addOnce(() => unregister());
        // __PUBLISH_EXTRACT_END__

        expect(hierarchyChangedSpy).to.not.have.been.called;

        testIModel.elements.insertAspect({ element: { id: "0x1" }, classFullName: "BisCore.ExternalSourceAspect" });
        testIModel.saveChanges();
        expect(hierarchyChangedSpy).to.have.been.calledOnce;
        await testIModel.importSchemaStrings([
          getFullSchemaXml({
            schemaName: "TestSchema",
            schemaContentXml: `
              <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
              <ECEntityClass typeName="X">
                <BaseClass>bis:PhysicalElement</BaseClass>
              </ECEntityClass>
            `,
          }),
        ]);
        testIModel.saveChanges();
        expect(hierarchyChangedSpy).to.have.been.calledTwice;
      });
    });
  });
});
