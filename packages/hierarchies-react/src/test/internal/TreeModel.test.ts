/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GenericInstanceFilter } from "@itwin/presentation-hierarchies";
import { isTreeModelHierarchyNode, isTreeModelInfoNode, TreeModel } from "../../presentation-hierarchies-react/internal/TreeModel";
import { addNodesToModel, createTestHierarchyNode, createTestModelInfoNode, createTreeModel, getHierarchyNode } from "../TestUtils";

describe("TreeModel", () => {
  describe("expandNode", () => {
    it("expands node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
        },
        {
          id: "root-2",
          isExpanded: false,
        },
      ]);

      expect(getHierarchyNode(model, "root-1")!.isExpanded).to.be.false;
      expect(getHierarchyNode(model, "root-2")!.isExpanded).to.be.false;

      TreeModel.expandNode(model, "root-2", true);

      expect(getHierarchyNode(model, "root-1")!.isExpanded).to.be.false;
      expect(getHierarchyNode(model, "root-2")!.isExpanded).to.be.true;
    });

    it("collapses node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: true,
        },
        {
          id: "root-2",
          isExpanded: true,
        },
      ]);

      expect(getHierarchyNode(model, "root-1")!.isExpanded).to.be.true;
      expect(getHierarchyNode(model, "root-2")!.isExpanded).to.be.true;

      TreeModel.expandNode(model, "root-2", false);

      expect(getHierarchyNode(model, "root-1")!.isExpanded).to.be.true;
      expect(getHierarchyNode(model, "root-2")!.isExpanded).to.be.false;
    });

    it("returns `loadChildren` if expanded node has unloaded children", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
      ]);

      expect(TreeModel.expandNode(model, "root-1", true)).to.be.eq("loadChildren");
    });

    it("returns `none` if expanded node has loaded children", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: ["child-1", "child-2"],
        },
      ]);

      expect(TreeModel.expandNode(model, "root-1", true)).to.be.eq("none");
    });

    it("returns `none` if expanded node has no children", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: [],
        },
      ]);

      expect(TreeModel.expandNode(model, "root-1", true)).to.be.eq("none");
    });

    it("sets `isLoading` = `true` if expanded node has unloaded children", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
      ]);

      expect(TreeModel.expandNode(model, "root-1", true)).to.be.eq("loadChildren");
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.true;
    });

    it("returns `reloadChildren` and removes child info node when expanding node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
      ]);
      addNodesToModel(model, "root-1", [createTestModelInfoNode({ id: "info-1" })]);

      expect(TreeModel.expandNode(model, "root-1", true)).to.be.eq("reloadChildren");
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.true;
      expect(TreeModel.getNode(model, "info-1")).to.be.undefined;
    });

    it("returns `reloadChildren` and removes child info node when expanding node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isExpanded: false,
          children: undefined,
        },
      ]);
      addNodesToModel(model, "root-1", [createTestModelInfoNode({ id: "info-1" })]);

      expect(TreeModel.expandNode(model, "root-1", true)).to.be.eq("reloadChildren");
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.true;
      expect(TreeModel.getNode(model, "info-1")).to.be.undefined;
    });

    it("does nothing if node does not exist", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
        },
      ]);

      TreeModel.expandNode(model, "invalid", false);
      expect(getHierarchyNode(model, "root-1")?.isExpanded).to.be.true;
    });
  });

  describe("removeSubTree", () => {
    it("removes child level", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1", "child-2"],
        },
        {
          id: "child-1",
          children: ["child-1-1"],
        },
        {
          id: "child-2",
        },
      ]);

      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.not.be.undefined;

      TreeModel.removeSubTree(model, "root-1");

      expect(getHierarchyNode(model, "child-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.be.undefined;
      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
    });

    it("removes child and grandchild levels", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1", "child-2"],
        },
        {
          id: "child-1",
          children: ["child-1-1", "child-1-2"],
        },
        {
          id: "child-2",
          children: ["child-2-1"],
        },
        {
          id: "child-1-1",
        },
        {
          id: "child-1-2",
        },
        {
          id: "child-2-1",
        },
      ]);

      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1-2")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-2-1")).to.not.be.undefined;

      TreeModel.removeSubTree(model, "root-1");

      expect(getHierarchyNode(model, "child-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.be.undefined;
      expect(getHierarchyNode(model, "child-1-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-1-2")).to.be.undefined;
      expect(getHierarchyNode(model, "child-2-1")).to.be.undefined;
      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
    });

    it("removes all levels", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1", "child-2"],
        },
        {
          id: "child-1",
        },
        {
          id: "child-2",
        },
      ]);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.not.be.undefined;

      TreeModel.removeSubTree(model, undefined);

      expect(getHierarchyNode(model, "root-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.be.undefined;
    });
  });

  describe("addHierarchyPart", () => {
    it("adds hierarchy part to empty model", () => {
      const model = createTreeModel([]);
      const hierarchyPart = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "root-2",
          children: [],
        },
        {
          id: "child-1",
          children: undefined,
        },
      ]);

      TreeModel.addHierarchyPart(model, undefined, hierarchyPart);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
    });

    it("adds hierarchy part at specific level", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "root-2",
          children: [],
        },
        {
          id: "child-1",
        },
      ]);
      const hierarchyPart = createTreeModel([
        {
          id: "root-2",
          children: ["child-2"],
        },
        {
          id: "child-2",
          children: undefined,
        },
      ]);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.be.undefined;

      TreeModel.addHierarchyPart(model, "root-2", hierarchyPart);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "root-2")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.not.be.undefined;
    });

    it("overrides existing hierarchy part", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "child-1",
        },
      ]);
      const hierarchyPart = createTreeModel([
        {
          id: "root-1",
          children: ["child-2"],
        },
        {
          id: "child-2",
        },
      ]);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.be.undefined;

      TreeModel.addHierarchyPart(model, "root-1", hierarchyPart);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-2")).to.not.be.undefined;
    });

    it("sets `isLoading` = `false` for root of added hierarchy", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: undefined,
          isLoading: true,
        },
      ]);
      const hierarchyPart = createTreeModel([
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "child-1",
        },
      ]);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.true;
      expect(getHierarchyNode(model, "child-1")).to.be.undefined;

      TreeModel.addHierarchyPart(model, "root-1", hierarchyPart);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.false;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
    });
  });

  describe("setHierarchyLimit", () => {
    it("sets limit on tree root", () => {
      const model = createTreeModel([]);

      expect(model.rootNode.hierarchyLimit).to.be.undefined;

      TreeModel.setHierarchyLimit(model, undefined, 100);
      expect(model.rootNode.hierarchyLimit).to.be.eq(100);
    });

    it("sets limit on specified node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
        },
      ]);

      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.undefined;

      TreeModel.setHierarchyLimit(model, "root-1", 100);
      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.eq(100);
    });

    it("sets `unbounded` limit", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
        },
      ]);

      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.undefined;

      TreeModel.setHierarchyLimit(model, "root-1", "unbounded");
      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.eq("unbounded");
    });

    it("removes limit", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          hierarchyLimit: 100,
        },
      ]);

      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.eq(100);

      TreeModel.setHierarchyLimit(model, "root-1", undefined);
      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.undefined;
    });

    it("sets `isLoading` = `true` when new limit is set on expanded node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
          isLoading: false,
        },
      ]);

      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.undefined;
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.false;

      expect(TreeModel.setHierarchyLimit(model, "root-1", 100)).to.be.true;
      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.eq(100);
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.true;
    });

    it("removes subtree when limit is set", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: ["child-1-1"],
        },
        {
          id: "child-1-1",
        },
      ]);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1-1")).to.not.be.undefined;

      TreeModel.setHierarchyLimit(model, "root-1", 100);
      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-1-1")).to.be.undefined;
    });

    it("does nothing if node does not exist", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          hierarchyLimit: undefined,
        },
      ]);

      TreeModel.setHierarchyLimit(model, "invalid", 100);
      expect(getHierarchyNode(model, "root-1")?.hierarchyLimit).to.be.undefined;
    });
  });

  describe("setInstanceFilter", () => {
    it("sets filter on tree root", () => {
      const model = createTreeModel([]);
      const filter: GenericInstanceFilter = { rules: { operator: "and", rules: [] }, propertyClassNames: [], relatedInstances: [] };

      expect(model.rootNode.instanceFilter).to.be.undefined;

      TreeModel.setInstanceFilter(model, undefined, filter);
      expect(model.rootNode.instanceFilter).to.be.eq(filter);
    });

    it("sets filter on specified node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
        },
      ]);
      const filter: GenericInstanceFilter = { rules: { operator: "and", rules: [] }, propertyClassNames: [], relatedInstances: [] };

      expect(getHierarchyNode(model, "root-1")?.instanceFilter).to.be.undefined;

      TreeModel.setInstanceFilter(model, "root-1", filter);
      expect(getHierarchyNode(model, "root-1")?.instanceFilter).to.be.eq(filter);
    });

    it("removes filter", () => {
      const filter: GenericInstanceFilter = { rules: { operator: "and", rules: [] }, propertyClassNames: [], relatedInstances: [] };
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          instanceFilter: filter,
        },
      ]);

      expect(getHierarchyNode(model, "root-1")?.instanceFilter).to.be.eq(filter);

      TreeModel.setInstanceFilter(model, "root-1", undefined);
      expect(getHierarchyNode(model, "root-1")?.instanceFilter).to.be.undefined;
    });

    it("sets `isLoading` = `true` when new filter is set on expanded node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isExpanded: true,
          isLoading: false,
        },
      ]);
      const filter: GenericInstanceFilter = { rules: { operator: "and", rules: [] }, propertyClassNames: [], relatedInstances: [] };

      expect(getHierarchyNode(model, "root-1")?.instanceFilter).to.be.undefined;
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.false;

      expect(TreeModel.setInstanceFilter(model, "root-1", filter)).to.be.true;
      expect(getHierarchyNode(model, "root-1")?.instanceFilter).to.be.eq(filter);
      expect(getHierarchyNode(model, "root-1")?.isLoading).to.be.true;
    });

    it("removes subtree when filter is set", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          children: ["child-1"],
        },
        {
          id: "child-1",
          children: ["child-1-1"],
        },
        {
          id: "child-1-1",
        },
      ]);
      const filter: GenericInstanceFilter = { rules: { operator: "and", rules: [] }, propertyClassNames: [], relatedInstances: [] };

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1-1")).to.not.be.undefined;

      TreeModel.setInstanceFilter(model, "root-1", filter);

      expect(getHierarchyNode(model, "root-1")).to.not.be.undefined;
      expect(getHierarchyNode(model, "child-1")).to.be.undefined;
      expect(getHierarchyNode(model, "child-1-1")).to.be.undefined;
    });

    it("does nothing if node does not exist", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          instanceFilter: undefined,
        },
      ]);
      const filter: GenericInstanceFilter = { rules: { operator: "and", rules: [] }, propertyClassNames: [], relatedInstances: [] };

      TreeModel.setInstanceFilter(model, "invalid", filter);
      expect(getHierarchyNode(model, "root-1")?.instanceFilter).to.be.undefined;
    });
  });

  describe("selectNode", () => {
    it("selects node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isSelected: false,
        },
      ]);

      TreeModel.selectNode(model, "root-1", true);
      expect(getHierarchyNode(model, "root-1")?.isSelected).to.be.true;
    });

    it("deselects node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isSelected: true,
        },
      ]);

      TreeModel.selectNode(model, "root-1", false);
      expect(getHierarchyNode(model, "root-1")?.isSelected).to.be.false;
    });

    it("does nothing if node does not exist", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
          isSelected: true,
        },
      ]);

      TreeModel.selectNode(model, "invalid", false);
      expect(getHierarchyNode(model, "root-1")?.isSelected).to.be.true;
    });
  });

  describe("isNodeSelected", () => {
    it("returns correct results", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1", "root-2"],
        },
        {
          id: "root-1",
          isSelected: false,
        },
        {
          id: "root-2",
          isSelected: true,
        },
      ]);

      expect(TreeModel.isNodeSelected(model, "root-1")).to.be.false;
      expect(TreeModel.isNodeSelected(model, "root-2")).to.be.true;
    });
  });

  describe("getNode", () => {
    it("returns tree root", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
        },
      ]);

      expect(TreeModel.getNode(model, undefined)).to.be.eq(model.rootNode);
    });

    it("returns specific node", () => {
      const model = createTreeModel([
        {
          id: undefined,
          children: ["root-1"],
        },
        {
          id: "root-1",
        },
      ]);

      expect(TreeModel.getNode(model, "root-1")).to.not.be.undefined;
    });
  });
});

describe("isTreeModelHierarchyNode", () => {
  it("returns correct result", () => {
    expect(isTreeModelHierarchyNode({ id: undefined, nodeData: undefined })).to.be.false;
    expect(isTreeModelHierarchyNode({ id: "info-node", type: "Unknown", message: "info" })).to.be.false;
    expect(isTreeModelHierarchyNode({ id: "hierarchy-node", label: "Node", children: false, nodeData: createTestHierarchyNode({ id: "hierarchy-node" }) })).to
      .be.true;
  });
});

describe("isTreeModelInfoNode", () => {
  it("returns correct result", () => {
    expect(isTreeModelInfoNode({ id: undefined, nodeData: undefined })).to.be.false;
    expect(isTreeModelInfoNode({ id: "info-node", type: "Unknown", message: "info" })).to.be.true;
    expect(isTreeModelInfoNode({ id: "hierarchy-node", label: "Node", children: false, nodeData: createTestHierarchyNode({ id: "hierarchy-node" }) })).to.be
      .false;
  });
});
