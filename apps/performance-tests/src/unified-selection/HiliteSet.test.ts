/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { SnapshotDb } from "@itwin/core-backend";
import { SchemaContext, SchemaJsonLocater } from "@itwin/ecschema-metadata";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createHiliteSetProvider, Selectables } from "@itwin/unified-selection";
import { Datasets, IModelName } from "../util/Datasets";
import { queryInstanceIds, run, RunOptions } from "../util/TestUtilities";

describe("hilite", () => {
  runHiliteTest({
    testName: "50k elements",
    iModelName: "50k elements",
    fullClassName: "BisCore:Element",
    userLabel: "test_element",
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "50k group elements",
    iModelName: "50k group member elements",
    fullClassName: "BisCore:GroupInformationElement",
    userLabel: "test_group",
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "1k subjects",
    iModelName: "1k subjects",
    fullClassName: "BisCore:Subject",
    userLabel: "test_subject",
    expectedCounts: { models: 20 },
  });

  runHiliteTest({
    testName: "50k subcategories",
    iModelName: "50k subcategories",
    fullClassName: "BisCore:SpatialCategory",
    userLabel: "test_category",
    expectedCounts: { subCategories: 50_000 },
  });

  runHiliteTest({
    testName: "50k functional 3D elements",
    iModelName: "50k functional 3D elements",
    fullClassName: "Functional:FunctionalElement",
    userLabel: "test_functional_element",
    expectedCounts: { elements: 50_000 },
  });

  runHiliteTest({
    testName: "50k functional 2D elements",
    iModelName: "50k functional 2D elements",
    fullClassName: "Functional:FunctionalElement",
    userLabel: "test_functional_element",
    // iModel contains one additional 2D element
    expectedCounts: { elements: 50_001 },
  });
});

function runHiliteTest(
  testProps: {
    fullClassName: string;
    userLabel: string;
    iModelName: IModelName;
    expectedCounts?: { elements?: number; subCategories?: number; models?: number };
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { iModelName } = testProps;
  run({
    ...testProps,
    setup: async () => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath(iModelName));
      const schemas = new SchemaContext();
      const locater = new SchemaJsonLocater((schemaName) => iModel.getSchemaProps(schemaName));
      schemas.addLocater(locater);

      const imodelAccess = {
        ...createECSchemaProvider(schemas),
        ...createECSqlQueryExecutor(iModel),
      };
      const ids = await queryInstanceIds({ queryExecutor: imodelAccess, fullClassName: testProps.fullClassName, userLabel: testProps.userLabel });
      const selection = Selectables.create(ids.map((id) => ({ className: testProps.fullClassName, id })));

      return {
        iModel,
        selection,
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
