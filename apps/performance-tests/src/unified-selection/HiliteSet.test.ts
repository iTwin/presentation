/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { SnapshotDb } from "@itwin/core-backend";
import { SchemaContext, SchemaJsonLocater } from "@itwin/ecschema-metadata";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createHiliteSetProvider, Selectable, Selectables } from "@itwin/unified-selection";
import { Datasets, IModelName } from "../util/Datasets";
import { run, RunOptions } from "../util/TestUtilities";

describe("hilite", () => {
  const additionalElementCount = 5;
  const additionalFunctionalElement2dCount = 1;

  function createSelection({ fullClassName, start, count }: { fullClassName: string; start: number; count: number }) {
    const selectables: Selectable[] = [];
    for (let i = start; i < start + count + additionalElementCount; i++) {
      selectables.push({ className: fullClassName, id: `0x${i.toString(16)}` });
    }
    return Selectables.create(selectables);
  }

  runHiliteTest({
    testName: "50k elements",
    iModelName: "50k nested elements",
    selection: createSelection({ fullClassName: "Generic:PhysicalObject", start: 14, count: 50_000 }),
    expectedCounts: { elements: 50000 },
  });

  runHiliteTest({
    testName: "50k group elements",
    iModelName: "50k group member elements",
    selection: createSelection({ fullClassName: "Generic:Group", start: 15, count: 50_000 }),
    expectedCounts: { elements: 50000 },
  });

  runHiliteTest({
    testName: "1k subjects",
    iModelName: "1k nested subjects",
    selection: createSelection({ fullClassName: "BisCore:Subject", start: 11, count: 2_000 }),
    expectedCounts: { models: 20 },
  });

  runHiliteTest({
    testName: "50k subcategories",
    iModelName: "50k subcategories",
    selection: createSelection({ fullClassName: "BisCore:SpatialCategory", start: 11, count: 2_000 }),
    expectedCounts: { subCategories: 50001 },
  });

  runHiliteTest({
    testName: "50k functional 3D elements",
    iModelName: "50k nested functional 3D elements",
    selection: createSelection({ fullClassName: "Functional:FunctionalElement", start: 16, count: 100_000 }),
    expectedCounts: { elements: 50000 },
  });

  runHiliteTest({
    testName: "10k functional 2D elements",
    iModelName: "10k nested functional 2D elements",
    selection: createSelection({ fullClassName: "Functional:FunctionalElement", start: 17, count: 20_000 }),
    expectedCounts: { elements: 10_000 + additionalFunctionalElement2dCount },
  });
});

function runHiliteTest(
  testProps: {
    selection: Selectables;
    iModelName: IModelName;
    expectedCounts?: { elements?: number; subCategories?: number; models?: number };
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { iModelName } = testProps;
  run({
    ...testProps,
    setup: () => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath(iModelName));
      const schemas = new SchemaContext();
      const locater = new SchemaJsonLocater((schemaName) => iModel.getSchemaProps(schemaName));
      schemas.addLocater(locater);

      return {
        iModel,
        provider: createHiliteSetProvider({
          imodelAccess: {
            ...createECSchemaProvider(schemas),
            ...createECSqlQueryExecutor(iModel),
          },
        }),
      };
    },
    test: async (props) => {
      const iterator = props.provider.getHiliteSet({ selectables: testProps.selection });
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
