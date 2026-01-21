/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { SnapshotDb } from "@itwin/core-backend";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
import { createHiliteSetProvider, Selectable, Selectables } from "@itwin/unified-selection";
import { Datasets, IModelName } from "../util/Datasets";
import { run, RunOptions } from "../util/TestUtilities";

describe("hilite", () => {
  runHiliteTest({
    testName: "50k elements",
    iModelName: "50k elements",
    fullClassName: "BisCore:Element",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "50k group elements",
    iModelName: "50k group member elements",
    fullClassName: "BisCore:GroupInformationElement",
    inputQuery: "SELECT ECInstanceId FROM BisCore:GroupInformationElement",
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "1k subjects",
    iModelName: "1k subjects",
    fullClassName: "BisCore:Subject",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Subject WHERE UserLabel = 'test_subject'",
    expectedCounts: { models: 20 },
  });

  runHiliteTest({
    testName: "50k subcategories",
    iModelName: "50k subcategories",
    fullClassName: "BisCore:SpatialCategory",
    inputQuery: "SELECT ECInstanceId FROM BisCore:SpatialCategory",
    expectedCounts: { subCategories: 50_000 },
  });

  runHiliteTest({
    testName: "50k functional 3D elements",
    iModelName: "50k functional 3D elements",
    fullClassName: "Functional:FunctionalElement",
    inputQuery: "SELECT ECInstanceId FROM Functional:FunctionalElement",
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "50k functional 2D elements",
    iModelName: "50k functional 2D elements",
    fullClassName: "Functional:FunctionalElement",
    inputQuery: "SELECT ECInstanceId FROM Functional:FunctionalElement",
    // iModel contains one additional 2D element
    expectedCounts: { elements: 50_001 },
  });
});

function runHiliteTest(
  testProps: {
    inputQuery: string;
    fullClassName: string;
    iModelName: IModelName;
    expectedCounts?: { elements?: number; subCategories?: number; models?: number };
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { iModelName } = testProps;
  run({
    ...testProps,
    setup: async () => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath(iModelName));

      const selectables: Selectable[] = [];
      const imodelAccess = {
        ...createECSqlQueryExecutor(iModel),
        ...createCachingECClassHierarchyInspector({
          schemaProvider: createECSchemaProvider(iModel.schemaContext),
          cacheSize: 100,
        }),
      };

      for await (const row of imodelAccess.createQueryReader({ ecsql: testProps.inputQuery })) {
        selectables.push({ className: testProps.fullClassName, id: row.ECInstanceId });
      }

      return {
        iModel,
        selection: Selectables.create(selectables),
        provider: createHiliteSetProvider({ imodelAccess }),
      };
    },
    test: async (props) => {
      const iterator = props.provider.getHiliteSet({ selectables: props.selection });
      const counts = {
        elements: 0,
        subCategories: 0,
        models: 0,
      };

      for await (const set of iterator) {
        counts.elements += set.elements.length;
        counts.subCategories += set.subCategories.length;
        counts.models += set.models.length;
      }

      if (testProps.expectedCounts !== undefined) {
        expect(counts.elements).to.eq(testProps.expectedCounts.elements ?? 0);
        expect(counts.subCategories).to.eq(testProps.expectedCounts.subCategories ?? 0);
        expect(counts.models).to.eq(testProps.expectedCounts.models ?? 0);
      }
    },
    cleanup: ({ iModel }) => iModel.close(),
  });
}
