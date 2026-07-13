/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collectInParallel } from "../InternalUtils.js";
import { collectCategories } from "./Categories.js";
import { createContributionMemoizer } from "./ContributionMemoizer.js";
import { createDirectPropertyFields } from "./DirectFields.js";
import { mergePropertyFieldsByIdentity } from "./PropertyFieldMerge.js";
import { createRelatedPropertyFields } from "./RelatedFields.js";

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
 * This is being implemented incrementally. It currently enumerates the direct property fields of
 * each source's primary class and the related property fields reached via each source's resolved
 * relationship paths (merged across sources), and assembles the category registry (provider-declared
 * plus auto-created related-path categories); selector assembly is added in a later stage.
 *
 * @internal
 */
export async function buildContentDescriptor(props: BuildContentDescriptorProps): Promise<ContentDescriptor> {
  const { imodelAccess, sources, config } = props;
  const providers = config?.fieldsProviders ?? [];
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  const { getContribution } = createContributionMemoizer({ imodelAccess });
  const candidates = await collectInParallel(sources, async (source) => {
    const [direct, related] = await Promise.all([
      createDirectPropertyFields({ imodelAccess, source }),
      createRelatedPropertyFields({ imodelAccess, source, getContribution, providersById }),
    ]);
    return [...direct, ...related];
  });
  const fields = mergePropertyFieldsByIdentity(candidates);
  const categories = await collectCategories({ imodelAccess, sources, providers, getContribution, fields });
  return { sources, fields, categories, selectors: {} };
}
