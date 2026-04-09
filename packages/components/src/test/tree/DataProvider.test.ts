/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { createAsyncIterator, ResolvablePromise } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from "vitest";
import { PropertyRecord } from "@itwin/appui-abstract";
import { CheckBoxState, PageOptions } from "@itwin/components-react";
import { assert, BeEvent, Logger } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import {
  ClassInfo,
  ClientDiagnosticsAttribute,
  Descriptor,
  ECInstancesNodeKey,
  FilterByTextHierarchyRequestOptions,
  HierarchyRequestOptions,
  Node,
  NodeKey,
  Paged,
  PresentationError,
  PresentationStatus,
  PropertyInfo,
  RulesetVariable,
} from "@itwin/presentation-common";
import { Presentation, PresentationManager, RulesetVariablesManager } from "@itwin/presentation-frontend";
import { translate } from "../../presentation-components/common/Utils.js";
import { PresentationInstanceFilterInfo } from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder.js";
import { PresentationTreeDataProvider } from "../../presentation-components/tree/DataProvider.js";
import {
  PresentationInfoTreeNodeItem,
  PresentationTreeNodeItem,
  PresentationTreeNodeItemFilteringInfo,
} from "../../presentation-components/tree/PresentationTreeNodeItem.js";
import { createTestECClassInfo, createTestECInstanceKey, createTestPropertyInfo } from "../_helpers/Common.js";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content.js";
import { createTestECClassGroupingNodeKey, createTestECInstancesNode, createTestECInstancesNodeKey, createTestNodePathElement } from "../_helpers/Hierarchy.js";
import { createTestLabelDefinition } from "../_helpers/LabelDefinition.js";
import { createTestTreeNodeItem } from "../_helpers/UiComponents.js";
import { createMocked } from "../TestUtils.js";

function createTestECInstancesNodeKeyWithId(id?: string) {
  return createTestECInstancesNodeKey({
    instanceKeys: [createTestECInstanceKey({ id })],
  });
}

function createTestECInstancesNodeWithId(id?: string) {
  return createTestECInstancesNode({
    key: createTestECInstancesNodeKeyWithId(id),
  });
}

type GetNodesOptions = Paged<HierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>> & ClientDiagnosticsAttribute;
type GetFilteredNodePathsOptions = FilterByTextHierarchyRequestOptions<IModelConnection, RulesetVariable> & ClientDiagnosticsAttribute;

