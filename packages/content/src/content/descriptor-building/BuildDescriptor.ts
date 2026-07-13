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
import { createDirectPropertyFields } from "./DirectFields.js";
import { collectExternalFields } from "./ExternalFields.js";
import { mergePropertyFieldsByIdentity } from "./PropertyFieldMerge.js";
import { createRelatedPropertyFields } from "./RelatedFields.js";
import { collectSelectors } from "./Selectors.js";

import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentConfiguration } from "../Content.js";
import type { ContentSource } from "../ContentTarget.js";
import type { ContentDescriptor } from "../model/ContentDescriptor.js";

/**
 * Props for {@link buildContentDescriptor}.
 * @internal
 */
interface BuildContentDescriptorProps {
  /** Schema access used to enumerate fields from EC metadata (Stage 2 is schema-only — no queries). */
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector;
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
  const providers = config?.fieldsProviders ?? [];
  const externalProviders = config?.externalFieldsProviders ?? [];
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const { getContribution } = createContributionMemoizer({ imodelAccess });

  const candidates = await collectInParallel(sources, async (source) => {
    const [direct, related] = await Promise.all([
      createDirectPropertyFields({ imodelAccess, source }),
      createRelatedPropertyFields({ imodelAccess, source, getContribution, providersById }),
    ]);
    return [...direct, ...related];
  });
  const propertyFields = mergePropertyFieldsByIdentity(candidates);

  const [categories, calculatedFields] = await Promise.all([
    collectCategories({ imodelAccess, sources, providers, externalProviders, getContribution, fields: propertyFields }),
    collectCalculatedFields({ sources, providers, getContribution }),
  ]);
  const { fields: externalFields, inputs: externalInputs } = collectExternalFields(externalProviders);

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
    categories: pruneUnreferencedCategories(transformed.fields, transformed.categories),
    selectors: collectSelectors(Object.values(transformed.fields), externalInputs),
  };
}
