/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import deepEqual from "fast-deep-equal/es6/index.js";
import { useEffect, useMemo, useState } from "react";
import { createIModelContentConfiguration } from "@itwin/presentation-content";
import { getContent } from "./GetContent.js";
import { useAsyncValue } from "./internal/UseAsyncValue.js";

import type { ContentConfiguration, ContentTarget } from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor, Event } from "@itwin/presentation-shared";
import type { Content } from "./GetContent.js";
import type { AsyncValueLoader } from "./internal/UseAsyncValue.js";

/**
 * Props for `useContent`.
 *
 * `imodelAccess`, `imodelChanged` and `getContentConfiguration` should be stable references (e.g. memoized),
 * because changing them loads content again.
 *
 * @public
 */
export interface UseContentProps {
  /** Access to the iModel's schemas and ECSQL queries. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  /**
   * Targets to load content for, usually created from the current selection. Content is loaded again only
   * when the targets change by value. `undefined` or an empty list means there's nothing to load.
   */
  targets: ContentTarget[] | undefined;
  /**
   * An event raised when the iModel's data changes. Content is loaded again, keeping the current content
   * until the new one is ready. Events raised in quick succession result in a single reload.
   */
  imodelChanged?: Event<() => void>;
  /**
   * Creates the content configuration. Defaults to `createIModelContentConfiguration` from
   * `@itwin/presentation-content`. Called before the first load and after creating the configuration failed.
   * The configuration is reused when `imodelChanged` is raised, so pass a new reference to create it again,
   * e.g. after presentation rules change.
   */
  getContentConfiguration?: (props: {
    imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  }) => Promise<ContentConfiguration>;
}

/**
 * Result of `useContent`.
 * @public
 */
export interface UseContentResult {
  /**
   * The loaded content. Undefined when there's nothing to load, while loading content for new targets,
   * and when loading failed. While reloading, holds the previous content.
   */
  content: Content | undefined;
  /** Whether content is being loaded. */
  isLoading: boolean;
  /** The error that made the latest load fail, if any. Rejections with `undefined` are reported as an `Error`. */
  error?: unknown;
  /** Loads content for the current targets again, keeping the current content until the new one is ready. */
  reload: () => void;
}

/** Time to wait for more `imodelChanged` events before reloading content. */
const IMODEL_CHANGE_DEBOUNCE_TIME = 100;

/**
 * A React hook that loads content of the given targets and keeps it up to date.
 *
 * Content is loaded again when targets change by value, when `imodelChanged` is raised or when `reload` is
 * called. Only the latest request affects the result.
 *
 * The result holds raw content, as returned by `@itwin/presentation-content`: the descriptor and one content
 * item per instance. Formatting values and merging values of multiple instances is left to the consumer.
 * Use `getContent` to load content outside React.
 *
 * @public
 */
export function useContent(props: UseContentProps): UseContentResult {
  const { imodelAccess, imodelChanged, getContentConfiguration } = props;
  const targets = useStableValue(props.targets);

  const cachedGetContentConfiguration = useMemo(
    () =>
      cacheConfiguration(async () => (getContentConfiguration ?? createIModelContentConfiguration)({ imodelAccess })),
    [imodelAccess, getContentConfiguration],
  );
  const load = useMemo((): AsyncValueLoader<Content> | undefined => {
    if (!targets || targets.length === 0) {
      return undefined;
    }
    return async ({ signal }) =>
      getContent({
        imodelAccess,
        targets,
        getContentConfiguration: cachedGetContentConfiguration,
        abortSignal: signal,
      });
  }, [imodelAccess, cachedGetContentConfiguration, targets]);
  const { value: content, isLoading, error, reload } = useAsyncValue(load);

  useEffect(() => {
    if (!imodelChanged) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const removeListener = imodelChanged.addListener(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, IMODEL_CHANGE_DEBOUNCE_TIME);
    });
    return () => {
      removeListener();
      clearTimeout(timer);
    };
  }, [imodelChanged, reload]);

  return useMemo(
    (): UseContentResult => ({ content, isLoading, ...(error !== undefined ? { error } : {}), reload }),
    [content, isLoading, error, reload],
  );
}

/** Returns a getter that reuses the created content configuration, unless creating it failed. */
function cacheConfiguration(create: () => Promise<ContentConfiguration>): () => Promise<ContentConfiguration> {
  let cached: Promise<ContentConfiguration> | undefined;
  return async () => {
    if (!cached) {
      const promise = create();
      cached = promise;
      promise.catch(() => {
        cached = undefined;
      });
    }
    return cached;
  };
}

/**
 * Returns the previously returned value for as long as the given value stays equal to it by value. Uses the `es6`
 * variant of `fast-deep-equal`, because targets may carry `Set`-valued `idset` bindings.
 */
function useStableValue<T>(value: T): T {
  const [stableValue, setStableValue] = useState(value);
  if (stableValue !== value && !deepEqual(stableValue, value)) {
    setStableValue(value);
    return value;
  }
  return stableValue;
}
