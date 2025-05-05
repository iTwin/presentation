/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Datasets } from "../util/Datasets";
import { runHierarchyTest } from "./RunHierarchyTest";

describe("grouping", () => {
  const { schemaName, baseClassName, customPropName, itemsPerGroup, defaultClassName } = Datasets.CUSTOM_SCHEMA;
  const expectedNodeCount = 50_000 + 50_000 / itemsPerGroup;
  const baseFullClassName = `${schemaName}.${baseClassName}`;

  runHierarchyTest({
    testName: "by label",
    iModelName: "50k flat elements",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byLabel: true } },
  });

  runHierarchyTest({
    testName: "by class",
    iModelName: "50k flat elements",
    expectedNodeCount,
    nodeSelectProps: { grouping: { byClass: true } },
  });

  runHierarchyTest({
    testName: "by property",
    iModelName: "50k flat elements",
    fullClassName: baseFullClassName,
    expectedNodeCount,
    nodeSelectProps: {
      grouping: {
        byProperties: {
          propertiesClassName: baseFullClassName,
          propertyGroups: [{ propertyName: customPropName, propertyClassAlias: "this" }],
        },
      },
    },
  });

  const physicalElementFullClassName = "BisCore.PhysicalElement";
  const baseClassQueryLimit = 10;
  const fullClassNames = [
    physicalElementFullClassName,
    baseFullClassName,
    ...[...Array(baseClassQueryLimit).keys()].map((i) => `${schemaName}.${defaultClassName}_${i}`),
  ];
  runHierarchyTest({
    testName: `by base class (${baseClassQueryLimit} classes)`,
    iModelName: "50k flat elements",
    fullClassName: baseFullClassName,
    expectedNodeCount: 50_000 + fullClassNames.length,
    nodeSelectProps: {
      grouping: {
        byBaseClasses: { fullClassNames },
      },
    },
  });

  runHierarchyTest({
    testName: "by multiple attributes",
    iModelName: "50k flat elements",
    fullClassName: baseFullClassName,
    nodeSelectProps: {
      grouping: {
        byBaseClasses: { fullClassNames: [physicalElementFullClassName] },
        byClass: true,
        byLabel: true,
        byProperties: {
          propertiesClassName: baseFullClassName,
          propertyGroups: [{ propertyName: customPropName, propertyClassAlias: "this" }],
        },
      },
    },
  });
});
