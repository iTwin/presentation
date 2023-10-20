/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createGroupingOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/Grouping";
import { IMetadataProvider } from "../../../hierarchy-builder/Metadata";
import { createGetClassStub, createGroupingHandlers, createTestNode, getObservableResult, isMock, setupLogging, TStubClassFunc } from "../../Utils";

describe("Grouping", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  const metadataProvider = {} as unknown as IMetadataProvider;
  let stubClass: TStubClassFunc;
  beforeEach(() => {
    stubClass = createGetClassStub(metadataProvider).stubClass;
  });

  it("creates a tree with multiple groups", async () => {
    const nodes = [
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
        params: {
          grouping: {
            byBaseClasses: {
              baseClassInfo: [
                {
                  className: "TestParentClassA",
                  schemaName: "TestSchema",
                },
                {
                  className: "TestParentClassAA",
                  schemaName: "TestSchema",
                },
              ],
            },
            byClass: true,
            byLabel: true,
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x1" }] },
        label: "1",
        params: {
          grouping: {
            byBaseClasses: {
              baseClassInfo: [
                {
                  className: "TestParentClassA",
                  schemaName: "TestSchema",
                },
                {
                  className: "TestParentClassAA",
                  schemaName: "TestSchema",
                },
              ],
              hideIfNoSiblings: true,
            },
            byLabel: true,
            byClass: true,
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.A", id: "0x3" }] },
        label: "2",
        params: {
          grouping: {
            byBaseClasses: {
              baseClassInfo: [
                {
                  className: "TestParentClassA",
                  schemaName: "TestSchema",
                },
                {
                  className: "TestParentClassAA",
                  schemaName: "TestSchema",
                },
                {
                  className: "TestRandomClassAA",
                  schemaName: "TestSchema",
                },
              ],
            },
            byLabel: { hideIfOneGroupedNode: true },
            byClass: true,
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.AA", id: "0x2" }] },
        label: "3",
        params: {
          grouping: {
            byBaseClasses: {
              baseClassInfo: [
                {
                  className: "TestParentClassAA",
                  schemaName: "TestSchema",
                },
              ],
              hideIfNoSiblings: true,
            },
            byClass: true,
          },
        },
      }),
      createTestNode({
        key: { type: "instances", instanceKeys: [{ className: "TestSchema.B", id: "0x2" }] },
        label: "4",
        params: {
          grouping: {
            byBaseClasses: {
              baseClassInfo: [
                {
                  className: "TestParentClassB",
                  schemaName: "TestSchema",
                },
              ],
              hideIfOneGroupedNode: true,
            },
          },
        },
      }),
    ];

    const classA = stubClass({ schemaName: "TestSchema", className: "A", classLabel: "Class A", is: isMock });
    const classAA = stubClass({ schemaName: "TestSchema", className: "AA", classLabel: "Class AA", is: isMock });
    stubClass({ schemaName: "TestSchema", className: "B", classLabel: "Class B", is: isMock });
    const parentClassA = stubClass({
      schemaName: "TestSchema",
      className: "TestParentClassA",
      classLabel: "TestSchema.TestParentClassA",
      isEntityClass: () => true,
      isRelationshipClass: () => true,
    });
    const parentClassAA = stubClass({
      schemaName: "TestSchema",
      className: "TestParentClassAA",
      classLabel: "TestSchema.TestParentClassAA",
      is: isMock,
      isEntityClass: () => true,
      isRelationshipClass: () => true,
    });
    stubClass({
      schemaName: "TestSchema",
      className: "TestParentClassB",
      classLabel: "TestSchema.TestParentClassB",
      isEntityClass: () => true,
      isRelationshipClass: () => true,
    });
    stubClass({ schemaName: "TestSchema", className: "TestRandomClassAA", isEntityClass: () => true, isRelationshipClass: () => true });

    const result = await getObservableResult(from(nodes).pipe(createGroupingOperator(metadataProvider, createGroupingHandlers)));
    expect(result).to.deep.eq([
      nodes[4],
      {
        label: "TestSchema.TestParentClassA",
        key: {
          type: "class-grouping",
          class: parentClassA,
        },
        children: [
          {
            label: "Class A",
            key: {
              type: "class-grouping",
              class: classA,
            },
            children: [
              {
                label: "1",
                key: {
                  type: "label-grouping",
                  label: "1",
                },
                children: [nodes[0], nodes[1]],
              },
              nodes[2],
            ],
          },
        ],
      },
      {
        label: "TestSchema.TestParentClassAA",
        key: {
          type: "class-grouping",
          class: parentClassAA,
        },
        children: [
          {
            label: "Class AA",
            key: {
              type: "class-grouping",
              class: classAA,
            },
            children: [nodes[3]],
          },
        ],
      },
    ] as HierarchyNode[]);
  });
});
