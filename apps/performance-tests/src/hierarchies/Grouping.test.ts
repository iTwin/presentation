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
    classCount,
  } = DATASETS["50k elements in 500 classes"];
  const expectedNodeCount = elementCount + classCount;
  const baseFullClassName: EC.FullClassNameDotNotation = `${schemaName}.${baseClassName}`;

  runHierarchyTest({
    testName: "by label",
    imodelName: "50k elements in 500 classes",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byLabel: true } },
  });

  runHierarchyTest({
    testName: "by class",
    imodelName: "50k elements in 500 classes",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byClass: true } },
  });

  runHierarchyTest({
    testName: "by property",
    imodelName: "50k elements in 500 classes",
    fullClassName: baseFullClassName,
    expectedNodeCount,
    nodeSelectProps: {
      grouping: {
        byProperties: {
          propertiesClassName: baseFullClassName,
          propertyGroups: [{ propertyName, propertyClassAlias: "this" }],
        },
      },
    },
  });

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
