/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { initialize, terminate } from "../IntegrationTests";
import { NodeValidators, validateHierarchy } from "./HierarchyValidation";
import { createProvider } from "./Utils";

describe("Hierarchies", () => {
  describe("Custom nodes", () => {
    let emptyIModel!: IModelConnection;

    before(async function () {
      await initialize();
      // eslint-disable-next-line deprecation/deprecation
      emptyIModel = await buildTestIModel(this, async () => {});
    });

    after(async () => {
      await terminate();
    });

    it("creates custom root nodes", async () => {
      const node1 = {
        key: "custom-1",
        label: "1",
        children: undefined,
      };
      const node2 = {
        key: "custom-2",
        label: "2",
        children: undefined,
      };
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            switch (parentNode?.key) {
              case undefined:
                return [{ node: node1 }, { node: node2 }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [NodeValidators.createForCustomNode(node1), NodeValidators.createForCustomNode(node2)],
      });
    });

    it("creates custom child nodes", async () => {
      const root = {
        key: "root",
        label: "r",
        children: undefined,
      };
      const child = {
        key: "child",
        label: "c",
        children: undefined,
      };
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            switch (parentNode?.key) {
              case undefined:
                return [{ node: root }];
              case "root":
                return [{ node: child }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForCustomNode({
            ...root,
            children: [NodeValidators.createForCustomNode(child)],
          }),
        ],
      });
    });

    it("creates hidden custom nodes", async () => {
      const root = {
        key: "root",
        label: "r",
        children: undefined,
      };
      const hiddenChild = {
        key: "hidden child",
        label: "hc",
        children: undefined,
        processingParams: {
          hideInHierarchy: true,
        },
      };
      const visibleChild = {
        key: "visible child",
        label: "vc",
        children: undefined,
      };
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            switch (parentNode?.key) {
              case undefined:
                return [{ node: root }];
              case "root":
                return [{ node: hiddenChild }];
              case "hidden child":
                return [{ node: visibleChild }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForCustomNode({
            ...root,
            children: [NodeValidators.createForCustomNode(visibleChild)],
          }),
        ],
      });
    });

    it("hides custom nodes with no children", async () => {
      const root = {
        key: "root",
        label: "r",
        children: undefined,
      };
      const hiddenChild = {
        key: "hidden child",
        label: "hc",
        children: undefined,
        processingParams: {
          hideIfNoChildren: true,
        },
      };
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            switch (parentNode?.key) {
              case undefined:
                return [{ node: root }];
              case "root":
                return [{ node: hiddenChild }];
              case "hidden child":
                return [];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForCustomNode({
            ...root,
            children: false,
          }),
        ],
      });
    });
  });
});
