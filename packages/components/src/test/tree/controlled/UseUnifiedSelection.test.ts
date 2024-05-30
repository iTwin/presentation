/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ResolvablePromise } from "presentation-test-utilities";
import { Subject } from "rxjs";
import { from } from "rxjs/internal/observable/from";
import { finalize } from "rxjs/internal/operators/finalize";
import { ObservableInput } from "rxjs/internal/types";
import sinon from "sinon";
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
import { using } from "@itwin/core-bentley";
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
} from "../../../presentation-components/tree/controlled/UseUnifiedSelection";
import { IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider";
import { PresentationTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem";
import { createTestECClassGroupingNodeKey, createTestECInstancesNodeKey } from "../../_helpers/Hierarchy";
import { createTestTreeNodeItem } from "../../_helpers/UiComponents";
import { renderHook } from "../../TestUtils";

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

  let selectionManager: sinon.SinonStubbedInstance<SelectionManager>;
  const selectionChangeEvent = new SelectionChangeEvent();

  before(async () => {
    await UiComponents.initialize(new EmptyLocalization());
  });

  after(() => {
    UiComponents.terminate();
  });

  beforeEach(() => {
    modelSource.modifyModel((model) => {
      model.clearChildren(undefined);
    });

    selectionManager = sinon.createStubInstance(SelectionManager);
    selectionManager.getSelection.returns(new KeySet());
    Object.assign(selectionManager, { selectionChange: selectionChangeEvent });

    sinon.stub(Presentation, "selection").get(() => selectionManager);
  });

  function createHandler() {
    return new UnifiedSelectionTreeEventHandler({
      nodeLoader,
      name: "Test_Handler",
    });
  }

  type SelectionAction = SelectionManager["addToSelection"] | SelectionManager["replaceSelection"] | SelectionManager["removeFromSelection"];
  function expectCalledWithKeys(callback: SelectionAction, keys: Key[]) {
    expect(callback).to.be.calledWith(
      sinon.match(() => true),
      sinon.match(() => true),
      sinon.match((actualKeys: Key[]) => {
        const lhs = new KeySet(actualKeys);
        const rhs = new KeySet(keys);
        return lhs.size === rhs.size && lhs.hasAll(rhs);
      }),
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
      using(createHandler(), (handler) => {
        expect(handler.modelSource).to.be.eq(modelSource);
      });
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
      await using(createHandler(), async (handler) => {
        handler.onSelectionModified(event);
        await waitForCompletion();

        expectCalledWithKeys(selectionManager.addToSelection, selectionKeys);
      });
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

      await using(createHandler(), async (handler) => {
        handler.onSelectionModified(event);
        await waitForCompletion();

        expectCalledWithKeys(selectionManager.removeFromSelection, selectionKeys);
      });
    });

    it("applies unified selection after event is handled", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodes: TreeModelNodeInput[] = [createNode(() => nodeKey), createNode(() => nodeKey)];

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      selectionManager.addToSelection.callsFake((_imodel, _source, keys) => {
        selectionManager.getSelection.returns(new KeySet(keys));
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [nodes[0].item], deselectedNodeItems: [] }]);
      const event: TreeSelectionModificationEventArgs = {
        modifications: observable,
      };
      await using(createHandler(), async (handler) => {
        handler.onSelectionModified(event);
        await waitForCompletion();

        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
      });
    });

    it("stops handling event when selection is cleared", () => {
      const modificationsSubject = new Subject<TreeSelectionChange>();

      const event: TreeSelectionModificationEventArgs = {
        modifications: modificationsSubject,
      };

      using(createHandler(), (handler) => {
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

      await using(createHandler(), async (handler) => {
        handler.onSelectionReplaced(event);
        await waitForCompletion();

        expectCalledWithKeys(selectionManager.replaceSelection, selectionKeys);
      });
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

      await using(createHandler(), async (handler) => {
        handler.onSelectionReplaced(event);
        await waitForCompletion();

        expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));
        expectCalledWithKeys(selectionManager.addToSelection, SelectionHelper.getKeysForSelection([getItemKey(node2.item)]));
      });
    });

    it("does not replace selection if event does not have nodes", async () => {
      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [] }]);
      const event: TreeSelectionReplacementEventArgs = {
        replacements: observable,
      };

      await using(createHandler(), async (handler) => {
        handler.onSelectionReplaced(event);
        await waitForCompletion();

        expect(selectionManager.replaceSelection).to.not.be.called;
      });
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

      await using(createHandler(), async (handler) => {
        handler.onSelectionReplaced(initialEvent);

        replacements.next({ selectedNodeItems: [node1.item] });
        handler.onSelectionReplaced(event);
        replacements.next({ selectedNodeItems: [node2.item] });
        await waitForCompletion();

        expect(selectionManager.addToSelection).to.not.be.called;
        expect(selectionManager.replaceSelection).to.be.calledTwice;
        expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));
        expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node3.item)]));
      });
    });

    it("applies unified selection after event is handled", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodes: TreeModelNodeInput[] = [createNode(() => nodeKey), createNode(() => nodeKey)];

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      selectionManager.replaceSelection.callsFake((_imodel, _source, keys) => {
        selectionManager.getSelection.returns(new KeySet(keys));
      });

      const { observable, waitForCompletion } = awaitableObservable([{ selectedNodeItems: [nodes[0].item] }]);
      const event: TreeSelectionReplacementEventArgs = {
        replacements: observable,
      };

      await using(createHandler(), async (handler) => {
        handler.onSelectionReplaced(event);
        await waitForCompletion();

        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
      });
    });

    it("stops handling event when selection is cleared", () => {
      const replacementsSubject = new Subject<TreeSelectionChange>();

      const event: TreeSelectionReplacementEventArgs = {
        replacements: replacementsSubject,
      };

      using(createHandler(), (handler) => {
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
  });

  describe("model change handling", () => {
    it("applies unified selection for added nodes", () => {
      const node = createNode();
      selectionManager.getSelection.returns(new KeySet([getItemKey(node.item)]));

      using(createHandler(), (_) => {
        modelSource.modifyModel((model) => {
          model.setChildren(undefined, [node], 0);
        });
        expect(modelSource.getModel().getNode(node.id)?.isSelected).to.be.true;
      });
    });

    it("applies unified selection for modified nodes", () => {
      const node = createNode();
      selectionManager.getSelection.returns(new KeySet([getItemKey(node.item)]));

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, [node], 0);
      });

      using(createHandler(), (_) => {
        modelSource.modifyModel((model) => {
          model.getNode(node.id)!.isExpanded = true;
        });

        expect(modelSource.getModel().getNode(node.id)?.isSelected).to.be.true;
      });
    });

    it("does not lookup selection when node is removed", () => {
      const nodes = [createNode(createTestECInstancesNodeKey, { id: "A" }), createNode(createTestECInstancesNodeKey, { id: "B" })];
      selectionManager.getSelection.returns(new KeySet([getItemKey(nodes[0].item)]));

      modelSource.modifyModel((model) => {
        model.setChildren(undefined, nodes, 0);
      });

      using(createHandler(), (_) => {
        selectionManager.getSelection.resetHistory();
        modelSource.modifyModel((model) => {
          model.removeChild(undefined, nodes[1].id);
        });

        expect(selectionManager.getSelection).to.not.be.called;
      });
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
      selectionManager.getSelection.reset();
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
      selectionManager.getSelection.returns(new KeySet(SelectionHelper.getKeysForSelection([getItemKey(nodes[1].item)])));

      using(createHandler(), (_) => {
        // verify nodes selected based on initial unified selection
        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
        expect(modelSource.getModel().getNode(nodes[2].id)?.isSelected).to.be.false;

        selectionManager.getSelection.reset();
        const selectionKeys = SelectionHelper.getKeysForSelection(nodes.map((n) => getItemKey(n.item)));
        selectionManager.getSelection.returns(new KeySet(selectionKeys));
        selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Add }), selectionProvider);

        // verify nodes selected based on updated unified selection
        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.true;
        expect(modelSource.getModel().getNode(nodes[2].id)?.isSelected).to.be.true;
      });
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
      selectionManager.getSelection.returns(new KeySet(SelectionHelper.getKeysForSelection([getItemKey(nodes[0].item)])));

      using(createHandler(), (_) => {
        // verify nodes selected based on initial unified selection
        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.true;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;

        selectionManager.getSelection.reset();
        selectionManager.getSelection.returns(new KeySet());
        selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Add }), selectionProvider);

        // verify nodes selected based on updated unified selection
        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;
      });
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
      selectionManager.getSelection.returns(new KeySet());

      using(createHandler(), (_) => {
        // verify nodes selected based on initial unified selection
        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;

        selectionManager.getSelection.resetHistory();
        selectionChangeEvent.raiseEvent(
          { ...createSelectionEvent({ changeType: SelectionChangeType.Add }), imodel: {} as IModelConnection },
          selectionProvider,
        );
        expect(selectionManager.getSelection).to.not.be.called;

        // verify selection change event was ignored
        expect(modelSource.getModel().getNode(nodes[0].id)?.isSelected).to.be.false;
        expect(modelSource.getModel().getNode(nodes[1].id)?.isSelected).to.be.false;
      });
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
      selectionManager.getSelection.returns(new KeySet());

      await using(createHandler(), async (handler) => {
        handler.onSelectionReplaced(event);

        replacements.next({ selectedNodeItems: [node1.item] });
        expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));

        selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Replace, source: "Unified_Selection" }), selectionProvider);

        replacements.next({ selectedNodeItems: [node2.item] });
        expect(selectionManager.addToSelection).to.not.be.called;
      });
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
      selectionManager.getSelection.returns(new KeySet());

      await using(createHandler(), async (handler) => {
        handler.onSelectionReplaced(event);

        replacements.next({ selectedNodeItems: [node1.item] });
        expectCalledWithKeys(selectionManager.replaceSelection, SelectionHelper.getKeysForSelection([getItemKey(node1.item)]));

        selectionChangeEvent.raiseEvent(createSelectionEvent({ changeType: SelectionChangeType.Replace, source: "Test_Handler" }), selectionProvider);

        replacements.next({ selectedNodeItems: [node2.item] });
        expectCalledWithKeys(selectionManager.addToSelection, SelectionHelper.getKeysForSelection([getItemKey(node2.item)]));
      });
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

  before(async () => {
    await UiComponents.initialize(new EmptyLocalization());
  });

  after(() => {
    UiComponents.terminate();
  });

  beforeEach(() => {
    const selectionManager = sinon.createStubInstance(SelectionManager);
    Object.assign(selectionManager, { selectionChange: new SelectionChangeEvent() });
    sinon.stub(Presentation, "selection").get(() => selectionManager);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("creates and disposes UnifiedSelectionTreeEventHandler", () => {
    // eslint-disable-next-line deprecation/deprecation
    const { result, unmount } = renderHook((props: UnifiedSelectionTreeEventHandlerParams) => useUnifiedSelectionTreeEventHandler(props), {
      initialProps: { nodeLoader },
      disableStrictMode: true,
    });

    expect(result.current).to.not.be.undefined;
    const spy = sinon.spy(result.current, "dispose");
    unmount();
    expect(spy).to.be.called;
  });
});
