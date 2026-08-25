/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { collectInParallel } from "../InternalUtils.js";
import { collectClassPropertyFields } from "./ClassPropertyFields.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { IModelFieldsProvider, RelatedPropertiesDeclaration } from "../extensions/IModelFieldsProvider.js";
import type { StepPropertySpec } from "../model/PropertySpec.js";
import type { CategorizedField } from "./ClassPropertyFields.js";
import type { GetAnchorContributionFn, GetContributionFn } from "./ContributionMemoizer.js";

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
 * A group's `nested` metadata (see `ResolvedDeclarationGroup`) means the declaration was applied on a
 * *nested anchor* rather than directly on this source's target: the declaration is instead recovered
 * via `getAnchorContribution` (the contribution the provider returns for the anchor class), and each
 * `StepPropertySpec.stepIndex` is relative to the *nested suffix* — `nested.prefixStepCount` is added
 * to translate it into an index of the full (already prefix + suffix) `path` stored on the group.
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
  getAnchorContribution: GetAnchorContributionFn;
  imodelFieldsProvidersById: ReadonlyMap<IModelFieldsProvider["id"], IModelFieldsProvider>;
}): Promise<RelatedCandidate[]> {
  const { imodelAccess, source, getContribution, getAnchorContribution, imodelFieldsProvidersById } = props;
  // Enumerate each declaration group concurrently, but flatten the results in input order so the
  // candidate order is deterministic across runs — downstream merge tie-breaking (equal-priority
  // inter-provider conflicts) resolves to input order.
  return collectInParallel({
    inputs: source.resolvedDeclarations,
    expand: async (group) => {
      const provider = imodelFieldsProvidersById.get(group.providerId);
      if (!provider) {
        throw new Error(
          `Content configuration is missing the iModel fields provider "${group.providerId}" that resolved a related-properties declaration for target "${source.target.primaryClass}"${describeNestedContext(group)}.`,
        );
      }
      const contribution = group.nested
        ? await getAnchorContribution({ provider, anchorClassName: group.nested.anchorClassName })
        : await getContribution({ provider, target: source.target });
      const declaration = contribution?.relatedProperties?.[group.declarationIndex];
      if (!declaration) {
        throw new Error(
          `iModel fields provider "${group.providerId}" no longer returns the related-properties declaration at index ${group.declarationIndex} for target "${source.target.primaryClass}"${describeNestedContext(group)}.`,
        );
      }
      const stepIndexOffset = group.nested?.prefixStepCount ?? 0;
      const perPath = await Promise.all(
        group.paths.map(async ({ path, targetClassNames }) =>
          createFieldsForPath({
            imodelAccess,
            path,
            properties: declaration.properties,
            primaryClassNames: targetClassNames,
            stepIndexOffset,
          }),
        ),
      );
      return perPath.flat().map((enumerated) => ({ ...enumerated, provider }));
    },
  });
}

/** Describes a group's nested-anchor context for error messages, or `""` for a base (non-nested) group. */
function describeNestedContext(group: ContentSource["resolvedDeclarations"][number]): string {
  return group.nested ? ` (nested anchor "${group.nested.anchorClassName}")` : "";
}

/** Enumerates the property fields of a single concrete relationship path. */
async function createFieldsForPath(props: {
  imodelAccess: ECSchemaProvider;
  path: RelationshipPath;
  properties: RelatedPropertiesDeclaration["properties"];
  /** Concrete primary classes whose instances connect to `path` (the path's first-step source end). */
  primaryClassNames: EC.FullClassNameDotNotation[];
  /**
   * For a nested group, how many leading steps of `path` are the prefix (from the original target to
   * the anchor) — added to each `StepPropertySpec.stepIndex` (suffix-relative) to get an index into
   * `path`. `0` for a base (non-nested) declaration.
   */
  stepIndexOffset: number;
}): Promise<CategorizedField[]> {
  const { imodelAccess, path, properties, primaryClassNames, stepIndexOffset } = props;

  // Default (no per-step specs): all properties of the final step's target class. `path` is always the
  // full path (prefix + suffix for a nested group), so its last step is already the suffix's last step
  // — no offset needed here.
  if (properties === undefined) {
    const lastStep = path[path.length - 1];
    return collectClassPropertyFields({
      propertiesClass: await getClass(imodelAccess, lastStep.targetClassName),
      valueClassNames: [lastStep.targetClassName],
      relationshipInfo: { pathFromTarget: path, primaryClassNames },
      spec: { select: "all" },
      anchor: "targetClass",
    });
  }

  // Opt-in: only the classes explicitly named by each step's `target`/`relationship`.
  const perStep = await Promise.all(
    properties.map(async (stepSpec) =>
      createFieldsForStep({ imodelAccess, path, stepSpec, primaryClassNames, stepIndexOffset }),
    ),
  );
  return perStep.flat();
}

/** Enumerates the target-class and relationship-class fields opted in by a single `StepPropertySpec`. */
async function createFieldsForStep(props: {
  imodelAccess: ECSchemaProvider;
  path: RelationshipPath;
  stepSpec: StepPropertySpec;
  /** Concrete primary classes whose instances connect to `path` (the path's first-step source end). */
  primaryClassNames: EC.FullClassNameDotNotation[];
  /** See {@link createFieldsForPath}. */
  stepIndexOffset: number;
}): Promise<CategorizedField[]> {
  const { imodelAccess, path, stepSpec, primaryClassNames, stepIndexOffset } = props;
  const effectiveStepIndex = stepIndexOffset + stepSpec.stepIndex;
  if (effectiveStepIndex < 0 || effectiveStepIndex >= path.length) {
    if (stepIndexOffset > 0) {
      const suffixLength = path.length - stepIndexOffset;
      throw new Error(
        `Related-properties declaration references step index ${stepSpec.stepIndex}, but the resolved nested suffix only has ${suffixLength} step(s).`,
      );
    }
    throw new Error(
      `Related-properties declaration references step index ${stepSpec.stepIndex}, but the resolved path only has ${path.length} step(s).`,
    );
  }
  const step = path[effectiveStepIndex];
  const pathFromTarget = path.slice(0, effectiveStepIndex + 1);
  const enumerated: CategorizedField[] = [];
  if (stepSpec.target) {
    enumerated.push(
      ...collectClassPropertyFields({
        propertiesClass: await getClass(imodelAccess, step.targetClassName),
        valueClassNames: [step.targetClassName],
        relationshipInfo: { pathFromTarget, primaryClassNames },
        spec: stepSpec.target,
        anchor: "targetClass",
      }),
    );
  }
  if (stepSpec.relationship) {
    enumerated.push(
      ...collectClassPropertyFields({
        propertiesClass: await getClass(imodelAccess, step.relationshipName),
        valueClassNames: [step.relationshipName],
        relationshipInfo: { pathFromTarget, primaryClassNames },
        spec: stepSpec.relationship,
        anchor: "relationshipClass",
      }),
    );
  }
  return enumerated;
}
