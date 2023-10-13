/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import equal from "fast-deep-equal";
import * as sinon from "sinon";
import * as moq from "typemoq";
import { PropertyRecord } from "@itwin/appui-abstract";
import { PageOptions, PropertyFilterRuleOperator } from "@itwin/components-react";
import { assert, BeEvent, Logger } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { CheckBoxState } from "@itwin/core-react";
import {
  Descriptor,
  HierarchyRequestOptions,
  Node,
  NodeKey,
  Paged,
  PresentationError,
  PresentationStatus,
  RegisteredRuleset,
  RulesetVariable,
} from "@itwin/presentation-common";
import { Presentation, PresentationManager, RulesetManager, RulesetVariablesManager } from "@itwin/presentation-frontend";
import { translate } from "../../presentation-components/common/Utils";
import { PresentationTreeDataProvider } from "../../presentation-components/tree/DataProvider";
import {
  PresentationInfoTreeNodeItem,
  PresentationTreeNodeItem,
  PresentationTreeNodeItemFilteringInfo,
} from "../../presentation-components/tree/PresentationTreeNodeItem";
import { pageOptionsUiToPresentation } from "../../presentation-components/tree/Utils";
import { createTestECInstanceKey, createTestPropertyInfo, createTestRuleset } from "../_helpers/Common";
import { createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";
import { createTestECClassGroupingNodeKey, createTestECInstancesNode, createTestECInstancesNodeKey, createTestNodePathElement } from "../_helpers/Hierarchy";
import { createTestLabelDefinition } from "../_helpers/LabelDefinition";
import { PromiseContainer, ResolvablePromise } from "../_helpers/Promises";
import { createTestTreeNodeItem } from "../_helpers/UiComponents";

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

describe("TreeDataProvider", () => {
  const rulesetId: string = "ruleset_id";
  let provider: PresentationTreeDataProvider;
  let onVariableChanged: BeEvent<(variableId: string) => void>;
  const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
  const rulesetVariablesManagerMock = moq.Mock.ofType<RulesetVariablesManager>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();

  beforeEach(() => {
    onVariableChanged = new BeEvent();
    presentationManagerMock.setup((x) => x.vars(moq.It.isAny())).returns(() => rulesetVariablesManagerMock.object);
    rulesetVariablesManagerMock.setup((x) => x.onVariableChanged).returns(() => onVariableChanged);
    sinon.stub(Presentation, "presentation").get(() => presentationManagerMock.object);
    sinon.stub(Presentation, "localization").get(() => new EmptyLocalization());
    provider = new PresentationTreeDataProvider({ imodel: imodelMock.object, ruleset: rulesetId });
  });

  afterEach(() => {
    presentationManagerMock.reset();
    rulesetVariablesManagerMock.reset();
    provider.dispose();
    sinon.restore();
    Presentation.terminate();
  });

  describe("dispose", () => {
    it("disposes registered ruleset", async () => {
      const registerPromise = new ResolvablePromise<RegisteredRuleset>();
      const rulesetsManagerMock = moq.Mock.ofType<RulesetManager>();
      rulesetsManagerMock.setup(async (x) => x.add(moq.It.isAny())).returns(async () => registerPromise);
      presentationManagerMock.setup((x) => x.rulesets()).returns(() => rulesetsManagerMock.object);

      const ruleset = createTestRuleset();
      const p = new PresentationTreeDataProvider({ imodel: imodelMock.object, ruleset });
      const rulesetDisposeSpy = sinon.spy();
      await registerPromise.resolve(new RegisteredRuleset(ruleset, "test", rulesetDisposeSpy));

      expect(rulesetDisposeSpy).to.not.be.called;
      p.dispose();
      expect(rulesetDisposeSpy).to.be.calledOnce;
    });
  });

  describe("rulesetId", () => {
    it("returns rulesetId provider is initialized with", () => {
      expect(provider.rulesetId).to.eq(rulesetId);
    });
  });

  describe("imodel", () => {
    it("returns imodel provider is initialized with", () => {
      expect(provider.imodel).to.eq(imodelMock.object);
    });
  });

  describe("getNodeKey", () => {
    it("returns invalid key for non presentation tree node item", () => {
      const key = provider.getNodeKey({ id: "test_id", label: PropertyRecord.fromString("Test Label") }); // eslint-disable-line deprecation/deprecation
      expect(key.type).to.be.empty;
      expect(key.pathFromRoot).to.be.empty;
      expect(key.version).to.be.eq(0);
    });

    it("returns valid key for presentation tree node item", () => {
      const nodeKey = createTestECInstancesNodeKey();
      const item: PresentationTreeNodeItem = {
        id: "test_id",
        label: PropertyRecord.fromString("Test Label"),
        key: nodeKey,
      };
      expect(provider.getNodeKey(item)).to.be.eq(nodeKey); // eslint-disable-line deprecation/deprecation
    });
  });

  describe("getNodesCount", () => {
    it("returns presentation manager result through `getNodesAndCount`", async () => {
      const resultNodes = [createTestECInstancesNodeWithId("0x1"), createTestECInstancesNodeWithId("0x2")];
      const parentKey = createTestECInstancesNodeKeyWithId("0x3");
      const parentNode = createTestTreeNodeItem(parentKey);
      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, parentKey }))
        .returns(async () => ({ nodes: resultNodes, count: resultNodes.length }))
        .verifiable();
      const actualResult = await provider.getNodesCount(parentNode);
      expect(actualResult).to.eq(resultNodes.length);
      presentationManagerMock.verifyAll();
    });

    it("memoizes result", async () => {
      const parentKeys = [createTestECInstancesNodeKeyWithId("0x1"), createTestECInstancesNodeKeyWithId("0x2")];
      const parentNodes = parentKeys.map((key, i) => createTestTreeNodeItem(key, { id: `node_id_${i}` }));
      const resultContainers = [new PromiseContainer<{ nodes: Node[]; count: number }>(), new PromiseContainer<{ nodes: Node[]; count: number }>()];

      presentationManagerMock

        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, paging: { start: 0, size: 10 }, parentKey: parentKeys[0] }))
        .returns(async () => resultContainers[0].promise)
        .verifiable(moq.Times.once());
      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, paging: { start: 0, size: 10 }, parentKey: parentKeys[1] }))
        .returns(async () => resultContainers[1].promise)
        .verifiable(moq.Times.once());

      provider.pagingSize = 10;
      const promises = [provider.getNodesCount(parentNodes[0]), provider.getNodesCount(parentNodes[0]), provider.getNodesCount(parentNodes[1])];
      resultContainers.forEach((c, index) => c.resolve({ nodes: [createTestECInstancesNode(), createTestECInstancesNode()], count: index }));
      const results = await Promise.all(promises);
      expect(results[0]).to.eq(results[1]).to.eq(0);
      expect(results[2]).to.eq(1);

      presentationManagerMock.verifyAll();
    });

    it("clears memoized result when ruleset variables changes", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, paging: { start: 0, size: 10 }, parentKey }))
        .returns(async () => ({ nodes: [createTestECInstancesNode(), createTestECInstancesNode()], count: 2 }))
        .verifiable(moq.Times.exactly(2));

      provider.pagingSize = 10;
      await provider.getNodesCount(parentNode);
      onVariableChanged.raiseEvent("testVar");
      await provider.getNodesCount(parentNode);

      presentationManagerMock.verifyAll();
    });

    it("passes instance filter to presentation manager", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);

      const { filterDefinition, filteringInfo } = createInstanceFilteringInfo("prop1");
      parentNode.filtering = filteringInfo;

      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount(is({ imodel: imodelMock.object, rulesetOrId: rulesetId, parentKey, instanceFilter: filterDefinition })))
        .returns(async () => ({ nodes: [createTestECInstancesNode()], count: 1 }))
        .verifiable();

      const actualResult = await provider.getNodesCount(parentNode);
      expect(actualResult).to.eq(1);
      presentationManagerMock.verifyAll();
    });
  });

  describe("getNodes", () => {
    it("returns presentation manager result", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const pageOptions: PageOptions = { start: 0, size: 5 };
      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, paging: pageOptionsUiToPresentation(pageOptions), parentKey }),
        )
        .returns(async () => ({ nodes: [createTestECInstancesNode(), createTestECInstancesNode()], count: 2 }))
        .verifiable();
      const actualResult = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult).to.matchSnapshot();
      presentationManagerMock.verifyAll();
    });

    it("memoizes result", async () => {
      const parentKeys = [createTestECInstancesNodeKeyWithId("0x1"), createTestECInstancesNodeKeyWithId("0x2")];
      const parentNodes = parentKeys.map((key, i) => createTestTreeNodeItem(key, { id: `node_id_${i}` }));
      const resultNodesFirstPageContainer0 = new PromiseContainer<{ nodes: Node[]; count: number }>();
      const resultNodesFirstPageContainer1 = new PromiseContainer<{ nodes: Node[]; count: number }>();
      const resultNodesNonFirstPageContainer = new PromiseContainer<{ nodes: Node[]; count: number }>();

      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, parentKey: parentKeys[0] }))
        .returns(async () => resultNodesFirstPageContainer0.promise)
        .verifiable(moq.Times.once());
      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, paging: { start: 0, size: 0 }, parentKey: parentKeys[0] }))
        .verifiable(moq.Times.never());
      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, paging: { start: 1, size: 0 }, parentKey: parentKeys[0] }))
        .returns(async () => resultNodesNonFirstPageContainer.promise)
        .verifiable(moq.Times.once());
      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, paging: { start: 0, size: 1 }, parentKey: parentKeys[1] }))
        .returns(async () => resultNodesFirstPageContainer1.promise)
        .verifiable(moq.Times.once());

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
      resultNodesFirstPageContainer0.resolve({ nodes: [createTestECInstancesNode()], count: 1 });
      resultNodesFirstPageContainer1.resolve({ nodes: [createTestECInstancesNode()], count: 1 });
      resultNodesNonFirstPageContainer.resolve({ nodes: [createTestECInstancesNode()], count: 1 });
      const results = await Promise.all(promises);

      expect(results[0]).to.eq(results[1], "results[0] should eq results[1]");
      expect(results[2]).to.eq(results[3], "results[2] should eq results[3]").to.eq(results[0], "both results[2] and results[3] should eq results[0]");
      expect(results[4]).to.eq(results[5], "results[4] should eq results[5]");
      expect(results[6]).to.eq(results[7], "results[6] should eq results[7]");

      presentationManagerMock.verifyAll();
    });

    it("uses `getNodesAndCount` data source override if supplied", async () => {
      const override = sinon.mock().resolves({ count: 0, nodes: [] });
      provider = new PresentationTreeDataProvider({ imodel: imodelMock.object, ruleset: rulesetId, dataSourceOverrides: { getNodesAndCount: override } });
      await provider.getNodes();
      presentationManagerMock.verify(async (x) => x.getNodesAndCount(moq.It.isAny()), moq.Times.never());
      expect(override).to.be.calledOnce;
    });

    it("logs a warning when requesting nodes and pagingSize is not the same as passed pageOptions", async () => {
      const pageOptions: PageOptions = { start: 0, size: 10 };
      const loggerSpy = sinon.spy(Logger, "logWarning");
      const result = { nodes: [createTestECInstancesNode(), createTestECInstancesNode()], count: 2 };
      presentationManagerMock.setup(async (x) => x.getNodesAndCount(moq.It.isAny())).returns(async () => result);

      // Paging size is not set and pageOptions are passed
      await provider.getNodes(undefined, pageOptions);
      expect(loggerSpy.calledOnce).to.be.true;
      loggerSpy.resetHistory();

      // Paging size is set and no pageOptions are passed
      provider.pagingSize = 10;
      await provider.getNodes();
      expect(loggerSpy.notCalled).to.be.true;
      loggerSpy.resetHistory();

      // Paging size is set and pageOptions are passed but not equal to paging size
      provider.pagingSize = 20;
      await provider.getNodes(undefined, pageOptions);
      expect(loggerSpy.calledOnce).to.be.true;
      loggerSpy.resetHistory();

      // Paging size is set and pageOptions are passed and equal to paging size
      provider.pagingSize = 10;
      await provider.getNodes(undefined, pageOptions);
      expect(loggerSpy.notCalled).to.be.true;
    });

    it("passes instance filter to presentation manager", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const { filterDefinition: instanceFilter0, filteringInfo: filteringInfo0 } = createInstanceFilteringInfo("prop");
      parentNode.filtering = filteringInfo0;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount(
            is({
              imodel: imodelMock.object,
              rulesetOrId: rulesetId,
              paging: pageOptionsUiToPresentation(pageOptions),
              parentKey,
              instanceFilter: instanceFilter0,
            }),
          ),
        )
        .returns(async () => ({ nodes: [createTestECInstancesNode()], count: 1 }))
        .verifiable();

      const actualResult0 = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult0).to.have.lengthOf(1);

      const { filterDefinition: instanceFilter1, filteringInfo: filteringInfo1 } = createInstanceFilteringInfo("prop2");
      parentNode.filtering = filteringInfo1;
      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount(
            is({
              imodel: imodelMock.object,
              rulesetOrId: rulesetId,
              paging: pageOptionsUiToPresentation(pageOptions),
              parentKey,
              instanceFilter: instanceFilter1,
            }),
          ),
        )
        .returns(async () => ({ nodes: [createTestECInstancesNode(), createTestECInstancesNode()], count: 2 }))
        .verifiable();

      const actualResult1 = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult1).to.have.lengthOf(2);

      presentationManagerMock.verifyAll();
    });

    it("passes parent instance filter to presentation manager", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      const { filterDefinition, filteringInfo } = createInstanceFilteringInfo(undefined, ["parentProp"]);
      nodeItem.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount(
            is({
              imodel: imodelMock.object,
              rulesetOrId: rulesetId,
              paging: pageOptionsUiToPresentation(pageOptions),
              parentKey: nodeKey,
              instanceFilter: filterDefinition,
            }),
          ),
        )
        .returns(async () => ({ nodes: [createTestECInstancesNode()], count: 1 }))
        .verifiable();

      const actualResult = await provider.getNodes(nodeItem, pageOptions);
      expect(actualResult).to.have.lengthOf(1);

      presentationManagerMock.verifyAll();
    });

    it("passes combined parent and current node instance filter to presentation manager", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      const { filterDefinition, filteringInfo } = createInstanceFilteringInfo("prop", ["parentProp"]);
      nodeItem.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount(
            is({
              imodel: imodelMock.object,
              rulesetOrId: rulesetId,
              paging: pageOptionsUiToPresentation(pageOptions),
              parentKey: nodeKey,
              instanceFilter: filterDefinition,
            }),
          ),
        )
        .returns(async () => ({ nodes: [createTestECInstancesNode()], count: 1 }))
        .verifiable();

      const actualResult = await provider.getNodes(nodeItem, pageOptions);
      expect(actualResult).to.have.lengthOf(1);

      presentationManagerMock.verifyAll();
    });

    it("passes empty instance filter to manager if there are no ancestor and active filters", async () => {
      const nodeKey = createTestECInstancesNodeKey();
      const nodeItem = createTestTreeNodeItem(nodeKey);
      const { filteringInfo } = createInstanceFilteringInfo(undefined, []);
      nodeItem.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount(
            is({
              imodel: imodelMock.object,
              rulesetOrId: rulesetId,
              paging: pageOptionsUiToPresentation(pageOptions),
              parentKey: nodeKey,
              instanceFilter: undefined,
            }),
          ),
        )
        .returns(async () => ({ nodes: [createTestECInstancesNode()], count: 1 }))
        .verifiable();

      const actualResult = await provider.getNodes(nodeItem, pageOptions);
      expect(actualResult).to.have.lengthOf(1);

      presentationManagerMock.verifyAll();
    });

    it("passes hierarchy level size limit to presentation manager", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const limit = 999;
      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount(is({ imodel: imodelMock.object, rulesetOrId: rulesetId, parentKey, sizeLimit: limit })))
        .returns(async () => ({ nodes: [], count: 0 }))
        .verifiable();
      provider.hierarchyLevelSizeLimit = limit;
      await provider.getNodes(parentNode);
      presentationManagerMock.verifyAll();
    });

    it("returns info node if filtered hierarchy level does not have children", async () => {
      const parentKey = createTestECInstancesNodeKey();
      const parentNode = createTestTreeNodeItem(parentKey);
      const { filterDefinition, filteringInfo } = createInstanceFilteringInfo("prop");
      parentNode.filtering = filteringInfo;

      const pageOptions: PageOptions = { start: 0, size: 2 };
      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount(
            is({
              imodel: imodelMock.object,
              rulesetOrId: rulesetId,
              paging: pageOptionsUiToPresentation(pageOptions),
              parentKey,
              instanceFilter: filterDefinition,
            }),
          ),
        )
        .returns(async () => ({ nodes: [], count: 0 }));

      const actualResult = await provider.getNodes(parentNode, pageOptions);
      expect(actualResult).to.have.lengthOf(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).to.eq(translate("tree.no-filtered-children"));
    });

    it("returns info node if hierarchy level exceeds given limit when hierarchy limit is unknown", async () => {
      const presentationManager = {
        getNodesAndCount: sinon
          .stub<Parameters<PresentationManager["getNodesAndCount"]>, ReturnType<PresentationManager["getNodesAndCount"]>>()
          .callsFake(async () => {
            throw new PresentationError(PresentationStatus.ResultSetTooLarge);
          }),
      };

      sinon.stub(Presentation, "presentation").get(() => presentationManager);
      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).to.have.lengthOf(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).to.eq(translate("tree.result-limit-exceeded.limit-unknown"));
    });

    it("returns info node if hierarchy level exceeds given limit when limit is known", async () => {
      const presentationManager = {
        getNodesAndCount: sinon
          .stub<Parameters<PresentationManager["getNodesAndCount"]>, ReturnType<PresentationManager["getNodesAndCount"]>>()
          .callsFake(async () => {
            throw new PresentationError(PresentationStatus.ResultSetTooLarge);
          }),
      };

      sinon.stub(Presentation, "presentation").get(() => presentationManager);
      provider.hierarchyLevelSizeLimit = 5;
      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).to.have.lengthOf(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).to.eq(
        `${translate("tree.result-limit-exceeded.limit-known")} ${provider.hierarchyLevelSizeLimit}`,
      );
    });

    it("returns info node on timeout", async () => {
      const presentationManager = {
        getNodesAndCount: sinon
          .stub<Parameters<PresentationManager["getNodesAndCount"]>, ReturnType<PresentationManager["getNodesAndCount"]>>()
          .callsFake(async () => {
            throw new PresentationError(PresentationStatus.BackendTimeout);
          }),
      };

      sinon.stub(Presentation, "presentation").get(() => presentationManager);
      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).to.have.lengthOf(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).to.eq(translate("tree.timeout"));
    });

    it("returns info node on generic error", async () => {
      const presentationManager = {
        getNodesAndCount: sinon
          .stub<Parameters<PresentationManager["getNodesAndCount"]>, ReturnType<PresentationManager["getNodesAndCount"]>>()
          .callsFake(async () => {
            throw new Error("test");
          }),
      };

      sinon.stub(Presentation, "presentation").get(() => presentationManager);
      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).to.have.lengthOf(1);
      expect((actualResult[0] as PresentationInfoTreeNodeItem).message).to.eq(translate("tree.unknown-error"));
    });

    it("returns empty result on cancellation", async () => {
      const presentationManager = {
        getNodesAndCount: sinon
          .stub<Parameters<PresentationManager["getNodesAndCount"]>, ReturnType<PresentationManager["getNodesAndCount"]>>()
          .callsFake(async () => {
            throw new PresentationError(PresentationStatus.Canceled);
          }),
      };

      sinon.stub(Presentation, "presentation").get(() => presentationManager);
      const actualResult = await provider.getNodes(undefined);
      expect(actualResult).to.have.lengthOf(0);
    });
  });

  describe("getFilteredNodes", () => {
    it("returns presentation manager result", async () => {
      const filter = "test_filter";
      presentationManagerMock
        .setup(async (x) => x.getFilteredNodePaths({ imodel: imodelMock.object, rulesetOrId: rulesetId, filterText: filter }))
        .returns(async () => [createTestNodePathElement(), createTestNodePathElement()])
        .verifiable();
      const actualResult = await provider.getFilteredNodePaths(filter);
      expect(actualResult).to.matchSnapshot();
      presentationManagerMock.verifyAll();
    });

    it("uses `getFilteredNodePaths` data source override if supplied", async () => {
      const override = sinon.mock().resolves([]);
      provider = new PresentationTreeDataProvider({ imodel: imodelMock.object, ruleset: rulesetId, dataSourceOverrides: { getFilteredNodePaths: override } });
      await provider.getFilteredNodePaths("test");
      presentationManagerMock.verify(async (x) => x.getFilteredNodePaths(moq.It.isAny()), moq.Times.never());
      expect(override).to.be.calledOnce;
    });
  });

  describe("diagnostics", () => {
    it("passes rule diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = sinon.stub();

      provider.dispose();
      provider = new PresentationTreeDataProvider({
        imodel: imodelMock.object,
        ruleset: rulesetId,
        ruleDiagnostics: { severity: "error", handler: diagnosticsHandler },
      });

      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId, diagnostics: { editor: "error", handler: diagnosticsHandler } }),
        )
        .returns(async () => ({ nodes: [], count: 0 }))
        .verifiable();
      await provider.getNodesCount();
      presentationManagerMock.verifyAll();
    });

    it("passes dev diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = sinon.stub();

      provider.dispose();
      provider = new PresentationTreeDataProvider({
        imodel: imodelMock.object,
        ruleset: rulesetId,
        devDiagnostics: { backendVersion: true, perf: true, severity: "error", handler: diagnosticsHandler },
      });

      presentationManagerMock
        .setup(async (x) =>
          x.getNodesAndCount({
            imodel: imodelMock.object,
            rulesetOrId: rulesetId,
            diagnostics: { backendVersion: true, perf: true, dev: "error", handler: diagnosticsHandler },
          }),
        )
        .returns(async () => ({ nodes: [], count: 0 }))
        .verifiable();
      await provider.getNodesCount();
      presentationManagerMock.verifyAll();
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

      presentationManagerMock.setup(async (x) => x.getNodesAndCount(moq.It.isAny())).returns(async () => ({ nodes, count: 0 }));

      const actualResult = await provider.getNodes();
      expect(actualResult).to.have.lengthOf(2);
      expect((actualResult[0] as PresentationTreeNodeItem).filtering).to.be.undefined;
      expect((actualResult[1] as PresentationTreeNodeItem).filtering).to.not.be.undefined;
    });

    it("loads node descriptor for filtering", async () => {
      const nodes = [createTestECInstancesNode({ supportsFiltering: true })];

      presentationManagerMock.setup(async (x) => x.getNodesAndCount(moq.It.isAny())).returns(async () => ({ nodes, count: 0 }));

      presentationManagerMock
        .setup(async (x) => x.getNodesDescriptor({ imodel: imodelMock.object, rulesetOrId: rulesetId, parentKey: nodes[0].key }))
        .returns(async () => createTestContentDescriptor({ fields: [] }));

      const actualResult = await provider.getNodes();
      expect(actualResult).to.have.lengthOf(1);
      const treeItem = actualResult[0] as PresentationTreeNodeItem;
      expect(treeItem.filtering).to.not.be.undefined;
      const descriptor = await loadDescriptor(treeItem.filtering!);
      expect(descriptor).to.not.be.undefined;
    });

    it("throws if cannot load node descriptor for filtering", async () => {
      const nodes = [createTestECInstancesNode({ supportsFiltering: true })];

      presentationManagerMock.setup(async (x) => x.getNodesAndCount(moq.It.isAny())).returns(async () => ({ nodes, count: 0 }));

      presentationManagerMock
        .setup(async (x) => x.getNodesDescriptor({ imodel: imodelMock.object, rulesetOrId: rulesetId, parentKey: nodes[0].key }))
        .returns(async () => undefined);

      const actualResult = await provider.getNodes();
      expect(actualResult).to.have.lengthOf(1);
      const treeItem = actualResult[0] as PresentationTreeNodeItem;
      expect(treeItem.filtering).to.not.be.undefined;
      await expect(loadDescriptor(treeItem.filtering!)).to.eventually.be.rejected;
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

      presentationManagerMock.setup(async (x) => x.getNodesAndCount(moq.It.isAny())).returns(async () => ({ nodes: [groupingNode], count: 1 }));

      const result = await provider.getNodes(parentTreeNodeItem);
      const groupingNodeItem = result[0] as PresentationTreeNodeItem;
      expect(groupingNodeItem.filtering?.ancestorFilters).to.have.lengthOf(1).and.containSubset([parentFilterInfo]);
    });

    it("adds grandparent filter to grouping node filtering info", async () => {
      const { filterInfo: grandParentFilterInfo } = createFilterInfo("parentProp");
      const parentTreeNodeItem = createTestTreeNodeItem();
      parentTreeNodeItem.filtering = {
        ancestorFilters: [grandParentFilterInfo],
        descriptor: createTestContentDescriptor({ fields: [] }),
      };
      const groupingNode = createTestECInstancesNode({ key: createTestECClassGroupingNodeKey(), supportsFiltering: true });

      presentationManagerMock.setup(async (x) => x.getNodesAndCount(moq.It.isAny())).returns(async () => ({ nodes: [groupingNode], count: 1 }));

      const result = await provider.getNodes(parentTreeNodeItem);
      const groupingNodeItem = result[0] as PresentationTreeNodeItem;
      expect(groupingNodeItem.filtering?.ancestorFilters).to.have.lengthOf(1).and.containSubset([grandParentFilterInfo]);
    });
  });

  describe("documentation snippets", () => {
    function mockPresentationManager(extendedData: { [key: string]: any }) {
      const node: Node = {
        key: createTestECInstancesNodeKey(),
        label: createTestLabelDefinition(),
        extendedData,
      };

      presentationManagerMock
        .setup(async (x) => x.getNodesAndCount({ imodel: imodelMock.object, rulesetOrId: rulesetId }))
        .returns(async () => ({ nodes: [node], count: 1 }));
    }

    it("uses ExtendedDataRule to set tree item icon", async () => {
      const providerProps = {
        imodel: imodelMock.object,
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

      mockPresentationManager({ iconName: "custom-icon" });
      const treeNodeItems = await dataProvider.getNodes();
      expect(treeNodeItems)
        .to.be.lengthOf(1)
        .and.to.containSubset([{ icon: "custom-icon" }]);
    });

    it("uses ExtendedDataRule to set tree item checkbox", async () => {
      const providerProps = {
        imodel: imodelMock.object,
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

      mockPresentationManager({
        showCheckbox: true,
        isChecked: true,
        disableCheckbox: false,
      });
      const treeNodeItems = await dataProvider.getNodes();
      expect(treeNodeItems)
        .to.be.lengthOf(1)
        .and.to.containSubset([
          {
            isCheckboxVisible: true,
            checkBoxState: CheckBoxState.On,
            isCheckboxDisabled: false,
          },
        ]);
    });

    it("uses ExtendedDataRule to set tree item style", async () => {
      const providerProps = {
        imodel: imodelMock.object,
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

      mockPresentationManager({
        isBold: true,
        isItalic: false,
        color: 255,
      });
      const treeNodeItems = await dataProvider.getNodes();
      expect(treeNodeItems)
        .to.be.lengthOf(1)
        .and.to.containSubset([
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

function is(expected: Paged<HierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>> & { sizeLimit?: number }) {
  return moq.It.is((options: Paged<HierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable>> & { sizeLimit?: number }) => {
    return (
      equal(options.imodel, expected.imodel) &&
      equal(options.rulesetOrId, expected.rulesetOrId) &&
      equal(options.parentKey, expected.parentKey) &&
      equal(options.paging, expected.paging) &&
      equal(options.sizeLimit, expected.sizeLimit) &&
      options.instanceFilter?.expression === expected.instanceFilter?.expression
    );
  });
}

function createFilterInfo(propName: string) {
  const property = createTestPropertyInfo({ name: propName });
  const field = createTestPropertiesContentField({ properties: [{ property }], name: property.name });
  return {
    filterInfo: {
      filter: {
        field,
        operator: PropertyFilterRuleOperator.IsNull,
      },
      usedClasses: [],
    },
    property,
  };
}

function createInstanceFilteringInfo(currentFilterPropName: string | undefined, ancestorFilterPropNames: string[] = []) {
  const currentFilter = currentFilterPropName !== undefined ? createFilterInfo(currentFilterPropName) : undefined;
  const ancestorFilters = ancestorFilterPropNames.map((propName) => createFilterInfo(propName));

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
