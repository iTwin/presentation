/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { ResolvablePromise } from "presentation-test-utilities";
import { Subject } from "rxjs";
import { from } from "rxjs/internal/observable/from";
import { finalize } from "rxjs/internal/operators/finalize";
import { ObservableInput } from "rxjs/internal/types";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, Mocked, vi } from "vitest";
import {
  AbstractTreeNodeLoaderWithProvider,
  TreeModelNodeInput,
  TreeModelSource,
  TreeNodeItem,
  TreeSelectionChange,
  TreeSelectionModificationEventArgs,
  TreeSelectionReplacementEventArgs,
  UiComponents,
} from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { Key, KeySet, NodeKey } from "@itwin/presentation-common";
import {
  ISelectionProvider,
  Presentation,
  SelectionChangeEvent,
  SelectionChangeEventArgs,
  SelectionChangeType,
  SelectionHelper,
  SelectionManager,
} from "@itwin/presentation-frontend";
import {
  UnifiedSelectionTreeEventHandler,
  UnifiedSelectionTreeEventHandlerParams,
  useUnifiedSelectionTreeEventHandler,
} from "../../../presentation-components/tree/controlled/UseUnifiedSelection.js";
import { IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider.js";
import { PresentationTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem.js";
import { createTestECClassGroupingNodeKey, createTestECInstancesNodeKey } from "../../_helpers/Hierarchy.js";
import { createTestTreeNodeItem } from "../../_helpers/UiComponents.js";
import { configure, createMocked, renderHook } from "../../TestUtils.js";

const awaitableObservable = <T>(input: ObservableInput<T>) => {
  const promise = new ResolvablePromise<void>();
  const observable = from(input).pipe(finalize(async () => promise.resolve()));
  return { observable, waitForCompletion: async () => promise };
};

describe("UnifiedSelectionEventHandler", () => {
  const modelSource = new TreeModelSource();
  const imodel = {} as IModelConnection;
  const dataProvider = {
    imodel,
    rulesetId: "test_ruleset",
  } as IPresentationTreeDataProvider;
  const nodeLoader = {
    dataProvider,
    modelSource,
  } as AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;

  let selectionManager: Mocked<SelectionManager>;
  const selectionChangeEvent = new SelectionChangeEvent();

  beforeAll(async () => {
    await UiComponents.initialize(new EmptyLocalization());
  });

  afterAll(() => {
    UiComponents.terminate();
  });

  beforeEach(() => {
    modelSource.modifyModel((model) => {
      model.clearChildren(undefined);
    });

    selectionManager = createMocked(SelectionManager);
    selectionManager.getSelection.mockReturnValue(new KeySet());
    Object.assign(selectionManager, { selectionChange: selectionChangeEvent });

    vi.spyOn(Presentation, "selection", "get").mockReturnValue(selectionManager);
  });

  function createHandler() {
    return new UnifiedSelectionTreeEventHandler({
      nodeLoader,
      name: "Test_Handler",
    });
  }

  type SelectionAction = SelectionManager["addToSelection"] | SelectionManager["replaceSelection"] | SelectionManager["removeFromSelection"];
  function expectCalledWithKeys(callback: SelectionAction, keys: Key[]) {
    expect(callback).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        asymmetricMatch: (actualKeys: unknown) => {
          const lhs = new KeySet(actualKeys as Key[]);
          const rhs = new KeySet(keys);
          return lhs.size === rhs.size && lhs.hasAll(rhs);
        },
      },
      expect.anything(),
      expect.anything(),
    );
  }

  const createNode = (nodeKeyGenerator: () => NodeKey = createTestECInstancesNodeKey, customNodeItem?: Partial<TreeNodeItem>): TreeModelNodeInput => {
    const nodeItem = createTestTreeNodeItem(nodeKeyGenerator(), customNodeItem);
    const node: TreeModelNodeInput = {
      id: nodeItem.id,
      label: nodeItem.label,
      isLoading: false,
      isSelected: false,
      description: "",
      item: nodeItem,
      isExpanded: false,
      numChildren: 0,
    };
    return node;
  };

  const getItemKey = (item: TreeNodeItem) => (item as PresentationTreeNodeItem).key;

  describe("modelSource", () => {
    it("returns modelSource", () => {
      using handler = createHandler();
      expect(handler.modelSource).to.be.eq(modelSource);
    });
  });

  describe("onSelectionModified", () => {
    it("adds nodes to selection", async () => {
      const node1: TreeModelNodeInput = createNode();
      const node2: TreeModelNodeInput = createNode(createTestECClassGroupingNodeKey);
      const selectionKeys = SelectionHelper.getKeysForSelection([getItemKey(node1.item), getItemKey(node2.item)]);

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node1, node2], 0);
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [node1.item, node2.item], deselectedNodeItems: [] }]);
      const event: TreeSelectionModificationEventArgs = {
        modifications: observable,
      };
      using handler = createHandler();
      handler.onSelectionModified(event);
      await waitForCompletion();

      expectCalledWithKeys(selectionManager.addToSelection, selectionKeys);
    });

    it("removes nodes from selection", async () => {
      const node1: TreeModelNodeInput = createNode();
      const node2: TreeModelNodeInput = createNode(createTestECClassGroupingNodeKey);
      const selectionKeys = SelectionHelper.getKeysForSelection([getItemKey(node1.item), getItemKey(node2.item)]);

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node1, node2], 0);
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [], deselectedNodeItems: [node1.item, node2.item] }]);
      const event: TreeSelectionModificationEventArgs = {
        modifications: observable,
      };

      using handler = createHandler();
      handler.onSelectionModified(event);
      await waitForCompletion();

      expectCalledWithKeys(selectionManager.removeFromSelection, selectionKeys);
    });

    it("applies unified selection after event is handled", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodes: TreeModelNodeInput[] = [createNode(() => nodeKey), createNode(() => nodeKey)];

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      selectionManager.addToSelection.mockImplementation((_imodel, _source, keys) => {
        selectionManager.getSelection.mockReturnValue(new KeySet(keys));
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [nodes[0].item], deselectedNodeItems: [] }]);
      const event: TreeSelectionModificationEventArgs = {
        modifications: observable,
      };
      using handler = createHandler();
      handler.onSelectionModified(event);
      await waitForCompletion();

      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
    });

    it("stops handling event when selection is cleared", () => {
      const modificationsSubject = new Subject<TreeSelectionChange>();

      const event: TreeSelectionModificationEventArgs = {
        modifications: modificationsSubject,
      };

      using handler = createHandler();
      handler.onSelectionModified(event);
      expect(modificationsSubject.observed).to.be.true;

      selectionChangeEvent.raiseEvent(
        {
          changeType: SelectionChangeType.Clear,
          imodel,
          keys: new KeySet(),
          level: 0,
          source: "TestSource",
          timestamp: new Date(),
        },
        {} as ISelectionProvider,
      );

      expect(modificationsSubject.observed).to.be.false;
    });
  });

  describe("onSelectionReplaced", () => {
    it("collects affected node items", async () => {
      const node1: TreeModelNodeInput = createNode();
      const node2: TreeModelNodeInput = createNode(createTestECClassGroupingNodeKey);
      const selectionKeys = SelectionHelper.getKeysForSelection([getItemKey(node1.item), getItemKey(node2.item)]);

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node1, node2], 0);
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [node1.item, node2.item] }]);
      const event: TreeSelectionReplacementEventArgs = {
        replacements: observable,
      };

      using handler = createHandler();
      handler.onSelectionReplaced(event);
      await waitForCompletion();

      expectCalledWithKeys(selectionManager.replaceSelection, selectionKeys);
    });

    it("adds loaded nodes to selection", async () => {
      const node1: TreeModelNodeInput = createNode();
      const node2: TreeModelNodeInput = createNode();

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node1, node2], 0);
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [node1.item] }, { selectedNodeItems: [node2.item] }]);
      const event: TreeSelectionReplacementEventArgs = {
        replacements: observable,
      };

      using handler = createHandler();
      handler.onSelectionReplaced(event);
      await waitForCompletion();

      expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));
      expectCalledWithKeys(selectionManager.addToSelection, SelectionHelper.getKeysForSelection([getItemKey(node2.item)]));
    });

    it("does not replace selection if event does not have nodes", async () => {
      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [] }]);
      const event: TreeSelectionReplacementEventArgs = {
        replacements: observable,
      };

      using handler = createHandler();
      handler.onSelectionReplaced(event);
      await waitForCompletion();

      expect(selectionManager.replaceSelection).not.toHaveBeenCalled();
    });

    it("cancels ongoing changes", async () => {
      const node1: TreeModelNodeInput = createNode();
      const node2: TreeModelNodeInput = createNode();
      const node3: TreeModelNodeInput = createNode();

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node1, node2, node3], 0);
      });

      const replacements = new Subject<{ selectedNodeItems: TreeNodeItem[] }>();
      const initialEvent: TreeSelectionReplacementEventArgs = { replacements };

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [node3.item] }]);
      const event: TreeSelectionReplacementEventArgs = {
        replacements: observable,
      };

      using handler = createHandler();
      handler.onSelectionReplaced(initialEvent);

      replacements.next({ selectedNodeItems: [node1.item] });
      handler.onSelectionReplaced(event);
      replacements.next({ selectedNodeItems: [node2.item] });
      await waitForCompletion();

      expect(selectionManager.addToSelection).not.toHaveBeenCalled();
      expect(selectionManager.replaceSelection).toHaveBeenCalledTimes(2);
      expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));
      expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node3.item)]));
    });

    it("applies unified selection after event is handled", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodes: TreeModelNodeInput[] = [createNode(() => nodeKey), createNode(() => nodeKey)];

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      selectionManager.replaceSelection.mockImplementation((_imodel, _source, keys) => {
        selectionManager.getSelection.mockReturnValue(new KeySet(keys));
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [nodes[0].item] }]);
      const event: TreeSelectionReplacementEventArgs = {
        replacements: observable,
      };

      using handler = createHandler();
      handler.onSelectionReplaced(event);
      await waitForCompletion();

      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
    });

    it("stops handling event when selection is cleared", () => {
      const replacementsSubject = new Subject<TreeSelectionChange>();

      const event: TreeSelectionReplacementEventArgs = {
        replacements: replacementsSubject,
      };

      using handler = createHandler();
      handler.onSelectionReplaced(event);
      expect(replacementsSubject.observed).to.be.true;

      selectionChangeEvent.raiseEvent(
        {
          changeType: SelectionChangeType.Clear,
          imodel,
          keys: new KeySet(),
          level: 0,
          source: "TestSource",
          timestamp: new Date(),
        },
        {} as ISelectionProvider,
      );

      expect(replacementsSubject.observed).to.be.false;
    });
  });

  describe("model change handling", () => {
    it("applies unified selection for added nodes", () => {
      const node = createNode();
      selectionManager.getSelection.mockReturnValue(new KeySet([getItemKey(node.item)]));

      using _handler = createHandler();
      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node], 0);
      });
      expect(modelSource.getModel().getNode(node.id)?.isSelected).to.be.true;
    });

    it("applies unified selection for modified nodes", () => {
      const node = createNode();
      selectionManager.getSelection.mockReturnValue(new KeySet([getItemKey(node.item)]));

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node], 0);
      });

      using _handler = createHandler();
      modelSource.modifyModel((model) => {
        model.getNode(node.id)!.isExpanded = true;
      });

      expect(modelSource.getModel().getNode(node.id)?.isSelected).to.be.true;
    });

    it("does not lookup selection when node is removed", () => {
      const nodes = [createNode(createTestECInstancesNodeKey, { id: "A" }), createNode(createTestECInstancesNodeKey, { id: "B" })];
      selectionManager.getSelection.mockReturnValue(new KeySet([getItemKey(nodes[0].item)]));

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      using _handler = createHandler();
      selectionManager.getSelection.mockClear();
      modelSource.modifyModel((model) => {
        model.removeChild(undefined, nodes[1].id);
      });

      expect(selectionManager.getSelection).not.toHaveBeenCalled();
    });
  });

  describe("unified selection handling", () => {
    const selectionProvider = {} as ISelectionProvider;

    function createSelectionEvent({ changeType, source }: { changeType: SelectionChangeType; source?: string }): SelectionChangeEventArgs {
      return {
        changeType,
        imodel,
        keys: new KeySet(),
        level: 0,
        source: source ?? "Test",
        timestamp: new Date(),
      };
    }

    beforeEach(() => {
      selectionManager.getSelection.mockReset();
    });

    it("selects nodes according unified selection", () => {
      const nodes: TreeModelNodeInput[] = [
        createNode(() => createTestECInstancesNodeKey({ instanceKeys: [{ id: "0x1", className: "Schema:Class" }] }), { id: "node_1" }),
        createNode(() => createTestECInstancesNodeKey({ instanceKeys: [{ id: "0x2", className: "Schema:Class" }] }), { id: "node_2" }),
        createNode(createTestECClassGroupingNodeKey, { id: "node_3" }),
      ];

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      // setup initial selection
      selectionManager.getSelection.mockReturnValue(new KeySet(SelectionHelper.getKeysForSelection([getItemKey(nodes[1].item)])));

      using _handler = createHandler();
      // verify nodes selected based on initial unified selection
      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
      expect(modelSource.getModel().getNode(nodes[2].id)?.isSelected).to.be.false;

      selectionManager.getSelection.mockReset();
      const selectionKeys = SelectionHelper.getKeysForSelection(nodes.map((n) => getItemKey(n.item)));
      selectionManager.getSelection.mockReturnValue(new KeySet(selectionKeys));
      selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Add }), selectionProvider);

      // verify nodes selected based on updated unified selection
      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
      expect(modelSource.getModel().getNode(nodes[2].id)?.isSelected).to.be.true;
    });

    it("deselects nodes according unified selection", () => {
      const nodes: TreeModelNodeInput[] = [
        createNode(() => createTestECInstancesNodeKey({ instanceKeys: [{ id: "0x1", className: "Schema:Class" }] }), { id: "node_1" }),
        createNode(createTestECClassGroupingNodeKey, { id: "node_2" }),
      ];

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      // setup initial selection
      selectionManager.getSelection.mockReturnValue(new KeySet(SelectionHelper.getKeysForSelection([getItemKey(nodes[0].item)])));

      using _handler = createHandler();
      // verify nodes selected based on initial unified selection
      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;

      selectionManager.getSelection.mockReset();
      selectionManager.getSelection.mockReturnValue(new KeySet());
      selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Add }), selectionProvider);

      // verify nodes selected based on updated unified selection
      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;
    });

    it("ignores selection changes on different imodel", () => {
      const nodes: TreeModelNodeInput[] = [
        createNode(() => createTestECInstancesNodeKey({ instanceKeys: [{ id: "0x1", className: "Schema:Class" }] }), { id: "node_1" }),
        createNode(createTestECClassGroupingNodeKey, { id: "node_2" }),
      ];

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      // setup initial selection
      selectionManager.getSelection.mockReturnValue(new KeySet());

      using _handler = createHandler();
      // verify nodes selected based on initial unified selection
      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;

      selectionManager.getSelection.mockClear();
      selectionChangeEvent.raiseEvent({ ...createSelectionEvent({ changeType: SelectionChangeType.Add }), imodel: {} as IModelConnection }, selectionProvider);
      expect(selectionManager.getSelection).not.toHaveBeenCalled();

      // verify selection change event was ignored
      expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
      expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;
    });

    it("cancels ongoing changes when unified selection changes", async () => {
      const node1: TreeModelNodeInput = createNode();
      const node2: TreeModelNodeInput = createNode();

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node1, node2], 0);
      });

      const replacements = new Subject<{ selectedNodeItems: TreeNodeItem[] }>();
      const event: TreeSelectionReplacementEventArgs = { replacements };

      // setup initial selection
      selectionManager.getSelection.mockReturnValue(new KeySet());

      using handler = createHandler();
      handler.onSelectionReplaced(event);

      replacements.next({ selectedNodeItems: [node1.item] });
      expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));

      selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Replace, source: "Unified_Selection" }), selectionProvider);

      replacements.next({ selectedNodeItems: [node2.item] });
      expect(selectionManager.addToSelection).not.toHaveBeenCalled();
    });

    it("does not cancel ongoing changes when change caused by handler", async () => {
      const node1: TreeModelNodeInput = createNode();
      const node2: TreeModelNodeInput = createNode();

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node1, node2], 0);
      });

      const replacements = new Subject<{ selectedNodeItems: TreeNodeItem[] }>();
      const event: TreeSelectionReplacementEventArgs = { replacements };

      // setup initial selection
      selectionManager.getSelection.mockReturnValue(new KeySet());

      using handler = createHandler();
      handler.onSelectionReplaced(event);

      replacements.next({ selectedNodeItems: [node1.item] });
      expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));

      selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Replace, source: "Test_Handler" }), selectionProvider);

      replacements.next({ selectedNodeItems: [node2.item] });
      expectCalledWithKeys(selectionManager.addToSelection, SelectionHelper.getKeysForSelection([getItemKey(node2.item)]));
    });
  });
});

