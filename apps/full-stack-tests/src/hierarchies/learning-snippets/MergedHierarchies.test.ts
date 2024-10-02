/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedHierarchies.Imports
import { BeEvent } from "@itwin/core-bentley";
import { GetHierarchyNodesProps, HierarchyNode, HierarchyProvider, mergeProviders } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { initialize, terminate } from "../../IntegrationTests";
import { collectHierarchy } from "./Utils";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Merged hierarchies", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("merges providers", async function () {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.MergedHierarchies.Example
        // Create a very basic hierarchy provider factory
        function createBasicHierarchyProvider(nodes: (parentNode: GetHierarchyNodesProps["parentNode"]) => HierarchyNode[]): HierarchyProvider {
          return {
            hierarchyChanged: new BeEvent(),
            async *getNodes({ parentNode }) {
              for (const node of nodes(parentNode)) {
                yield node;
              }
            },
            async *getNodeInstanceKeys() {},
            setFormatter() {},
            setHierarchyFilter() {},
          };
        }
        // A provider that returns a single "Node X" root node
        const provider1 = createBasicHierarchyProvider((parent) => {
          if (!parent) {
            return [{ key: { type: "generic", id: "x" }, label: "Node X", children: false, parentKeys: [] }];
          }
          return [];
        });
        // A provider that returns a single "Node A" root node
        const provider2 = createBasicHierarchyProvider((parent) => {
          if (!parent) {
            return [{ key: { type: "generic", id: "a" }, label: "Node A", children: false, parentKeys: [] }];
          }
          return [];
        });
        // A provider that returns no root nodes, but returns a single "Child node" for parent nodes "A" and "X"
        const childrenProvider = createBasicHierarchyProvider((parent) => {
          if (parent && HierarchyNode.isGeneric(parent) && (parent.key.id === "a" || parent.key.id === "x")) {
            return [{ key: { type: "generic", id: "c" }, label: "Child node", children: false, parentKeys: [...parent.parentKeys, parent.key] }];
          }
          return [];
        });

        // Merge all 3 providers
        const mergingProvider = mergeProviders({ providers: [provider1, provider2, childrenProvider] });

        // Collect the hierarchy. Notes:
        // - Root nodes are sorted by label
        // - "Child node" is placed under both "Node A" and "Node X"
        expect(await collectHierarchy(mergingProvider)).to.containSubset([
          {
            label: "Node A",
            children: [
              {
                label: "Child node",
                children: undefined,
              },
            ],
          },
          {
            label: "Node X",
            children: [
              {
                label: "Child node",
                children: undefined,
              },
            ],
          },
        ]);
        // __PUBLISH_EXTRACT_END__
      });
    });
  });
});
