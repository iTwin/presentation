/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { IModelDb, PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { IMetadataProvider, NodeSelectClauseProps, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { Datasets, IModelName } from "./Datasets";
import { ProviderOptions, StatelessHierarchyProvider } from "./StatelessHierarchyProvider";
import { run } from "./util/TestUtilities";

describe("models tree", () => {
  const getHierarchyFactory = (metadataProvider: IMetadataProvider) => new ModelsTreeDefinition({ metadataProvider });
  let iModel: IModelDb;

  beforeEach(() => {
    iModel = SnapshotDb.openFile(Datasets.getIModelPath("baytown"));
  });

  afterEach(() => iModel.close());

  run("initial (Baytown)", async () => {
    const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
    await provider.loadInitialHierarchy();
  });

  run("full (Baytown)", async () => {
    const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
    await provider.loadFullHierarchy();
  });
});

runQueryTest({ testName: "flat 50k elements list", iModelName: "50k elements" });

describe("grouping", () => {
  const expectedNodeCount = 50000 / Datasets.ITEMS_PER_GROUP;

  runQueryTest({
    testName: "by label",
    iModelName: "50k elements",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byLabel: true } },
  });

  runQueryTest({
    testName: "by class",
    iModelName: "50k elements",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byClass: true } },
  });

  const { schemaName, baseClassName, customPropName } = Datasets.CUSTOM_SCHEMA;
  const fullClassName = `${schemaName}.${baseClassName}`;
  runQueryTest({
    testName: "by property",
    iModelName: "50k elements",
    fullClassName,
    expectedNodeCount,
    nodeSelectProps: {
      grouping: {
        byProperties: {
          propertiesClassName: fullClassName,
          propertyGroups: [{ propertyName: customPropName, propertyClassAlias: "this" }],
        },
      },
    },
  });
});

function runQueryTest(testProps: {
  testName: string;
  iModelName: IModelName;
  fullClassName?: string;
  nodeSelectProps?: Partial<NodeSelectClauseProps>;
  expectedNodeCount?: number;
  limit?: number;
}) {
  const { testName, iModelName, nodeSelectProps, limit } = testProps;
  run(testName + (limit ? ` (${limit / 1000}k limit)` : ""), {
    setup: (): ProviderOptions => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath(iModelName));
      const fullClassName = testProps.fullClassName ?? PhysicalElement.classFullName.replace(":", ".");
      return {
        iModel,
        rowLimit: "unbounded",
        nodeRequestLimit: "unbounded",
        getHierarchyFactory: (metadataProvider) => ({
          async defineHierarchyLevel(props) {
            if (props.parentNode) {
              return [];
            }

            const query = new NodeSelectQueryFactory(metadataProvider);
            return [
              {
                fullClassName,
                query: {
                  ecsql: `
                    SELECT ${await query.createSelectClause({
                      ...nodeSelectProps,
                      ecClassId: nodeSelectProps?.ecClassId ?? { selector: `this.ECClassId` },
                      ecInstanceId: nodeSelectProps?.ecInstanceId ?? { selector: `this.ECInstanceId` },
                      nodeLabel: nodeSelectProps?.nodeLabel ?? { selector: `this.UserLabel` },
                    })}
                    FROM ${fullClassName} AS this
                    ${limit ? `LIMIT ${limit}` : ""}
                  `,
                },
              },
            ];
          },
        }),
      };
    },
    test: async (props) => {
      const provider = new StatelessHierarchyProvider(props);
      const nodeCount = await provider.loadFullHierarchy();
      if (testProps.expectedNodeCount !== undefined) {
        expect(nodeCount).to.eq(testProps.expectedNodeCount);
      }
    },
    cleanup: ({ iModel }) => iModel.close(),
  });
}
