/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { PrimitiveValue } from "@itwin/appui-abstract";
import { MutableTreeModel, TreeModel, TreeModelNode, TreeModelNodeEditingInfo, TreeModelNodeInput, UiComponents } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { ITwinLocalization } from "@itwin/core-i18n";
import { LabelDefinition, Node, RegisteredRuleset, StandardNodeTypes } from "@itwin/presentation-common";
import { Presentation, PresentationManager, RulesetManager, RulesetVariablesManager } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import { cleanup, renderHook } from "@testing-library/react-hooks";
import {
  PresentationTreeNodeLoaderProps,
  PresentationTreeNodeLoaderResult,
  usePresentationTreeNodeLoader,
} from "../../../presentation-components/tree/controlled/TreeHooks";
import { createTreeNodeItem } from "../../../presentation-components/tree/Utils";
import { mockPresentationManager } from "../../_helpers/UiComponents";

describe("usePresentationNodeLoader", () => {
  let onIModelHierarchyChanged: PresentationManager["onIModelHierarchyChanged"];
  let onRulesetModified: RulesetManager["onRulesetModified"];
  let onRulesetVariableChanged: RulesetVariablesManager["onVariableChanged"];
  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const rulesetId = "test-ruleset-id";
  const imodelKey = "test-imodel-key";
  const initialProps: PresentationTreeNodeLoaderProps = {
    imodel: imodelMock.object,
    ruleset: rulesetId,
    pagingSize: 5,
  };

  beforeEach(async () => {
    imodelMock.setup((x) => x.key).returns(() => imodelKey);
    const mocks = mockPresentationManager();
    onIModelHierarchyChanged = mocks.presentationManager.object.onIModelHierarchyChanged;
    onRulesetModified = mocks.rulesetsManager.object.onRulesetModified;
    onRulesetVariableChanged = mocks.rulesetVariablesManager.object.onVariableChanged;
    mocks.presentationManager.setup(async (x) => x.getNodesAndCount(moq.It.isAny())).returns(async () => ({ count: 0, nodes: [] }));
    sinon.stub(Presentation, "presentation").get(() => mocks.presentationManager.object);
    await UiComponents.initialize(new ITwinLocalization());
  });

  afterEach(async () => {
    await cleanup();
    imodelMock.reset();
    UiComponents.terminate();
    Presentation.terminate();
  });

  it("creates node loader", () => {
    const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });

    expect(result.current.nodeLoader).to.not.be.undefined;
  });

  it("creates new nodeLoader when imodel changes", () => {
    const { result, rerender } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
    const oldNodeLoader = result.current.nodeLoader;

    const newImodelMock = moq.Mock.ofType<IModelConnection>();
    rerender({ ...initialProps, imodel: newImodelMock.object });

    expect(result.current.nodeLoader).to.not.eq(oldNodeLoader);
  });

  it("creates new nodeLoader when ruleset changes", () => {
    const { result, rerender } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
    const oldNodeLoader = result.current.nodeLoader;

    rerender({ ...initialProps, ruleset: "changed" });

    expect(result.current.nodeLoader).to.not.eq(oldNodeLoader);
  });

  it("creates new nodeLoader when pagingSize changes", () => {
    const { result, rerender } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
    const oldNodeLoader = result.current.nodeLoader;

    rerender({ ...initialProps, pagingSize: 20 });

    expect(result.current.nodeLoader).to.not.eq(oldNodeLoader);
  });

  describe("auto-updating model source", () => {
    beforeEach(() => {
      initialProps.enableHierarchyAutoUpdate = true;
    });

    it("doesn't create a new nodeLoader when `PresentationManager` raises `onIModelHierarchyChanged` event with unrelated ruleset", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      onIModelHierarchyChanged.raiseEvent({ rulesetId: "unrelated", updateInfo: "FULL", imodelKey });

      await waitFor(() => expect(result.current.nodeLoader).to.eq(oldNodeLoader));
    });

    it("doesn't create a new nodeLoader when `PresentationManager` raises `onIModelHierarchyChanged` event with unrelated imodel", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      onIModelHierarchyChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey: "unrelated" });

      await waitFor(() => expect(result.current.nodeLoader).to.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `PresentationManager` raises a related `onIModelHierarchyChanged event`", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), {
        initialProps: { ...initialProps, ruleset: rulesetId },
      });
      const oldNodeLoader = result.current.nodeLoader;

      onIModelHierarchyChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey });

      await waitFor(() => expect(result.current.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("doesn't create a new nodeLoader when `RulesetsManager` raises an unrelated `onRulesetModified` event", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      const currRuleset = new RegisteredRuleset({ id: "unrelated", rules: [] }, "", () => {});
      onRulesetModified.raiseEvent(currRuleset, { ...currRuleset.toJSON() });

      await waitFor(() => expect(result.current.nodeLoader).to.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetsManager` raises a related `onRulesetModified` event", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      const currRuleset = new RegisteredRuleset({ id: rulesetId, rules: [] }, "", () => {});
      onRulesetModified.raiseEvent(currRuleset, currRuleset.toJSON());
      await waitFor(() => expect(result.current.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetVariablesManager` raises an `onRulesetVariableChanged` event with a new value", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      onRulesetVariableChanged.raiseEvent("var-id", undefined, "curr");
      await waitFor(() => expect(result.current.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetVariablesManager` raises an `onRulesetVariableChanged` event with a changed value", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      onRulesetVariableChanged.raiseEvent("var-id", "prev", "curr");
      await waitFor(() => expect(result.current.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetVariablesManager` raises an `onRulesetVariableChanged` event with a removed value", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      onRulesetVariableChanged.raiseEvent("var-id", "prev", undefined);
      await waitFor(() => expect(result.current.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("does not create a new nodeLoader when `onRulesetModified` event is raised but there are no changes", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      const currRuleset = new RegisteredRuleset({ id: rulesetId, rules: [] }, "", () => {});
      onRulesetModified.raiseEvent(currRuleset, currRuleset.toJSON());

      await waitFor(() => expect(result.current.nodeLoader).to.eq(oldNodeLoader));
    });

    it("creates a fresh `TreeModelSource` when nodeLoader changes", async () => {
      const seedTreeModel = createTreeModel(["test"]);
      const { result, rerender } = renderHook<PresentationTreeNodeLoaderProps, PresentationTreeNodeLoaderResult>(
        (props) => usePresentationTreeNodeLoader(props),
        { initialProps: { ...initialProps, ruleset: "initial", seedTreeModel } },
      );

      await waitFor(() => expectTree(result.current.nodeLoader.modelSource.getModel(), ["test"]));

      rerender({ ...initialProps, ruleset: "updated" });
      const newModelSource = result.current.nodeLoader.modelSource;
      await waitFor(() => expectTree(newModelSource.getModel(), []));
    });
  });

  describe("seed tree model", () => {
    it("initializes tree with the provided model", () => {
      const treeHierarchy = [{ root1: ["child1", "child2"] }, "root2"];
      const seedTreeModel = createTreeModel(treeHierarchy);
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), {
        initialProps: { ...initialProps, seedTreeModel },
      });
      expectTree(result.current.nodeLoader.modelSource.getModel(), treeHierarchy);
    });
  });
});

function createNode(label: string): Node {
  return {
    key: {
      version: 2,
      type: StandardNodeTypes.ECInstancesNode,
      instanceKeys: [],
      pathFromRoot: [label],
    },
    label: LabelDefinition.fromLabelString(label),
  };
}

function createNodeInput(label: string): TreeModelNodeInput {
  const node = createNode(label);
  const item = createTreeNodeItem(node, undefined);
  return {
    id: label,
    item,
    label: item.label,
    isExpanded: false,
    isLoading: false,
    isSelected: false,
  };
}

type TreeHierarchy =
  | string
  | {
      [label: string]: TreeHierarchy[];
    }
  | {
      label: string;
      selected?: true;
      expanded?: true;
      loading?: true;
      editingInfo?: TreeModelNodeEditingInfo;
      children?: TreeHierarchy[];
    };

function expectTree(model: TreeModel, expectedHierarchy: TreeHierarchy[]): void {
  const actualHierarchy = buildActualHierarchy(undefined);
  expect(actualHierarchy).to.deep.equal(expectedHierarchy);

  function buildActualHierarchy(parentId: string | undefined): TreeHierarchy[] {
    const result: TreeHierarchy[] = [];
    for (const childId of model.getChildren(parentId) ?? []) {
      const node = model.getNode(childId) as TreeModelNode | undefined;
      if (!node) continue;
      const label = (node.label.value as PrimitiveValue).displayValue!;
      const children = buildActualHierarchy(childId);
      const additionalProperties: Partial<TreeHierarchy> = {};
      if (node.isSelected) {
        additionalProperties.selected = true;
      }

      if (node.isExpanded) {
        additionalProperties.expanded = true;
      }

      if (node.isLoading) {
        additionalProperties.loading = true;
      }

      if (node.editingInfo) {
        additionalProperties.editingInfo = node.editingInfo;
      }

      if (Object.keys(additionalProperties).length > 0) {
        result.push({ label, ...additionalProperties, ...(children.length > 0 && { children }) });
      } else if (children.length > 0) {
        result.push({ [label]: children });
      } else {
        result.push(label);
      }
    }

    return result;
  }
}

function createTreeModel(hierarchy: TreeHierarchy[]): MutableTreeModel {
  const treeModel = new MutableTreeModel();
  insertNodes(undefined, hierarchy);
  expectTree(treeModel, hierarchy);
  return treeModel;

  function insertNodes(parentId: string | undefined, childNodes: TreeHierarchy[]): void {
    for (let i = 0; i < childNodes.length; ++i) {
      const node = childNodes[i];
      if (typeof node === "string") {
        treeModel.insertChild(parentId, createNodeInput(node), i);
      } else if (typeof node.label === "string") {
        treeModel.insertChild(parentId, createNodeInput(node.label), i);
        const insertedNode = treeModel.getNode(node.label)!;
        if (node.selected) {
          insertedNode.isSelected = true;
        }

        if (node.expanded) {
          insertedNode.isExpanded = true;
        }

        if (node.loading) {
          insertedNode.isLoading = true;
        }

        if (node.editingInfo) {
          insertedNode.editingInfo = node.editingInfo as TreeModelNodeEditingInfo;
        }

        insertNodes(node.label, node.children ?? []);
      } else {
        const nodeLabel = Object.keys(node)[0];
        treeModel.insertChild(parentId, createNodeInput(nodeLabel), i);
        insertNodes(nodeLabel, (node as any)[nodeLabel] as TreeHierarchy[]);
      }
    }
  }
}
