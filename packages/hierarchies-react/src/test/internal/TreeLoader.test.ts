/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator, throwingAsyncIterator } from "presentation-test-utilities";
import { Observable } from "rxjs";
import sinon from "sinon";
import {
  GenericInstanceFilter,
  GetHierarchyNodesProps,
  HierarchyNode,
  HierarchyNodeKey,
  HierarchyProvider,
  RowsLimitExceededError,
} from "@itwin/presentation-hierarchies";
import { LoadedTreePart, TreeLoader } from "../../presentation-hierarchies-react/internal/TreeLoader.js";
import { TreeModelHierarchyNode, TreeModelInfoNode, TreeModelNode } from "../../presentation-hierarchies-react/internal/TreeModel.js";
import { createNodeId } from "../../presentation-hierarchies-react/internal/Utils.js";
import { createTestHierarchyNode, createTreeModelNode } from "../TestUtils.js";

describe("TreeLoader", () => {
  const onHierarchyLimitExceededStub = sinon.stub();
  const onHierarchyLoadErrorStub = sinon.stub();
  const hierarchyProvider = {
    getNodes: sinon.stub<Parameters<HierarchyProvider["getNodes"]>, ReturnType<HierarchyProvider["getNodes"]>>(),
  };

  function createLoader() {
    return new TreeLoader(hierarchyProvider as unknown as HierarchyProvider, onHierarchyLimitExceededStub, onHierarchyLoadErrorStub, (n) =>
      HierarchyNode.isGeneric(n) ? n.key.id : createNodeId(n),
    );
  }

  beforeEach(() => {
    hierarchyProvider.getNodes.reset();
    onHierarchyLimitExceededStub.reset();
    onHierarchyLoadErrorStub.reset();
  });

  describe("loadNodes", () => {
    it("loads root nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        return createAsyncIterator(props.parentNode === undefined ? rootHierarchyNodes : []);
      });

      const nodes = await collectNodes(
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: undefined, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: () => false,
        }),
      );

      const rootNodes = nodes.get(undefined);
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "root-1" }, { id: "root-2" }]);
    });

    it("loads root nodes and child nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNodes = [createTestHierarchyNode({ id: "root-1" }), createTestHierarchyNode({ id: "root-2" })];
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        if (props.parentNode === undefined) {
          return createAsyncIterator(rootHierarchyNodes);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator(childHierarchyNodes);
        }
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: undefined, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: (parentNode) => HierarchyNodeKey.equals(parentNode.nodeData.key, { type: "generic", id: "root-1" }),
        }),
      );

      const rootNodes = nodes.get(undefined);
      const childNodes = nodes.get("root-1");
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "root-1" }, { id: "root-2" }]);
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "child-1" }]);
      expect(nodes.get("root-2")).to.be.undefined;
      expect(hierarchyProvider.getNodes).to.be.calledTwice;
    });

    it("load child nodes", async () => {
      const loader = createLoader();
      const rootHierarchyNode = createTestHierarchyNode({ id: "root-1" });
      const childHierarchyNodes = [createTestHierarchyNode({ id: "child-1" })];
      hierarchyProvider.getNodes.callsFake((props) => {
        return createAsyncIterator(
          props.parentNode && HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" }) ? childHierarchyNodes : [],
        );
      });

      const nodes = await collectNodes(
        loader.loadNodes({
          parent: createTreeModelNode({ id: "root-1", nodeData: rootHierarchyNode }),
          getHierarchyLevelOptions: () => ({ instanceFilter: undefined, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: () => false,
        }),
      );

      const childNodes = nodes.get("root-1");
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "child-1" }]);
    });

    it("loads info node when `RowsLimitExceededError` is thrown", async () => {
      const loader = createLoader();
      hierarchyProvider.getNodes.callsFake(() => {
        return throwingAsyncIterator(new RowsLimitExceededError(10));
      });

      const nodes = await collectNodes(
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: undefined, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: () => false,
        }),
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
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: undefined, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: () => false,
        }),
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
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "root-1" })) {
          return createAsyncIterator(childHierarchyNodes);
        }
        if (HierarchyNodeKey.equals(props.parentNode.key, { type: "generic", id: "child-1" })) {
          return createAsyncIterator(grandChildHierarchyNodes);
        }
        return createAsyncIterator([]);
      });

      const nodes = await collectNodes(
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: undefined, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: () => true,
        }),
      );

      const rootNodes = nodes.get(undefined);
      const childNodes = nodes.get("root-1");
      const grandChildNodes = nodes.get("child-1");
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "root-1" }]);
      expect(childNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "child-1" }]);
      expect(grandChildNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "grandchild-1" }]);
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
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined, instanceFilter: filter },
          getHierarchyLevelOptions: (parent) => ({ instanceFilter: parent.instanceFilter, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: () => true,
        }),
      );

      const rootNodes = nodes.get(undefined);
      expect(rootNodes?.map((node) => (node as TreeModelHierarchyNode).nodeData.key)).to.containSubset([{ id: "root-1" }]);
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
        loader.loadNodes({
          parent: modelNode,
          getHierarchyLevelOptions: (parent) => ({ instanceFilter: parent.instanceFilter, hierarchyLevelSizeLimit: undefined }),
          shouldLoadChildren: () => true,
        }),
      );

      const children = nodes.get("root-1");
      expect(children).to.have.lengthOf(1);
      expect((children![0] as TreeModelInfoNode).type).to.be.eq("NoFilterMatches");
      expect(hierarchyProvider.getNodes).to.be.calledWith(
        sinon.match((props: GetHierarchyNodesProps) => {
          return props.instanceFilter === filter;
        }),
      );
    });

    it("reports when `RowsLimitExceededError` is thrown", async () => {
      const loader = createLoader();
      hierarchyProvider.getNodes.callsFake(() => {
        return throwingAsyncIterator(new RowsLimitExceededError(10));
      });

      const filter = {} as GenericInstanceFilter;

      await collectNodes(
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: filter, hierarchyLevelSizeLimit: 10 }),
          shouldLoadChildren: () => false,
        }),
      );

      expect(onHierarchyLimitExceededStub).to.be.calledOnceWith({ parentId: undefined, filter, limit: 10 });
    });

    it("reports when hierarchy load timeouts", async () => {
      const loader = createLoader();
      const error = new Error("query too long to execute or server is too busy");
      hierarchyProvider.getNodes.callsFake(() => {
        return throwingAsyncIterator(error);
      });

      const filter = {} as GenericInstanceFilter;

      await collectNodes(
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: filter, hierarchyLevelSizeLimit: 10 }),
          shouldLoadChildren: () => false,
        }),
      );

      expect(onHierarchyLoadErrorStub).to.be.calledOnceWith({ parentId: undefined, type: "timeout", error });
    });

    it("reports unknown hierarchy load error", async () => {
      const loader = createLoader();
      const error = new Error("Test error");
      hierarchyProvider.getNodes.callsFake(() => {
        return throwingAsyncIterator(error);
      });

      const filter = {} as GenericInstanceFilter;

      await collectNodes(
        loader.loadNodes({
          parent: { id: undefined, nodeData: undefined },
          getHierarchyLevelOptions: () => ({ instanceFilter: filter, hierarchyLevelSizeLimit: 10 }),
          shouldLoadChildren: () => false,
        }),
      );

      expect(onHierarchyLoadErrorStub).to.be.calledOnceWith({ parentId: undefined, type: "unknown", error });
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
