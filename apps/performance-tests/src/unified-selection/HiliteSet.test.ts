/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect } from "vitest";
import { SnapshotDb } from "@itwin/core-backend";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createHiliteSetProvider, Selectables } from "@itwin/unified-selection";
import { Datasets } from "../util/Datasets.js";
import { run } from "../util/TestUtilities.js";

import type { Selectable } from "@itwin/unified-selection";
import type { Dataset, IModelName } from "../util/Datasets.js";
import type { RunOptions } from "../util/TestUtilities.js";

describe("hilite", () => {
  runHiliteTest({
    testName: "50k elements",
    imodelName: "50k hierarchical 2D and 3D elements",
    fullClassName: "BisCore.Element",
    inputQuery: "SELECT ECInstanceId FROM BisCore:Element",
    getExpectedCounts: ({ elementCount }) => ({ elements: elementCount }),
  });

  runHiliteTest({
    testName: "50k group elements",
    imodelName: "50k group member elements",
    fullClassName: "BisCore.GroupInformationElement",
    inputQuery: "SELECT ECInstanceId FROM BisCore:GroupInformationElement",
    getExpectedCounts: ({ elementCount }) => ({ elements: elementCount }),
  });

  runHiliteTest({
    testName: "1k subjects",
    imodelName: "1k subjects",
    fullClassName: "BisCore.Subject",
    inputQuery: ({ userLabel }) => `SELECT ECInstanceId FROM BisCore:Subject WHERE UserLabel = '${userLabel}'`,
    // Every subject chain has one model.
    getExpectedCounts: ({ chainCount }) => ({ models: chainCount }),
  });

  runHiliteTest({
    testName: "50k subcategories",
    imodelName: "50k subcategories",
    fullClassName: "BisCore.SpatialCategory",
    inputQuery: "SELECT ECInstanceId FROM BisCore:SpatialCategory",
    getExpectedCounts: ({ elementCount }) => ({ subCategories: elementCount }),
  });

  runHiliteTest({
    testName: "50k functional 3D elements",
    imodelName: "50k functional 3D elements",
    fullClassName: "Functional.FunctionalElement",
    inputQuery: "SELECT ECInstanceId FROM Functional:FunctionalElement",
    getExpectedCounts: ({ elementCount }) => ({ elements: elementCount }),
  });

  runHiliteTest({
    testName: "50k functional 2D elements",
    imodelName: "50k functional 2D elements",
    fullClassName: "Functional.FunctionalElement",
    inputQuery: "SELECT ECInstanceId FROM Functional:FunctionalElement",
    // iModel contains one additional 2D element
    getExpectedCounts: ({ elementCount }) => ({ elements: elementCount + 1 }),
  });
});

function runHiliteTest<TName extends IModelName>(
  testProps: {
    inputQuery: string | ((meta: Dataset<TName>["meta"]) => string);
    fullClassName: string;
    imodelName: TName;
    getExpectedCounts?: (meta: Dataset<TName>["meta"]) => {
      elements?: number;
      subCategories?: number;
      models?: number;
    };
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { imodelName } = testProps;
  run({
    ...testProps,
    setup: async () => {
      const { imodelPath, meta } = Datasets.getDataset({ name: imodelName });
      const imodel = SnapshotDb.openFile(imodelPath);

      const selectables: Selectable[] = [];
      const imodelAccess = { ...createECSqlQueryExecutor(imodel), ...createECSchemaProvider(imodel) };
      const ecsql = typeof testProps.inputQuery === "string" ? testProps.inputQuery : testProps.inputQuery(meta);

      for await (const row of imodelAccess.createQueryReader({ ecsql })) {
        selectables.push({ className: testProps.fullClassName, id: row.ECInstanceId });
      }

      return {
        imodel,
        selection: Selectables.create(selectables),
        provider: createHiliteSetProvider({ imodelAccess }),
        expectedCounts: testProps.getExpectedCounts?.(meta),
      };
    },
    test: async (props) => {
      const iterator = props.provider.getHiliteSet({ selectables: props.selection });
      const counts = { elements: 0, subCategories: 0, models: 0 };

      for await (const set of iterator) {
        counts.elements += set.elements.length;
        counts.subCategories += set.subCategories.length;
        counts.models += set.models.length;
      }

      if (props.expectedCounts !== undefined) {
        expect(counts.elements).toBe(props.expectedCounts.elements ?? 0);
        expect(counts.subCategories).toBe(props.expectedCounts.subCategories ?? 0);
        expect(counts.models).toBe(props.expectedCounts.models ?? 0);
      }
    },
    cleanup: ({ imodel }) => imodel.close(),
  });
}
