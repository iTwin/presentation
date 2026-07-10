/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentConfiguration } from "./Content.js";
import type { ContentSource } from "./ContentTarget.js";
import type { ContentDescriptor } from "./model/ContentDescriptor.js";

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
 * This is the skeleton that orchestrates those steps; the field-enumeration stages are added
 * incrementally. It currently produces a descriptor carrying the resolved `sources` with empty
 * field/category/selector maps.
 *
 * @internal
 */
export async function buildContentDescriptor(props: BuildContentDescriptorProps): Promise<ContentDescriptor> {
  return { sources: props.sources, fields: {}, categories: {}, selectors: {} };
}
