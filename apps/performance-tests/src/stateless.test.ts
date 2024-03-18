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
import { run, RunOptions } from "./util/TestUtilities";

describe("models tree", () => {
  const getHierarchyFactory = (metadataProvider: IMetadataProvider) => new ModelsTreeDefinition({ metadataProvider });
  const setup = () => SnapshotDb.openFile(Datasets.getIModelPath("baytown"));
  const cleanup = (iModel: IModelDb) => iModel.close();

  run({
    testName: "initial (Baytown)",
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
      await provider.loadInitialHierarchy();
    },
  });

  run({
    testName: "full (Baytown)",
    setup,
    cleanup,
    test: async (iModel) => {
      const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
      await provider.loadFullHierarchy();
    },
  });
});

runHierarchyTest({ testName: "flat 50k elements list", iModelName: "50k elements" });

describe("grouping", () => {
  const { schemaName, baseClassName, customPropName, itemsPerGroup, defaultClassName } = Datasets.CUSTOM_SCHEMA;
  const expectedNodeCount = 50000 / itemsPerGroup;
  const baseFullClassName = `${schemaName}.${baseClassName}`;

  runHierarchyTest({
    testName: "by label",
    iModelName: "50k elements",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byLabel: true } },
  });

  runHierarchyTest({
    testName: "by class",
    iModelName: "50k elements",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byClass: true } },
  });

  runHierarchyTest({
    testName: "by property",
    iModelName: "50k elements",
    fullClassName: baseFullClassName,
    expectedNodeCount,
    nodeSelectProps: {
      grouping: {
        byProperties: {
          propertiesClassName: baseFullClassName,
          propertyGroups: [{ propertyName: customPropName, propertyClassAlias: "this" }],
        },
      },
    },
  });

  const physicalElementFullClassName = "BisCore.PhysicalElement";
  const baseClassQueryLimit = 10;
  const fullClassNames = [
    physicalElementFullClassName,
    baseFullClassName,
    ...[...Array(baseClassQueryLimit).keys()].map((i) => `${schemaName}.${defaultClassName}_${i}`),
  ];
  runHierarchyTest({
    testName: `by base class (${baseClassQueryLimit} classes)`,
    iModelName: "50k elements",
    fullClassName: baseFullClassName,
    expectedNodeCount: fullClassNames.length,
    nodeSelectProps: {
      grouping: {
        byBaseClasses: { fullClassNames },
      },
    },
  });

  runHierarchyTest({
    testName: "by multiple attributes",
    iModelName: "50k elements",
    fullClassName: baseFullClassName,
    nodeSelectProps: {
      grouping: {
        byBaseClasses: { fullClassNames: [physicalElementFullClassName] },
        byClass: true,
        byLabel: true,
        byProperties: {
          propertiesClassName: baseFullClassName,
          propertyGroups: [{ propertyName: customPropName, propertyClassAlias: "this" }],
        },
      },
    },
  });
});

function runHierarchyTest(
  testProps: {
    iModelName: IModelName;
    fullClassName?: string;
    nodeSelectProps?: Partial<NodeSelectClauseProps>;
    expectedNodeCount?: number;
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { iModelName, nodeSelectProps } = testProps;
  run({
    ...testProps,
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
