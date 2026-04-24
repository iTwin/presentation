/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { createAsyncIterator } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { TreeNodeItem } from "@itwin/components-react";
import { BeEvent, Guid } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  HierarchyRequestOptions,
  LabelDefinition,
  Node,
  NodeKey,
  RegisteredRuleset,
  Ruleset,
} from "@itwin/presentation-common";
import {
  Presentation,
  PresentationManager,
  RulesetManager,
} from "@itwin/presentation-frontend";
import { HierarchyBuilder, NodeMappingFunc } from "../presentation-testing/HierarchyBuilder.js";
import { createStub } from "./Utils.js";

async function getRootNodes() {
  const root: Node = {
    label: LabelDefinition.fromLabelString("Root Node"),
    hasChildren: true,
    key: { type: "", version: 0, pathFromRoot: ["root"] },
  };
  return { items: createAsyncIterator([root]), total: 1 };
}

async function getChildrenNodes(opts: HierarchyRequestOptions<IModelConnection, NodeKey>) {
  if (opts.parentKey?.pathFromRoot[0] !== "root" || opts?.parentKey.pathFromRoot.length !== 1) {
    return { items: createAsyncIterator([]), total: 0 };
  }

  const child1: Node = {
    label: LabelDefinition.fromLabelString("Child 1"),
    key: { type: "", version: 0, pathFromRoot: ["root", "child1"] },
  };
  const child2: Node = {
    label: LabelDefinition.fromLabelString("Child 2"),
    key: { type: "", version: 0, pathFromRoot: ["root", "child2"] },
  };
  return { items: createAsyncIterator([child1, child2]), total: 2 };
}

describe("HierarchyBuilder", () => {
  let presentationManager: { rulesets: MockInstance; vars: MockInstance; getNodesIterator: MockInstance };
  const rulesetManager = { add: createStub<RulesetManager["add"]>() };

  const ruleset = { id: "1" } as Ruleset;
  const imodel = {} as IModelConnection;

  beforeEach(() => {
    rulesetManager.add.mockImplementation(async (rules) => new RegisteredRuleset(rules, Guid.createValue(), () => {}));

    presentationManager = {
      rulesets: vi.fn().mockReturnValue(rulesetManager),
      vars: vi.fn().mockReturnValue({ onVariableChanged: new BeEvent() }),
      getNodesIterator: vi.fn(),
    };
  });

  afterEach(() => {
    rulesetManager.add.mockReset();
  });

  describe("createHierarchy", () => {
    describe("without data", () => {
      beforeEach(() => {
        vi.spyOn(Presentation, "presentation", "get").mockReturnValue(
          presentationManager as unknown as PresentationManager,
        );
        presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([]), total: 0 });
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("returns empty list when rulesetId is given", async () => {
        const builder = new HierarchyBuilder({ imodel });
        const hierarchy = await builder.createHierarchy("1");
        expect(hierarchy).toHaveLength(0);
      });

      it("returns empty list when ruleset is given", async () => {
        const builder = new HierarchyBuilder({ imodel });
        const hierarchy = await builder.createHierarchy(ruleset);
        expect(hierarchy).toHaveLength(0);
      });
    });

    describe("with data", () => {
      beforeEach(() => {
        vi.spyOn(Presentation, "presentation", "get").mockReturnValue(
          presentationManager as unknown as PresentationManager,
        );
        presentationManager.getNodesIterator.mockImplementation(async (opts) =>
          opts.parentKey === undefined ? getRootNodes() : getChildrenNodes(opts),
        );
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("returns correct hierarchy", async () => {
        const builder = new HierarchyBuilder({ imodel });
        expect(await builder.createHierarchy(ruleset)).toMatchSnapshot();
      });

      it("returns correct hierarchy with custom node mapping function", async () => {
        const nodeMapper: NodeMappingFunc = (node: TreeNodeItem) => ({ id: node.id });
        const builder = new HierarchyBuilder({ imodel, nodeMappingFunc: nodeMapper });
        expect(await builder.createHierarchy(ruleset)).toMatchSnapshot();
      });
    });
  });
});
