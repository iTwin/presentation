/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PrimitiveValue } from "@itwin/appui-abstract";
import {
  MutableTreeModel,
  TreeEventHandler,
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
  PresentationTreeEventHandlerProps,
  usePresentationTreeState,
  UsePresentationTreeStateProps,
  UsePresentationTreeStateResult,
} from "../../../presentation-components/tree/controlled/UsePresentationTreeState";
import { PresentationTreeDataProvider } from "../../../presentation-components/tree/DataProvider";
import { ReportingTreeNodeLoader } from "../../../presentation-components/tree/ReportingTreeNodeLoader";
import { createTreeNodeItem } from "../../../presentation-components/tree/Utils";
import { renderHook, waitFor } from "../../TestUtils";

describe("usePresentationTreeState", () => {
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
  const initialProps: UsePresentationTreeStateProps = {
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

  it("creates node loader", async () => {
    const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });

    await waitFor(() => expect(result.current?.nodeLoader).to.not.be.undefined);
  });

  it("creates new nodeLoader when imodel changes", async () => {
    const { result, rerender } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
    const oldNodeLoader = await waitForState(result);

    const newImodel = { key: "new-imodel-key" } as IModelConnection;
    rerender({ ...initialProps, imodel: newImodel });

    await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
  });

  it("creates new nodeLoader when ruleset changes", async () => {
    const { result, rerender } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
    const oldNodeLoader = await waitForState(result);

    rerender({ ...initialProps, ruleset: "changed" });

    await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
  });

  it("creates new nodeLoader when pagingSize changes", async () => {
    const { result, rerender } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
    const oldNodeLoader = await waitForState(result);

    rerender({ ...initialProps, pagingSize: 20 });

    await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
  });

  it("creates new reporting nodeLoader when `onNodeLoaded` callback passed", async () => {
    const onNodeLoaded = sinon.stub<[{ node: string | undefined; duration: number }], void>();
    const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), {
      initialProps: { ...initialProps, onNodeLoaded },
    });

    const observable = result.current?.nodeLoader.loadNode({ id: undefined, depth: -1, numChildren: 1 }, 0);
    observable?.subscribe();

    await waitFor(() => {
      expect(onNodeLoaded).to.be.calledOnce;
      expect(result.current?.nodeLoader instanceof ReportingTreeNodeLoader).to.be.true;
    });
  });

  describe("auto-updating model source", () => {
    beforeEach(() => {
      initialProps.enableHierarchyAutoUpdate = true;
    });

    it("doesn't create a new nodeLoader when `PresentationManager` raises `onIModelHierarchyChanged` event with unrelated ruleset", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), {
        initialProps: { ...initialProps, onNodeLoaded: () => {} },
      });

      onIModelHierarchyChanged.raiseEvent({ rulesetId: "unrelated", updateInfo: "FULL", imodelKey: imodel.key });

      await waitFor(() => expect(result.current?.nodeLoader instanceof ReportingTreeNodeLoader).to.be.true);
    });

    it("doesn't create a new nodeLoader when `PresentationManager` raises `onIModelHierarchyChanged` event with unrelated imodel", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      onIModelHierarchyChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey: "unrelated" });

      await waitFor(() => expect(result.current?.nodeLoader).to.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `PresentationManager` raises a related `onIModelHierarchyChanged event`", async () => {
      const onNodeLoaded = sinon.stub<[{ node: string | undefined; duration: number }], void>();
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), {
        initialProps: { ...initialProps, ruleset: rulesetId, onNodeLoaded },
      });
      const oldNodeLoader = await waitForState(result);

      onIModelHierarchyChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey: imodel.key });
      await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));

      const observable = result.current?.nodeLoader.loadNode({ id: undefined, depth: -1, numChildren: 1 }, 0);
      observable?.subscribe();

      await waitFor(() => expect(onNodeLoaded).to.be.calledOnce);
    });

    it("doesn't create a new nodeLoader when `RulesetsManager` raises an unrelated `onRulesetModified` event", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      const currRuleset = new RegisteredRuleset({ id: "unrelated", rules: [] }, "", () => {});
      onRulesetModified.raiseEvent(currRuleset, { ...currRuleset.toJSON() });

      await waitFor(() => expect(result.current?.nodeLoader).to.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetsManager` raises a related `onRulesetModified` event", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      const currRuleset = new RegisteredRuleset({ id: rulesetId, rules: [] }, "", () => {});
      onRulesetModified.raiseEvent(currRuleset, currRuleset.toJSON());
      await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetVariablesManager` raises an `onRulesetVariableChanged` event with a new value", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      onRulesetVariableChanged.raiseEvent("var-id", undefined, "curr");
      await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetVariablesManager` raises an `onRulesetVariableChanged` event with a changed value", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      onRulesetVariableChanged.raiseEvent("var-id", "prev", "curr");
      await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `RulesetVariablesManager` raises an `onRulesetVariableChanged` event with a removed value", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      onRulesetVariableChanged.raiseEvent("var-id", "prev", undefined);
      await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("creates a new nodeLoader when `QuantityFormatter` raises an `onActiveFormattingUnitSystemChanged` event", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
      await waitFor(() => expect(result.current?.nodeLoader).to.not.eq(oldNodeLoader));
    });

    it("does not create a new nodeLoader when `onRulesetModified` event is raised but there are no changes", async () => {
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), { initialProps });
      const oldNodeLoader = await waitForState(result);

      const currRuleset = new RegisteredRuleset({ id: rulesetId, rules: [] }, "", () => {});
      onRulesetModified.raiseEvent(currRuleset, currRuleset.toJSON());

      await waitFor(() => expect(result.current?.nodeLoader).to.eq(oldNodeLoader));
    });

    it("creates a fresh `TreeModelSource` when nodeLoader changes", async () => {
      const seedTreeModel = createTreeModel(["test"]);
      const { result, rerender } = renderHook((props) => usePresentationTreeState(props), {
        initialProps: { ...initialProps, ruleset: "initial", seedTreeModel },
      });

      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
        expectTree(result.current!.nodeLoader.modelSource.getModel(), ["test"]);
      });

      rerender({ ...initialProps, ruleset: "updated", seedTreeModel });
      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
        expectTree(result.current!.nodeLoader.modelSource.getModel(), []);
      });
    });
  });

  describe("seed tree model", () => {
    it("initializes tree with the provided model", async () => {
      const treeHierarchy = [{ root1: ["child1", "child2"] }, "root2"];
      const seedTreeModel = createTreeModel(treeHierarchy);
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), {
        initialProps: { ...initialProps, seedTreeModel },
      });
      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
        expectTree(result.current!.nodeLoader.modelSource.getModel(), treeHierarchy);
      });
    });
  });

  describe("events handler", () => {
    it("creates events handler using supplied factory method", async () => {
      const eventHandlerFactory = sinon
        .stub<[PresentationTreeEventHandlerProps], TreeEventHandler | undefined>()
        .callsFake((props) => new TreeEventHandler({ nodeLoader: props.nodeLoader, modelSource: props.modelSource }));
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), {
        initialProps: { ...initialProps, eventHandlerFactory },
      });
      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
        expect(result.current!.eventHandler).to.not.be.undefined;
        expect(eventHandlerFactory).to.be.called;
      });
    });

    it("recreates events handler using supplied factory method when node loader changes", async () => {
      const eventHandlerFactory = sinon
        .stub<[PresentationTreeEventHandlerProps], TreeEventHandler | undefined>()
        .callsFake((props) => new TreeEventHandler({ nodeLoader: props.nodeLoader, modelSource: props.modelSource }));
      const { result, rerender } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), {
        initialProps: { ...initialProps, eventHandlerFactory },
      });
      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
        expect(result.current!.eventHandler).to.not.be.undefined;
        expect(eventHandlerFactory).to.be.called;
      });

      eventHandlerFactory.resetHistory();

      rerender({ ...initialProps, eventHandlerFactory, ruleset: "new-ruleset" });
      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
        expect(result.current!.eventHandler).to.not.be.undefined;
        expect(eventHandlerFactory).to.be.called;
      });
    });
  });

  describe("filtering", () => {
    it("applies filter", async () => {
      const node = createNode("root");
      const getFilteredPathsStub = sinon
        .stub(PresentationTreeDataProvider.prototype, "getFilteredNodePaths")
        .resolves([{ children: [], index: 0, node, filteringData: { matchesCount: 1, childMatchesCount: 0 }, isMarked: true }]);
      const { result } = renderHook((props: UsePresentationTreeStateProps) => usePresentationTreeState(props), {
        initialProps: { ...initialProps, filteringParams: { filter: "root" } },
      });

      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
        expect(result.current!.filteringResult).to.not.be.undefined;
        expect(result.current!.filteringResult!.filteredProvider).to.not.be.undefined;
        expect(result.current!.filteringResult!.matchesCount).to.be.eq(1);
        expect(getFilteredPathsStub).to.be.called;
      });
    });
  });
});

async function waitForState(result: { current: UsePresentationTreeStateResult<TreeEventHandler> | undefined }) {
  return waitFor(() => {
    const loader = result.current?.nodeLoader;
    expect(loader).to.not.be.undefined;
    return loader!;
  });
}

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
