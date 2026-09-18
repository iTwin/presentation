/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  type EC,
  type ECSchemaProvider,
  getClass,
  type RelationshipPath,
  type ValueDescriptor,
} from "@itwin/presentation-shared";
import {
  createTransformableDescriptor,
  DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY,
} from "../extensions/DescriptorTransformer.js";
import { collectInParallel, getOrCreate } from "../InternalUtils.js";
import { createValueDescriptorFromProperty } from "../model/PropertyValueDescriptor.js";
import { serializeRelationshipPath } from "../model/Utils.js";
import { collectPathCardinalities, createPathCardinalityClassifier } from "../PathCardinality.js";
import { createPropertyValueDecoder } from "../query/value-loading/RowDecoder.js";
import { collectCalculatedFields } from "./CalculatedFields.js";
import { collectCategories, pruneUnreferencedCategories } from "./Categories.js";
import { createContributionMemoizer } from "./ContributionMemoizer.js";
import { collectDirectPropertyFields } from "./DirectFields.js";
import { collectExternalFields } from "./ExternalFields.js";
import { mergePropertyFieldsByIdentity } from "./PropertyFieldMerge.js";
import { collectRelatedPropertyFields } from "./RelatedFields.js";
import { collectValueRequirements } from "./Selectors.js";
import { computePropertySelectorId } from "./ValueSelector.js";

import type { ContentConfiguration } from "../Content.js";
import type { ContentSource } from "../ContentTarget.js";
import type { ExternalFieldsProvider, InputPropertyDeclaration } from "../extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../model/ContentDescriptor.js";
import type { Field, PropertyField } from "../model/Field.js";
import type { PropertyValueReader } from "../query/value-loading/RowDecoder.js";
import type { ValueSelector } from "./ValueSelector.js";

/**
 * The descriptor and private requirements for loading its values, built after transforms run.
 *
 * Contains no loaded values. Value requirements and field-to-value mappings remain
 * in provider-owned private state.
 */
export interface ContentDefinition {
  descriptor: ContentDescriptor;
  selectors: Record<ValueSelector["id"], ValueSelector>;
  propertyReaders: Record<ValueSelector["id"], PropertyValueReader>;
  fieldSelectorIds: Partial<Record<Field["id"], string>>;
  externalInputs: Array<{
    propertyClassName: EC.FullClassNameDotNotation;
    propertyName: string;
    pathFromTarget?: RelationshipPath;
    cardinalityHint?: "one" | "many";
  }>;
  externalProviders: Array<{
    provider: ExternalFieldsProvider;
    inputs: Array<{ key: string; selectorId: string; cardinalityHint?: "one" | "many" }>;
    outputs: Array<{ localId: string; fieldId: string }>;
  }>;
  /** Calculated fields contributed to each source, keyed by the original source object. */
  calculatedFieldIdsBySource: Map<ContentSource, Set<Field["id"]>>;
}

/**
 * Props for {@link buildContentDefinition}.
 */
interface BuildContentDefinitionProps {
  /** Schema access used to enumerate fields from EC metadata (Stage 2 is schema-only — no queries). */
  imodelAccess: ECSchemaProvider;
  /** Pre-resolved content sources (output of Stage 1). */
  sources: ContentSource[];
  /** Extension point configuration (fields providers, external providers, transformers). */
  config?: ContentConfiguration;
}

/**
 * Builds the descriptor and its private value-loading requirements without loading values.
 */
