/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PropertyValueFormat } from "@itwin/appui-abstract";
import { assert, Guid } from "@itwin/core-bentley";
import { RpcManager } from "@itwin/core-common";
import { ChildNodeSpecificationTypes, NodeKey, PresentationRpcInterface, RuleTypes } from "@itwin/presentation-common";
import { isPresentationInfoTreeNodeItem, PresentationTreeDataProvider } from "@itwin/presentation-components";
import { TestIModelConnection } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { Ruleset } from "@itwin/presentation-common";
import type { PresentationTreeNodeItem } from "@itwin/presentation-components";

const RULESET: Ruleset = {
  id: "SimpleHierarchy",
  rules: [
    {
      ruleType: RuleTypes.RootNodes,
      specifications: [
        {
          specType: ChildNodeSpecificationTypes.CustomNode,
          type: "root",
          label: "root label",
          description: "root description",
          imageId: "root image id",
        },
      ],
    },
    {
      ruleType: RuleTypes.ChildNodes,
      condition: `ParentNode.Type = "root"`,
      specifications: [
        {
          specType: ChildNodeSpecificationTypes.CustomNode,
          type: "child",
          label: "child label",
          description: "child description",
          imageId: "child image id",
        },
      ],
    },
  ],
};

describe("TreeDataProvider", async () => {
  let imodel: IModelConnection;
  let provider: PresentationTreeDataProvider;

  beforeAll(async () => {
    await initialize();
    const testIModelName: string = "assets/datasets/Properties_60InstancesWithUrl2.ibim";
    imodel = TestIModelConnection.openFile(testIModelName);
    expect(imodel).not.toBeNull();
    provider = new PresentationTreeDataProvider({ imodel, ruleset: RULESET });
  });

  afterAll(async () => {
    await imodel.close();
    await terminate();
  });

  it("returns root nodes count", async () => {
    const count = await provider.getNodesCount();
    expect(count).toBe(1);
  });

  it("returns root nodes", async () => {
    const nodes = await provider.getNodes();
    expect(nodes.length).toBe(1);
  });

  it("returns root nodes with paging", async () => {
    provider.pagingSize = 5;
    const nodes = await provider.getNodes(undefined, { start: 0, size: 5 });
    expect(nodes.length).toBe(1);
  });

  it("creates error node when requesting root nodes with invalid paging", async () => {
    // stub console log to avoid expected error in console
    const consoleStub = vi.spyOn(console, "error").mockImplementation(() => {});
    provider.pagingSize = 5;
    const nodes = await provider.getNodes(undefined, { start: 1, size: 5 });
    if (nodes.length === 1) {
      const node = nodes[0];
      assert(isPresentationInfoTreeNodeItem(node));
      // cspell:disable-next-line
      expect(node.message).toBe("Èrrór ¢rëätíñg thë hìérärçhý lévêl");
    } else {
      // presentation-frontend@3.6 returns an empty list in case of invalid page options
      expect(nodes).toHaveLength(0);
    }
    consoleStub.mockRestore();
  });

  it("returns child nodes count", async () => {
    const rootNodes = await provider.getNodes();
    const count = await provider.getNodesCount(rootNodes[0]);
    expect(count).toBe(1);
  });

  it("returns child nodes", async () => {
    const rootNodes = await provider.getNodes();
    const childNodes = await provider.getNodes(rootNodes[0]);
    expect(childNodes.length).toBe(1);
  });

  it("returns child nodes with paging", async () => {
    const rootNodes = await provider.getNodes();
    provider.pagingSize = 5;
    const nodes = await provider.getNodes(rootNodes[0], { start: 0, size: 5 });
    expect(nodes.length).toBe(1);
  });

  it("returns error node when requesting child nodes with invalid paging", async () => {
    // stub console log to avoid expected error in console
    const consoleStub = vi.spyOn(console, "error").mockImplementation(() => {});
    const rootNodes = await provider.getNodes();
    provider.pagingSize = 5;
    const nodes = await provider.getNodes(rootNodes[0], { start: 1, size: 5 });
    if (nodes.length === 1) {
      const node = nodes[0];
      assert(isPresentationInfoTreeNodeItem(node));
      // cspell:disable-next-line
      expect(node.message).toBe("Èrrór ¢rëätíñg thë hìérärçhý lévêl");
    } else {
      // presentation-frontend@3.6 returns an empty list in case of invalid page options
      expect(nodes).toHaveLength(0);
    }
    consoleStub.mockRestore();
  });

  it("requests backend only once to get first page", async () => {
    const getNodesSpy = vi.spyOn(RpcManager.getClientForInterface(PresentationRpcInterface), "getPagedNodes");
    provider.pagingSize = 10;

    // request count and first page
    const count = await provider.getNodesCount();
    const nodes = await provider.getNodes(undefined, { start: 0, size: 10 });

    expect(count).not.toBe(0);
    expect(nodes).toBeDefined();
    expect(getNodesSpy).toHaveBeenCalledOnce();
  });

  it("shows grouping node children counts", async () => {
    const ruleset: Ruleset = {
      id: Guid.createValue(),
      rules: [
        {
          ruleType: RuleTypes.RootNodes,
          specifications: [
            {
              specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
              classes: { schemaName: "BisCore", classNames: ["Model"], arePolymorphic: true },
              groupByClass: true,
            },
          ],
        },
      ],
    };
    provider = new PresentationTreeDataProvider({ imodel, ruleset, appendChildrenCountForGroupingNodes: true });
    const nodes = await provider.getNodes(undefined);
    expect(nodes).not.toHaveLength(0);
    nodes.forEach((item) => {
      const key = (item as PresentationTreeNodeItem).key;
      assert(NodeKey.isClassGroupingNodeKey(key));
      assert(item.label.value.valueFormat === PropertyValueFormat.Primitive);
      expect(item.label.value.displayValue).toMatch(
        new RegExp(`^[\\w\\d_ ]+ \\(${key.groupedInstancesCount}\\)$`, "i"),
      );
    });
  });
});
