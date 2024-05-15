/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { UserEvent } from "@testing-library/user-event";
import { PresentationHierarchyNode, PresentationInfoNode, PresentationTreeNode } from "../presentation-hierarchies-react/Types";
import { SelectionChangeType, SelectionMode, useSelectionHandler } from "../presentation-hierarchies-react/UseSelectionHandler";
import { render } from "./TestUtils";

interface TestComponentProps {
  rootNodes: Array<PresentationTreeNode> | undefined;
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  selectionMode: SelectionMode;
  isSelected: boolean;
}

function TestComponent({ rootNodes, selectNodes, selectionMode, isSelected }: TestComponentProps) {
  const { onNodeKeyDown, onNodeClick } = useSelectionHandler({ rootNodes, selectNodes, selectionMode });
  const invalidNode = { id: "invalid" } as PresentationHierarchyNode;
  const nodes = rootNodes ? [...rootNodes, invalidNode] : [invalidNode];
  return (
    <>
      {nodes?.map((node) => {
        return (
          <div
            role="button"
            key={node.id}
            tabIndex={0}
            onClick={(e) => onNodeClick(node.id, isSelected, e)}
            onKeyDown={(e) => onNodeKeyDown(node.id, isSelected, e)}
          >
            {node.id}
          </div>
        );
      })}
    </>
  );
}