export async function buildContentDefinition(props: BuildContentDefinitionProps): Promise<ContentDefinition> {
  const { imodelAccess, sources, config } = props;
  const imodelFieldsProviders = config?.imodelFieldsProviders ?? [];
  const externalFieldsProviders = config?.externalFieldsProviders ?? [];
  const imodelFieldsProvidersById = new Map(imodelFieldsProviders.map((provider) => [provider.id, provider]));
  const { getContribution, getAnchorContribution } = createContributionMemoizer({ imodelAccess });
  const classifier = createPathCardinalityClassifier(imodelAccess);

  const candidates = await collectInParallel({
    inputs: sources,
    expand: async (source) => {
      const [direct, related] = await Promise.all([
        collectDirectPropertyFields({ imodelAccess, source }),
        collectRelatedPropertyFields({
          imodelAccess,
          source,
          getContribution,
          getAnchorContribution,
          imodelFieldsProvidersById,
          classifier,
        }),
      ]);
      return [...direct, ...related];
    },
  });
  // Merge keeps each field's category facts; `collectCategories` (below) is the single place that
  // turns those facts into category ids and assigns `categoryId` (mutating the merged field objects).
  const mergedPropertyFields = mergePropertyFieldsByIdentity(candidates);

  const [categories, { fields: calculatedFields, fieldIdsBySource: calculatedFieldIdsBySource }] = await Promise.all([
    collectCategories({
      imodelAccess,
      sources,
      imodelFieldsProviders,
      externalFieldsProviders,
      getContribution,
      getAnchorContribution,
      fields: mergedPropertyFields,
    }),
    collectCalculatedFields({ sources, imodelFieldsProviders, getContribution }),
  ]);
  const { fields: externalFields, inputs: externalInputs } = collectExternalFields(externalFieldsProviders);
  const propertyFields: Record<Field["id"], PropertyField> = Object.fromEntries(
    mergedPropertyFields.map(({ field }) => [field.id, field]),
  );

  // Everything a transformer operates on — selectors are derived only after transforms run.
  const transformed: Pick<ContentDescriptor, "sources" | "fields" | "categories"> = {
    sources,
    fields: { ...propertyFields, ...calculatedFields, ...externalFields },
    categories,
  };

  // Run descriptor transformers sequentially in ascending priority — each sees prior mutations.
  const transformers = [...(config?.descriptorTransformers ?? [])].sort(
    (a, b) =>
      (a.priority ?? DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY) - (b.priority ?? DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY),
  );
  for (const transformer of transformers) {
    await transformer.transform({ descriptor: createTransformableDescriptor(transformed), imodelAccess });
  }

  const descriptor: ContentDescriptor = {
    sources: transformed.sources,
    fields: transformed.fields,
    categories: pruneUnreferencedCategories({ fields: transformed.fields, categories: transformed.categories }),
  };

  const { selectors, fieldSelectorIds } = collectValueRequirements({
    fields: Object.values(descriptor.fields),
    externalInputs,
  });
  const propertyReaders = await preparePropertyReaders({ imodelAccess, selectors, fields: descriptor.fields });
  const mergedPathCardinalities = collectPathCardinalities(descriptor, externalInputs);

  const externalProviders = await Promise.all(
    (config?.externalFieldsProviders ?? []).map(async (provider) => {
      const outputs = provider.fields
        .map((declaration) => ({ localId: declaration.id, fieldId: `${provider.id}:${declaration.id}` }))
        .filter((output) => output.fieldId in descriptor.fields);
      if (outputs.length === 0) {
        return undefined;
      }
      const inputs: ContentDefinition["externalProviders"][number]["inputs"] = [];
      if (provider.inputs) {
        const entries: ReadonlyArray<[string, InputPropertyDeclaration]> = Object.entries(provider.inputs);
        for (const [key, declaration] of entries) {
          const effectiveCardinalityHint =
            declaration.path && declaration.path.length > 0
              ? await classifier.classify({
                  path: declaration.path,
                  declaredPath: declaration.path,
                  hint: mergedPathCardinalities.get(serializeRelationshipPath({ path: declaration.path })),
                })
              : "one";
          inputs.push({
            key,
            selectorId: computePropertySelectorId({
              propertyClassName: declaration.propertyClassName,
              propertyName: declaration.propertyName,
              pathFromTarget: declaration.path,
            }),
            cardinalityHint: effectiveCardinalityHint,
          });
        }
      }
      return { provider, inputs, outputs };
    }),
  );

  return {
    descriptor,
    selectors,
    propertyReaders,
    fieldSelectorIds,
    externalInputs,
    externalProviders: externalProviders.filter(
      (provider): provider is ContentDefinition["externalProviders"][number] => provider !== undefined,
    ),
    calculatedFieldIdsBySource,
  };
}

export async function preparePropertyReaders(props: {
  imodelAccess: ECSchemaProvider;
  selectors: ContentDefinition["selectors"];
  fields: ContentDescriptor["fields"];
}): Promise<ContentDefinition["propertyReaders"]> {
  const { imodelAccess, selectors, fields } = props;
  const fieldTypes = new Map<string, ValueDescriptor>();
  for (const field of Object.values(fields)) {
    if (field.kind === "property") {
      const selectorId = computePropertySelectorId(field);
      fieldTypes.set(selectorId, field.type);
    }
  }
  const classes = new Map<EC.FullClassNameDotNotation, Promise<EC.Class>>();
  const propertyReaders: ContentDefinition["propertyReaders"] = {};
  for (const selector of Object.values(selectors)) {
    if (selector.kind !== "property") {
      continue;
    }
    let type = fieldTypes.get(selector.id);
    if (!type) {
      const ecClass = await getOrCreate({
        map: classes,
        key: selector.propertyClassName,
        createFunc: async () => getClass(imodelAccess, selector.propertyClassName),
      });
      const property = ecClass.getProperty(selector.propertyName);
      if (!property) {
        throw new Error(`Property "${selector.propertyClassName}.${selector.propertyName}" was not found.`);
      }
      type = createValueDescriptorFromProperty(property);
      if (!type) {
        throw new Error(
          `Property "${selector.propertyClassName}.${selector.propertyName}" has an unsupported value type.`,
        );
      }
    }
    const declaringClass = await getOrCreate({
      map: classes,
      key: selector.propertyClassName,
      createFunc: async () => getClass(imodelAccess, selector.propertyClassName),
    });
    const applicableClassNames = new Set(
      [declaringClass.fullName, ...declaringClass.getDerivedClassNames()].map((name) => name.toLowerCase()),
    );
    const decode = createPropertyValueDecoder(type);
    propertyReaders[selector.id] = (className, value) =>
      applicableClassNames.has(className.toLowerCase()) ? decode(value) : undefined;
  }
  return propertyReaders;
}
