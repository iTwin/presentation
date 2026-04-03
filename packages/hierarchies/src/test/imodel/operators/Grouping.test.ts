/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { from } from "rxjs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LogLevel } from "@itwin/core-bentley";
import { createDefaultValueFormatter, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { createGroupingOperator, GroupingHandlerResult, LOGGING_NAMESPACE } from "../../../hierarchies/imodel/operators/Grouping.js";
import {
  createIModelAccessStub,
  createTestProcessedGenericNode,
  createTestProcessedGroupingNode,
  createTestProcessedInstanceNode,
  setupLogging,
  testLocalizedStrings,
} from "../../Utils.js";

describe("Grouping", () => {
  const imodelAccess = createIModelAccessStub();
  let formatter: IPrimitiveValueFormatter;

  beforeAll(() => {
    formatter = createDefaultValueFormatter();
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  describe("createGroupingOperator", () => {
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
      const result = await collect(
        from(nodes).pipe(createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, undefined, undefined, [])),
      );
      expect(result).toEqual(nodes);
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
      const instanceNode3 = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.C", id: "0x3" }] },
        label: "3",
      });
      const classGroupingResult: GroupingHandlerResult = {
        groupingType: "class",
        grouped: [
          createTestProcessedGroupingNode({
            label: "TestSchema A",
            key: {
              type: "class-grouping",
              className: "TestSchema.A",
            },
            groupedInstanceKeys: instanceNode1.key.instanceKeys,
            children: [instanceNode1],
          }),
        ],
        ungrouped: [instanceNode2, instanceNode3],
      };
      const propertyGroupingResult: GroupingHandlerResult = {
        groupingType: "property",
        grouped: [
          createTestProcessedGroupingNode({
            label: "x",
            key: {
              type: "property-grouping:value",
              propertyClassName: "TestSchema.B",
              propertyName: "x",
              formattedPropertyValue: "x",
            },
            groupedInstanceKeys: instanceNode2.key.instanceKeys,
            children: [instanceNode2],
          }),
        ],
        ungrouped: [instanceNode3],
      };
      const labelGroupingResult: GroupingHandlerResult = {
        groupingType: "label",
        grouped: [
          createTestProcessedGroupingNode({
            label: "3",
            key: {
              type: "label-grouping" as const,
              label: "3",
            },
            groupedInstanceKeys: instanceNode3.key.instanceKeys,
            children: [instanceNode3],
          }),
        ],
        ungrouped: [],
      };

      const groupingSpy = vi.fn();
      const result = await collect(
        from([instanceNode1, instanceNode2, instanceNode3]).pipe(
          createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, groupingSpy, undefined, [
            async () => classGroupingResult,
            async () => propertyGroupingResult,
            async () => labelGroupingResult,
          ]),
        ),
      );
      expect(groupingSpy.mock.calls.length).toBe(3);
      expect(groupingSpy.mock.calls[0][0]).toEqual(classGroupingResult);
      expect(groupingSpy.mock.calls[1][0]).toEqual(propertyGroupingResult);
      expect(groupingSpy.mock.calls[2][0]).toEqual(labelGroupingResult);

      expect(result).toEqual([...classGroupingResult.grouped, ...propertyGroupingResult.grouped, ...labelGroupingResult.grouped]);
    });

    it("assigns `nonGroupingAncestor` from parent custom node", async () => {
      const parentNode = createTestProcessedGenericNode();
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
          createGroupingOperator(imodelAccess, parentNode, formatter, testLocalizedStrings, undefined, undefined, [
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );
      expect(result).toEqual([
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
          createGroupingOperator(imodelAccess, parentNode, formatter, testLocalizedStrings, undefined, undefined, [
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );
      expect(result).toEqual([
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
      const nonGroupingAncestor = createTestProcessedGenericNode();
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
          createGroupingOperator(imodelAccess, parentNode, formatter, testLocalizedStrings, undefined, undefined, [
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );
      expect(result).toEqual([
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
      const groupedNode3 = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.C", id: "0x3" }] },
        label: "3",
      });
      const classGroupingNode = createTestProcessedGroupingNode({
        label: "TestSchema A",
        key: {
          type: "class-grouping" as const,
          className: "TestSchema.A",
        },
        groupedInstanceKeys: groupedNode1.key.instanceKeys,
        children: [groupedNode1],
      });
      const propertyGroupingNode = createTestProcessedGroupingNode({
        label: "x",
        key: {
          type: "property-grouping:value" as const,
          propertyClassName: "TestSchema.B",
          propertyName: "x",
          formattedPropertyValue: "x",
        },
        groupedInstanceKeys: groupedNode2.key.instanceKeys,
        children: [groupedNode2],
      });
      const labelGroupingNode = createTestProcessedGroupingNode({
        label: "3",
        key: {
          type: "label-grouping" as const,
          label: "3",
        },
        groupedInstanceKeys: groupedNode3.key.instanceKeys,
        children: [groupedNode3],
      });

      const onGroupingNodeCreated = vi.fn();
      const result = await collect(
        from([groupedNode1, groupedNode2, groupedNode3]).pipe(
          createGroupingOperator(imodelAccess, undefined, formatter, testLocalizedStrings, undefined, onGroupingNodeCreated, [
            async () => ({
              groupingType: "class",
              grouped: [classGroupingNode],
              ungrouped: [groupedNode2, groupedNode3],
            }),
            async () => ({
              groupingType: "property",
              grouped: [propertyGroupingNode],
              ungrouped: [groupedNode3],
            }),
            async () => ({
              groupingType: "label",
              grouped: [labelGroupingNode],
              ungrouped: [],
            }),
          ]),
        ),
      );

      expect(onGroupingNodeCreated).toHaveBeenCalledTimes(3);
      expect(onGroupingNodeCreated).toHaveBeenNthCalledWith(1, classGroupingNode);
      expect(onGroupingNodeCreated).toHaveBeenNthCalledWith(2, propertyGroupingNode);
      expect(onGroupingNodeCreated).toHaveBeenNthCalledWith(3, labelGroupingNode);

      expect(result).toEqual([classGroupingNode, propertyGroupingNode, labelGroupingNode]);
    });
  });
});
