/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect } from "vitest";
import { SnapshotDb } from "@itwin/core-backend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { computeSelection } from "@itwin/unified-selection";
import { Datasets } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";

import type { Id64String } from "@itwin/core-bentley";
import type { Props } from "@itwin/presentation-shared";
import type { Dataset, IModelName } from "../util/Datasets.js";
import type { RunOptions } from "../util/TestUtilities.js";

describe("compute", () => {
  runSelectionScopeTest({
    testName: "selection for 50k elements",
    imodelName: "50k hierarchical 2D and 3D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: "element",
    getExpectedCounts: ({ elementCount, physicalElementClassName, drawingGraphicClassName }) => [
      { className: physicalElementClassName, count: elementCount / 2 },
      { className: drawingGraphicClassName, count: elementCount / 2 },
    ],
  });

  runSelectionScopeTest({
    testName: "parent selection for 50k elements",
    imodelName: "50k hierarchical 2D and 3D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: { id: "element", ancestorLevel: 1 },
    // All elements except chain leaves are parents.
    getExpectedCounts: ({ elementCount, chainCount, physicalElementClassName, drawingGraphicClassName }) => [
      { className: physicalElementClassName, count: elementCount / 2 - chainCount },
      { className: drawingGraphicClassName, count: elementCount / 2 - chainCount },
    ],
  });

  runSelectionScopeTest({
    testName: "top ancestor selection for 50k elements",
    imodelName: "50k hierarchical 2D and 3D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: { id: "element", ancestorLevel: -1 },
    getExpectedCounts: ({ chainCount, physicalElementClassName, drawingGraphicClassName }) => [
      { className: physicalElementClassName, count: chainCount },
      { className: drawingGraphicClassName, count: chainCount },
    ],
  });

  runSelectionScopeTest({
    testName: "category selection for 50k elements",
    imodelName: "50k hierarchical 2D and 3D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: "category",
    // All 2D and 3D elements belong to one category of each kind.
    getExpectedCounts: () => [
      { className: "BisCore.DrawingCategory", count: 1 },
      { className: "BisCore.SpatialCategory", count: 1 },
    ],
  });

  runSelectionScopeTest({
    testName: "model selection for 50k elements",
    imodelName: "50k hierarchical 2D and 3D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: "model",
    // All 2D and 3D elements belong to one model of each kind.
    getExpectedCounts: () => [
      { className: "BisCore.PhysicalModel", count: 1 },
      { className: "BisCore.DrawingModel", count: 1 },
    ],
  });

  runSelectionScopeTest({
    testName: "functional selection for 50k 3D elements",
    imodelName: "50k functional 3D elements",
    inputQuery: ({ physicalElementClassName }) => `SELECT ECInstanceId FROM ${physicalElementClassName}`,
    scope: "functional",
    getExpectedCounts: ({ elementCount, functionalElementClassName }) => [
      { className: functionalElementClassName, count: elementCount },
    ],
  });

  runSelectionScopeTest({
    testName: "parent functional selection for 50k 3D elements",
    imodelName: "50k functional 3D elements",
    inputQuery: ({ physicalElementClassName }) => `SELECT ECInstanceId FROM ${physicalElementClassName}`,
    scope: { id: "functional", ancestorLevel: 1 },
    // All functional elements except chain leaves are parents.
    getExpectedCounts: ({ elementCount, chainCount, functionalElementClassName }) => [
      { className: functionalElementClassName, count: elementCount - chainCount },
    ],
  });

  runSelectionScopeTest({
    testName: "top ancestor functional selection for 50k 3D elements",
    imodelName: "50k functional 3D elements",
    inputQuery: ({ physicalElementClassName }) => `SELECT ECInstanceId FROM ${physicalElementClassName}`,
    scope: { id: "functional", ancestorLevel: -1 },
    getExpectedCounts: ({ chainCount, functionalElementClassName }) => [
      { className: functionalElementClassName, count: chainCount },
    ],
  });

  runSelectionScopeTest({
    testName: "functional selection for 50k 2D elements",
    imodelName: "50k functional 2D elements",
    inputQuery: ({ drawingGraphicClassName, drawingGraphicUserLabel }) =>
      `SELECT ECInstanceId FROM ${drawingGraphicClassName} WHERE UserLabel = '${drawingGraphicUserLabel}'`,
    scope: "functional",
    getExpectedCounts: ({ chainCount, functionalElementClassName }) => [
      { className: functionalElementClassName, count: chainCount },
    ],
  });

  runSelectionScopeTest({
    testName: "parent functional selection for 50k 2D elements",
    imodelName: "50k functional 2D elements",
    inputQuery: ({ drawingGraphicClassName, drawingGraphicUserLabel }) =>
      `SELECT ECInstanceId FROM ${drawingGraphicClassName} WHERE UserLabel = '${drawingGraphicUserLabel}'`,
    scope: { id: "functional", ancestorLevel: 1 },
    getExpectedCounts: ({ chainCount, functionalElementClassName }) => [
      { className: functionalElementClassName, count: chainCount },
    ],
  });

  runSelectionScopeTest({
    testName: "top ancestor functional selection for 50k 2D elements",
    imodelName: "50k functional 2D elements",
    inputQuery: ({ drawingGraphicClassName, drawingGraphicUserLabel }) =>
      `SELECT ECInstanceId FROM ${drawingGraphicClassName} WHERE UserLabel = '${drawingGraphicUserLabel}'`,
    scope: { id: "functional", ancestorLevel: -1 },
    getExpectedCounts: ({ chainCount, functionalElementClassName }) => [
      { className: functionalElementClassName, count: chainCount },
    ],
  });
});

function runSelectionScopeTest<TName extends IModelName>(
  testProps: {
    imodelName: TName;
    inputQuery: string | ((meta: Dataset<TName>["meta"]) => string);
    scope: Props<typeof computeSelection>["scope"];
    getExpectedCounts?: (meta: Dataset<TName>["meta"]) => { className: string; count: number }[];
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { imodelName } = testProps;
  run({
    ...testProps,
    setup: async () => {
      const { imodelPath, meta } = Datasets.getDataset({ name: imodelName });
      const imodel = SnapshotDb.openFile(imodelPath);
      const queryExecutor = createECSqlQueryExecutor(imodel);
      const elementIds: Id64String[] = [];
      const ecsql = typeof testProps.inputQuery === "string" ? testProps.inputQuery : testProps.inputQuery(meta);

      for await (const row of queryExecutor.createQueryReader({ ecsql })) {
        elementIds.push(row.ECInstanceId);
      }

      return { imodel, elementIds, queryExecutor, expectedCounts: testProps.getExpectedCounts?.(meta) };
    },
    test: async (props) => {
      const iterator = computeSelection({
        elementIds: props.elementIds,
        scope: testProps.scope,
        queryExecutor: props.queryExecutor,
      });
      const counts = new Map<string, { count: number }>();

      for await (const instanceKey of iterator) {
        const res = counts.get(instanceKey.className);
        if (res) {
          ++res.count;
        } else {
          counts.set(instanceKey.className, { count: 1 });
        }
      }

      if (props.expectedCounts !== undefined) {
        for (const entry of props.expectedCounts) {
          expect(counts.get(entry.className)?.count).toBe(entry.count);
        }
      }
    },
    cleanup: ({ imodel }) => imodel.close(),
  });
}
