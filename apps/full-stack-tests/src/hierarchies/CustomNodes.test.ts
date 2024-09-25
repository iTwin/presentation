/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
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
        key: { type: "generic" as const, id: "custom-1" },
        label: "1",
      };
      const node2 = {
        key: { type: "generic" as const, id: "custom-2" },
        label: "2",
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
        expect: [NodeValidators.createForGenericNode(node1), NodeValidators.createForGenericNode(node2)],
      });
    });

    it("creates custom child nodes", async () => {
      const root = {
        key: { type: "generic" as const, id: "root" },
        label: "r",
        children: undefined,
      };
      const child = {
        key: { type: "generic" as const, id: "child" },
        label: "c",
        children: undefined,
      };
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: root }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: child }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForGenericNode({
            ...root,
            children: [NodeValidators.createForGenericNode(child)],
          }),
        ],
      });
    });

    it("creates hidden custom nodes", async () => {
      const root = {
        key: { type: "generic" as const, id: "root" },
        label: "r",
        children: undefined,
      };
      const hiddenChild = {
        key: { type: "generic" as const, id: "hidden child" },
        label: "hc",
        children: undefined,
        processingParams: {
          hideInHierarchy: true,
        },
      };
      const visibleChild = {
        key: { type: "generic" as const, id: "visible child" },
        label: "vc",
        children: undefined,
      };
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: root }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: hiddenChild }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "hidden child") {
              return [{ node: visibleChild }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForGenericNode({
            ...root,
            children: [NodeValidators.createForGenericNode(visibleChild)],
          }),
        ],
      });
    });

    it("hides custom nodes with no children", async () => {
      const root = {
        key: { type: "generic" as const, id: "root" },
        label: "r",
        children: undefined,
      };
      const hiddenChild = {
        key: { type: "generic" as const, id: "hidden child" },
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
            if (!parentNode) {
              return [{ node: root }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: hiddenChild }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForGenericNode({
            ...root,
            children: false,
          }),
        ],
      });
    });
  });
});
