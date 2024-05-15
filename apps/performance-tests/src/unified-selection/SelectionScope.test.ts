/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { SnapshotDb } from "@itwin/core-backend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { computeSelection } from "@itwin/unified-selection";
import { Datasets, IModelName } from "../util/Datasets";
import { run, RunOptions } from "../util/TestUtilities";

describe("compute", () => {
  runSelectionScopeTest({
    testName: "selection for 50k elements",
    iModelName: "50k elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: "element",
    expectedCounts: [
      { className: "Generic.PhysicalObject", count: 25_000 },
      { className: "BisCore.DrawingGraphic", count: 25_000 },
    ],
  });

  runSelectionScopeTest({
    testName: "parent selection for 50k elements",
    iModelName: "50k elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: { id: "element", ancestorLevel: 1 },
    expectedCounts: [
      { className: "Generic.PhysicalObject", count: 24_000 },
      { className: "BisCore.DrawingGraphic", count: 24_000 },
    ],
  });

  runSelectionScopeTest({
    testName: "top ancestor selection for 50k elements",
    iModelName: "50k elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: { id: "element", ancestorLevel: -1 },
    expectedCounts: [
      { className: "Generic.PhysicalObject", count: 1_000 },
      { className: "BisCore.DrawingGraphic", count: 1_000 },
    ],
  });

  runSelectionScopeTest({
    testName: "category selection for 50k elements",
    iModelName: "50k elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: "category",
    expectedCounts: [
      { className: "BisCore.DrawingCategory", count: 1 },
      { className: "BisCore.SpatialCategory", count: 1 },
    ],
  });

  runSelectionScopeTest({
    testName: "model selection for 50k elements",
    iModelName: "50k elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    scope: "model",
    expectedCounts: [
      { className: "BisCore.PhysicalModel", count: 1 },
      { className: "BisCore.DrawingModel", count: 1 },
    ],
  });

  runSelectionScopeTest({
    testName: "functional selection for 50k 3D elements",
    iModelName: "50k functional 3D elements",
    inputQuery: "SELECT ECInstanceId FROM Generic:PhysicalObject",
    scope: "functional",
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 50_000 }],
  });

  runSelectionScopeTest({
    testName: "parent functional selection for 50k 3D elements",
    iModelName: "50k functional 3D elements",
    inputQuery: "SELECT ECInstanceId FROM Generic:PhysicalObject",
    scope: { id: "functional", ancestorLevel: 1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 49_000 }],
  });

  runSelectionScopeTest({
    testName: "top ancestor functional selection for 50k 3D elements",
    iModelName: "50k functional 3D elements",
    inputQuery: "SELECT ECInstanceId FROM Generic:PhysicalObject",
    scope: { id: "functional", ancestorLevel: -1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 1_000 }],
  });

  runSelectionScopeTest({
    testName: "functional selection for 50k 2D elements",
    iModelName: "50k functional 2D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:DrawingGraphic WHERE UserLabel = 'test_element'",
    scope: "functional",
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 1_000 }],
  });

  runSelectionScopeTest({
    testName: "parent functional selection for 50k 2D elements",
    iModelName: "50k functional 2D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:DrawingGraphic WHERE UserLabel = 'test_element'",
    scope: { id: "functional", ancestorLevel: 1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 1_000 }],
  });

  runSelectionScopeTest({
    testName: "top ancestor functional selection for 50k 2D elements",
    iModelName: "50k functional 2D elements",
    inputQuery: "SELECT ECInstanceId FROM BisCore:DrawingGraphic WHERE UserLabel = 'test_element'",
    scope: { id: "functional", ancestorLevel: -1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 1_000 }],
  });
});

function runSelectionScopeTest(
  testProps: {
    iModelName: IModelName;
    inputQuery: string;
    scope: Parameters<typeof computeSelection>[0]["scope"];
    expectedCounts?: { className: string; count: number }[];
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { iModelName } = testProps;
  run({
    ...testProps,
    setup: async () => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath(iModelName));
      const queryExecutor = createECSqlQueryExecutor(iModel);
      const elementIds: string[] = [];

      for await (const row of queryExecutor.createQueryReader({ ecsql: testProps.inputQuery })) {
        elementIds.push(row.ECInstanceId);
      }

      return {
        iModel,
        elementIds,
        queryExecutor,
      };
    },
    test: async (props) => {
      const iterator = computeSelection({ elementIds: props.elementIds, scope: testProps.scope, queryExecutor: props.queryExecutor });
      const counts = new Map<string, { count: number }>();

      for await (const instanceKey of iterator) {
        const res = counts.get(instanceKey.className);
        if (res) {
          ++res.count;
        } else {
          counts.set(instanceKey.className, { count: 1 });
        }
      }

      if (testProps.expectedCounts !== undefined) {
        for (const entry of testProps.expectedCounts) {
          expect(counts.get(entry.className)?.count).to.be.eq(entry.count);
        }
      }
    },
    cleanup: ({ iModel }) => iModel.close(),
  });
}
