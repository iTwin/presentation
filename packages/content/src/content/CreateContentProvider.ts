/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { buildContentDescriptor } from "./descriptor-building/BuildDescriptor.js";
import { getSize } from "./query/GetSize.js";

import type { Props } from "@itwin/presentation-shared";
import type { ContentProvider, createContentProvider } from "./Content.js";
import type { ContentDescriptor } from "./model/ContentDescriptor.js";

/**
 * Builds the stateful content provider returned by `createContentProvider`.
 *
 * The descriptor is built lazily on the first `getContentDescriptor` call and cached; the
 * remaining methods are query-stage concerns handled by later pipeline stages.
 *
 * @internal
 */
export function createContentProviderImpl(props: Props<typeof createContentProvider>): ContentProvider {
  const { imodelAccess, sources, config } = props;
  let descriptor: Promise<ContentDescriptor> | undefined;
  async function getContentDescriptor() {
    descriptor ??= buildContentDescriptor({ imodelAccess, sources, config });
    return descriptor;
  }
  return {
    getContentDescriptor,
    async getSize(options) {
      return getSize({ imodelAccess, sources, queryFilterers: config?.queryFilterers, filters: options?.filters });
    },
    /* v8 ignore next 3 */
    getInstanceKeys() {
      throw new Error("Not implemented");
    },
    /* v8 ignore next 3 */
    getItems() {
      throw new Error("Not implemented");
    },
  };
}
