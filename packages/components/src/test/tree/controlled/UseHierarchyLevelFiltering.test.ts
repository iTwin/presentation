/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Subject } from "rxjs";
import { from } from "rxjs/internal/observable/from";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord } from "@itwin/appui-abstract";
import { ITreeNodeLoader, TreeModelNodeInput, TreeModelSource, TreeNodeLoadResult, UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { PresentationInstanceFilterInfo } from "../../../presentation-components/instance-filter-builder/PresentationFilterBuilder";
import { useHierarchyLevelFiltering } from "../../../presentation-components/tree/controlled/UseHierarchyLevelFiltering";
import { PresentationTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem";
import { createTestPropertyInfo } from "../../_helpers/Common";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../../_helpers/Content";
import { createTestECInstancesNodeKey } from "../../_helpers/Hierarchy";
import { renderHook } from "../../TestUtils";

function createTreeModelInput(input?: Partial<TreeModelNodeInput>, treeItem?: Partial<PresentationTreeNodeItem>): TreeModelNodeInput {
  const item: PresentationTreeNodeItem = {
    ...treeItem,
    id: treeItem?.id ?? input?.id ?? "node_id",
    key: treeItem?.key ?? createTestECInstancesNodeKey(),
    label: treeItem?.label ?? input?.label ?? PropertyRecord.fromString("Node Label"),
  };
  return {
    ...input,
    id: item.id,
    isExpanded: input?.isExpanded ?? false,
    isLoading: input?.isLoading ?? false,
    isSelected: input?.isSelected ?? false,
    label: item.label,
    item,
  };
}

describe("useHierarchyLevelFiltering", () => {
  const nodeLoaderMock = moq.Mock.ofType<ITreeNodeLoader>();
  const modelSource = new TreeModelSource();
  const property = createTestPropertyInfo();
  const field = createTestPropertiesContentField({ properties: [{ property }] });
  const filterInfo: PresentationInstanceFilterInfo = {
    filter: {
      field,
      operator: "is-null",
    },
    usedClasses: [],
  };

  before(() => {
    sinon.stub(UiComponents, "localization").get(() => new EmptyLocalization());
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    nodeLoaderMock.reset();
    modelSource.modifyModel((model) => {
      model.clearChildren(undefined);
    });
  });

  it("applies filter", () => {
    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });
    nodeLoaderMock.setup((x) => x.loadNode(moq.It.isAny(), 0)).returns(() => from([]));

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.applyFilter(node.item.id, filterInfo);
    const treeModel = modelSource.getModel();
    expect((treeModel.getNode(node.id)?.item as PresentationTreeNodeItem).filtering?.active).to.be.eq(filterInfo);
  });

  it("reloads children after filter applied to expanded node", () => {
    const node = createTreeModelInput({ isExpanded: true }, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    nodeLoaderMock
      .setup((x) =>
        x.loadNode(
          moq.It.is((parentNode) => parentNode?.id === node.id),
          0,
        ),
      )
      .returns(() => from([]))
      .verifiable(moq.Times.once());

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.applyFilter(node.item.id, filterInfo);
    nodeLoaderMock.verifyAll();
  });

  it("clears children from tree model when filter applied", () => {
    const parentNode = createTreeModelInput(
      { id: "parent_id" },
      { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } },
    );
    const childNode = createTreeModelInput({ id: "child_id" });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [parentNode], 0);
      model.setChildren(parentNode.id, [childNode], 0);
    });
    nodeLoaderMock.setup((x) => x.loadNode(moq.It.isAny(), 0)).returns(() => from([]));

    expect(modelSource.getModel().getNode(childNode.id)).to.not.be.undefined;

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.applyFilter(parentNode.item.id, filterInfo);
    expect(modelSource.getModel().getNode(childNode.id)).to.be.undefined;
  });

  it("does not apply filter on non presentation tree node item", () => {
    const parentNode: TreeModelNodeInput = {
      ...createTreeModelInput({ id: "parent_id" }),
      item: { id: "parent_id", label: PropertyRecord.fromString("Node Label") },
    };
    const childNode: TreeModelNodeInput = {
      ...createTreeModelInput({ id: "child_id" }),
      item: { id: "child_id", label: PropertyRecord.fromString("Node Label") },
    };
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [parentNode], 0);
      model.setChildren(parentNode.id, [childNode], 0);
    });

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.applyFilter(parentNode.item.id, filterInfo);
    expect(modelSource.getModel().getNode(childNode.id)).to.not.be.undefined;
  });

  it("clears filter", () => {
    const node = createTreeModelInput(undefined, {
      filtering: {
        descriptor: createTestContentDescriptor({ fields: [] }),
        ancestorFilters: [],
        active: filterInfo,
      },
    });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    expect((modelSource.getModel().getNode(node.id)?.item as PresentationTreeNodeItem).filtering?.active).to.not.be.undefined;

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.clearFilter(node.item.id);
    expect((modelSource.getModel().getNode(node.id)?.item as PresentationTreeNodeItem).filtering?.active).to.be.undefined;
  });

  it("reloads children after filter cleared on expanded node", () => {
    const node = createTreeModelInput(
      { isExpanded: true },
      {
        filtering: {
          descriptor: createTestContentDescriptor({ fields: [] }),
          ancestorFilters: [],
          active: filterInfo,
        },
      },
    );
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    nodeLoaderMock
      .setup((x) =>
        x.loadNode(
          moq.It.is((parentNode) => parentNode?.id === node.id),
          0,
        ),
      )
      .returns(() => from([]))
      .verifiable(moq.Times.once());

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.clearFilter(node.item.id);
    nodeLoaderMock.verifyAll();
  });

  it("clears children from tree model when filter cleared", () => {
    const parentNode = createTreeModelInput(
      { id: "parent_id" },
      {
        filtering: {
          descriptor: createTestContentDescriptor({ fields: [] }),
          ancestorFilters: [],
          active: filterInfo,
        },
      },
    );
    const childNode = createTreeModelInput({ id: "child_id" });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [parentNode], 0);
      model.setChildren(parentNode.id, [childNode], 0);
    });

    expect(modelSource.getModel().getNode(childNode.id)).to.not.be.undefined;

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.clearFilter(parentNode.item.id);
    expect(modelSource.getModel().getNode(childNode.id)).to.be.undefined;
  });

  it("clears filter unsubscribes from observable created by `applyFilter`", () => {
    const applyFilterActionSubject = new Subject<TreeNodeLoadResult>();
    const clearFilterActionSubject = new Subject<TreeNodeLoadResult>();
    nodeLoaderMock.setup((x) => x.loadNode(moq.It.isAny(), 0)).returns(() => applyFilterActionSubject);
    nodeLoaderMock.setup((x) => x.loadNode(moq.It.isAny(), 0)).returns(() => clearFilterActionSubject);

    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.applyFilter(node.item.id, filterInfo);
    expect(applyFilterActionSubject.observed).to.be.true;

    result.current.clearFilter(node.item.id);
    expect(applyFilterActionSubject.observed).to.be.false;
  });

  it("`applyFilter` unsubscribes from previous observable if called second time", () => {
    const nodeLoad1 = new Subject<TreeNodeLoadResult>();
    nodeLoaderMock.setup((x) => x.loadNode(moq.It.isAny(), 0)).returns(() => nodeLoad1);

    const nodeLoad2 = new Subject<TreeNodeLoadResult>();
    nodeLoaderMock.setup((x) => x.loadNode(moq.It.isAny(), 0)).returns(() => nodeLoad2);

    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.applyFilter(node.item.id, filterInfo);
    expect(nodeLoad1.observed).to.be.true;
    expect(nodeLoad2.observed).to.be.false;

    result.current.applyFilter(node.item.id, filterInfo);
    expect(nodeLoad1.observed).to.be.false;
    expect(nodeLoad2.observed).to.be.true;
  });

  it("unsubscribes from observable if error is thrown", () => {
    const subject = new Subject<TreeNodeLoadResult>();
    nodeLoaderMock.setup((x) => x.loadNode(moq.It.isAny(), 0)).returns(() => subject);
    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader: nodeLoaderMock.object } });

    result.current.applyFilter(node.item.id, filterInfo);
    expect(subject.observed).to.be.true;
    subject.error([]);
    expect(subject.observed).to.be.false;
  });
});