describe("TreeDataProvider", () => {
  const rulesetId: string = "ruleset_id";
  const onVariableChanged: BeEvent<(variableId: string) => void> = new BeEvent();
  const onHierarchyLimitExceededSpy = vi.fn();

  let provider: PresentationTreeDataProvider;
  let presentationManager: Mocked<PresentationManager>;

  const imodel = {} as IModelConnection;

  beforeEach(() => {
    presentationManager = createMocked(PresentationManager);
    presentationManager.vars.mockReturnValue({
      onVariableChanged,
    } as RulesetVariablesManager);

    vi.spyOn(Presentation, "presentation", "get").mockReturnValue(presentationManager);
    vi.spyOn(Presentation, "localization", "get").mockReturnValue(new EmptyLocalization());
    provider = new PresentationTreeDataProvider({ imodel, ruleset: rulesetId, onHierarchyLimitExceeded: onHierarchyLimitExceededSpy });
  });

  afterEach(() => {
    onHierarchyLimitExceededSpy.mockClear();
    provider[Symbol.dispose]();
  });

  describe("rulesetId", () => {
    it("returns rulesetId provider is initialized with", () => {
      expect(provider.rulesetId).toBe(rulesetId);
    });
  });

  describe("imodel", () => {
    it("returns imodel provider is initialized with", () => {
      expect(provider.imodel).toBe(imodel);
    });
  });

  describe("getNodeKey", () => {
    it("returns invalid key for non presentation tree node item", () => {
      const key = provider.getNodeKey({ id: "test_id", label: PropertyRecord.fromString("Test Label") });
      expect(key.type).toHaveLength(0);
      expect(key.pathFromRoot).toHaveLength(0);
      expect(key.version).toBe(0);
    });

    it("returns valid key for presentation tree node item", () => {
      const nodeKey = createTestECInstancesNodeKey();
      const item: PresentationTreeNodeItem = {
        id: "test_id",
        label: PropertyRecord.fromString("Test Label"),
        key: nodeKey,
      };
      expect(provider.getNodeKey(item)).toBe(nodeKey);
    });
  });

  describe("getNodesCount", () => {
    it("returns presentation manager result through `getNodesAndCount`", async () => {
      const resultNodes = [createTestECInstancesNodeWithId("0x1"), createTestECInstancesNodeWithId("0x2")];
      const parentKey = createTestECInstancesNodeKeyWithId("0x3");
      const parentNode = createTestTreeNodeItem(parentKey);

      presentationManager.getNodesIterator.mockImplementation(async (options) =>
        options.parentKey === parentKey ? { items: createAsyncIterator(resultNodes), total: resultNodes.length } : { items: createAsyncIterator([]), total: 0 },
      );

      const actualResult = await provider.getNodesCount(parentNode);
      expect(actualResult).toBe(resultNodes.length);
    });

    it("memoizes result", async () => {
      const parentKeys = [createTestECInstancesNodeKeyWithId("0x1"), createTestECInstancesNodeKeyWithId("0x2")];
      const parentNodes = parentKeys.map((key, i) => createTestTreeNodeItem(key, { id: `node_id_${i}` }));
      const resultContainers = [
        new ResolvablePromise<{ items: AsyncIterableIterator<Node>; total: number }>(),
        new ResolvablePromise<{ items: AsyncIterableIterator<Node>; total: number }>(),
      ];

      presentationManager.getNodesIterator.mockImplementation(async (options) => {
        if (options.parentKey === parentKeys[0]) {
          return resultContainers[0].promise;
        }
        if (options.parentKey === parentKeys[1]) {
          return resultContainers[1].promise;
        }
        return { items: createAsyncIterator([]), total: 0 };
      });

      provider.pagingSize = 10;
      const promises = [provider.getNodesCount(parentNodes[0]), provider.getNodesCount(parentNodes[0]), provider.getNodesCount(parentNodes[1])];
      resultContainers.forEach((c, index) =>
        c.resolveSync({ items: createAsyncIterator([createTestECInstancesNode(), createTestECInstancesNode()]), total: index }),
      );
      const results = await Promise.all(promises);
      expect(results[0]).toBe(0);
      expect(results[0]).toBe(results[1]);
      expect(results[2]).toBe(1);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledTimes(2);
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ parentKey }) => compareKeys(parentKey as ECInstancesNodeKey, parentKeys[0])),
      );
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ parentKey }) => compareKeys(parentKey as ECInstancesNodeKey, parentKeys[1])),
      );
    });

    it("clears memoized result when ruleset variables changes", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);

      presentationManager.getNodesIterator.mockResolvedValue({
        items: createAsyncIterator([createTestECInstancesNode(), createTestECInstancesNode()]),
        total: 2,
      });

      provider.pagingSize = 10;
      await provider.getNodesCount(parentNode);
      onVariableChanged.raiseEvent("testVar");
      await provider.getNodesCount(parentNode);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledTimes(2);
    });

    it("passes instance filter to presentation manager", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);

      const { filterDefinition, filteringInfo } = createInstanceFilteringInfo("prop1");
      parentNode.filtering = filteringInfo;

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });

      const actualResult = await provider.getNodesCount(parentNode);
      expect(actualResult).toBe(1);
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ instanceFilter }) => instanceFilter?.expression === filterDefinition?.expression),
      );
    });
  });

  describe("getNodes", () => {
    it("returns presentation manager result", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const pageOptions: PageOptions = { start: 0, size: 5 };

      presentationManager.getNodesIterator.mockResolvedValue({
        items: createAsyncIterator([createTestECInstancesNode(), createTestECInstancesNode()]),
        total: 2,
      });

      const actualResult = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult).toMatchSnapshot();
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 5));
    });

    it("memoizes result", async () => {
      const parentKeys = [createTestECInstancesNodeKeyWithId("0x1"), createTestECInstancesNodeKeyWithId("0x2")];
      const parentNodes = parentKeys.map((key, i) => createTestTreeNodeItem(key, { id: `node_id_${i}` }));
      const resultNodesFirstPageContainer0 = new ResolvablePromise<{ items: AsyncIterableIterator<Node>; total: number }>();
      const resultNodesFirstPageContainer1 = new ResolvablePromise<{ items: AsyncIterableIterator<Node>; total: number }>();
      const resultNodesNonFirstPageContainer = new ResolvablePromise<{ items: AsyncIterableIterator<Node>; total: number }>();

      presentationManager.getNodesIterator.mockImplementation(async ({ paging, parentKey }) => {
        if (paging === undefined && parentKey === parentKeys[0]) {
          return resultNodesFirstPageContainer0.promise;
        }
        if (paging?.start === 1 && paging.size === 0 && parentKey === parentKeys[0]) {
          return resultNodesNonFirstPageContainer.promise;
        }
        if (paging?.start === 0 && paging.size === 1 && parentKey === parentKeys[1]) {
          return resultNodesFirstPageContainer1.promise;
        }
        return { items: createAsyncIterator([]), total: 0 };
      });

      const promises = [
        provider.getNodes(parentNodes[0], undefined),
        provider.getNodes(parentNodes[0], undefined),
        provider.getNodes(parentNodes[0], { start: 0, size: 0 }),
        provider.getNodes(parentNodes[0], { start: 0, size: 0 }),
        provider.getNodes(parentNodes[0], { start: 1, size: 0 }),
        provider.getNodes(parentNodes[0], { start: 1, size: 0 }),
        provider.getNodes(parentNodes[1], { start: 0, size: 1 }),
        provider.getNodes(parentNodes[1], { start: 0, size: 1 }),
      ];
      resultNodesFirstPageContainer0.resolveSync({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });
      resultNodesFirstPageContainer1.resolveSync({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });
      resultNodesNonFirstPageContainer.resolveSync({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });
      const results = await Promise.all(promises);

      expect(results[0], "results[0] should eq results[1]").toBe(results[1]);
      expect(results[2], "results[2] should eq results[3]").toBe(results[3]);
      expect(results[4], "results[4] should eq results[5]").toBe(results[5]);
      expect(results[6], "results[6] should eq results[7]").toBe(results[7]);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledTimes(3);
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ paging, parentKey }) => paging === undefined && compareKeys(parentKey as ECInstancesNodeKey, parentKeys[0])),
      );
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ paging, parentKey }) => paging?.start === 1 && paging.size === 0 && compareKeys(parentKey as ECInstancesNodeKey, parentKeys[0])),
      );
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ paging, parentKey }) => paging?.start === 0 && paging.size === 1 && compareKeys(parentKey as ECInstancesNodeKey, parentKeys[1])),
      );
    });

    it("uses `getNodesAndCount` data source override if supplied", async () => {
      const override = vi.fn().mockResolvedValue({ count: 1, nodes: [createTestECInstancesNode()] });
      provider = new PresentationTreeDataProvider({ imodel, ruleset: rulesetId, dataSourceOverrides: { getNodesAndCount: override } });
      await provider.getNodes();
      expect(override).toHaveBeenCalledOnce();
      expect(presentationManager.getNodesIterator).not.toHaveBeenCalled();
    });

    it("uses `getNodesIterator` data source override if supplied", async () => {
      const override = vi.fn().mockResolvedValue({ total: 1, items: createAsyncIterator([createTestECInstancesNode()]) });
      provider = new PresentationTreeDataProvider({ imodel, ruleset: rulesetId, dataSourceOverrides: { getNodesIterator: override } });
      await provider.getNodes();
      expect(override).toHaveBeenCalledOnce();
      expect(presentationManager.getNodesIterator).not.toHaveBeenCalled();
    });

    it("uses `PresentationManager.getNodesAndCount` if `getNodesIterator` is not available", async () => {
      Object.assign(presentationManager, { getNodesIterator: undefined });
      presentationManager.getNodesAndCount.mockResolvedValue({ count: 1, nodes: [createTestECInstancesNode()] });
      provider = new PresentationTreeDataProvider({ imodel, ruleset: rulesetId });
      await provider.getNodes();
      expect(presentationManager.getNodesAndCount).toHaveBeenCalledOnce();
    });

    it("logs a warning when requesting nodes and pagingSize is not the same as passed pageOptions", async () => {
      const pageOptions: PageOptions = { start: 0, size: 10 };
      const loggerSpy = vi.spyOn(Logger, "logWarning");
      const result = { items: createAsyncIterator([createTestECInstancesNode(), createTestECInstancesNode()]), total: 2 };
      presentationManager.getNodesIterator.mockResolvedValue(result);

      // Paging size is not set and pageOptions are passed
      await provider.getNodes(undefined, pageOptions);
      expect(loggerSpy).toHaveBeenCalledOnce();
      loggerSpy.mockClear();

      // Paging size is set and no pageOptions are passed
      provider.pagingSize = 10;
      await provider.getNodes();
      expect(loggerSpy).not.toHaveBeenCalled();
      loggerSpy.mockClear();

      // Paging size is set and pageOptions are passed but not equal to paging size
      provider.pagingSize = 20;
      await provider.getNodes(undefined, pageOptions);
      expect(loggerSpy).toHaveBeenCalledOnce();
      loggerSpy.mockClear();

      // Paging size is set and pageOptions are passed and equal to paging size
      provider.pagingSize = 10;
      await provider.getNodes(undefined, pageOptions);
      expect(loggerSpy).not.toHaveBeenCalled();
    });

    it("passes instance filter to presentation manager", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const { filterDefinition: instanceFilter0, filteringInfo: filteringInfo0 } = createInstanceFilteringInfo("prop");
      parentNode.filtering = filteringInfo0;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManager.getNodesIterator.mockImplementation(async ({ instanceFilter }) => {
        if (instanceFilter?.expression === instanceFilter0?.expression) {
          return { items: createAsyncIterator([createTestECInstancesNode()]), total: 1 };
        }
        if (instanceFilter?.expression === instanceFilter1?.expression) {
          return { items: createAsyncIterator([createTestECInstancesNode(), createTestECInstancesNode()]), total: 2 };
        }
        return { items: createAsyncIterator([]), total: 0 };
      });

      const actualResult0 = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult0).toHaveLength(1);
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ instanceFilter }) => instanceFilter?.expression === instanceFilter0?.expression),
      );

      const { filterDefinition: instanceFilter1, filteringInfo: filteringInfo1 } = createInstanceFilteringInfo("prop2");
      parentNode.filtering = filteringInfo1;

      const actualResult1 = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult1).toHaveLength(2);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ instanceFilter }) => instanceFilter?.expression === instanceFilter1?.expression),
      );
    });

    it("passes parent instance filter to presentation manager", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      const { filterDefinition, filteringInfo } = createInstanceFilteringInfo(undefined, ["parentProp"]);
      nodeItem.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });

      const actualResult = await provider.getNodes(nodeItem, pageOptions);
      expect(actualResult).toHaveLength(1);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ instanceFilter }) => instanceFilter?.expression === filterDefinition?.expression),
      );
    });

    it("passes instance filter with redundant usedClasses and calls getNodes with expression that has no redundant class checks", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      const classId = "0x1";
      const { filteringInfo } = createInstanceFilteringInfo(
        undefined,
        ["filter1", "filter2"],
        [createTestECClassInfo({ id: classId }), createTestECClassInfo({ id: classId })],
      );
      nodeItem.filtering = filteringInfo;
      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([]), total: 0 });
      await provider.getNodes(nodeItem, { start: 0, size: 2 });
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceFilter: {
            expression: `(this.filter1 = NULL AND this.filter2 = NULL) AND (this.IsOfClass(${classId}))`,
            selectClassName: "SchemaName:ClassName",
            relatedInstances: [],
          },
        }),
      );
    });

    it("passes combined parent and current node instance filter to presentation manager", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      const { filterDefinition, filteringInfo } = createInstanceFilteringInfo("prop", ["parentProp"]);
      nodeItem.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });

      const actualResult = await provider.getNodes(nodeItem, pageOptions);
      expect(actualResult).toHaveLength(1);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ instanceFilter }) => instanceFilter?.expression === filterDefinition?.expression),
      );
    });

    it("passes combined parent and current node filter with only class checks to presentation manager", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      nodeItem.filtering = {
        descriptor: createTestContentDescriptor({ fields: [] }),
        ancestorFilters: [
          {
            filter: undefined,
            usedClasses: [createTestECClassInfo({ id: "0x1" })],
          },
        ],
        active: {
          filter: undefined,
          usedClasses: [createTestECClassInfo({ id: "0x2" })],
        },
      };

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });

      const actualResult = await provider.getNodes(nodeItem, pageOptions);
      expect(actualResult).toHaveLength(1);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ instanceFilter }) => instanceFilter?.expression === `(this.IsOfClass(0x1) OR this.IsOfClass(0x2))`),
      );
    });

    it("passes empty instance filter to manager if there are no ancestor and active filters", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      const { filteringInfo } = createInstanceFilteringInfo(undefined, []);
      nodeItem.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });

      const actualResult = await provider.getNodes(nodeItem, pageOptions);
      expect(actualResult).toHaveLength(1);

      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(matchOptions(({ instanceFilter }) => instanceFilter === undefined));
    });

    it("passes hierarchy level size limit to presentation manager", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const limit = 999;
      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([createTestECInstancesNode()]), total: 1 });

      provider.hierarchyLevelSizeLimit = limit;
      await provider.getNodes(parentNode);
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(matchOptions(({ sizeLimit }) => sizeLimit === limit));
    });

    it("returns info node if filtered hierarchy level does not have children", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const { filteringInfo } = createInstanceFilteringInfo("prop");
      parentNode.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([]), total: 0 });

      const actualResult = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult).toHaveLength(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).toBe(translate("tree.no-filtered-children"));
    });

    it("returns info node if hierarchy level exceeds given limit", async () => {
      presentationManager.getNodesIterator.mockImplementation(async () => {
        throw new PresentationError(PresentationStatus.ResultSetTooLarge);
      });

      provider.hierarchyLevelSizeLimit = 5;
      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).toHaveLength(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).toContain(
        `${translate("tree.result-limit-exceeded")} ${provider.hierarchyLevelSizeLimit}`,
      );
    });

    it("calls `onHierarchyLimitExceeded` if hierarchy level exceeds given limit", async () => {
      presentationManager.getNodesIterator.mockImplementation(async () => {
        throw new PresentationError(PresentationStatus.ResultSetTooLarge);
      });

      provider.hierarchyLevelSizeLimit = 5;
      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).toHaveLength(1);
      expect(onHierarchyLimitExceededSpy).toHaveBeenCalledOnce();
    });

    it("returns info node on timeout", async () => {
      presentationManager.getNodesIterator.mockImplementation(async () => {
        throw new PresentationError(PresentationStatus.BackendTimeout);
      });

      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).toHaveLength(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).toBe(translate("tree.timeout"));
    });

    it("returns info node on generic error", async () => {
      // stub console log to avoid expected error in console
      const consoleStub = vi.spyOn(console, "error").mockImplementation(() => {});
      presentationManager.getNodesIterator.mockImplementation(async () => {
        throw new Error("test");
      });

      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).toHaveLength(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).toBe(translate("tree.unknown-error"));
      consoleStub.mockRestore();
    });

    it("returns empty result on cancellation", async () => {
      presentationManager.getNodesIterator.mockImplementation(async () => {
        throw new PresentationError(PresentationStatus.Canceled);
      });

      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).toHaveLength(0);
    });
  });

  describe("getFilteredNodes", () => {
    it("returns presentation manager result", async () => {
      const filter = "test_filter";
      presentationManager.getFilteredNodePaths.mockResolvedValue([createTestNodePathElement(), createTestNodePathElement()]);

      const actualResult = await provider.getFilteredNodePaths(filter);
      expect(actualResult).toMatchSnapshot();
      expect(presentationManager.getFilteredNodePaths).toHaveBeenCalledWith(
        matchOptions<GetFilteredNodePathsOptions>((options) => options.filterText === filter),
      );
    });

    it("uses `getFilteredNodePaths` data source override if supplied", async () => {
      const override = vi.fn().mockResolvedValue([]);
      provider = new PresentationTreeDataProvider({ imodel, ruleset: rulesetId, dataSourceOverrides: { getFilteredNodePaths: override } });
      await provider.getFilteredNodePaths("test");
      expect(presentationManager.getFilteredNodePaths).not.toHaveBeenCalled();
      expect(override).toHaveBeenCalledOnce();
    });
  });

  describe("diagnostics", () => {
    it("passes rule diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = vi.fn();

      provider[Symbol.dispose]();
      provider = new PresentationTreeDataProvider({
        imodel,
        ruleset: rulesetId,
        ruleDiagnostics: { severity: "error", handler: diagnosticsHandler },
      });

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([]), total: 0 });
      await provider.getNodesCount();
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(({ diagnostics }) => diagnostics?.editor === "error" && diagnostics.handler === diagnosticsHandler),
      );
    });

    it("passes dev diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = vi.fn();

      provider[Symbol.dispose]();
      provider = new PresentationTreeDataProvider({
        imodel,
        ruleset: rulesetId,
        devDiagnostics: { backendVersion: true, perf: true, severity: "error", handler: diagnosticsHandler },
      });

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([]), total: 0 });
      await provider.getNodesCount();
      expect(presentationManager.getNodesIterator).toHaveBeenCalledWith(
        matchOptions(
          ({ diagnostics }) =>
            diagnostics?.backendVersion === true && diagnostics.perf === true && diagnostics?.dev === "error" && diagnostics.handler === diagnosticsHandler,
        ),
      );
    });
  });

  describe("filterable nodes", () => {
    async function loadDescriptor(filteringInfo: PresentationTreeNodeItemFilteringInfo) {
      assert(filteringInfo.descriptor !== undefined);
      if (filteringInfo.descriptor instanceof Descriptor) {
        return filteringInfo.descriptor;
      }
      return filteringInfo.descriptor();
    }

    it("sets filtering info if nodes supports filtering", async () => {
      const nodes = [createTestECInstancesNode(), createTestECInstancesNode({ supportsFiltering: true })];

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator(nodes), total: 2 });

      const actualResult = await provider.getNodes();
      expect(actualResult).toHaveLength(2);
      expect((actualResult[0] as PresentationTreeNodeItem).filtering).toBeUndefined();
      expect((actualResult[1] as PresentationTreeNodeItem).filtering).toBeDefined();
    });

    it("loads node descriptor for filtering", async () => {
      const nodes = [createTestECInstancesNode({ supportsFiltering: true })];

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator(nodes), total: 2 });
      presentationManager.getNodesDescriptor.mockResolvedValue(createTestContentDescriptor({ fields: [] }));

      const actualResult = await provider.getNodes();
      expect(actualResult).toHaveLength(1);
      const treeItem = actualResult[0] as PresentationTreeNodeItem;
      expect(treeItem.filtering).toBeDefined();
      const descriptor = await loadDescriptor(treeItem.filtering!);
      expect(descriptor).toBeDefined();
    });

    it("throws if cannot load node descriptor for filtering", async () => {
      const nodes = [createTestECInstancesNode({ supportsFiltering: true })];

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator(nodes), total: 2 });
      presentationManager.getNodesDescriptor.mockResolvedValue(undefined);

      const actualResult = await provider.getNodes();
      expect(actualResult).toHaveLength(1);
      const treeItem = actualResult[0] as PresentationTreeNodeItem;
      expect(treeItem.filtering).toBeDefined();
      await expect(loadDescriptor(treeItem.filtering!)).rejects.toThrow();
    });

    it("adds parent filter to grouping node filtering info", async () => {
      const { filterInfo: parentFilterInfo } = createFilterInfo("parentProp");
      const parentTreeNodeItem = createTestTreeNodeItem();
      parentTreeNodeItem.filtering = {
        ancestorFilters: [],
        descriptor: createTestContentDescriptor({ fields: [] }),
        active: parentFilterInfo,
      };
      const groupingNode = createTestECInstancesNode({ key: createTestECClassGroupingNodeKey(), supportsFiltering: true });

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([groupingNode]), total: 1 });

      const result = await provider.getNodes(parentTreeNodeItem);
      const groupingNodeItem = result[0] as PresentationTreeNodeItem;
      expect(groupingNodeItem.filtering?.ancestorFilters).toMatchObject([parentFilterInfo]);
    });

    it("adds grandparent filter to grouping node filtering info", async () => {
      const { filterInfo: grandParentFilterInfo } = createFilterInfo("parentProp");
      const parentTreeNodeItem = createTestTreeNodeItem();
      parentTreeNodeItem.filtering = {
        ancestorFilters: [grandParentFilterInfo],
        descriptor: createTestContentDescriptor({ fields: [] }),
      };
      const groupingNode = createTestECInstancesNode({ key: createTestECClassGroupingNodeKey(), supportsFiltering: true });

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([groupingNode]), total: 1 });

      const result = await provider.getNodes(parentTreeNodeItem);
      const groupingNodeItem = result[0] as PresentationTreeNodeItem;
      expect(groupingNodeItem.filtering?.ancestorFilters).toMatchObject([grandParentFilterInfo]);
    });
  });

  describe("documentation snippets", () => {
    function setupPresentationManager(extendedData: { [key: string]: any }) {
      const node: Node = {
        key: createTestECInstancesNodeKey(),
        label: createTestLabelDefinition(),
        extendedData,
      };

      presentationManager.getNodesIterator.mockResolvedValue({ items: createAsyncIterator([node]), total: 1 });
    }

    it("uses ExtendedDataRule to set tree item icon", async () => {
      const providerProps = {
        imodel,
        ruleset: rulesetId,
      };

      // __PUBLISH_EXTRACT_START__ Presentation.TreeDataProvider.Customization.Icon
      const dataProvider = new PresentationTreeDataProvider({
        ...providerProps,
        customizeTreeNodeItem: (treeNodeItem, node) => {
          treeNodeItem.icon = node.extendedData?.iconName;
        },
      });
      // __PUBLISH_EXTRACT_END__

      setupPresentationManager({ iconName: "custom-icon" });
      const treeNodeItems = await dataProvider.getNodes();
      expect(treeNodeItems).toMatchObject([{ icon: "custom-icon" }]);
    });

    it("uses ExtendedDataRule to set tree item checkbox", async () => {
      const providerProps = {
        imodel,
        ruleset: rulesetId,
      };

      // __PUBLISH_EXTRACT_START__ Presentation.TreeDataProvider.Customization.Checkbox
      const dataProvider = new PresentationTreeDataProvider({
        ...providerProps,
        customizeTreeNodeItem: (treeNodeItem, node) => {
          treeNodeItem.isCheckboxVisible = node.extendedData?.showCheckbox;
          treeNodeItem.checkBoxState = node.extendedData?.isChecked ? CheckBoxState.On : CheckBoxState.Off;
          treeNodeItem.isCheckboxDisabled = node.extendedData?.disableCheckbox;
        },
      });
      // __PUBLISH_EXTRACT_END__

      setupPresentationManager({
        showCheckbox: true,
        isChecked: true,
        disableCheckbox: false,
      });
      const treeNodeItems = await dataProvider.getNodes();
      expect(treeNodeItems).toMatchObject([
        {
          isCheckboxVisible: true,
          checkBoxState: CheckBoxState.On,
          isCheckboxDisabled: false,
        },
      ]);
    });

    it("uses ExtendedDataRule to set tree item style", async () => {
      const providerProps = {
        imodel,
        ruleset: rulesetId,
      };

      // __PUBLISH_EXTRACT_START__ Presentation.TreeDataProvider.Customization.Style
      const dataProvider = new PresentationTreeDataProvider({
        ...providerProps,
        customizeTreeNodeItem: (treeNodeItem, node) => {
          treeNodeItem.style = {
            isBold: node.extendedData?.isBold,
            isItalic: node.extendedData?.isItalic,
            colorOverrides: {
              color: node.extendedData?.color,
            },
          };
        },
      });
      // __PUBLISH_EXTRACT_END__

      setupPresentationManager({
        isBold: true,
        isItalic: false,
        color: 255,
      });
      const treeNodeItems = await dataProvider.getNodes();
      expect(treeNodeItems).toMatchObject([
        {
          style: {
            isBold: true,
            isItalic: false,
            colorOverrides: {
              color: 255,
            },
          },
        },
      ]);
    });
  });
});

