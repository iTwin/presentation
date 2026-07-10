/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { mergePropertyFieldsByIdentity } from "../model/PropertyFieldMerge.js";
import { createDirectPropertyFields } from "./DirectFields.js";

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
 * each source's primary class (merged across sources) and carries the resolved `sources`; category
 * and selector assembly are added in later stages.
 *
 * @internal
 */
export async function buildContentDescriptor(props: BuildContentDescriptorProps): Promise<ContentDescriptor> {
  const { imodelAccess, sources } = props;
  const candidates = (
    await Promise.all(sources.map(async (source) => createDirectPropertyFields({ imodelAccess, source })))
  ).flat();
  const fields = mergePropertyFieldsByIdentity(candidates);
  return { sources, fields, categories: {}, selectors: {} };
}
