/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { TreeNodeItem } from "@itwin/components-react";
import { BeEvent, Guid } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { HierarchyRequestOptions, LabelDefinition, Node, NodeKey, RegisteredRuleset, Ruleset } from "@itwin/presentation-common";
import { Presentation, PresentationManager, RulesetManager, RulesetVariablesManager } from "@itwin/presentation-frontend";
import { HierarchyBuilder, NodeMappingFunc } from "../presentation-testing/HierarchyBuilder";
import { createStub } from "./Utils";

async function getRootNodes() {
  const root: Node = {
    label: LabelDefinition.fromLabelString("Root Node"),
    hasChildren: true,
    key: { type: "", version: 0, pathFromRoot: ["root"] },
  };
  return { nodes: [root], count: 1 };
}

async function getChildrenNodes(opts: HierarchyRequestOptions<IModelConnection, NodeKey>) {
  if (opts.parentKey?.pathFromRoot[0] !== "root" || opts?.parentKey.pathFromRoot.length !== 1) {
    return { nodes: [], count: 0 };
  }

  const child1: Node = {
    label: LabelDefinition.fromLabelString("Child 1"),
    key: { type: "", version: 0, pathFromRoot: ["root", "child1"] },
  };
  const child2: Node = {
    label: LabelDefinition.fromLabelString("Child 2"),
    key: { type: "", version: 0, pathFromRoot: ["root", "child2"] },
  };
  return { nodes: [child1, child2], count: 2 };
}

describe("HierarchyBuilder", () => {
  let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;
  const rulesetManager = {
    add: createStub<RulesetManager["add"]>(),
  };

  const ruleset = { id: "1" } as Ruleset;
  const imodel = {} as IModelConnection;

  beforeEach(() => {
    rulesetManager.add.callsFake(async (rules) => new RegisteredRuleset(rules, Guid.createValue(), () => {}));

    presentationManager = sinon.createStubInstance(PresentationManager);
    presentationManager.rulesets.returns(rulesetManager as unknown as RulesetManager);
    presentationManager.vars.returns({
      onVariableChanged: new BeEvent(),
    } as RulesetVariablesManager);
  });

  afterEach(() => {
    rulesetManager.add.reset();
  });

  describe("createHierarchy", () => {
    context("without data", () => {
      beforeEach(() => {
        sinon.stub(Presentation, "presentation").get(() => presentationManager);
        presentationManager.getNodesAndCount.resolves({ nodes: [], count: 0 });
      });

      afterEach(() => {
        sinon.restore();
      });

      it("returns empty list when rulesetId is given", async () => {
        const builder = new HierarchyBuilder({ imodel });
        const hierarchy = await builder.createHierarchy("1");
        expect(hierarchy).to.be.empty;
      });

      it("returns empty list when ruleset is given", async () => {
        const builder = new HierarchyBuilder({ imodel });
        const hierarchy = await builder.createHierarchy(ruleset);
        expect(hierarchy).to.be.empty;
      });
    });

    context("with data", () => {
      beforeEach(() => {
        sinon.stub(Presentation, "presentation").get(() => presentationManager);
        presentationManager.getNodesAndCount.callsFake(async (opts) => (opts.parentKey === undefined ? getRootNodes() : getChildrenNodes(opts)));
      });

      afterEach(() => {
        sinon.restore();
      });

      it("returns correct hierarchy", async () => {
        const builder = new HierarchyBuilder({ imodel });
        expect(await builder.createHierarchy(ruleset)).to.matchSnapshot();
      });

      it("returns correct hierarchy with custom node mapping function", async () => {
        const nodeMapper: NodeMappingFunc = (node: TreeNodeItem) => ({ id: node.id });
        const builder = new HierarchyBuilder({ imodel, nodeMappingFunc: nodeMapper });
        expect(await builder.createHierarchy(ruleset)).to.matchSnapshot();
      });
    });
  });
});
