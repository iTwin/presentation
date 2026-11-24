/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect } from "vitest";
import { resolveContentSources } from "@itwin/presentation-content";
import { runContentTest } from "./ContentTestUtilities.js";

import type { ContentTarget } from "@itwin/presentation-content";

describe("Content source resolution", () => {
  // A broad base-class target forces discovery of all concrete classes present in the data.
  runContentTest({
    testName: "500 concrete classes through 1 target base class",
    imodelName: "50k elements in 500 classes",
    setup: (context) => context,
    test: async ({ imodelAccess, config, dataset: { meta } }) => {
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: `${meta.schema.name}.${meta.schema.baseClassName}` }],
        config,
      });
      expect(sources).toHaveLength(1);
      expect(new Set(sources[0].resolvedPrimaryClasses).size).toBe(meta.classCount);
    },
  });

  // Filtered targets of the same class can't be proven disjoint without a query, so 10 targets result in
  // 45 pairwise overlap queries. The ID modulo splits the 50k elements of the sealed class into 10
  // equally sized, disjoint scopes.
  runContentTest({
    testName: "overlap checks for 10 disjoint scopes of the same class",
    imodelName: "50k group member elements",
    setup: ({ imodelAccess, config, dataset }) => ({
      imodelAccess,
      config,
      targets: Array.from({ length: 10 }, (_, i): ContentTarget => ({
        primaryClass: dataset.meta.physicalElementClassName,
        instanceFilter: {
          expression: "this.ECInstanceId % 10 = :bucket",
          bindings: { bucket: { type: "int", value: i } },
        },
      })),
    }),
    test: async (props) => {
      const sources = await resolveContentSources(props);
      expect(sources).toHaveLength(10);
      expect(sources.every((source) => source.resolvedPrimaryClasses.length === 1)).toBe(true);
    },
  });

  // The aspect provider expands both owned aspects and those on the related type definitions. Every element owns
  // aspects of 7 classes, so all 50k elements have to be checked to find the 70 owned aspect classes.
  runContentTest({
    testName: "owned and type-aspect paths for 50k elements",
    imodelName: "50k elements with properties, types and aspects",
    setup: (context) => context,
    test: async ({ imodelAccess, config, dataset: { meta } }) => {
      const { schema } = meta;
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: `${schema.name}.${schema.className}` }],
        config,
      });
      expect(sources).toHaveLength(1);
      const aspectClassNamePrefix = `${schema.name}.${schema.aspectClassNamePrefix}`;
      const paths = sources[0].resolvedDeclarations.flatMap((group) => group.paths.map(({ path }) => path));
      // Owned aspects are related to the element directly, type aspects - through the element's type.
      const ownedAspectPaths = paths.filter(
        (path) => path.length === 1 && path[0].targetClassName.startsWith(aspectClassNamePrefix),
      );
      const typeAspectPaths = paths.filter(
        (path) =>
          path.length === 2 &&
          path[0].targetClassName === meta.typeClassName &&
          path[1].relationshipName === "BisCore.ElementOwnsUniqueAspect" &&
          path[1].targetClassName.startsWith(aspectClassNamePrefix),
      );
      expect(ownedAspectPaths).toHaveLength(meta.aspectClassCount);
      expect(typeAspectPaths).toHaveLength(meta.aspectClassCount);
    },
  });
});
