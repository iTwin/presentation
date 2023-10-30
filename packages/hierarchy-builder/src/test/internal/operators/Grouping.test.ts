/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
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
import { IMetadataProvider } from "../../../hierarchy-builder/Metadata";
import { createTestNode, getObservableResult, setupLogging } from "../../Utils";

describe("Grouping", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;

  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("createGroupingOperator", () => {
    let applyGroupingHidingParamsStub: sinon.SinonStub;
    let assignAutoExpandStub: sinon.SinonStub;
    beforeEach(() => {
      applyGroupingHidingParamsStub = sinon.stub(groupHiding, "applyGroupHidingParams").callsFake((props) => props);
      assignAutoExpandStub = sinon.stub(autoExpand, "assignAutoExpand").callsFake((props) => props);
    });

    it("doesn't change input nodes when grouping handlers don't group", async () => {
      const nodes = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x2" }] },
          label: "1",
        }),
      ];

      const result = await getObservableResult(
        from(nodes).pipe(
          createGroupingOperator(metadataProvider, [
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
      const nodes = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
          label: "1",
        }),
      ];
      const classGroupingResult = {
        grouped: [
          {
            label: "TestSchema A",
            key: {
              type: "class-grouping",
              class: {
                name: "TestSchema A",
              },
            },
            children: [nodes[0]],
          },
        ],
        ungrouped: [nodes[1]],
        groupingType: "class",
      } as GroupingHandlerResult;

      const result = await getObservableResult(
        from(nodes).pipe(
          createGroupingOperator(metadataProvider, [
            async () => classGroupingResult,
            async (allNodes) => {
              return {
                grouped: [
                  {
                    label: "1",
                    key: {
                      type: "label-grouping",
                      label: "1",
                    },
                    children: allNodes.filter((node) => !HierarchyNode.isClassGroupingNode(node)),
                  },
                ],
                ungrouped: allNodes.filter((node) => HierarchyNode.isClassGroupingNode(node)),
                groupingType: "label",
              } as GroupingHandlerResult;
            },
          ]),
        ),
      );
      expect(assignAutoExpandStub.callCount).to.eq(3);
      expect(applyGroupingHidingParamsStub.callCount).to.eq(3);
      expect(applyGroupingHidingParamsStub.firstCall).to.be.calledWith(classGroupingResult);
      expect(applyGroupingHidingParamsStub.secondCall).to.be.calledWith({
        grouped: [
          {
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [nodes[0]],
          },
        ],
        ungrouped: [],
        groupingType: "label",
      });
      expect(applyGroupingHidingParamsStub.thirdCall).to.be.calledWith({
        grouped: [
          {
            label: "1",
            key: {
              type: "label-grouping",
              label: "1",
            },
            children: [nodes[1]],
          },
        ],
        ungrouped: [
          {
            label: "TestSchema A",
            key: {
              type: "class-grouping",
              class: {
                name: "TestSchema A",
              },
            },
            children: [
              {
                label: "1",
                key: {
                  type: "label-grouping",
                  label: "1",
                },
                children: [nodes[0]],
              },
            ],
          },
        ],
        groupingType: "label",
      });

      expect(result).to.deep.eq([
        {
          label: "1",
          key: {
            type: "label-grouping",
            label: "1",
          },
          children: [nodes[1]],
        },
        {
          label: "TestSchema A",
          key: {
            type: "class-grouping",
            class: {
              name: "TestSchema A",
            },
          },
          children: [
            {
              label: "1",
              key: {
                type: "label-grouping",
                label: "1",
              },
              children: [nodes[0]],
            },
          ],
        },
      ]);
    });
  });

  describe("createGroupingHandlers", () => {
    let createBaseClassGroupingHandlersStub: sinon.SinonStub;
    let createClassGroupsStub: sinon.SinonStub;
    let createLabelGroupsStub: sinon.SinonStub;
    before(() => {
      createBaseClassGroupingHandlersStub = sinon.stub(baseClassGrouping, "createBaseClassGroupingHandlers").resolves([]);
      createClassGroupsStub = sinon.stub(classGrouping, "createClassGroups");
      createLabelGroupsStub = sinon.stub(labelGrouping, "createLabelGroups");
    });

    it("creates grouping handlers in class -> label grouping order", async () => {
      const nodes = [
        createTestNode({
          key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
          label: "1",
        }),
      ];

      const result = await createGroupingHandlers(metadataProvider, nodes);
      expect(createBaseClassGroupingHandlersStub.callCount).to.eq(1);
      expect(createBaseClassGroupingHandlersStub.firstCall).to.be.calledWith(metadataProvider, nodes);
      expect(result.length).to.eq(2);
      expect(createClassGroupsStub.callCount).to.eq(0);
      await result[0]([]);
      expect(createClassGroupsStub.callCount).to.eq(1);
      expect(createLabelGroupsStub.callCount).to.eq(0);
      await result[1]([]);
      expect(createLabelGroupsStub.callCount).to.eq(1);
    });
  });
});
