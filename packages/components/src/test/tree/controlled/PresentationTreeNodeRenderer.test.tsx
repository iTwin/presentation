/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord } from "@itwin/appui-abstract";
import { PropertyFilterRuleOperator, TreeActions, UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { PresentationInstanceFilterInfo } from "../../../presentation-components/instance-filter-builder/Types";
import { PresentationTreeNodeRenderer } from "../../../presentation-components/tree/controlled/PresentationTreeNodeRenderer";
import { PresentationInfoTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem";
import { createTestPropertyInfo } from "../../_helpers/Common";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../../_helpers/Content";
import { createTreeModelNode, createTreeNodeItem } from "./Helpers";

function createFilterInfo(propName: string = "prop"): PresentationInstanceFilterInfo {
  const property = createTestPropertyInfo({ name: propName });
  const field = createTestPropertiesContentField({ properties: [{ property }] });
  return {
    filter: {
      field,
      operator: PropertyFilterRuleOperator.IsNull,
    },
    usedClasses: [],
  };
}

describe("PresentationTreeNodeRenderer", () => {
  const treeActionsMock = moq.Mock.ofType<TreeActions>();

  before(() => {
    HTMLElement.prototype.scrollIntoView = () => {};
  });

  after(() => {
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    await UiComponents.initialize(localization);
    await Presentation.initialize();
  });

  afterEach(() => {
    UiComponents.terminate();
    Presentation.terminate();
    treeActionsMock.reset();
    sinon.restore();
  });

  it("renders default tree node", async () => {
    const testLabel = "testLabel";
    const node = createTreeModelNode(undefined, { id: "node_id", label: PropertyRecord.fromString(testLabel) });

    const { getByText, container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    await waitFor(() => getByText(testLabel));
    expect(container.querySelector(".presentation-components-node")).to.be.null;
  });

  it("renders info tree node", () => {
    const message = "Some info";
    const item: PresentationInfoTreeNodeItem = {
      id: "info_node_id",
      label: PropertyRecord.fromString("Info Node"),
      children: undefined,
      isSelectionDisabled: true,
      message,
    };
    const node = createTreeModelNode(undefined, item);

    const { getByText } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    getByText(message);
  });

  it("renders presentation tree node", async () => {
    const testLabel = "testLabel";
    const item = createTreeNodeItem({ label: PropertyRecord.fromString(testLabel) });
    const node = createTreeModelNode(undefined, item);

    const { getByText, container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    await waitFor(() => getByText(testLabel));
    expect(container.querySelector(".presentation-components-node")).to.not.be.null;
  });

  it("renders node with filter button", () => {
    const nodeItem = createTreeNodeItem({ filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    const buttons = container.querySelectorAll(".presentation-components-node-action-buttons button");
    expect(buttons.length).to.eq(1);
  });

  it("renders filtered node with filter and clear filter buttons", () => {
    const nodeItem = createTreeNodeItem({
      filtering: {
        descriptor: createTestContentDescriptor({ fields: [] }),
        ancestorFilters: [],
        active: createFilterInfo(),
      },
    });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    const buttons = container.querySelectorAll(".presentation-components-node-action-buttons button");
    expect(buttons.length).to.eq(2);
  });

  it("renders without buttons when node is not filterable", () => {
    const nodeItem = createTreeNodeItem();
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={() => {}} onClearFilterClick={() => {}} />,
    );

    const buttons = container.querySelectorAll(".presentation-components-node-action-buttons button");
    expect(buttons).to.be.empty;
  });

  it("invokes 'onFilterClick' when filter button is clicked", () => {
    const spy = sinon.spy();
    const nodeItem = createTreeNodeItem({ filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={spy} onClearFilterClick={() => {}} />,
    );

    const buttons = container.querySelectorAll(".presentation-components-node-action-buttons button");
    expect(buttons.length).to.eq(1);
    fireEvent.click(buttons[0]);
    expect(spy).be.calledOnce;
  });

  it("invokes 'onClearFilterClick' when clear button is clicked", () => {
    const spy = sinon.spy();
    const nodeItem = createTreeNodeItem({
      filtering: {
        descriptor: createTestContentDescriptor({ fields: [] }),
        ancestorFilters: [],
        active: createFilterInfo(),
      },
    });
    const node = createTreeModelNode(undefined, nodeItem);

    const { container } = render(
      <PresentationTreeNodeRenderer treeActions={treeActionsMock.object} node={node} onFilterClick={() => {}} onClearFilterClick={spy} />,
    );

    const buttons = container.querySelectorAll(".presentation-components-node-action-buttons button");
    expect(buttons.length).to.eq(2);
    fireEvent.click(buttons[0]);
    expect(spy).be.calledOnce;
  });
});
