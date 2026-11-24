/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe } from "vitest";
import { DATASETS } from "../util/Datasets.js";
import { runHierarchyTest } from "./RunHierarchyTest.js";

import type { EC } from "@itwin/presentation-shared";

describe("grouping", () => {
  const {
    schema: { name: schemaName, baseClassName, classNamePrefix, propertyName },
    elementCount,
  } = DATASETS["50k elements in 500 classes"];
  const baseFullClassName: EC.FullClassNameDotNotation = `${schemaName}.${baseClassName}`;

  const physicalElementFullClassName = "BisCore.PhysicalElement";
  const baseClassQueryLimit = 10;
  const fullClassNames: EC.FullClassNameDotNotation[] = [
    physicalElementFullClassName,
    baseFullClassName,
    ...[...Array(baseClassQueryLimit).keys()].map(
      (i): EC.FullClassNameDotNotation => `${schemaName}.${classNamePrefix}_${i}`,
    ),
  ];
  runHierarchyTest({
    testName: `by base class (${baseClassQueryLimit} classes)`,
    imodelName: "50k elements in 500 classes",
    fullClassName: baseFullClassName,
    expectedNodeCount: elementCount + fullClassNames.length,
    nodeSelectProps: { grouping: { byBaseClasses: { fullClassNames } } },
  });

  runHierarchyTest({
    testName: "by multiple attributes",
    imodelName: "50k elements in 500 classes",
    fullClassName: baseFullClassName,
    nodeSelectProps: {
      grouping: {
        byBaseClasses: { fullClassNames: [physicalElementFullClassName] },
        byClass: true,
        byLabel: true,
        byProperties: {
          propertiesClassName: baseFullClassName,
          propertyGroups: [{ propertyName, propertyClassAlias: "this" }],
        },
      },
    },
  });
});
