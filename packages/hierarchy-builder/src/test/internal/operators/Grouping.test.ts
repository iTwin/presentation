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
  GroupingHandler,
  GroupingHandlerResult,
  LOGGING_NAMESPACE,
} from "../../../hierarchy-builder/internal/operators/Grouping";
import * as baseClassGrouping from "../../../hierarchy-builder/internal/operators/grouping/BaseClassGrouping";
import * as classGrouping from "../../../hierarchy-builder/internal/operators/grouping/ClassGrouping";
import * as groupHiding from "../../../hierarchy-builder/internal/operators/grouping/GroupHiding";
import * as labelGrouping from "../../../hierarchy-builder/internal/operators/grouping/LabelGrouping";
import { IMetadataProvider } from "../../../hierarchy-builder/Metadata";
import { createTestNode, getObservableResult, setupLogging } from "../../Utils";

describe("Grouping", () => {
  const metadata = {} as unknown as IMetadataProvider;

  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("createGroupingOperator", () => {
    let applyGroupingHidingParamsStub: sinon.SinonStub;
    beforeEach(() => {
      applyGroupingHidingParamsStub = sinon.stub(groupHiding, "applyGroupHidingParams").callsFake((props) => props);
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
          createGroupingOperator(metadata, [
            async (allNodes) => ({ grouped: [], ungrouped: allNodes, groupingType: "label" }),
            async (allNodes) => ({ grouped: [], ungrouped: allNodes, groupingType: "class" }),
          ]),
        ),
      );
      expect(applyGroupingHidingParamsStub.callCount).to.eq(2);
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

      const result = await getObservableResult(
        from(nodes).pipe(
          createGroupingOperator(metadata, [
            async (allNodes) => {
              return {
                grouped: [
                  {
                    label: "TestSchema A",
                    key: {
                      type: "class-grouping",
                      class: {
                        name: "TestSchema A",
                      },
                    },
                    children: [allNodes[0]],
                  },
                ],
                ungrouped: [allNodes[1]],
                groupingType: "class",
              } as GroupingHandlerResult;
            },
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
      expect(applyGroupingHidingParamsStub.callCount).to.eq(3);
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
      createBaseClassGroupingHandlersStub = sinon.stub(baseClassGrouping, "createBaseClassGroupingHandlers").resolves([] as GroupingHandler[]);
      createClassGroupsStub = sinon.stub(classGrouping, "createClassGroups").resolves({ grouped: [], ungrouped: [], groupingType: "class" });
      createLabelGroupsStub = sinon.stub(labelGrouping, "createLabelGroups").resolves({ grouped: [], ungrouped: [], groupingType: "label" });
    });

    it("creates grouping handlers in class -> label grouping order", async () => {
      const result = await createGroupingHandlers(metadata, []);
      expect(createBaseClassGroupingHandlersStub.callCount).to.eq(1);
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
