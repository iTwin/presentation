/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { type EC, type ECSchemaProvider, getClass, type ValueDescriptor } from "@itwin/presentation-shared";
import {
  createTransformableDescriptor,
  DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY,
} from "../extensions/DescriptorTransformer.js";
import { collectInParallel, getOrCreate } from "../InternalUtils.js";
import { createValueDescriptorFromProperty } from "../model/PropertyValueDescriptor.js";
import { createPathCardinalityClassifier } from "../PathCardinality.js";
import { createPropertyValueDecoder } from "../query/value-loading/RowDecoder.js";
import { collectCalculatedFields } from "./CalculatedFields.js";
import { collectCategories, pruneUnreferencedCategories } from "./Categories.js";
import { createContributionMemoizer } from "./ContributionMemoizer.js";
import { collectDirectPropertyFields } from "./DirectFields.js";
import { collectExternalFields } from "./ExternalFields.js";
import { prepareExternalProviders } from "./ExternalProviders.js";
import { mergePropertyFieldsByIdentity } from "./PropertyFieldMerge.js";
import { collectRelatedPropertyFields } from "./RelatedFields.js";
import { collectValueRequirements } from "./Selectors.js";
import { computePropertySelectorId } from "./ValueSelector.js";

import type { ContentConfiguration } from "../Content.js";
import type { ContentSource } from "../ContentTarget.js";
import type { ContentDescriptor } from "../model/ContentDescriptor.js";
import type { Field, PropertyField } from "../model/Field.js";
import type { PropertyValueReader } from "../query/value-loading/RowDecoder.js";
import type { ExternalInput, ExternalProviderPlan } from "./ExternalProviders.js";
import type { CalculatedValueSelector, PropertyValueSelector, ValueSelector } from "./ValueSelector.js";

/**
 * The descriptor and private requirements for loading its values, built after transforms run.
 *
 * Contains no loaded values. Value requirements and field-to-value mappings remain
 * in provider-owned private state.
 */
export interface ContentDefinition {
  descriptor: ContentDescriptor;
  /**
   * Everything needed to select and decode each column, keyed by selector id. Includes selectors
   * backing no descriptor field (external fields provider inputs).
   */
  selectors: Record<ValueSelector["id"], SelectorDefinition>;
  fieldSelectorIds: Partial<Record<Field["id"], string>>;
  externalInputs: ExternalInput[];
  externalProviders: ExternalProviderPlan[];
  /** Calculated fields contributed to each source, keyed by the original source object. */
  calculatedFieldIdsBySource: Map<ContentSource, Set<Field["id"]>>;
}

/**
 * A {@link ValueSelector} together with whatever decoding its column needs. Calculated selectors read
 * straight from a scalar column, so they need nothing beyond the selector itself.
 */
export type SelectorDefinition = PropertySelectorDefinition | CalculatedValueSelector;

/**
 * A {@link PropertyValueSelector} carrying the resolved value type of the column it selects and the
 * reader that decodes that column's raw value. Pairing them with the selector makes it impossible to
 * project a property column with no way to decode it, and gives the value loader the type it needs to
 * find the navigation target ids a decoded value carries without re-reading schema.
 */
export interface PropertySelectorDefinition extends PropertyValueSelector {
  type: ValueDescriptor;
  read: PropertyValueReader;
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
  const externalFields = collectExternalFields(externalFieldsProviders);
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

  const { inputs: externalInputs, plans: externalProviders } = await prepareExternalProviders({
    providers: externalFieldsProviders,
    sources,
    fields: descriptor.fields,
    classifier,
  });
  const { selectors: rawSelectors, fieldSelectorIds } = collectValueRequirements({
    fields: Object.values(descriptor.fields),
    externalInputs,
  });
  const selectors = await prepareSelectorDefinitions({
    imodelAccess,
    selectors: rawSelectors,
    fields: descriptor.fields,
  });

  return { descriptor, selectors, fieldSelectorIds, externalInputs, externalProviders, calculatedFieldIdsBySource };
}

/**
 * Pairs each selector with whatever decoding its column needs: a property selector gets its value type
 * and the reader derived from it, while a calculated selector passes through unchanged. Types come from
 * the backing descriptor field where there is one, and from schema otherwise.
 */
export async function prepareSelectorDefinitions(props: {
  imodelAccess: ECSchemaProvider;
  selectors: Record<ValueSelector["id"], ValueSelector>;
  fields: ContentDescriptor["fields"];
}): Promise<ContentDefinition["selectors"]> {
  const { imodelAccess, selectors, fields } = props;
  const fieldTypes = new Map<string, ValueDescriptor>();
  for (const field of Object.values(fields)) {
    if (field.kind === "property") {
      const selectorId = computePropertySelectorId(field);
      fieldTypes.set(selectorId, field.type);
    }
  }
  const classes = new Map<EC.FullClassNameDotNotation, Promise<EC.Class>>();
  const definitions: ContentDefinition["selectors"] = {};
  for (const selector of Object.values(selectors)) {
    if (selector.kind !== "property") {
      definitions[selector.id] = selector;
      continue;
    }
    let type = fieldTypes.get(selector.id);
    if (!type) {
      // External input selectors exist whether or not the property has a field — the provider may
      // request one that was never exposed, or whose field a descriptor transformer removed. With no
      // field to take the type from, it comes from the schema.
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
    const applicableClassNames = new Set<string>([declaringClass.fullName, ...declaringClass.getDerivedClassNames()]);
    const decode = createPropertyValueDecoder(type);
    definitions[selector.id] = {
      ...selector,
      type,
      read: (className, value) => (applicableClassNames.has(className) ? decode(value) : undefined),
    };
  }
  return definitions;
}
