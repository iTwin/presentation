/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { SnapshotDb } from "@itwin/core-backend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { computeSelection } from "@itwin/unified-selection";
import { ComputeSelectionProps } from "@itwin/unified-selection/lib/cjs/unified-selection/SelectionScope";
import { Datasets, IModelName } from "../util/Datasets";
import { run, RunOptions } from "../util/TestUtilities";

describe("compute", () => {
  const additionalElementCount = 5;

  function createElementKeys({ start, count }: { start: number; count: number }) {
    const elementIds: string[] = [];
    for (let i = start; i <= start + count + additionalElementCount; ++i) {
      elementIds.push(`0x${i.toString(16)}`);
    }
    return elementIds;
  }

  runSelectionScopeTest({
    testName: "selection for 50k elements",
    iModelName: "50k nested elements",
    elementIds: createElementKeys({ start: 17, count: 50_000 }),
    scope: "element",
    expectedCounts: [
      { className: "Generic.PhysicalObject", count: 25_000 },
      { className: "BisCore.DrawingGraphic", count: 25_000 },
    ],
  });

  runSelectionScopeTest({
    testName: "parent selection for 50k elements",
    iModelName: "50k nested elements",
    elementIds: createElementKeys({ start: 17, count: 50_000 }),
    scope: { id: "element", ancestorLevel: 1 },
    expectedCounts: [
      { className: "Generic.PhysicalObject", count: 24_000 },
      { className: "BisCore.DrawingGraphic", count: 24_000 },
    ],
  });

  runSelectionScopeTest({
    testName: "top ancestor selection for 50k elements",
    iModelName: "50k nested elements",
    elementIds: createElementKeys({ start: 17, count: 50_000 }),
    scope: { id: "element", ancestorLevel: -1 },
    expectedCounts: [
      { className: "Generic.PhysicalObject", count: 1_000 },
      { className: "BisCore.DrawingGraphic", count: 1_000 },
    ],
  });

  runSelectionScopeTest({
    testName: "category selection for 50k elements",
    iModelName: "50k nested elements",
    elementIds: createElementKeys({ start: 17, count: 50_000 }),
    scope: "category",
    expectedCounts: [
      { className: "BisCore.DrawingCategory", count: 1 },
      { className: "BisCore.SpatialCategory", count: 1 },
    ],
  });

  runSelectionScopeTest({
    testName: "model selection for 50k elements",
    iModelName: "50k nested elements",
    elementIds: createElementKeys({ start: 17, count: 50_000 }),
    scope: "model",
    expectedCounts: [
      { className: "BisCore.PhysicalModel", count: 1 },
      { className: "BisCore.DrawingModel", count: 1 },
    ],
  });

  runSelectionScopeTest({
    testName: "functional selection for 50k 3D elements",
    iModelName: "50k nested functional 3D elements",
    elementIds: createElementKeys({ start: 16, count: 100_000 }),
    scope: "functional",
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 50_000 }],
  });

  runSelectionScopeTest({
    testName: "parent functional selection for 50k 3D elements",
    iModelName: "50k nested functional 3D elements",
    elementIds: createElementKeys({ start: 16, count: 100_000 }),
    scope: { id: "functional", ancestorLevel: 1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 49_000 }],
  });

  runSelectionScopeTest({
    testName: "top ancestor functional selection for 50k 3D elements",
    iModelName: "50k nested functional 3D elements",
    elementIds: createElementKeys({ start: 16, count: 100_000 }),
    scope: { id: "functional", ancestorLevel: -1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 1_000 }],
  });

  runSelectionScopeTest({
    testName: "functional selection for 50k 2D elements",
    iModelName: "10k nested functional 2D elements",
    elementIds: createElementKeys({ start: 17, count: 20_000 }),
    scope: "functional",
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 10_000 }],
  });

  runSelectionScopeTest({
    testName: "parent functional selection for 50k 2D elements",
    iModelName: "10k nested functional 2D elements",
    elementIds: createElementKeys({ start: 17, count: 20_000 }),
    scope: { id: "functional", ancestorLevel: 1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 9_000 }],
  });

  runSelectionScopeTest({
    testName: "top ancestor functional selection for 50k 2D elements",
    iModelName: "10k nested functional 2D elements",
    elementIds: createElementKeys({ start: 17, count: 20_000 }),
    scope: { id: "functional", ancestorLevel: -1 },
    expectedCounts: [{ className: "Functional.FunctionalComposite", count: 1_000 }],
  });
});

function runSelectionScopeTest(
  testProps: {
    iModelName: IModelName;
    elementIds: string[];
    scope: ComputeSelectionProps["scope"];
    expectedCounts?: { className: string; count: number }[];
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { iModelName } = testProps;
  run({
    ...testProps,
    setup: () => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath(iModelName));
      const queryExecutor = createECSqlQueryExecutor(iModel);

      return {
        iModel,
        queryExecutor,
      };
    },
    test: async (props) => {
      const iterator = computeSelection({ elementIds: testProps.elementIds, scope: testProps.scope, queryExecutor: props.queryExecutor });
      const counts = new Map<string, number>();

      for await (const instanceKey of iterator) {
        const count = counts.get(instanceKey.className) ?? 0;
        counts.set(instanceKey.className, count + 1);
      }

      if (testProps.expectedCounts !== undefined) {
        for (const entry of testProps.expectedCounts) {
          expect(counts.get(entry.className)).to.be.eq(entry.count);
        }
      }
    },
    cleanup: ({ iModel }) => iModel.close(),
  });
}
