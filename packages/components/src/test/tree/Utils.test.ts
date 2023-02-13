/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { LabelDefinition, Node } from "@itwin/presentation-common";
import { PageOptions } from "@itwin/components-react";
import {
  createPartialTreeNodeItem, createTreeNodeItem, createTreeNodeItems, pageOptionsUiToPresentation,
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
      const parentId = "test_parent_id";
      const treeNode = createTreeNodeItem(node, parentId);
      expect(treeNode).to.matchSnapshot();
    });

    it("creates tree node with custom label styles", () => {
      const node = createTestECInstancesNode();
      node.fontStyle = "Bold Italic"; // eslint-disable-line deprecation/deprecation
      const treeNode = createTreeNodeItem(node);
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
        label: LabelDefinition.fromLabelString("test"), // eslint-disable-line @itwin/no-internal
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
          label: LabelDefinition.fromLabelString("test"), // eslint-disable-line @itwin/no-internal
        },
        undefined,
        {},
      );
      expect(node.id).not.to.be.undefined;
      expect(node.label).not.to.be.undefined;
      expect(node.key).not.to.be.undefined;
    });

    it("does not set a presentation tree node key when input does not have a key", () => {
      const node = createPartialTreeNodeItem({}, undefined, {});
      expect(node.key).to.be.undefined;
    });

    it("uses provided callback to customize tree node", () => {
      const treeNode = createPartialTreeNodeItem(
        {
          key: { type: "", version: 0, pathFromRoot: [] },
          label: LabelDefinition.fromLabelString("test"), // eslint-disable-line @itwin/no-internal
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
      const parentId = "test_parent_id";
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
      const size = 10;
      const start = 2;
      const pageOptions: PageOptions = { size, start };
      const result = pageOptionsUiToPresentation(pageOptions);

      expect(result).to.not.be.undefined;
      expect(result!.size).to.be.equal(size);
      expect(result!.start).to.be.equal(start);
    });
  });
});
