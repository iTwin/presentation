/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PrimitiveValue } from "@itwin/appui-abstract";
import {
  AbstractTreeNodeLoaderWithProvider,
  MutableTreeModel,
  TreeModel,
  TreeModelNode,
  TreeModelNodeEditingInfo,
  TreeModelNodeInput,
  UiComponents,
} from "@itwin/components-react";
import { BeEvent, BeUiEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import { LabelDefinition, Node, RegisteredRuleset, Ruleset, StandardNodeTypes, VariableValue } from "@itwin/presentation-common";
import { IModelHierarchyChangeEventArgs, Presentation, PresentationManager, RulesetManager, RulesetVariablesManager } from "@itwin/presentation-frontend";
import {
  PresentationTreeNodeLoaderProps,
  useControlledPresentationTreeFiltering,
  usePresentationTreeNodeLoader,
} from "../../../presentation-components/tree/controlled/TreeHooks";
import { IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider";
import { createTreeNodeItem } from "../../../presentation-components/tree/Utils";
import { renderHook, waitFor } from "../../TestUtils";

/* eslint-disable deprecation/deprecation */

describe("usePresentationNodeLoader", () => {
  const onIModelHierarchyChanged: PresentationManager["onIModelHierarchyChanged"] = new BeEvent<(args: IModelHierarchyChangeEventArgs) => void>();
  const onRulesetModified: RulesetManager["onRulesetModified"] = new BeEvent<(curr: RegisteredRuleset, prev: Ruleset) => void>();
  const onRulesetVariableChanged: RulesetVariablesManager["onVariableChanged"] = new BeEvent<
    (variableId: string, prevValue: VariableValue | undefined, currValue: VariableValue | undefined) => void
  >();
  const onActiveFormattingUnitSystemChanged: QuantityFormatter["onActiveFormattingUnitSystemChanged"] = new BeUiEvent<FormattingUnitSystemChangedArgs>();

  const imodel = {
    key: "test-imodel-key",
  } as IModelConnection;
  const rulesetId = "test-ruleset-id";
  const initialProps: PresentationTreeNodeLoaderProps = {
    imodel,
    ruleset: rulesetId,
    pagingSize: 5,
  };

  beforeEach(async () => {
    const presentationManager = sinon.createStubInstance(PresentationManager);
    Object.assign(presentationManager, { onIModelHierarchyChanged });

    presentationManager.rulesets.returns({
      onRulesetModified,
    } as RulesetManager);

    presentationManager.vars.returns({
      onVariableChanged: onRulesetVariableChanged,
    } as RulesetVariablesManager);

    presentationManager.getNodesAndCount.resolves({ count: 0, nodes: [] });

    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged,
    }));

    await UiComponents.initialize(new EmptyLocalization());
  });

  afterEach(() => {
    UiComponents.terminate();
    sinon.restore();
  });

  it("creates node loader", () => {
    const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });

    expect(result.current.nodeLoader).to.not.be.undefined;
  });

  it("creates new nodeLoader when imodel changes", () => {
    const { result, rerender } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
    const oldNodeLoader = result.current.nodeLoader;

    const newImodel = { key: "new-imodel-key" } as IModelConnection;
    rerender({ ...initialProps, imodel: newImodel });

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

      onIModelHierarchyChanged.raiseEvent({ rulesetId: "unrelated", updateInfo: "FULL", imodelKey: imodel.key });

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

      onIModelHierarchyChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey: imodel.key });

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

    it("creates a new nodeLoader when `QuantityFormatter` raises an `onActiveFormattingUnitSystemChanged` event", async () => {
      const { result } = renderHook((props: PresentationTreeNodeLoaderProps) => usePresentationTreeNodeLoader(props), { initialProps });
      const oldNodeLoader = result.current.nodeLoader;

      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
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
      const { result, rerender } = renderHook((props) => usePresentationTreeNodeLoader(props), {
        initialProps: { ...initialProps, ruleset: "initial", seedTreeModel },
      });

      await waitFor(() => expectTree(result.current.nodeLoader.modelSource.getModel(), ["test"]));

      rerender({ ...initialProps, ruleset: "updated", seedTreeModel });
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

describe("useControlledPresentationTreeFiltering", () => {
  const getFilteredNodePathsStub = sinon.stub<
    Parameters<IPresentationTreeDataProvider["getFilteredNodePaths"]>,
    ReturnType<IPresentationTreeDataProvider["getFilteredNodePaths"]>
  >();
  const dataProvider = {
    getFilteredNodePaths: getFilteredNodePathsStub,
  } as unknown as IPresentationTreeDataProvider;
  const nodeLoader = {
    dataProvider,
  } as AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;

  beforeEach(() => {
    getFilteredNodePathsStub.reset();
  });

  it("returns original node loader if filter is not provided", () => {
    const { result } = renderHook(useControlledPresentationTreeFiltering, { initialProps: { nodeLoader } });
    expect(result.current.filteredNodeLoader).to.be.eq(nodeLoader);
  });

  it("returns filtered node loader when tree is filtered", async () => {
    const node = createNode("root");
    getFilteredNodePathsStub.resolves([{ children: [], index: 0, node, filteringData: { matchesCount: 1, childMatchesCount: 0 }, isMarked: true }]);

    const { result } = renderHook(useControlledPresentationTreeFiltering, { initialProps: { nodeLoader, filter: "test" } });

    await waitFor(() => {
      expect(result.current.isFiltering).to.be.false;
      expect(result.current.filteredNodeLoader).to.not.be.eq(nodeLoader);
      expect(result.current.matchesCount).to.be.eq(1);
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
      if (!node) {
        continue;
      }
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
