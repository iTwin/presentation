/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator, throwingAsyncIterator } from "presentation-test-utilities";
import { Observable } from "rxjs";
import sinon from "sinon";
import { GenericInstanceFilter, GetHierarchyNodesProps, HierarchyProvider, RowsLimitExceededError } from "@itwin/presentation-hierarchies";
import { LoadedTreePart, TreeLoader } from "../../presentation-hierarchies-react/internal/TreeLoader";
import { TreeModelHierarchyNode, TreeModelInfoNode, TreeModelNode } from "../../presentation-hierarchies-react/internal/TreeModel";
import { createTestHierarchyNode, createTreeModelNode } from "../TestUtils";

describe("TreeLoader", () => {
  const hierarchyProvider = {
    getNodes: sinon.stub<Parameters<HierarchyProvider["getNodes"]>, ReturnType<HierarchyProvider["getNodes"]>>(),
  };

  function createLoader() {
    return new TreeLoader(hierarchyProvider as unknown as HierarchyProvider);
  }

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
  });

  describe("getNodes", () => {
    it("loads root nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode === undefined ? rootHierarchyNodes : []);
      });

      const nodes = await collectNodes(
        loader.getNodes(
          { id: undefined, nodeData: undefined },
          () => undefined,
          () => false,
        ),
      );

      const rootNodes = nodes.get(undefined);
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1", "root-2"]);
    });

    it("loads root nodes and child nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootHierarchyNodes);
        }
        if (props.parentNode.key === "root-1") {
          return createAsyncIterator(childHierarchyNodes);
        }
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.getNodes(
          { id: undefined, nodeData: undefined },
          () => undefined,
          (parentNode) => parentNode.nodeData.key === "root-1",
        ),
      );

      const rootNodes = nodes.get(undefined);
      const childNodes = nodes.get("root-1");
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1", "root-2"]);
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["child-1"]);
      expect(nodes.get("root-2")).to.be.undefined;
      expect(hierarchyProvider.getNodes).to.be.calledTwice;
    });

    it("load child nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNode = createTestHierarchyNode({ id: "root-1" });
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode?.key === "root-1" ? childHierarchyNodes : []);
      });

      const nodes = await collectNodes(
        loader.getNodes(
          createTreeModelNode({ id: "root-1", nodeData: rootHierarchyNode }),
          () => undefined,
          () => false,
        ),
      );

      const childNodes = nodes.get("root-1");
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["child-1"]);
    });

    it("loads info node when `RowsLimitExceededError` is thrown", async () => {
      const loader = createLoader();
      hierarchyProvider.getNodes.callsFake(() => {
        return throwingAsyncIterator(new RowsLimitExceededError(10));
      });

      const nodes = await collectNodes(
        loader.getNodes(
          { id: undefined, nodeData: undefined },
          () => undefined,
          () => false,
        ),
      );

      const rootNodes = nodes.get(undefined);
      const infoNode = rootNodes![0] as TreeModelInfoNode;
      expect(infoNode.type).to.be.eq("ResultSetTooLarge");
    });

    it("loads `Unknown` info node when error is thrown", async () => {
      const loader = createLoader();
      hierarchyProvider.getNodes.callsFake(() => {
        return throwingAsyncIterator(new Error("Some Error"));
      });

      const nodes = await collectNodes(
        loader.getNodes(
          { id: undefined, nodeData: undefined },
          () => undefined,
          () => false,
        ),
      );

      const rootNodes = nodes.get(undefined);
      const infoNode = rootNodes![0] as TreeModelInfoNode;
      expect(infoNode.type).to.be.eq("Unknown");
    });

    it("loads multiple child hierarchy levels", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" })];
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      const grandChildHierarchyNodes = [createTestHierarchyNode({ id: "grandchild-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootHierarchyNodes);
        }
        if (props.parentNode.key === "root-1") {
          return createAsyncIterator(childHierarchyNodes);
        }
        if (props.parentNode.key === "child-1") {
          return createAsyncIterator(grandChildHierarchyNodes);
        }
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.getNodes(
          { id: undefined, nodeData: undefined },
          () => undefined,
          () => true,
        ),
      );

      const rootNodes = nodes.get(undefined);
      const childNodes = nodes.get("root-1");
      const grandChildNodes = nodes.get("child-1");
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1"]);
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["child-1"]);
      expect(grandChildNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["grandchild-1"]);
      expect(nodes.get("grandchild-1")).to.be.empty;
      expect(hierarchyProvider.getNodes).to.have.callCount(4);
    });

    it("loads hierarchy level with instance filter", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode === undefined && props.instanceFilter !== undefined ? rootHierarchyNodes : []);
      });

      const filter: GenericInstanceFilter = {
        propertyClassNames: [],
        relatedInstances: [],
        rules: { operator: "and", rules: [] },
      };

      const nodes = await collectNodes(
        loader.getNodes(
          { id: undefined, nodeData: undefined, instanceFilter: filter },
          (parent) => parent.instanceFilter,
          () => true,
        ),
      );

      const rootNodes = nodes.get(undefined);
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1"]);
      expect(hierarchyProvider.getNodes).to.be.calledWith(
        sinon.match((props: GetHierarchyNodesProps) => {
          return props.instanceFilter === filter;
        }),
      );
    });

    it("loads info node if all children are filtered out", async () => {
      const filter: GenericInstanceFilter = {
        propertyClassNames: [],
        relatedInstances: [],
        rules: { operator: "and", rules: [] },
      };
      const loader = createLoader();
      const rootHierarchyNode = createTestHierarchyNode({ id: "root-1" });
      const modelNode = createTreeModelNode({ id: "root-1", nodeData: rootHierarchyNode, instanceFilter: filter });
      hierarchyProvider.getNodes.callsFake(() => {
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.getNodes(
          modelNode,
          (parent) => parent.instanceFilter,
          () => true,
        ),
      );

      const children = nodes.get("root-1");
      expect(children).to.have.lengthOf(1);
      expect((children![0] as TreeModelInfoNode).type).to.be.eq("NoFilterMatchingNodes");
      expect(hierarchyProvider.getNodes).to.be.calledWith(
        sinon.match((props: GetHierarchyNodesProps) => {
          return props.instanceFilter === filter;
        }),
      );
    });
  });

  describe("reloadNodes", () => {
    it("reloads expanded nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2", autoExpand: false })];
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootHierarchyNodes);
        }
        if (props.parentNode) {
          return createAsyncIterator(childHierarchyNodes);
        }
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.reloadNodes(
          { id: undefined, nodeData: undefined },
          {
            expandedNodes: [createTreeModelNode({ id: "root-2", nodeData: rootHierarchyNodes[1] })],
            collapsedNodes: [],
            buildNode: (node) => node,
            getInstanceFilter: () => undefined,
          },
        ),
      );

      const rootNodes = nodes.get(undefined);
      const childNodes = nodes.get("root-2");
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1", "root-2"]);
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["child-1"]);
      expect(nodes.get("root-1")).to.be.undefined;
    });

    it("reloads auto expanded nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1", autoExpand: true }), createTestHierarchyNode({ id: "root-2" })];
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootHierarchyNodes);
        }
        if (props.parentNode) {
          return createAsyncIterator(childHierarchyNodes);
        }
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.reloadNodes(
          { id: undefined, nodeData: undefined },
          {
            expandedNodes: [],
            collapsedNodes: [],
            buildNode: (node) => node,
            getInstanceFilter: () => undefined,
          },
        ),
      );

      const rootNodes = nodes.get(undefined);
      const childNodes = nodes.get("root-1");
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1", "root-2"]);
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["child-1"]);
      expect(nodes.get("root-2")).to.be.undefined;
    });

    it("does not reload auto expanded collapsed nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1", autoExpand: true }), createTestHierarchyNode({ id: "root-2" })];
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootHierarchyNodes);
        }
        if (props.parentNode) {
          return createAsyncIterator(childHierarchyNodes);
        }
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.reloadNodes(
          { id: undefined, nodeData: undefined },
          {
            expandedNodes: [],
            collapsedNodes: [createTreeModelNode({ id: "root-1", nodeData: rootHierarchyNodes[0] })],
            buildNode: (node) => node,
            getInstanceFilter: () => undefined,
          },
        ),
      );

      const rootNodes = nodes.get(undefined);
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1", "root-2"]);
      expect(nodes.get("root-1")).to.be.undefined;
      expect(nodes.get("root-2")).to.be.undefined;
    });

    it("reloads nodes with additional attributes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode === undefined ? rootHierarchyNodes : []);
      });

      const nodes = await collectNodes(
        loader.reloadNodes(
          { id: undefined, nodeData: undefined },
          {
            expandedNodes: [],
            collapsedNodes: [],
            buildNode: (node) => ({ ...node, hierarchyLimit: 100 }),
            getInstanceFilter: () => undefined,
          },
        ),
      );

      const rootNodes = nodes.get(undefined);
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset(["root-1", "root-2"]);
      expect((rootNodes?.[0] as TreeModelHierarchyNode).hierarchyLimit).to.be.eq(100);
      expect((rootNodes?.[0] as TreeModelHierarchyNode).hierarchyLimit).to.be.eq(100);
    });
  });
});

async function collectNodes(loadObs: Observable<LoadedTreePart>) {
  const nodes = new Map<string | undefined, TreeModelNode[]>();
  return new Promise<Map<string | undefined, TreeModelNode[]>>((resolve) => {
    loadObs.subscribe({
      next: (loaded) => {
        let hierarchyLevel = nodes.get(loaded.parentId);
        if (!hierarchyLevel) {
          hierarchyLevel = [];
          nodes.set(loaded.parentId, hierarchyLevel);
        }
        hierarchyLevel.push(...loaded.loadedNodes);
      },
      complete: () => {
        resolve(nodes);
      },
    });
  });
}
