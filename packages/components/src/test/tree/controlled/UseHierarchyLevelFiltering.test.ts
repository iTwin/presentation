/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { Subject } from "rxjs";
import { from } from "rxjs/internal/observable/from";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PropertyRecord } from "@itwin/appui-abstract";
import { ITreeNodeLoader, TreeModelNodeInput, TreeModelSource, TreeNodeLoadResult, UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { PresentationInstanceFilterInfo } from "../../../presentation-components/instance-filter-builder/PresentationFilterBuilder.js";
import { useHierarchyLevelFiltering } from "../../../presentation-components/tree/controlled/UseHierarchyLevelFiltering.js";
import { PresentationTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem.js";
import { createTestPropertyInfo } from "../../_helpers/Common.js";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../../_helpers/Content.js";
import { createTestECInstancesNodeKey } from "../../_helpers/Hierarchy.js";
import { createStub, renderHook } from "../../TestUtils.js";

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
  const nodeLoader = {
    loadNode: createStub<ITreeNodeLoader["loadNode"]>(),
  };
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

  beforeAll(async () => {
    await UiComponents.initialize(new EmptyLocalization());
  });

  afterAll(() => {
    UiComponents.terminate();
  });

  beforeEach(() => {
    nodeLoader.loadNode.mockReset();
    modelSource.modifyModel((model) => {
      model.clearChildren(undefined);
    });
  });

  it("applies filter", () => {
    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });
    nodeLoader.loadNode.mockReturnValue(from([]));

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.applyFilter(node.item.id, filterInfo);
    const treeModel = modelSource.getModel();
    expect((treeModel.getNode(node.id)?.item as PresentationTreeNodeItem).filtering?.active).toBe(filterInfo);
  });

  it("reloads children after filter applied to expanded node", () => {
    const node = createTreeModelInput({ isExpanded: true }, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    nodeLoader.loadNode.mockReturnValue(from([]));

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.applyFilter(node.item.id, filterInfo);
    expect(nodeLoader.loadNode).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: node.id }), expect.anything());
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
    nodeLoader.loadNode.mockReturnValue(from([]));

    expect(modelSource.getModel().getNode(childNode.id)).toBeDefined();

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.applyFilter(parentNode.item.id, filterInfo);
    expect(modelSource.getModel().getNode(childNode.id)).toBeUndefined();
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

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.applyFilter(parentNode.item.id, filterInfo);
    expect(modelSource.getModel().getNode(childNode.id)).toBeDefined();
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

    expect((modelSource.getModel().getNode(node.id)?.item as PresentationTreeNodeItem).filtering?.active).toBeDefined();

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.clearFilter(node.item.id);
    expect((modelSource.getModel().getNode(node.id)?.item as PresentationTreeNodeItem).filtering?.active).toBeUndefined();
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

    nodeLoader.loadNode.mockReturnValue(from([]));

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.clearFilter(node.item.id);
    expect(nodeLoader.loadNode).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: node.id }), expect.anything());
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

    expect(modelSource.getModel().getNode(childNode.id)).toBeDefined();

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.clearFilter(parentNode.item.id);
    expect(modelSource.getModel().getNode(childNode.id)).toBeUndefined();
  });

  it("clears filter unsubscribes from observable created by `applyFilter`", () => {
    const applyFilterActionSubject = new Subject<TreeNodeLoadResult>();
    const clearFilterActionSubject = new Subject<TreeNodeLoadResult>();
    nodeLoader.loadNode.mockReturnValueOnce(applyFilterActionSubject);
    nodeLoader.loadNode.mockReturnValueOnce(clearFilterActionSubject);

    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.applyFilter(node.item.id, filterInfo);
    expect(applyFilterActionSubject.observed).toBe(true);

    result.current.clearFilter(node.item.id);
    expect(applyFilterActionSubject.observed).toBe(false);
  });

  it("`applyFilter` unsubscribes from previous observable if called second time", () => {
    const nodeLoad1 = new Subject<TreeNodeLoadResult>();
    nodeLoader.loadNode.mockReturnValueOnce(nodeLoad1);

    const nodeLoad2 = new Subject<TreeNodeLoadResult>();
    nodeLoader.loadNode.mockReturnValueOnce(nodeLoad2);

    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.applyFilter(node.item.id, filterInfo);
    expect(nodeLoad1.observed).toBe(true);
    expect(nodeLoad2.observed).toBe(false);

    result.current.applyFilter(node.item.id, filterInfo);
    expect(nodeLoad1.observed).toBe(false);
    expect(nodeLoad2.observed).toBe(true);
  });

  it("unsubscribes from observable if error is thrown", () => {
    const subject = new Subject<TreeNodeLoadResult>();
    nodeLoader.loadNode.mockReturnValue(subject);
    const node = createTreeModelInput(undefined, { filtering: { descriptor: createTestContentDescriptor({ fields: [] }), ancestorFilters: [] } });
    modelSource.modifyModel((model) => {
      model.setChildren(undefined, [node], 0);
    });

    const { result } = renderHook(useHierarchyLevelFiltering, { initialProps: { modelSource, nodeLoader } });

    result.current.applyFilter(node.item.id, filterInfo);
    expect(subject.observed).toBe(true);
    subject.error([]);
    expect(subject.observed).toBe(false);
  });
});
