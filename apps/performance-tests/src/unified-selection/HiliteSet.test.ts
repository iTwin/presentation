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
  function createSelection({ fullClassName, start, count, step }: { fullClassName: string; start: number; count: number; step?: number }) {
    const selectables: Selectable[] = [];
    const increment = step ?? 1;
    for (let i = start; i < start + count * increment; i += increment) {
      selectables.push({ className: fullClassName, id: `0x${i.toString(16)}` });
    }
    return Selectables.create(selectables);
  }

  runHiliteTest({
    testName: "50k elements",
    iModelName: "50k elements",
    selection: createSelection({ fullClassName: "BisCore:Element", start: 20, count: 50_000 }),
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "50k group elements",
    iModelName: "50k group member elements",
    selection: createSelection({ fullClassName: "Generic:Group", start: 21, count: 50_000 }),
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "1k subjects",
    iModelName: "1k subjects",
    selection: createSelection({ fullClassName: "BisCore:Subject", start: 17, count: 1_000, step: 2 }),
    expectedCounts: { models: 20 },
  });

  runHiliteTest({
    testName: "50k subcategories",
    iModelName: "50k subcategories",
    selection: createSelection({ fullClassName: "BisCore:SpatialCategory", start: 17, count: 1 }),
    expectedCounts: { subCategories: 50_000 },
  });

  runHiliteTest({
    testName: "50k functional 3D elements",
    iModelName: "50k functional 3D elements",
    selection: createSelection({ fullClassName: "Functional:FunctionalElement", start: 22, count: 50_000, step: 2 }),
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "50k functional 2D elements",
    iModelName: "50k functional 2D elements",
    selection: createSelection({ fullClassName: "Functional:FunctionalElement", start: 23, count: 50_000, step: 2 }),
    // iModel contains one additional 2D element
    expectedCounts: { elements: 50_001 },
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
