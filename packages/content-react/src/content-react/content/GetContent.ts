/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { abortable, abortableIterable } from "../Utils.js";

import type {
  ContentConfiguration,
  ContentItem,
  ContentTarget,
  ReadonlyContentDescriptor,
} from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor } from "@itwin/presentation-shared";

/**
 * Content loaded for a set of content targets: the descriptor and one content item per instance.
 * @public
 */
export interface Content {
  /** Describes the loaded fields and their categories. */
  descriptor: ReadonlyContentDescriptor;
  /** One item per loaded instance. Use `item.getValue(field)` to read raw values of descriptor fields. */
  items: ContentItem[];
}

/**
 * Props for `getContent`.
 * @public
 */
interface GetContentProps {
  /** Access to the iModel's schemas and ECSQL queries. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  /** Targets to load content for, usually created from the current selection. */
  targets: ContentTarget[];
  /**
   * Returns the content configuration. Called once per `getContent` call, so cache the result when loading
   * content repeatedly. Defaults to `createIModelContentConfiguration` from `@itwin/presentation-content`.
   */
  getContentConfiguration?: (props: {
    imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  }) => Promise<ContentConfiguration>;
  /** Cancels loading. The returned promise rejects with the signal's reason. */
  abortSignal?: AbortSignal;
}

/**
 * Loads the content descriptor and all content items of the given targets.
 *
 * Values are raw, as returned by `@itwin/presentation-content`. Formatting them and merging values of
 * multiple instances is left to the consumer.
 *
 * Use `useContent` to load content in React components. It keeps content up to date and tracks loading state.
 *
 * The returned promise rejects with the signal's reason as soon as `abortSignal` is aborted, and reading items stops.
 * Resolving content sources and building the descriptor keep running in the background until they complete, because
 * `@itwin/presentation-content` doesn't accept an abort signal yet.
 *
 * @public
 */
export async function getContent(props: GetContentProps): Promise<Content> {
  const { imodelAccess, targets, getContentConfiguration = createIModelContentConfiguration, abortSignal } = props;
  const config = await abortable(async () => getContentConfiguration({ imodelAccess }), abortSignal);
  const sources = await abortable(async () => resolveContentSources({ imodelAccess, targets, config }), abortSignal);
  const provider = createContentProvider({ imodelAccess, sources, config });
  const descriptor = await abortable(async () => provider.getContentDescriptor(), abortSignal);
  const items: ContentItem[] = [];
  for await (const item of abortableIterable(provider.getItems(), abortSignal)) {
    items.push(item);
  }
  return { descriptor, items };
}
