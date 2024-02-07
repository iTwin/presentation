/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { EMPTY, Subject } from "rxjs";
import sinon from "sinon";
import { StandardTypeNames } from "@itwin/appui-abstract";
import {
  AbstractTreeNodeLoaderWithProvider,
  computeVisibleNodes,
  ITreeNodeLoader,
  MutableTreeModel,
  TreeActions,
  TreeModelSource,
  TreeNodeLoadResult,
  UiComponents,
} from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { PresentationError, PresentationStatus, PropertyValueFormat } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { translate } from "../../../presentation-components/common/Utils";
import { PresentationInstanceFilterInfo } from "../../../presentation-components/instance-filter-builder/PresentationFilterBuilder";
import { PresentationTreeRenderer } from "../../../presentation-components/tree/controlled/PresentationTreeRenderer";
import { PresentationTreeDataProvider } from "../../../presentation-components/tree/DataProvider";
import { IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider";
import { PresentationTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem";
import { createTestPropertyInfo, stubDOMMatrix, stubRaf } from "../../_helpers/Common";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../../_helpers/Content";
import { render, waitFor } from "../../TestUtils";
import { createTreeModelNodeInput } from "./Helpers";

describe("PresentationTreeRenderer", () => {
  stubRaf();
  stubDOMMatrix();

  const baseTreeProps = {
    imodel: {} as IModelConnection,
    treeActions: {} as TreeActions,
    dataProvider: {} as IPresentationTreeDataProvider,
    height: 100,
    width: 100,
    nodeHeight: () => 20,
  };

  const dataProviderStub = {
    imodel: {} as IModelConnection,
    rulesetId: "test-ruleset",
    createRequestOptions: () => ({}),
  };

  const nodeLoaderStub = {
    loadNode: sinon.stub<Parameters<ITreeNodeLoader["loadNode"]>, ReturnType<ITreeNodeLoader["loadNode"]>>(),
    modelSource: {},
    dataProvider: dataProviderStub,
  };

  const presentationManager = {
    getNodesCount: sinon.stub<Parameters<PresentationManager["getNodesCount"]>, ReturnType<PresentationManager["getNodesCount"]>>(),
  };

  before(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(Presentation, "localization").get(() => localization);

    // need to initialize for immer patches to be enabled.
    await UiComponents.initialize(localization);
    HTMLElement.prototype.scrollIntoView = () => {};
  });

  after(() => {
    sinon.restore();
    UiComponents.terminate();
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  beforeEach(() => {
    nodeLoaderStub.loadNode.returns(EMPTY);
    presentationManager.getNodesCount.resolves(15);
  });

  afterEach(() => {
    nodeLoaderStub.loadNode.reset();
    presentationManager.getNodesCount.reset();
  });

  const property = createTestPropertyInfo({ name: "TestProperty", type: StandardTypeNames.Bool });
  const propertyField = createTestPropertiesContentField({
    properties: [{ property }],
    name: property.name,
    label: property.name,
    type: { typeName: StandardTypeNames.Bool, valueFormat: PropertyValueFormat.Primitive },
  });
  const initialFilter: PresentationInstanceFilterInfo = {
    filter: { field: propertyField, operator: "is-false" },
    usedClasses: [],
  };

  function setupTreeModel(setup: (model: MutableTreeModel) => void) {
    const model = new MutableTreeModel();
    setup(model);
    const modelSource = new TreeModelSource(model);
    const visibleNodes = computeVisibleNodes(model);
    nodeLoaderStub.modelSource = modelSource;
    return { modelSource, visibleNodes, nodeLoader: nodeLoaderStub as unknown as AbstractTreeNodeLoaderWithProvider<PresentationTreeDataProvider> };
  }

  it("renders default tree node", async () => {
    const { visibleNodes, nodeLoader } = setupTreeModel((model) => {
      const input = createTreeModelNodeInput({ id: "A" });
      // use non presentation tree node item
      (input as any).item = { id: "A", label: input.label };
      model.setChildren(undefined, [input], 0);
    });

    const { queryByText, container } = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />);

    await waitFor(() => expect(queryByText("A")).to.not.be.null);
    expect(container.querySelector(".presentation-components-node")).to.be.null;
  });

  it("renders filter builder dialog when node filter button is clicked", async () => {
    const { visibleNodes, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [createTreeModelNodeInput({ id: "A", item: { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } } })],
        0,
      );
    });

    const { queryByText, container, baseElement, user } = render(
      <PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />,
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

  it("does not render filter dialog when tree model does not find a matching node", async () => {
    const { visibleNodes, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [createTreeModelNodeInput({ id: "A", item: { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } } })],
        0,
      );
    });

    // stub getNode method to make it return undefined when onFilterClick() is called.
    sinon.stub(nodeLoader.modelSource.getModel(), "getNode").returns(undefined);

    const { queryByText, baseElement, user, container } = render(
      <PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />,
    );

    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    const filterButton = container.querySelector(".presentation-components-node-action-buttons button");
    expect(filterButton).to.not.be.null;
    await user.click(filterButton!);

    // assert that dialog is not loaded
    await waitFor(() => {
      expect(baseElement.querySelector(".presentation-instance-filter-dialog")).to.be.null;
    });
  });

  it("applies filter and closes dialog", async () => {
    const { visibleNodes, modelSource, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [
          createTreeModelNodeInput({
            id: "A",
            item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }), ancestorFilters: [] } },
          }),
        ],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await applyFilter(result, propertyField.label);

    const nodeItem = modelSource.getModel().getNode("A")?.item as PresentationTreeNodeItem;
    expect(nodeItem.filtering?.active).to.not.be.undefined;
  });

  it("sets `node.isLoading` to true when filter is applied", async () => {
    const subject = new Subject<TreeNodeLoadResult>();
    nodeLoaderStub.loadNode.reset();
    nodeLoaderStub.loadNode.callsFake(() => subject);

    const { visibleNodes, modelSource, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [
          createTreeModelNodeInput({
            id: "A",
            item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }), ancestorFilters: [] } },
          }),
        ],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await applyFilter(result, propertyField.label);

    await waitFor(() => expect(nodeLoaderStub.loadNode).to.be.calledOnce);
    expect(modelSource.getModel().getNode("A")?.isLoading).to.be.true;
    subject.complete();
  });

  it("renders results count when filtering dialog has valid filter", async () => {
    const { visibleNodes, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [
          createTreeModelNodeInput({
            id: "A",
            item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }), active: initialFilter, ancestorFilters: [] } },
          }),
        ],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await openFilterDialog(result);

    await waitFor(() => expect(queryByText(/15$/i)).to.not.be.null);
    expect(presentationManager.getNodesCount).to.be.calledOnce;
  });

  it("renders information message if results set too large error is thrown", async () => {
    presentationManager.getNodesCount.reset();
    presentationManager.getNodesCount.callsFake(async () => {
      throw new PresentationError(PresentationStatus.ResultSetTooLarge, "Results set too large");
    });
    const limit = 5;

    dataProviderStub.createRequestOptions = () => {
      return {
        sizeLimit: limit,
      };
    };

    const { visibleNodes, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [
          createTreeModelNodeInput({
            id: "A",
            item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }), active: initialFilter, ancestorFilters: [] } },
          }),
        ],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await openFilterDialog(result);

    await waitFor(() => expect(presentationManager.getNodesCount).to.be.calledOnce);
    expect(queryByText(translate("tree.filter-dialog.result-limit-exceeded"), { exact: false })).to.not.be.null;
  });

  it("does not render result if unknown error is encountered", async () => {
    presentationManager.getNodesCount.reset();
    presentationManager.getNodesCount.callsFake(async () => {
      throw new Error("Test Error");
    });

    const { visibleNodes, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [
          createTreeModelNodeInput({
            id: "A",
            item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }), active: initialFilter, ancestorFilters: [] } },
          }),
        ],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />);

    const { queryByText } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await openFilterDialog(result);

    await waitFor(() => expect(presentationManager.getNodesCount).to.be.calledOnce);
    expect(queryByText(/tree.filter-dialog/i)).to.be.null;
  });

  it("clears filter if apply button is pressed after filtering rules are cleared", async () => {
    const { visibleNodes, modelSource, nodeLoader } = setupTreeModel((model) => {
      model.setChildren(
        undefined,
        [
          createTreeModelNodeInput({
            id: "A",
            item: { filtering: { descriptor: createTestContentDescriptor({ fields: [propertyField] }), ancestorFilters: [] } },
          }),
        ],
        0,
      );
    });

    const result = render(<PresentationTreeRenderer {...baseTreeProps} visibleNodes={visibleNodes} nodeLoader={nodeLoader} />);

    const { queryByText, user } = result;
    await waitFor(() => expect(queryByText("A")).to.not.be.null);

    await applyFilter(result, propertyField.label);

    // ensure that initially the filter is enabled
    let nodeItem = modelSource.getModel().getNode("A")?.item as PresentationTreeNodeItem;
    expect(nodeItem.filtering?.active).to.not.be.undefined;

    await openFilterDialog(result);

    const { baseElement } = result;

    // clear all filter selections
    const resetButton = await waitFor(() => {
      const button = baseElement.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-reset-button");
      expect(button?.disabled).to.be.false;
      return button;
    });
    await user.click(resetButton!);

    // pressing apply on empty filter clears it
    const applyButton = await waitFor(() => {
      const button = baseElement.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-apply-button");
      return button;
    });
    await user.click(applyButton!);

    await waitFor(() => {
      expect(baseElement.querySelector(".presentation-instance-filter-dialog")).to.be.null;
    });

    nodeItem = modelSource.getModel().getNode("A")?.item as PresentationTreeNodeItem;
    expect(nodeItem.filtering?.active).to.be.undefined;
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
  const { baseElement, getByTitle, user } = result;

  // select property in filter builder dialog
  // open property selector
  const propertySelector = baseElement.querySelector<HTMLInputElement>(".fb-property-name input");
  expect(propertySelector).to.not.be.null;
  await user.click(propertySelector!);
  // select property
  await user.click(getByTitle(propertyLabel));

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