function createFilterInfo(
  propName: string,
  usedClasses?: ClassInfo[],
): {
  filterInfo: PresentationInstanceFilterInfo;
  property: PropertyInfo;
} {
  const property = createTestPropertyInfo({ name: propName });
  const field = createTestPropertiesContentField({ properties: [{ property }], name: property.name });
  return {
    filterInfo: {
      filter: {
        field,
        operator: "is-null",
      },
      usedClasses: usedClasses ?? [],
    },
    property,
  };
}

function createInstanceFilteringInfo(currentFilterPropName: string | undefined, ancestorFilterPropNames: string[] = [], usedClasses?: ClassInfo[]) {
  const currentFilter = currentFilterPropName !== undefined ? createFilterInfo(currentFilterPropName, usedClasses) : undefined;
  const ancestorFilters = ancestorFilterPropNames.map((propName) => createFilterInfo(propName, usedClasses));

  const filteringInfo = {
    descriptor: createTestContentDescriptor({ fields: [] }),
    ancestorFilters: ancestorFilters.map((filter) => filter.filterInfo),
    active: currentFilter?.filterInfo,
  };

  const properties = [...ancestorFilters.map((filter) => filter.property), ...(currentFilter ? [currentFilter.property] : [])];
  const filterExpressions = properties.map((prop) => `this.${prop.name} = NULL`);

  if (filterExpressions.length === 0) {
    return {
      filterDefinition: undefined,
      filteringInfo,
    };
  }

  const expression = filterExpressions.length > 1 ? `(${filterExpressions.join(" AND ")})` : filterExpressions[0];

  return {
    filterDefinition: {
      expression,
      selectClassName: properties[0].classInfo.name,
    },
    filteringInfo,
  };
}

function compareKeys(lhs: ECInstancesNodeKey, rhs: ECInstancesNodeKey) {
  return lhs.instanceKeys[0].id === rhs.instanceKeys[0].id;
}

function matchOptions<TOptions = GetNodesOptions>(pred: (options: TOptions) => boolean) {
  return { asymmetricMatch: (actual: unknown) => pred(actual as TOptions) };
}
