/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { EMPTY, Subject } from "rxjs";
import sinon from "sinon";
import { StandardTypeNames } from "@itwin/appui-abstract";
import {
  computeVisibleNodes,
  ITreeNodeLoader,
  MutableTreeModel,
  PropertyFilterRuleOperator,
  TreeActions,
  TreeModelSource,
  TreeNodeLoadResult,
  UiComponents,
} from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { PropertyValueFormat } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import { PresentationInstanceFilterInfo } from "../../../presentation-components/instance-filter-builder/Types";
import { PresentationTreeRenderer } from "../../../presentation-components/tree/controlled/PresentationTreeRenderer";
import { IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider";
import { PresentationTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem";
import { createTestPropertyInfo, render, stubDOMMatrix, stubRaf } from "../../_helpers/Common";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../../_helpers/Content";
import { createTreeModelNodeInput } from "./Helpers";

describe("PresentationTreeRenderer", () => {
  stubRaf();
  stubDOMMatrix();

  const baseTreeProps = {
    imodel: {} as IModelConnection,
    treeActions: {} as TreeActions,
    nodeLoader: {
      loadNode: sinon.stub<Parameters<ITreeNodeLoader["loadNode"]>, ReturnType<ITreeNodeLoader["loadNode"]>>(),
    },
    dataProvider: {} as IPresentationTreeDataProvider,
    height: 100,
    width: 100,
    nodeHeight: () => 20,
  };

  const presentationManager = {
    getNodesCount: sinon.stub<Parameters<PresentationManager["getNodesCount"]>, ReturnType<PresentationManager["getNodesCount"]>>(),
  };

  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(Presentation, "localization").get(() => localization);

    // need to initialize for immer patches to be enabled.
    await UiComponents.initialize(localization);
    HTMLElement.prototype.scrollIntoView = () => {};

    baseTreeProps.nodeLoader.loadNode.returns(EMPTY);
    presentationManager.getNodesCount.resolves(15);
  });

  afterEach(() => {
    baseTreeProps.nodeLoader.loadNode.reset();
    presentationManager.getNodesCount.reset();
    sinon.restore();
    UiComponents.terminate();
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  function setupTreeModel(setup: (model: MutableTreeModel) => void) {
    const model = new MutableTreeModel();
    setup(model);
    const modelSource = new TreeModelSource(model);
    const visibleNodes = computeVisibleNodes(model);
    return { modelSource, visibleNodes };
  }

  it("renders default tree node", async () => {
    const { visibleNodes, modelSource } = setupTreeModel((model) => {
      const input = createTreeModelNodeInput({ id: "A" });
      // use non presentation tree node item
      (input as any).item = { id: "A", label: input.label };
      model.setChildren(undefined, [input], 0);
    });

    const { queryByText, container } = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} modelSource={modelSource} />);

    await waitFor(() => expect(queryByText("A")).to.not.be.null);
    expect(container.querySelector(".presentation-components-node")).to.be.null;
  });

  it("renders filter builder dialog when node filter button is clicked", async () => {
    const { visibleNodes, modelSource } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [createTreeModelNodeInput({ id: "A", item: { filtering: { descriptor: createTestContentDescriptor({ fields: [] }) } } })],
        0,
      );
    });

    const { queryByText, container, baseElement, user } = render(
      <PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} modelSource={modelSource} />,
    );

    await waitFor(() => expect(queryByText("A")).to.not.be.null);
    expect(container.querySelector(".presentation-components-node")).to.not.be.null;

    const filterButton = container.querySelector(".presentation-components-node-action-buttons button");
    expect(filterButton).to.not.be.null;
    await user.click(filterButton!);

    // wait for dialog to be visible
    await waitFor(() => {
      expect(baseElement.querySelector(".presentation-instance-filter-dialog")).to.not.be.null;
    });

    const closeButton = baseElement.querySelector(".presentation-instance-filter-dialog-close-button");
    expect(closeButton).to.not.be.null;
    await user.click(closeButton!);

    const dialog = baseElement.querySelector(".presentation-instance-filter-dialog");
    expect(dialog).to.be.null;
  });

  it("applies filter and closes dialog", async () => {
    const property = createTestPropertyInfo({ name: "TestProperty", type: StandardTypeNames.Bool });
    const propertyField = createTestPropertiesContentField({
      properties: [{ property }],
      name: property.name,
      label: property.name,
      type: { typeName: StandardTypeNames.Bool, valueFormat: PropertyValueFormat.Primitive },
    });
    const { visibleNodes, modelSource } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [createTreeModelNodeInput({ id: "A", item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }) } } })],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} modelSource={modelSource} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await applyFilter(result, propertyField.label);

    const nodeItem = modelSource.getModel().getNode("A")?.item as PresentationTreeNodeItem;
    expect(nodeItem.filtering?.active).to.not.be.undefined;
  });

  it("sets `node.isLoading` to true when filter is applied", async () => {
    const subject = new Subject<TreeNodeLoadResult>();
    baseTreeProps.nodeLoader.loadNode.reset();
    baseTreeProps.nodeLoader.loadNode.callsFake(() => subject);

    const property = createTestPropertyInfo({ name: "TestProperty", type: StandardTypeNames.Bool });
    const propertyField = createTestPropertiesContentField({
      properties: [{ property }],
      name: property.name,
      label: property.name,
      type: { typeName: StandardTypeNames.Bool, valueFormat: PropertyValueFormat.Primitive },
    });
    const { visibleNodes, modelSource } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [createTreeModelNodeInput({ id: "A", item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }) } } })],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} modelSource={modelSource} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await applyFilter(result, propertyField.label);

    await waitFor(() => expect(baseTreeProps.nodeLoader.loadNode).to.be.calledOnce);
    expect(modelSource.getModel().getNode("A")?.isLoading).to.be.true;
    subject.complete();
  });

  it("shows results count when filtering dialog has valid filter", async () => {
    const property = createTestPropertyInfo({ name: "TestProperty", type: StandardTypeNames.Bool });
    const propertyField = createTestPropertiesContentField({
      properties: [{ property }],
      name: property.name,
      label: property.name,
      type: { typeName: StandardTypeNames.Bool, valueFormat: PropertyValueFormat.Primitive },
    });
    const initialFilter: PresentationInstanceFilterInfo = {
      filter: { field: propertyField, operator: PropertyFilterRuleOperator.IsFalse },
      usedClasses: [],
    };

    const { visibleNodes, modelSource } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [
          createTreeModelNodeInput({
            id: "A",
            item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }), active: initialFilter } },
          }),
        ],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} modelSource={modelSource} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await openFilterDialog(result);

    await waitFor(() => expect(queryByText(/15$/i)).to.not.be.null);
    expect(presentationManager.getNodesCount).to.be.calledOnce;
  });
});

async function openFilterDialog({ getByRole, baseElement, user }: ReturnType<typeof render>) {
  const filterButton = getByRole("button", { name: "tree.filter-hierarchy-level" });
  await user.click(filterButton);

  // wait for dialog to be visible
  await waitFor(() => {
    expect(baseElement.querySelector(".presentation-instance-filter-dialog")).to.not.be.null;
  });
}

async function applyFilter(result: ReturnType<typeof render>, propertyLabel: string) {
  await openFilterDialog(result);
  const { baseElement, getByText, user } = result;

  // select property in filter builder dialog
  // open property selector
  const propertySelector = baseElement.querySelector<HTMLInputElement>(".rule-property input");
  expect(propertySelector).to.not.be.null;
  await user.click(propertySelector!);
  // select property
  await user.click(getByText(propertyLabel));

  // wait until apply button is enabled
  const applyButton = await waitFor(() => {
    const button = baseElement.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
    expect(button?.disabled).to.be.false;
    return button;
  });
  await user.click(applyButton!);

  // wait until dialog closes
  await waitFor(() => {
    expect(baseElement.querySelector(".presentation-instance-filter-dialog")).to.be.null;
  });
}