describe("useSelectionHandler", () => {
  const selectNodesStub = sinon.stub<[Array<string>, SelectionChangeType], void>();

  const createHierarchyNode = (id: string, children: Array<PresentationTreeNode> = [], isExpanded: boolean = true) => {
    return { id, isExpanded, children } as PresentationHierarchyNode;
  };

  const createInfoNode = (id: string) => {
    return { id, message: "message" } as PresentationInfoNode;
  };

  const createProps = (rootNodes: Array<PresentationTreeNode> | undefined, selectionMode: SelectionMode, isSelected: boolean) => {
    return { rootNodes, selectNodes: selectNodesStub, selectionMode, isSelected };
  };

  afterEach(() => {
    selectNodesStub.reset();
  });

  const selectionTests = (clickNode: (user: UserEvent, node: HTMLElement) => Promise<void>) => {
    describe("`none` selection mode", () => {
      it("does nothing when node is clicked", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], "none", true)} />);

        const node = getByText("node");
        node.focus();

        await clickNode(user, node);

        expect(selectNodesStub).to.not.be.called;
      });
    });

    describe("`single` selection mode", () => {
      const selectionMode = "single";

      it("replaces selection when node is clicked", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, true)} />);

        const node = getByText("node");
        node.focus();

        await clickNode(user, node);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });

      it("replaces selection when clicking using `ctrl` and `shift`", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, true)} />);

        const node = getByText("node");
        node.focus();

        await user.keyboard(`{Ctrl>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Ctrl}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
        selectNodesStub.resetHistory();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });

      it("removes from selection when a selected node is clicked", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, false)} />);

        const node = getByText("node");
        node.focus();

        await clickNode(user, node);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "remove");
      });
    });

    describe("`multiple` selection mode", () => {
      const selectionMode = "multiple";

      it("adds to selection when node is clicked", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, true)} />);

        const node = getByText("node");
        node.focus();

        await clickNode(user, node);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
      });

      it("adds to selection when clicking using `ctrl` and `shift`", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, true)} />);

        const node = getByText("node");
        node.focus();

        await user.keyboard(`{Ctrl>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Ctrl}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
        selectNodesStub.resetHistory();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
      });

      it("removes from selection when a selected node is clicked", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, false)} />);

        const node = getByText("node");
        node.focus();

        await clickNode(user, node);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "remove");
      });
    });

    describe("`extended` selection mode", () => {
      const selectionMode = "extended";

      it("replaces selection when node is clicked", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, true)} />);

        const node = getByText("node");
        node.focus();

        await clickNode(user, node);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "replace");
      });

      it("adds to selection when node is clicked and `ctrl` used", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, true)} />);

        const node = getByText("node");
        node.focus();

        await user.keyboard(`{Control>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Control}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "add");
      });

      it("removes from selection when a selected node is clicked and `ctrl` used", async () => {
        const rootNode = createHierarchyNode("node");
        const { user, getByText } = render(<TestComponent {...createProps([rootNode], selectionMode, false)} />);

        const node = getByText("node");
        node.focus();

        await user.keyboard(`{Control>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Control}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node"], "remove");
      });

      it("replaces selection with node range when node clicked and `shift` used", async () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3")];
        const { user, getByText } = render(<TestComponent {...createProps(nodes, selectionMode, true)} />);

        const node1 = getByText("node-1");
        node1.focus();
        await clickNode(user, node1);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodesStub.reset();

        const node3 = getByText("node-3");
        node3.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node3);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });

      it("starts range selection from first node when previous selection does not exist", async () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3")];
        const { user, getByText } = render(<TestComponent {...createProps(nodes, selectionMode, true)} />);

        const node = getByText("node-3");
        node.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });

      it("selects range when second selected node has lower index", async () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3")];
        const { user, getByText } = render(<TestComponent {...createProps(nodes, selectionMode, true)} />);

        const node3 = getByText("node-3");
        node3.focus();
        await clickNode(user, node3);

        expect(selectNodesStub).to.be.calledOnceWith(["node-3"], "replace");
        selectNodesStub.reset();

        const node1 = getByText("node-1");
        node1.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node1);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2", "node-3"], "replace");
      });

      it("skips info nodes when selecting range", async () => {
        const nodes = [createHierarchyNode("node-1"), createInfoNode("node-2"), createHierarchyNode("node-3")];
        const { user, getByText } = render(<TestComponent {...createProps(nodes, selectionMode, true)} />);

        const node1 = getByText("node-1");
        node1.focus();
        await clickNode(user, node1);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodesStub.reset();

        const node3 = getByText("node-3");
        node3.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node3);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-3"], "replace");
      });

      it("selects visible children of different depth when selecting range", async () => {
        const innerChild = createHierarchyNode("child-inner");
        const outerChild = createHierarchyNode("child-outer", [innerChild]);
        const nodes = [createHierarchyNode("node-1", [outerChild]), createHierarchyNode("node-2")];
        const { user, getByText } = render(<TestComponent {...createProps(nodes, selectionMode, true)} />);

        const node1 = getByText("node-1");
        node1.focus();
        await clickNode(user, node1);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodesStub.reset();

        const node2 = getByText("node-2");
        node2.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node2);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "child-outer", "child-inner", "node-2"], "replace");
      });

      it("skips non visible children when selecting range", async () => {
        const innerChild = createHierarchyNode("child-inner");
        const outerChild = createHierarchyNode("child-outer", [innerChild]);
        const nodes = [createHierarchyNode("node-1", [outerChild], false), createHierarchyNode("node-2")];
        const { user, getByText } = render(<TestComponent {...createProps(nodes, selectionMode, true)} />);

        const node1 = getByText("node-1");
        node1.focus();
        await clickNode(user, node1);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1"], "replace");
        selectNodesStub.reset();

        const node2 = getByText("node-2");
        node2.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node2);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2"], "replace");
      });

      it("subsequent range selections use the same starting point", async () => {
        const nodes = [createHierarchyNode("node-1"), createHierarchyNode("node-2"), createHierarchyNode("node-3"), createHierarchyNode("node-4")];
        const { user, getByText } = render(<TestComponent {...createProps(nodes, selectionMode, true)} />);

        let node = getByText("node-2");
        node.focus();
        await clickNode(user, node);

        expect(selectNodesStub).to.be.calledOnceWith(["node-2"], "replace");
        selectNodesStub.reset();

        node = getByText("node-1");
        node.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-1", "node-2"], "replace");
        selectNodesStub.reset();

        node = getByText("node-3");
        node.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-2", "node-3"], "replace");
        selectNodesStub.reset();

        node = getByText("node-4");
        node.focus();

        await user.keyboard(`{Control>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Control}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-4"], "add");
        selectNodesStub.reset();

        node = getByText("node-3");
        node.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.be.calledOnceWith(["node-3", "node-4"], "replace");
      });

      it("does nothing when invalid node clicked and `shift` used", async () => {
        const { user, getByText } = render(<TestComponent {...createProps(undefined, selectionMode, true)} />);

        const node = getByText("invalid");
        node.focus();

        await user.keyboard(`{Shift>}`);
        await clickNode(user, node);
        await user.keyboard(`{/Shift}`);

        expect(selectNodesStub).to.not.be.called;
      });
    });
  };

  describe("keyboard input", () => {
    it("only reacts to ` `, `Spacebar` and `Enter`", async () => {
      const rootNode = createHierarchyNode("node");
      const { user, getByText } = render(<TestComponent {...createProps([rootNode], "single", true)} />);

      const node = getByText("node");
      node.focus();

      await user.keyboard("{ }");
      await user.keyboard("{Spacebar}");
      await user.keyboard("{Enter}");

      expect(selectNodesStub).to.be.calledThrice;
      selectNodesStub.reset();

      await user.keyboard("{Shift}");
      await user.keyboard("{Control}");

      expect(selectNodesStub).to.not.be.called;
    });

    selectionTests(async (user, _) => {
      return user.keyboard("{Enter}");
    });
  });

  describe("mouse input", () => {
    selectionTests(async (user, node) => {
      return user.click(node);
    });
  });
});
