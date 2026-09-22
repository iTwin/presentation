/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getOrCreate } from "../InternalUtils.js";
import { serializeRelationshipPath } from "../model/Utils.js";
import { validateExternalInputs } from "../ValidateExternalInputs.js";
import { computePropertySelectorId } from "./ValueSelector.js";

import type { RelationshipPath } from "@itwin/presentation-shared";
import type { CardinalityHint, ContentSource } from "../ContentTarget.js";
import type { ExternalFieldsProvider, InputPropertyDeclaration } from "../extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../model/ContentDescriptor.js";
import type { PathCardinalityClassifier } from "../PathCardinality.js";

/** Property coordinates and resolved cardinality required by an external input's query. */
export interface ExternalInput extends Pick<InputPropertyDeclaration, "propertyClassName" | "propertyName"> {
  pathFromTarget?: RelationshipPath;
  /** Resolved for this concrete path. Always `"one"` for direct properties. */
  cardinality: CardinalityHint;
}

/** Prepared bindings for a provider's surviving output fields and declared inputs. */
export interface ExternalProviderPlan {
  provider: ExternalFieldsProvider;
  inputs: Array<{
    key: string;
    selectors: Array<{ selectorId: string; pathKey?: string }>;
    /** The input's value shape across all its concrete paths, independent of shared query loading. */
    cardinality: CardinalityHint;
  }>;
  outputs: Array<{ localId: string; fieldId: string }>;
}

/**
 * Prepares query requirements and value bindings together from provider input declarations.
 * Input columns remain required even when descriptor transforms remove all of a provider's outputs.
 */
export async function prepareExternalProviders(props: {
  providers: ExternalFieldsProvider[];
  sources: ContentSource[];
  fields: ContentDescriptor["fields"];
  classifier: PathCardinalityClassifier;
}): Promise<{ inputs: ExternalInput[]; plans: ExternalProviderPlan[] }> {
  validateExternalInputs(props.providers);
  const pathsByProvider = collectResolvedInputPaths(props);
  const prepared = await Promise.all(
    props.providers.map(async (provider) =>
      prepareProvider({
        provider,
        fields: props.fields,
        pathsByInput: pathsByProvider.get(provider.id),
        classifier: props.classifier,
      }),
    ),
  );
  return {
    inputs: prepared.flatMap(({ inputs }) => inputs),
    plans: prepared.flatMap(({ plan }) => (plan ? [plan] : [])),
  };
}

async function prepareProvider(props: {
  provider: ExternalFieldsProvider;
  fields: ContentDescriptor["fields"];
  pathsByInput?: Map<string, Map<string, RelationshipPath>>;
  classifier: PathCardinalityClassifier;
}): Promise<{ inputs: ExternalInput[]; plan?: ExternalProviderPlan }> {
  const { provider, fields, pathsByInput, classifier } = props;
  const outputs = provider.fields
    .map(({ id }) => ({ localId: id, fieldId: `${provider.id}:${id}` }))
    .filter(({ fieldId }) => fieldId in fields);
  const declarations: Array<[string, InputPropertyDeclaration]> = Object.entries(provider.inputs ?? {});
  const prepared = await Promise.all(
    declarations.map(async ([key, declaration]) =>
      prepareInput({
        key,
        declaration,
        resolvedPaths: pathsByInput?.get(key),
        classifier,
        includePlan: outputs.length > 0,
      }),
    ),
  );
  const inputPlans = prepared.flatMap(({ plan }) => (plan ? [plan] : []));
  return {
    inputs: prepared.flatMap(({ inputs }) => inputs),
    plan: outputs.length === 0 ? undefined : { provider, outputs, inputs: inputPlans },
  };
}

/**
 * Prepares query requirements per resolved path and one provider input binding across all those paths.
 *
 * The two cardinality classifications serve different purposes. Without a hint, a declared relationship
 * may be many-valued while its derived relationships are each one-valued. Each concrete query requirement
 * can then be one-valued, but the provider input must combine their values into an array.
 *
 * When the resolved and declared paths are identical, the classifier reuses its cached result.
 */
async function prepareInput(props: {
  key: string;
  declaration: InputPropertyDeclaration;
  resolvedPaths?: Map<string, RelationshipPath>;
  classifier: PathCardinalityClassifier;
  includePlan: boolean;
}): Promise<{ inputs: ExternalInput[]; plan?: ExternalProviderPlan["inputs"][number] }> {
  const { key, declaration, resolvedPaths, classifier, includePlan } = props;
  // Retain unresolved declarations for schema validation and missing-value handling.
  const paths = resolvedPaths?.size ? [...resolvedPaths.values()] : [declaration.related?.path];
  const inputs = await Promise.all(
    paths.map(async (pathFromTarget): Promise<ExternalInput> => ({
      propertyClassName: declaration.propertyClassName,
      propertyName: declaration.propertyName,
      ...(pathFromTarget ? { pathFromTarget } : {}),
      // Loading requirement for this concrete path, not the combined provider input.
      cardinality: pathFromTarget?.length
        ? await classifier.classify({
            path: pathFromTarget,
            declaredPath: pathFromTarget,
            hint: declaration.related?.cardinalityHint,
          })
        : "one",
    })),
  );
  if (!includePlan) {
    return { inputs };
  }
  const plan: ExternalProviderPlan["inputs"][number] = {
    key,
    // Provider input contract across all resolved paths, based on the original declaration.
    cardinality: declaration.related
      ? await classifier.classify({
          path: declaration.related.path,
          declaredPath: declaration.related.path,
          hint: declaration.related.cardinalityHint,
        })
      : "one",
    selectors: inputs.map((input) => ({
      selectorId: computePropertySelectorId(input),
      ...(input.pathFromTarget?.length ? { pathKey: serializeRelationshipPath({ path: input.pathFromTarget }) } : {}),
    })),
  };
  return { inputs, plan };
}

function collectResolvedInputPaths(props: {
  providers: ExternalFieldsProvider[];
  sources: ContentSource[];
}): Map<string, Map<string, Map<string, RelationshipPath>>> {
  const providersById = new Map(props.providers.map((provider) => [provider.id, provider]));
  const pathsByProvider = new Map<string, Map<string, Map<string, RelationshipPath>>>();
  for (const source of props.sources) {
    for (const group of source.resolvedExternalInputs) {
      const provider = providersById.get(group.providerId);
      if (!provider) {
        throw new Error(
          `Content configuration is missing the external fields provider "${group.providerId}" that resolved input "${group.inputKey}" for target "${source.target.primaryClass}".`,
        );
      }
      const declarations: Readonly<Partial<Record<string, InputPropertyDeclaration>>> = provider.inputs ?? {};
      const declaration = declarations[group.inputKey];
      if (!declaration?.related) {
        throw new Error(
          `External fields provider "${group.providerId}" no longer declares related input "${group.inputKey}" for target "${source.target.primaryClass}".`,
        );
      }
      const byInputKey = getOrCreate({ map: pathsByProvider, key: group.providerId, createFunc: () => new Map() });
      const paths = getOrCreate({ map: byInputKey, key: group.inputKey, createFunc: () => new Map() });
      for (const { path } of group.paths) {
        paths.set(serializeRelationshipPath({ path }), path);
      }
    }
  }
  return pathsByProvider;
}
