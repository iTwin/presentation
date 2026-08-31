/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  createTransformableDescriptor,
  DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY,
} from "../extensions/DescriptorTransformer.js";
import { collectInParallel } from "../InternalUtils.js";
import { collectCalculatedFields } from "./CalculatedFields.js";
import { collectCategories, pruneUnreferencedCategories } from "./Categories.js";
import { createContributionMemoizer } from "./ContributionMemoizer.js";
import { collectDirectPropertyFields } from "./DirectFields.js";
import { collectExternalFields } from "./ExternalFields.js";
import { mergePropertyFieldsByIdentity } from "./PropertyFieldMerge.js";
import { collectRelatedPropertyFields } from "./RelatedFields.js";
import { collectSelectors } from "./Selectors.js";

import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentConfiguration } from "../Content.js";
import type { ContentSource } from "../ContentTarget.js";
import type { ContentDescriptor } from "../model/ContentDescriptor.js";
import type { Field, PropertyField } from "../model/Field.js";

/**
 * Props for {@link buildContentDescriptor}.
 * @internal
 */
interface BuildContentDescriptorProps {
  /** Schema access used to enumerate fields from EC metadata (Stage 2 is schema-only — no queries). */
  imodelAccess: ECSchemaProvider;
  /** Pre-resolved content sources (output of Stage 1). */
  sources: ContentSource[];
  /** Extension point configuration (fields providers, external providers, transformers). */
  config?: ContentConfiguration;
}

/**
 * Builds a {@link (ContentDescriptor:interface)} from pre-resolved content sources (Stage 2 of the
 * content pipeline).
 *
 * Re-calls providers (cheap — no data queries) to recover declaration metadata, reads EC schema
 * metadata to enumerate direct and related property fields, appends calculated and external fields,
 * resolves categories, runs descriptor transformers, and assembles the value selectors.
 *
 * @internal
 */
export async function buildContentDescriptor(props: BuildContentDescriptorProps): Promise<ContentDescriptor> {
  const { imodelAccess, sources, config } = props;
  const imodelFieldsProviders = config?.imodelFieldsProviders ?? [];
  const externalFieldsProviders = config?.externalFieldsProviders ?? [];
  const imodelFieldsProvidersById = new Map(imodelFieldsProviders.map((provider) => [provider.id, provider]));
  const { getContribution, getAnchorContribution } = createContributionMemoizer({ imodelAccess });

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
        }),
      ]);
      return [...direct, ...related];
    },
  });
  // Merge keeps each field's category facts; `collectCategories` (below) is the single place that
  // turns those facts into category ids and assigns `categoryId` (mutating the merged field objects).
  const mergedPropertyFields = mergePropertyFieldsByIdentity(candidates);

  const [categories, calculatedFields] = await Promise.all([
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

  // Selectors and category pruning reflect the post-transform field set: a removed field drops its
  // selector (unless an external input still requires the column), and its category may fall away.
  return {
    sources: transformed.sources,
    fields: transformed.fields,
    categories: pruneUnreferencedCategories({ fields: transformed.fields, categories: transformed.categories }),
    selectors: collectSelectors({ fields: Object.values(transformed.fields), externalInputs }),
  };
}
