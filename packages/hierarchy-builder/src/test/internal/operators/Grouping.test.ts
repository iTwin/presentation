/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { IMetadataProvider } from "../../../hierarchy-builder/ECMetadata";
import { ProcessedInstanceHierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { BaseClassChecker } from "../../../hierarchy-builder/internal/Common";
import {
  createGroupingHandlers,
  createGroupingOperator,
  GroupingHandlerResult,
  LOGGING_NAMESPACE,
} from "../../../hierarchy-builder/internal/operators/Grouping";
import * as autoExpand from "../../../hierarchy-builder/internal/operators/grouping/AutoExpand";
import * as baseClassGrouping from "../../../hierarchy-builder/internal/operators/grouping/BaseClassGrouping";
import * as classGrouping from "../../../hierarchy-builder/internal/operators/grouping/ClassGrouping";
import * as groupHiding from "../../../hierarchy-builder/internal/operators/grouping/GroupHiding";
import * as labelGrouping from "../../../hierarchy-builder/internal/operators/grouping/LabelGrouping";
import * as propertiesGrouping from "../../../hierarchy-builder/internal/operators/grouping/PropertiesGrouping";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "../../../hierarchy-builder/values/Formatting";
import { createTestProcessedGroupingNode, createTestProcessedInstanceNode, getObservableResult, setupLogging, testLocalizedStrings } from "../../Utils";

describe("Grouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  const baseClassChecker = sinon.createStubInstance(BaseClassChecker);
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

      const result = await getObservableResult(
        from(nodes).pipe(
          createGroupingOperator(metadataProvider, formatter, testLocalizedStrings, baseClassChecker, undefined, [
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
      const classGroupingInput = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
          label: "2",
        }),
      ];
      const labelGroupingInput1 = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
      ];
      const labelGroupingInput2 = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
          label: "2",
        }),
      ];
      const classGroupingResult: GroupingHandlerResult = {
        groupingType: "class",
        grouped: [
          createTestProcessedGroupingNode({
            label: "TestSchema A",
            key: {
              type: "class-grouping",
              className: "TestSchema A",
            },
            groupedInstanceKeys: labelGroupingInput1.flatMap((n) => n.key.instanceKeys),
            children: labelGroupingInput1,
          }),
        ],
        ungrouped: labelGroupingInput2,
      };
      const createLabelGroupingResult = (childNodes: ProcessedInstanceHierarchyNode[]): GroupingHandlerResult => ({
        groupingType: "label",
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping" as const,
              label: "1",
            },
            groupedInstanceKeys: childNodes.flatMap((n) => n.key.instanceKeys),
            children: childNodes,
          }),
        ],
        ungrouped: [],
      });

      const result = await getObservableResult(
        from(classGroupingInput).pipe(
          createGroupingOperator(metadataProvider, formatter, testLocalizedStrings, baseClassChecker, undefined, [
            async () => classGroupingResult,
            async (input) => createLabelGroupingResult(input),
          ]),
        ),
      );
      expect(assignAutoExpandStub.callCount).to.eq(3);
      expect(applyGroupingHidingParamsStub.callCount).to.eq(3);
      expect(applyGroupingHidingParamsStub.firstCall).to.be.calledWith(classGroupingResult);
      expect(applyGroupingHidingParamsStub.secondCall).to.be.calledWith(createLabelGroupingResult(labelGroupingInput1));
      expect(applyGroupingHidingParamsStub.thirdCall).to.be.calledWith({
        groupingType: "label",
        grouped: [
          createTestProcessedGroupingNode({
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            groupedInstanceKeys: labelGroupingInput2.flatMap((n) => n.key.instanceKeys),
            children: labelGroupingInput2,
          }),
        ],
        ungrouped: [],
      });

      expect(result).to.deep.eq([
        createTestProcessedGroupingNode({
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          groupedInstanceKeys: labelGroupingInput2.flatMap((n) => n.key.instanceKeys),
          children: labelGroupingInput2,
        }),
        createTestProcessedGroupingNode({
          label: "TestSchema A",
          key: {
            type: "class-grouping",
            className: "TestSchema A",
          },
          groupedInstanceKeys: labelGroupingInput1.flatMap((n) => n.key.instanceKeys),
          children: [
            createTestProcessedGroupingNode({
              label: "1",
              key: {
                type: "label-grouping",
                label: "1",
              },
              groupedInstanceKeys: labelGroupingInput1.flatMap((n) => n.key.instanceKeys),
              children: labelGroupingInput1,
            }),
          ],
        }),
      ]);
    });

    it("returns nodes in sorted order when grouping nodes are created", async () => {
      const groupedNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "A", id: "0x1" }] },
        label: "1",
      });
      const ungroupedNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "B", id: "0x2" }] },
        label: "2",
      });
      const classGroupingNode = createTestProcessedGroupingNode({
        label: "A",
        key: {
          type: "class-grouping" as const,
          className: "A",
        },
        groupedInstanceKeys: groupedNode.key.instanceKeys,
        children: [groupedNode],
      });
      const result = await getObservableResult(
        from([groupedNode, ungroupedNode]).pipe(
          createGroupingOperator(metadataProvider, formatter, testLocalizedStrings, baseClassChecker, undefined, [
            async () => ({
              groupingType: "class",
              grouped: [classGroupingNode],
              ungrouped: [ungroupedNode],
            }),
          ]),
        ),
      );
      expect(result).to.deep.eq([ungroupedNode, classGroupingNode]);
    });

    it("calls `onGroupingNodeCreated` callback argument for each grouping node", async () => {
      const groupedNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
      });
      const classGroupingNode = createTestProcessedGroupingNode({
        label: "TestSchema A",
        key: {
          type: "class-grouping" as const,
          className: "TestSchema A",
        },
        groupedInstanceKeys: groupedNode.key.instanceKeys,
        children: [groupedNode],
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

      const onGroupingNodeCreated = sinon.spy();
      const result = await getObservableResult(
        from([groupedNode]).pipe(
          createGroupingOperator(metadataProvider, formatter, testLocalizedStrings, baseClassChecker, onGroupingNodeCreated, [
            async () => ({
              groupingType: "class",
              grouped: [classGroupingNode],
              ungrouped: [],
            }),
            async (nodes: ProcessedInstanceHierarchyNode[]) => ({
              groupingType: "label",
              grouped: nodes.length > 0 ? [labelGroupingNode] : [],
              ungrouped: [],
            }),
          ]),
        ),
      );

      expect(onGroupingNodeCreated).to.be.calledTwice;
      expect(onGroupingNodeCreated.firstCall).to.be.calledWith(labelGroupingNode);
      expect(onGroupingNodeCreated.secondCall).to.be.calledWith({ ...classGroupingNode, children: [labelGroupingNode] });

      expect(result).to.deep.eq([
        createTestProcessedGroupingNode({
          label: "TestSchema A",
          key: {
            type: "class-grouping",
            className: "TestSchema A",
          },
          groupedInstanceKeys: groupedNode.key.instanceKeys,
          children: [
            createTestProcessedGroupingNode({
              label: "1",
              key: {
                type: "label-grouping",
                label: "1",
              },
              groupedInstanceKeys: groupedNode.key.instanceKeys,
              children: [groupedNode],
            }),
          ],
        }),
      ]);
    });
  });

  describe("createGroupingHandlers", () => {
    let createBaseClassGroupingHandlersStub: sinon.SinonStub;
    let createPropertiesGroupingHandlersStub: sinon.SinonStub;
    let baseClassHandlerStub: sinon.SinonStub;
    let propertyHandlerStub: sinon.SinonStub;
    let createClassGroupsStub: sinon.SinonStub;
    let createLabelGroupsStub: sinon.SinonStub;
    before(() => {
      baseClassHandlerStub = sinon.stub();
      propertyHandlerStub = sinon.stub();
      createBaseClassGroupingHandlersStub = sinon.stub(baseClassGrouping, "createBaseClassGroupingHandlers").resolves([baseClassHandlerStub]);
      createPropertiesGroupingHandlersStub = sinon.stub(propertiesGrouping, "createPropertiesGroupingHandlers").resolves([propertyHandlerStub]);
      createClassGroupsStub = sinon.stub(classGrouping, "createClassGroups");
      createLabelGroupsStub = sinon.stub(labelGrouping, "createLabelGroups");
    });

    it("creates grouping handlers in class -> property -> label grouping order", async () => {
      const nodes = [
        createTestProcessedInstanceNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
      ];

      const result = await createGroupingHandlers(metadataProvider, nodes, formatter, testLocalizedStrings, baseClassChecker);
      expect(createBaseClassGroupingHandlersStub.callCount).to.eq(1);
      expect(createBaseClassGroupingHandlersStub.firstCall).to.be.calledWith(metadataProvider, nodes);
      expect(createPropertiesGroupingHandlersStub.callCount).to.eq(1);
      expect(createPropertiesGroupingHandlersStub.firstCall).to.be.calledWith(metadataProvider, nodes, formatter, testLocalizedStrings);
      expect(result.length).to.eq(4);
      expect(baseClassHandlerStub.callCount).to.eq(0);
      await result[0]([]);
      expect(baseClassHandlerStub.callCount).to.eq(1);
      expect(createClassGroupsStub.callCount).to.eq(0);
      await result[1]([]);
      expect(createClassGroupsStub.callCount).to.eq(1);
      expect(propertyHandlerStub.callCount).to.eq(0);
      await result[2]([]);
      expect(propertyHandlerStub.callCount).to.eq(1);
      expect(createLabelGroupsStub.callCount).to.eq(0);
      await result[3]([]);
      expect(createLabelGroupsStub.callCount).to.eq(1);
    });
  });
});
