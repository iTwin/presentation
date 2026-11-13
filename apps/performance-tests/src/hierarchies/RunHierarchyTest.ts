/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "vitest";
import { PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { normalizeFullClassName } from "@itwin/presentation-shared";
import { Datasets } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";
import { StatelessHierarchyProvider } from "./StatelessHierarchyProvider.js";

import type { DefineHierarchyLevelProps } from "@itwin/presentation-hierarchies";
import type { EC, Props } from "@itwin/presentation-shared";
import type { IModelName } from "../util/Datasets.js";
import type { RunOptions } from "../util/TestUtilities.js";

/**
 * Runs a full hierarchy test against a given iModel. The hierarchy is created using the given
 * `fullClassName` and additional `NodeSelectClauseProps`, which allow specifying additional
 * grouping, hiding, etc. parameters.
 */
export function runHierarchyTest(
  testProps: {
    imodelName: IModelName;
    fullClassName?: EC.FullClassNameDotNotation;
    nodeSelectProps?: Partial<Props<DefineHierarchyLevelProps["createSelectClause"]>>;
    expectedNodeCount?: number;
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { imodelName, nodeSelectProps } = testProps;
  run({
    ...testProps,
    setup: () => {
      const imodel = SnapshotDb.openFile(Datasets.getDataset({ name: imodelName }).imodelPath);
      const fullClassName = testProps.fullClassName ?? normalizeFullClassName(PhysicalElement.classFullName);
      return {
        imodel,
        getHierarchyFactory: () => ({
          async defineHierarchyLevel({ parentNode, createSelectClause }: DefineHierarchyLevelProps) {
            if (parentNode) {
              return [];
            }

            return [
              {
                fullClassName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
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
      const { imodel, ...hierarchyProps } = props;
      const provider = await StatelessHierarchyProvider.create({
        ...hierarchyProps,
        iModel: imodel,
        rowLimit: "unbounded",
      });
      const nodeCount = await provider.loadHierarchy();
      if (testProps.expectedNodeCount !== undefined) {
        expect(nodeCount).toBe(testProps.expectedNodeCount);
      }
    },
    cleanup: ({ imodel }) => imodel.close(),
  });
}
