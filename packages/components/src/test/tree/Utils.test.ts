/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as faker from "faker";
import { LabelDefinition, Node } from "@itwin/presentation-common";
import { PageOptions } from "@itwin/components-react";
import {
  createPartialTreeNodeItem, createTreeNodeItem, createTreeNodeItems, pageOptionsUiToPresentation, PRESENTATION_TREE_NODE_KEY,
} from "../../presentation-components/tree/Utils";
import { createTestECClassGroupingNodeKey, createTestECInstancesNode } from "../_helpers/Hierarchy";

describe("Utils", () => {
  describe("createTreeNodeItem", () => {
    it("creates tree node", () => {
      const node = createTestECInstancesNode();
      const treeNode = createTreeNodeItem(node);
      expect(treeNode).to.matchSnapshot();
    });

    it("creates tree node with extended data", () => {
      const node = { ...createTestECInstancesNode(), extendedData: { test: "value" } };
      const treeNode = createTreeNodeItem(node);
      expect(treeNode.extendedData!.test).to.eq("value");
    });

    it("creates tree node with parent id", () => {
      const node = createTestECInstancesNode();
      const parentId = faker.random.word();
      const treeNode = createTreeNodeItem(node, parentId);
      expect(treeNode).to.matchSnapshot();
    });

    it("creates auto expanded tree node", () => {
      const node = createTestECInstancesNode({ isExpanded: true });
      const treeNode = createTreeNodeItem(node);
      expect(treeNode).to.matchSnapshot();
    });

    it("appends grouped nodes count if requested", () => {
      const node: Node = {
        key: createTestECClassGroupingNodeKey({ groupedInstancesCount: 999 }),
        label: LabelDefinition.fromLabelString("test"),
      };
      const treeNode = createTreeNodeItem(node, undefined, { appendChildrenCountForGroupingNodes: true });
      expect(treeNode).to.matchSnapshot();
    });

    it("uses provided callback to customize tree node", () => {
      const node = createTestECInstancesNode();
      const treeNode = createTreeNodeItem(node, undefined, {
        customizeTreeNodeItem: (item) => {
          item.icon = "custom-icon";
          item.description = "custom-description";
        },
      });
      expect(treeNode).to.matchSnapshot();
    });
  });

  describe("createPartialTreeNodeItem", () => {
    it("assigns item id and label from loaded node", () => {
      const node = createPartialTreeNodeItem(
        {
          key: { type: "", version: 0, pathFromRoot: [] },
          label: LabelDefinition.fromLabelString("test"),
        },
        undefined,
        {},
      );
      expect(node.id).not.to.be.undefined;
      expect(node.label).not.to.be.undefined;
      expect(PRESENTATION_TREE_NODE_KEY in node).to.be.true;
    });

    it("does not set a presentation tree node key when input does not have a key", () => {
      const node = createPartialTreeNodeItem({}, undefined, {});
      expect(PRESENTATION_TREE_NODE_KEY in node).to.be.false;
    });

    it("uses provided callback to customize tree node", () => {
      const treeNode = createPartialTreeNodeItem(
        {
          key: { type: "", version: 0, pathFromRoot: [] },
          label: LabelDefinition.fromLabelString("test"),
        }, undefined,
        {
          customizeTreeNodeItem: (item) => {
            item.icon = "custom-icon";
            item.description = "custom-description";
          },
        },
      );
      expect(treeNode).to.matchSnapshot();
    });
  });

  describe("createTreeNodeItems", () => {
    it("creates tree nodes", () => {
      const nodes = [createTestECInstancesNode(), createTestECInstancesNode()];
      const treeNode = createTreeNodeItems(nodes);
      expect(treeNode).to.matchSnapshot();
    });

    it("creates tree nodes with parentId", () => {
      const nodes = [createTestECInstancesNode(), createTestECInstancesNode()];
      const parentId = faker.random.word();
      const treeNode = createTreeNodeItems(nodes, parentId);
      expect(treeNode).to.matchSnapshot();
    });

  });

  describe("pageOptionsUiToPresentation", () => {
    it("returns undefined if passed undefined parameter", () => {
      const result = pageOptionsUiToPresentation(undefined);
      expect(result).to.be.equal(undefined);
    });

    it("converts ui page options to presentation page options", () => {
      const size = faker.random.number();
      const start = faker.random.number();
      const pageOptions: PageOptions = { size, start };
      const result = pageOptionsUiToPresentation(pageOptions);

      expect(result).to.not.be.undefined;
      expect(result!.size).to.be.equal(size);
      expect(result!.start).to.be.equal(start);
    });
  });
});
