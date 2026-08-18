/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { type ECSchemaProvider, getClass, type RelationshipPath } from "@itwin/presentation-shared";
import { collectInParallel } from "../InternalUtils.js";
import { collectClassPropertyFields } from "./ClassPropertyFields.js";

import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider, RelatedPropertiesDeclaration } from "../extensions/IModelFieldsProvider.js";
import type { StepPropertySpec } from "../model/PropertySpec.js";
import type { CategorizedField } from "./ClassPropertyFields.js";
import type { GetContributionFn } from "./ContributionMemoizer.js";

/** A related property field paired with its category facts and the provider that contributed it. */
type RelatedCandidate = CategorizedField & { provider: IModelFieldsProvider };

/**
 * Enumerates the **related** property fields of a content source — the properties reached by
 * navigating each of the source's resolved relationship paths.
 *
 * Each of the source's `resolvedDeclarations` links back to the provider and declaration that
 * produced it during source resolution (Stage 1). This re-reads that declaration (via
 * `getContribution`) to recover its per-step property specs, then enumerates fields for every
 * concrete path the declaration resolved to:
 *
 * - When the declaration omits `properties`, all properties of each path's final-step target class
 *   are loaded (nothing from intermediate steps or relationship classes).
 * - When `properties` is provided, only the classes explicitly named by each step's `target`
 *   (the step's target class) and `relationship` (the step's relationship class) are loaded —
 *   omitted classes and unlisted steps contribute nothing.
 *
 * A field's `pathFromTarget` is the sub-path from the content target up to and including the step
 * whose class supplies the property, and its `valueClassNames` are that step's concrete class. Each
 * field is paired with the contributing provider (so the merge step can resolve cross-provider
 * metadata conflicts) and its `FieldCategorization` facts — target-class fields anchor to
 * `"targetClass"`, relationship-class fields to `"relationshipClass"`. The categorization pass turns
 * those facts into the actual category tree.
 *
 * @internal
 */
export async function collectRelatedPropertyFields(props: {
  imodelAccess: ECSchemaProvider;
  source: ContentSource;
  getContribution: GetContributionFn;
  imodelFieldsProvidersById: ReadonlyMap<IModelFieldsProvider["id"], IModelFieldsProvider>;
}): Promise<RelatedCandidate[]> {
  const { imodelAccess, source, getContribution, imodelFieldsProvidersById } = props;
  // Enumerate each declaration group concurrently, but flatten the results in input order so the
  // candidate order is deterministic across runs — downstream merge tie-breaking (equal-priority
  // inter-provider conflicts) resolves to input order.
  return collectInParallel({
    inputs: source.resolvedDeclarations,
    expand: async (group) => {
      const provider = imodelFieldsProvidersById.get(group.providerId);
      if (!provider) {
        throw new Error(
          `Content configuration is missing the iModel fields provider "${group.providerId}" that resolved a related-properties declaration for target "${source.target.primaryClass}".`,
        );
      }
      const contribution = await getContribution({ provider, target: source.target });
      const declaration = contribution?.relatedProperties?.[group.declarationIndex];
      if (!declaration) {
        throw new Error(
          `iModel fields provider "${group.providerId}" no longer returns the related-properties declaration at index ${group.declarationIndex} for target "${source.target.primaryClass}".`,
        );
      }
      const perPath = await Promise.all(
        group.paths.map(async ({ path }) =>
          createFieldsForPath({ imodelAccess, path, properties: declaration.properties }),
        ),
      );
      return perPath.flat().map((enumerated) => ({ ...enumerated, provider }));
    },
  });
}

/** Enumerates the property fields of a single concrete relationship path. */
async function createFieldsForPath(props: {
  imodelAccess: ECSchemaProvider;
  path: RelationshipPath;
  properties: RelatedPropertiesDeclaration["properties"];
}): Promise<CategorizedField[]> {
  const { imodelAccess, path, properties } = props;

  // Default (no per-step specs): all properties of the final step's target class.
  if (properties === undefined) {
    const lastStep = path[path.length - 1];
    return collectClassPropertyFields({
      propertiesClass: await getClass(imodelAccess, lastStep.targetClassName),
      pathFromTarget: path,
      valueClassNames: [lastStep.targetClassName],
      spec: { select: "all" },
      anchor: "targetClass",
    });
  }

  // Opt-in: only the classes explicitly named by each step's `target`/`relationship`.
  const perStep = await Promise.all(
    properties.map(async (stepSpec) => createFieldsForStep({ imodelAccess, path, stepSpec })),
  );
  return perStep.flat();
}

/** Enumerates the target-class and relationship-class fields opted in by a single `StepPropertySpec`. */
async function createFieldsForStep(props: {
  imodelAccess: ECSchemaProvider;
  path: RelationshipPath;
  stepSpec: StepPropertySpec;
}): Promise<CategorizedField[]> {
  const { imodelAccess, path, stepSpec } = props;
  if (stepSpec.stepIndex < 0 || stepSpec.stepIndex >= path.length) {
    throw new Error(
      `Related-properties declaration references step index ${stepSpec.stepIndex}, but the resolved path only has ${path.length} step(s).`,
    );
  }
  const step = path[stepSpec.stepIndex];
  const pathFromTarget = path.slice(0, stepSpec.stepIndex + 1);
  const enumerated: CategorizedField[] = [];
  if (stepSpec.target) {
    enumerated.push(
      ...collectClassPropertyFields({
        propertiesClass: await getClass(imodelAccess, step.targetClassName),
        pathFromTarget,
        valueClassNames: [step.targetClassName],
        spec: stepSpec.target,
        anchor: "targetClass",
      }),
    );
  }
  if (stepSpec.relationship) {
    enumerated.push(
      ...collectClassPropertyFields({
        propertiesClass: await getClass(imodelAccess, step.relationshipName),
        pathFromTarget,
        valueClassNames: [step.relationshipName],
        spec: stepSpec.relationship,
        anchor: "relationshipClass",
      }),
    );
  }
  return enumerated;
}
