/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyRecord } from "@itwin/appui-abstract";
import { TreeActions } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { PresentationInstanceFilterInfo } from "../../../presentation-components/instance-filter-builder/PresentationFilterBuilder.js";
import { PresentationTreeNodeRenderer } from "../../../presentation-components/tree/controlled/PresentationTreeNodeRenderer.js";
import { InfoTreeNodeItemType, PresentationInfoTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem.js";
import { createTestPropertyInfo } from "../../_helpers/Common.js";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../../_helpers/Content.js";
import { fireEvent, render, waitFor } from "../../TestUtils.js";
import { createInfoTreeNodeItem, createTreeModelNode, createTreeNodeItem } from "./Helpers.js";

function createFilterInfo(propName: string = "prop"): PresentationInstanceFilterInfo {
  const property = createTestPropertyInfo({ name: propName });
  const field = createTestPropertiesContentField({ properties: [{ property }] });
  return {
    filter: {
      field,
      operator: "is-null",
    },
    usedClasses: [],
  };
}

describe("PresentationTreeNodeRenderer", () => {
  const treeActions = {} as TreeActions;

  beforeEach(async () => {
    const localization = new EmptyLocalization();
    vi.spyOn(IModelApp, "initialized", "get").mockReturnValue(true);
    vi.spyOn(IModelApp, "localization", "get").mockReturnValue(localization);
    vi.spyOn(Presentation, "localization", "get").mockReturnValue(localization);
  });

  it("renders default tree node", async () => {
    const testLabel = "testLabel";
    const node = createTreeModelNode(undefined, { id: "node_id", label: PropertyRecord.fromString(testLabel) });

    const { getByText, container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    await waitFor(() => {
      getByText(testLabel);
      expect(container.querySelector(".presentation-components-node")).to.be.null;
    });
  });

  it("renders info tree node", async () => {
    const message = "Some info";
    const item: PresentationInfoTreeNodeItem = {
      id: "info_node_id",
      label: PropertyRecord.fromString("Info Node"),
      children: undefined,
      isSelectionDisabled: true,
      type: InfoTreeNodeItemType.Unset,
      message,
    };
    const node = createTreeModelNode(undefined, item);

    const { getByText } = render(<PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />);

    await waitFor(() => {
      getByText(message);
    });
  });

  it("renders presentation tree node", async () => {
    const testLabel = "testLabel";
    const item = createTreeNodeItem({ label: PropertyRecord.fromString(testLabel) });
    const node = createTreeModelNode(undefined, item);

    const { getByText, container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    await waitFor(() => getByText(testLabel));
    expect(container.querySelector(".presentation-components-node")).to.not.be.null;
  });

  it("renders node with filter button", async () => {
    const nodeItem = createTreeNodeItem({ filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(<PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />);

    const buttons = await waitFor(() => container.querySelectorAll(".presentation-components-node-action-buttons button"));
    expect(buttons.length).to.eq(1);
  });

  it("renders filtered node with filter and clear filter buttons", async () => {
    const nodeItem = createTreeNodeItem({
      filtering: {
        descriptor: createTestContentDescriptor({ fields: [] }),
        ancestorFilters: [],
        active: createFilterInfo(),
      },
    });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(<PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />);

    const buttons = await waitFor(() => container.querySelectorAll(".presentation-components-node-action-buttons button"));
    expect(buttons.length).to.eq(2);
  });

  it("renders without buttons when node is not filterable", async () => {
    const nodeItem = createTreeNodeItem();
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(<PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />);

    const buttons = await waitFor(() => container.querySelectorAll(".presentation-components-node-action-buttons button"));
    expect(buttons).to.be.empty;
  });

  it("renders with option to provide additional filtering, when node is of type 'ResultSetTooLarge'", async () => {
    const nodeItem = createInfoTreeNodeItem({ type: InfoTreeNodeItemType.ResultSetTooLarge });
    const node = createTreeModelNode(undefined, nodeItem);

    const { queryByText } = render(
      <PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    const infoNode = await waitFor(() => queryByText("tree.additional-filtering", { exact: false }));
    expect(infoNode).to.not.be.null;
  });

  it("calls 'onFilterClick' when additional filtering message is clicked with correct parent", async () => {
    const nodeInfoItem = createInfoTreeNodeItem({ type: InfoTreeNodeItemType.ResultSetTooLarge, parentId: "testId" });
    const node = createTreeModelNode(undefined, nodeInfoItem);
    const filterClickSpy = vi.fn();

    const { getByText } = render(
      <PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={filterClickSpy} onClearFilterClick={() => {}} />,
    );

    const infoNode = await waitFor(() => getByText("tree.additional-filtering", { exact: false }));

    fireEvent.click(infoNode);
    expect(filterClickSpy).toHaveBeenCalled();
  });

  it("does not call 'onFilterClick' when additional filtering message is clicked with empty parent", async () => {
    const nodeInfoItem = createInfoTreeNodeItem({ type: InfoTreeNodeItemType.ResultSetTooLarge });
    const node = createTreeModelNode(undefined, nodeInfoItem);

    const filterClickSpy = vi.fn();

    const { getByText } = render(
      <PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={filterClickSpy} onClearFilterClick={() => {}} />,
    );

    const infoNode = await waitFor(() => getByText("tree.additional-filtering", { exact: false }));

    fireEvent.click(infoNode);
    expect(filterClickSpy).not.toHaveBeenCalled();
  });

  it("invokes 'onFilterClick' when filter button is clicked", async () => {
    const spy = vi.fn();
    const nodeItem = createTreeNodeItem({ filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(<PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={spy} onClearFilterClick={() => {}} />);

    const buttons = await waitFor(() => container.querySelectorAll(".presentation-components-node-action-buttons button"));
    expect(buttons.length).to.eq(1);
    fireEvent.click(buttons[0]);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("invokes 'onClearFilterClick' when clear button is clicked", async () => {
    const spy = vi.fn();
    const nodeItem = createTreeNodeItem({
      filtering: {
        descriptor: createTestContentDescriptor({ fields: [] }),
        ancestorFilters: [],
        active: createFilterInfo(),
      },
    });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(<PresentationTreeNodeRenderer treeActions={treeActions} node={node} onFilterClick={() => {}} onClearFilterClick={spy} />);

    const buttons = await waitFor(() => container.querySelectorAll(".presentation-components-node-action-buttons button"));
    expect(buttons.length).to.eq(2);
    fireEvent.click(buttons[0]);
    expect(spy).toHaveBeenCalledOnce();
  });
});