describe("useUnifiedSelectionTreeEventHandler", () => {
  const modelSource = new TreeModelSource();
  const dataProvider = {} as IPresentationTreeDataProvider;

  const nodeLoader = {
    modelSource,
    dataProvider,
  } as AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;

  beforeAll(async () => {
    await UiComponents.initialize(new EmptyLocalization());
  });

  afterAll(() => {
    UiComponents.terminate();
  });

  beforeEach(() => {
    const selectionManager = createMocked(SelectionManager);
    Object.assign(selectionManager, { selectionChange: new SelectionChangeEvent() });
    vi.spyOn(Presentation, "selection", "get").mockReturnValue(selectionManager);
  });

  afterEach(() => {});

  it("creates and disposes UnifiedSelectionTreeEventHandler", () => {
    configure({ reactStrictMode: false });
    const { result, unmount } = renderHook((props: UnifiedSelectionTreeEventHandlerParams) => useUnifiedSelectionTreeEventHandler(props), {
      initialProps: { nodeLoader },
    });
    expect(result.current).to.not.be.undefined;
    expect(nodeLoader.modelSource.onModelChanged.numberOfListeners).to.be.eq(1);
    unmount();
    expect(nodeLoader.modelSource.onModelChanged.numberOfListeners).to.be.eq(0);
  });
});
