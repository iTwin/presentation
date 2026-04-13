/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
} from "@itwin/presentation-hierarchies";
import {
  createBisInstanceLabelSelectClauseFactory,
  createDefaultInstanceLabelSelectClauseFactory,
} from "@itwin/presentation-shared";
import { initialize, terminate } from "../IntegrationTests.js";
import { buildTestIModel } from "../TestIModelSetup.js";
import { NodeValidators, validateHierarchy } from "./HierarchyValidation.js";
import { createIModelAccess, createProvider } from "./Utils.js";

describe("NodesQueryClauseFactory", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("creates correct labels for BisCore.Model subclasses when outer query uses alias 'e'", async () => {
    const { imodel } = await buildTestIModel(async (builder) => {
      insertPhysicalModelWithPartition({ builder, codeValue: "Test model" });
    });
    const imodelAccess = createIModelAccess(imodel);

    const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });

    const nodesQueryFactory = createNodesQueryClauseFactory({
      imodelAccess,
      instanceLabelSelectClauseFactory: labelsQueryFactory,
    });

    const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => [
          {
            fullClassName: "BisCore.GeometricModel3d",
            query: {
              ecsql: `
                SELECT
                  ${await nodesQueryFactory.createSelectClause({
                    ecClassId: { selector: "e.ECClassId" },
                    ecInstanceId: { selector: "e.ECInstanceId" },
                    nodeLabel: {
                      selector: await labelsQueryFactory.createSelectClause({
                        classAlias: "e",
                        className: "BisCore.GeometricModel3d",
                      }),
                    },
                  })}
                FROM BisCore.GeometricModel3d e
              `,
            },
          },
        ],
        childNodes: [],
      },
    });

    const provider = createProvider({ imodelAccess, hierarchy: hierarchyDefinition });

    await validateHierarchy({
      provider,
      expect: [NodeValidators.createForInstanceNode({ label: "Test model", children: false })],
    });
  });

  it("creates correct labels when outer query uses alias 'c' (same as default label factory's internal alias)", async () => {
    const { imodel } = await buildTestIModel(async (builder) => {
      insertPhysicalModelWithPartition({ builder, codeValue: "Test model" });
    });
    const imodelAccess = createIModelAccess(imodel);

    const labelsQueryFactory = createDefaultInstanceLabelSelectClauseFactory();

    const nodesQueryFactory = createNodesQueryClauseFactory({
      imodelAccess,
      instanceLabelSelectClauseFactory: labelsQueryFactory,
    });

    const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
      classHierarchyInspector: imodelAccess,
      hierarchy: {
        rootNodes: async () => [
          {
            fullClassName: "BisCore.GeometricModel3d",
            query: {
              ecsql: `
                SELECT
                  ${await nodesQueryFactory.createSelectClause({
                    ecClassId: { selector: "c.ECClassId" },
                    ecInstanceId: { selector: "c.ECInstanceId" },
                    nodeLabel: {
                      selector: await labelsQueryFactory.createSelectClause({
                        classAlias: "c",
                        className: "BisCore.GeometricModel3d",
                      }),
                    },
                  })}
                FROM BisCore.GeometricModel3d c
              `,
            },
          },
        ],
        childNodes: [],
      },
    });

    const provider = createProvider({ imodelAccess, hierarchy: hierarchyDefinition });

    await validateHierarchy({
      provider,
      expect: [NodeValidators.createForInstanceNode({ label: "Physical Model [0-H]", children: false })],
    });
  });
});
