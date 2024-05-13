/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { from } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { createDefaultValueFormatter, ILogger, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { ProcessedHierarchyNode } from "../../../hierarchies/HierarchyNode";
import { createGroupingHandlers, createGroupingOperator, GroupingHandlerResult, LOGGING_NAMESPACE } from "../../../hierarchies/internal/operators/Grouping";
import * as autoExpand from "../../../hierarchies/internal/operators/grouping/AutoExpand";
import * as baseClassGrouping from "../../../hierarchies/internal/operators/grouping/BaseClassGrouping";
import * as classGrouping from "../../../hierarchies/internal/operators/grouping/ClassGrouping";
import * as groupHiding from "../../../hierarchies/internal/operators/grouping/GroupHiding";
import * as labelGrouping from "../../../hierarchies/internal/operators/grouping/LabelGrouping";
import * as propertiesGrouping from "../../../hierarchies/internal/operators/grouping/PropertiesGrouping";
import { setLogger } from "../../../hierarchies/Logging";
import {
  createIModelAccessStub,
  createTestProcessedCustomNode,
  createTestProcessedGroupingNode,
  createTestProcessedInstanceNode,
  setupLogging,
  testLocalizedStrings,
} from "../../Utils";

describe("Grouping", () => {
  const imodelAccess = createIModelAccessStub();
  let formatter: IPrimitiveValueFormatter;

  before(() => {
    formatter = createDefaultValueFormatter();
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("createGroupingOperator", () => {
    let assignAutoExpandStub: sinon.SinonStub;
    let applyGroupingHidingParamsStub: sinon.SinonStub<[GroupingHandlerResult, number], GroupingHandlerResult>;
    beforeEach(() => {
      applyGroupingHidingParamsStub = sinon.stub(groupHiding, "applyGroupHidingParams").callsFake((props) => props);
      assignAutoExpandStub = sinon.stub(autoExpand, "assignAutoExpand").callsFake((props) => props);
    });

    it("doesn't change input nodes when grouping handlers list is empty", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x2" }] },
          label: "1",
        }),
      ];

      const result = await collect(from(nodes).pipe(createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, undefined, [])));
      expect(result).to.deep.eq(nodes);
    });

    it("doesn't change input nodes when grouping handlers don't group", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x2" }] },
          label: "1",
        }),
      ];

      const result = await collect(
        from(nodes).pipe(
          createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, undefined, [
            async (allNodes) => ({ grouped: [], ungrouped: allNodes, groupingType: "label" }),
            async (allNodes) => ({ grouped: [], ungrouped: allNodes, groupingType: "class" }),
          ]),
        ),
      );
      expect(applyGroupingHidingParamsStub.callCount).to.eq(2);
      expect(applyGroupingHidingParamsStub.firstCall).to.be.calledWith({ grouped: [], ungrouped: nodes, groupingType: "label" });
      expect(applyGroupingHidingParamsStub.secondCall).to.be.calledWith({ grouped: [], ungrouped: nodes, groupingType: "class" });
      expect(assignAutoExpandStub.callCount).to.eq(2);
      expect(assignAutoExpandStub.firstCall).to.be.calledWith({ grouped: [], ungrouped: nodes, groupingType: "label" });
      expect(assignAutoExpandStub.secondCall).to.be.calledWith({ grouped: [], ungrouped: nodes, groupingType: "class" });
      expect(result).to.deep.eq(nodes);
    });

    it("runs grouping handlers in provided order", async () => {
      const instanceNode1 = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
      });
      const instanceNode2 = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        label: "2",
      });
      const classGroupingResult: GroupingHandlerResult = {
        groupingType: "class",
        grouped: [
          createTestProcessedGroupingNode({
            label: "TestSchema A",
            key: {
              type: "class-grouping",
              className: "TestSchema A",
            },
            groupedInstanceKeys: instanceNode1.key.instanceKeys,
            children: [instanceNode1],
          }),
        ],
        ungrouped: [instanceNode2],
      };
      const labelGroupingResult: GroupingHandlerResult = {
        groupingType: "label",
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping" as const,
              label: "1",
            },
            groupedInstanceKeys: instanceNode2.key.instanceKeys,
            children: [instanceNode2],
          }),
        ],
        ungrouped: [],
      };

      const result = await collect(
        from([instanceNode1, instanceNode2]).pipe(
          createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, undefined, [
            async () => classGroupingResult,
            async () => labelGroupingResult,
          ]),
        ),
      );
      expect(applyGroupingHidingParamsStub.callCount).to.eq(2);
      expect(applyGroupingHidingParamsStub.firstCall).to.be.calledWith(classGroupingResult);
      expect(applyGroupingHidingParamsStub.secondCall).to.be.calledWith(labelGroupingResult);

      expect(result).to.deep.eq([
        createTestProcessedGroupingNode({
          label: "TestSchema A",
          key: {
            type: "class-grouping",
            className: "TestSchema A",
          },
          groupedInstanceKeys: instanceNode1.key.instanceKeys,
          children: [instanceNode1],
        }),
        createTestProcessedGroupingNode({
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          groupedInstanceKeys: instanceNode2.key.instanceKeys,
          children: [instanceNode2],
        }),
      ]);
    });

    it("assigns `nonGroupingAncestor` from parent custom node", async () => {
      const parentNode = createTestProcessedCustomNode();
      const groupedNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
      });
      const labelGroupingNode = createTestProcessedGroupingNode({
        label: "1",
        key: {
          type: "label-grouping" as const,
          label: "1",
        },
        groupedInstanceKeys: groupedNode.key.instanceKeys,
        children: [groupedNode],
      });

      const result = await collect(
        from([groupedNode]).pipe(
          createGroupingOperator(imodelAccess, parentNode, formatter, testLocalizedStrings, undefined, [
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );
      expect(result).to.deep.eq([
        createTestProcessedGroupingNode({
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          nonGroupingAncestor: parentNode,
          groupedInstanceKeys: groupedNode.key.instanceKeys,
          children: [groupedNode],
        }),
      ]);
    });

    it("assigns `nonGroupingAncestor` from parent non-grouping node", async () => {
      const parentNode = createTestProcessedInstanceNode();
      const groupedNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
      });
      const labelGroupingNode = createTestProcessedGroupingNode({
        label: "1",
        key: {
          type: "label-grouping" as const,
          label: "1",
        },
        groupedInstanceKeys: groupedNode.key.instanceKeys,
        children: [groupedNode],
      });

      const result = await collect(
        from([groupedNode]).pipe(
          createGroupingOperator(imodelAccess, parentNode, formatter, testLocalizedStrings, undefined, [
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );
      expect(result).to.deep.eq([
        createTestProcessedGroupingNode({
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          nonGroupingAncestor: parentNode,
          groupedInstanceKeys: groupedNode.key.instanceKeys,
          children: [groupedNode],
        }),
      ]);
    });

    it("assigns `nonGroupingAncestor` from parent grouping node", async () => {
      const nonGroupingAncestor = createTestProcessedCustomNode();
      const parentNode = createTestProcessedGroupingNode({ nonGroupingAncestor });
      const groupedNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
      });
      const labelGroupingNode = createTestProcessedGroupingNode({
        label: "1",
        key: {
          type: "label-grouping" as const,
          label: "1",
        },
        groupedInstanceKeys: groupedNode.key.instanceKeys,
        children: [groupedNode],
      });

      const result = await collect(
        from([groupedNode]).pipe(
          createGroupingOperator(imodelAccess, parentNode, formatter, testLocalizedStrings, undefined, [
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );
      expect(result).to.deep.eq([
        createTestProcessedGroupingNode({
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          nonGroupingAncestor,
          groupedInstanceKeys: groupedNode.key.instanceKeys,
          children: [groupedNode],
        }),
      ]);
    });

    it("calls `onGroupingNodeCreated` callback argument for each grouping node", async () => {
      const groupedNode1 = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
      });
      const groupedNode2 = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        label: "2",
      });
      const classGroupingNode = createTestProcessedGroupingNode({
        label: "TestSchema A",
        key: {
          type: "class-grouping" as const,
          className: "TestSchema A",
        },
        groupedInstanceKeys: groupedNode1.key.instanceKeys,
        children: [groupedNode1],
      });
      const labelGroupingNode = createTestProcessedGroupingNode({
        label: "2",
        key: {
          type: "label-grouping" as const,
          label: "2",
        },
        groupedInstanceKeys: groupedNode2.key.instanceKeys,
        children: [groupedNode2],
      });

      const onGroupingNodeCreated = sinon.spy();
      const result = await collect(
        from([groupedNode1, groupedNode2]).pipe(
          createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, onGroupingNodeCreated, [
            async () => ({
              groupingType: "class",
              grouped: [classGroupingNode],
              ungrouped: [groupedNode2],
            }),
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );

      expect(onGroupingNodeCreated).to.be.calledTwice;
      expect(onGroupingNodeCreated.firstCall).to.be.calledWith(classGroupingNode);
      expect(onGroupingNodeCreated.secondCall).to.be.calledWith(labelGroupingNode);

      expect(result).to.deep.eq([classGroupingNode, labelGroupingNode]);
    });

    it("logs when main thread released", async () => {
      const logger = {
        logTrace: sinon.spy(),
        isEnabled: () => true,
      } as unknown as ILogger;
      setLogger(logger);

      const nodes: ProcessedHierarchyNode[] = [];
      for (let i = 1; i <= 100; i++) {
        nodes.push(
          createTestProcessedInstanceNode({
            key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: `0x${i.toString(16)}` }] },
            label: `${i}`,
          }),
        );
      }

      await collect(from(nodes).pipe(createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, undefined, [])));

      expect(logger.logTrace).to.be.calledWith("Presentation.Hierarchies", "Releasing main thread");
    });
  });

  describe("createGroupingHandlers", () => {
    let createBaseClassGroupingHandlersStub: sinon.SinonStub;
    let createPropertiesGroupingHandlersStub: sinon.SinonStub;
    let baseClassHandlerStub: sinon.SinonStub;
    let propertyHandlerStub: sinon.SinonStub;
    let createClassGroupsStub: sinon.SinonStub;
    let createLabelGroupsStub: sinon.SinonStub;

    beforeEach(() => {
      baseClassHandlerStub = sinon.stub();
      propertyHandlerStub = sinon.stub();
      createBaseClassGroupingHandlersStub = sinon.stub(baseClassGrouping, "createBaseClassGroupingHandlers").resolves([baseClassHandlerStub]);
      createPropertiesGroupingHandlersStub = sinon.stub(propertiesGrouping, "createPropertiesGroupingHandlers").resolves([propertyHandlerStub]);
      createClassGroupsStub = sinon.stub(classGrouping, "createClassGroups");
      createLabelGroupsStub = sinon.stub(labelGrouping, "createLabelGroups");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("creates [base class, class, property, label] grouping handlers when requesting root nodes", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
      ];

      const result = await collect(createGroupingHandlers(imodelAccess, undefined, nodes, formatter, testLocalizedStrings));
      expect(createBaseClassGroupingHandlersStub.callCount).to.eq(1);
      expect(createBaseClassGroupingHandlersStub.firstCall).to.be.calledWith(imodelAccess, undefined, nodes);

      expect(createPropertiesGroupingHandlersStub.callCount).to.eq(1);
      expect(createPropertiesGroupingHandlersStub.firstCall).to.be.calledWith(imodelAccess, undefined, nodes, formatter, testLocalizedStrings);

      expect(result.length).to.eq(4);

      expect(baseClassHandlerStub.callCount).to.eq(0);
      await result[0]([], []);
      expect(baseClassHandlerStub.callCount).to.eq(1);

      expect(createClassGroupsStub.callCount).to.eq(0);
      await result[1]([], []);
      expect(createClassGroupsStub.callCount).to.eq(1);

      expect(propertyHandlerStub.callCount).to.eq(0);
      await result[2]([], []);
      expect(propertyHandlerStub.callCount).to.eq(1);

      expect(createLabelGroupsStub.callCount).to.eq(0);
      await result[3]([], []);
      expect(createLabelGroupsStub.callCount).to.eq(1);
    });

    it("creates [base class, class, property, label] grouping handlers when requesting class grouping node children", async () => {
      const parentNode = createTestProcessedGroupingNode({
        key: {
          type: "class-grouping",
          className: "test.class",
        },
      });
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
      ];

      const result = await collect(createGroupingHandlers(imodelAccess, parentNode, nodes, formatter, testLocalizedStrings));

      expect(createBaseClassGroupingHandlersStub.callCount).to.eq(1);
      expect(createBaseClassGroupingHandlersStub.firstCall).to.be.calledWith(imodelAccess, parentNode, nodes);

      expect(createPropertiesGroupingHandlersStub.callCount).to.eq(1);
      expect(createPropertiesGroupingHandlersStub.firstCall).to.be.calledWith(imodelAccess, parentNode, nodes, formatter, testLocalizedStrings);

      expect(result.length).to.eq(4);

      expect(baseClassHandlerStub.callCount).to.eq(0);
      await result[0]([], []);
      expect(baseClassHandlerStub.callCount).to.eq(1);

      expect(createClassGroupsStub.callCount).to.eq(0);
      await result[1]([], []);
      expect(createClassGroupsStub.callCount).to.eq(1);

      expect(propertyHandlerStub.callCount).to.eq(0);
      await result[2]([], []);
      expect(propertyHandlerStub.callCount).to.eq(1);

      expect(createLabelGroupsStub.callCount).to.eq(0);
      await result[3]([], []);
      expect(createLabelGroupsStub.callCount).to.eq(1);
    });

    it("creates [property, label] grouping handlers when requesting property grouping node children", async () => {
      const parentNode = createTestProcessedGroupingNode({
        key: {
          type: "property-grouping:other",
          properties: [],
        },
      });
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
      ];

      const result = await collect(createGroupingHandlers(imodelAccess, parentNode, nodes, formatter, testLocalizedStrings));

      expect(createBaseClassGroupingHandlersStub.callCount).to.eq(0);

      expect(createPropertiesGroupingHandlersStub.callCount).to.eq(1);
      expect(createPropertiesGroupingHandlersStub.firstCall).to.be.calledWith(imodelAccess, parentNode, nodes, formatter, testLocalizedStrings);

      expect(result.length).to.eq(2);

      expect(propertyHandlerStub.callCount).to.eq(0);
      await result[0]([], []);
      expect(propertyHandlerStub.callCount).to.eq(1);

      expect(createLabelGroupsStub.callCount).to.eq(0);
      await result[1]([], []);
      expect(createLabelGroupsStub.callCount).to.eq(1);
    });

    it("creates no grouping handlers when requesting label grouping node children", async () => {
      const parentNode = createTestProcessedGroupingNode({
        key: {
          type: "label-grouping",
          label: "x",
        },
      });
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
      ];

      const result = await collect(createGroupingHandlers(imodelAccess, parentNode, nodes, formatter, testLocalizedStrings));

      expect(createBaseClassGroupingHandlersStub.callCount).to.eq(0);
      expect(createPropertiesGroupingHandlersStub.callCount).to.eq(0);
      expect(result.length).to.eq(0);
    });
  });
});
