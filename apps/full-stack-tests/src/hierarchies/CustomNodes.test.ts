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
  describe("Generic nodes", () => {
    let emptyIModel!: IModelConnection;

    before(async function () {
      await initialize();
      // eslint-disable-next-line deprecation/deprecation
      emptyIModel = await buildTestIModel(this, async () => {});
    });

    after(async () => {
      await terminate();
    });

    it("creates generic root nodes", async () => {
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: { key: "custom-1", label: "1" } }, { node: { key: "custom-2", label: "2" } }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [NodeValidators.createForGenericNode({ label: "1" }), NodeValidators.createForGenericNode({ label: "2" })],
      });
    });

    it("creates generic child nodes", async () => {
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: { key: "root", label: "r" } }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: { key: "child", label: "c" } }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForGenericNode({
            key: { type: "generic" as const, id: "root" },
            label: "r",
            children: [
              NodeValidators.createForGenericNode({
                key: { type: "generic" as const, id: "child" },
                label: "c",
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("creates hidden generic nodes", async () => {
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: { key: "root", label: "r" } }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: { key: "hidden child", label: "hc", processingParams: { hideInHierarchy: true } } }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "hidden child") {
              return [{ node: { key: "visible child", label: "vc" } }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForGenericNode({
            key: { type: "generic", id: "root" },
            children: [NodeValidators.createForGenericNode({ key: "visible child", label: "vc", children: false })],
          }),
        ],
      });
    });

    it("hides generic nodes with no children", async () => {
      const provider = createProvider({
        imodel: emptyIModel,
        hierarchy: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: { key: "root", label: "r" } }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: { key: "hidden child", label: "hc", processingParams: { hideIfNoChildren: true } } }];
            }
            return [];
          },
        },
      });
      await validateHierarchy({
        provider,
        expect: [
          NodeValidators.createForGenericNode({
            key: { type: "generic", id: "root" },
            children: false,
          }),
        ],
      });
    });
  });
});
