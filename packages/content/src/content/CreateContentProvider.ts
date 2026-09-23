/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { buildContentDefinition } from "./definition-building/BuildContentDefinition.js";
import { getInstanceKeys } from "./query/GetInstanceKeys.js";
import { getSize } from "./query/GetSize.js";
import { getItems } from "./query/value-loading/GetItems.js";

import type { Props } from "@itwin/presentation-shared";
import type { ContentProvider, createContentProvider } from "./Content.js";
import type { ContentDefinition } from "./definition-building/BuildContentDefinition.js";

/**
 * Builds the stateful content provider returned by `createContentProvider`.
 *
 * The descriptor is built lazily on the first `getContentDescriptor` call and cached; the
 * remaining methods are query-stage concerns handled by later pipeline stages.
 */
export function createContentProviderImpl(props: Props<typeof createContentProvider>): ContentProvider {
  const { imodelAccess, sources, config } = props;
  let definition: Promise<ContentDefinition> | undefined;
  async function getContentDefinition() {
    definition ??= buildContentDefinition({ imodelAccess, sources, config });
    return definition;
  }

  return {
    async getContentDescriptor() {
      const contentDefinition = await getContentDefinition();
      return contentDefinition.descriptor;
    },
    async getSize(options) {
      return getSize({ imodelAccess, sources, filters: options?.filters });
    },
    getInstanceKeys(options) {
      return getInstanceKeys({ imodelAccess, sources, filters: options?.filters });
    },
    getItems(options) {
      return getItems({
        imodelAccess,
        getContentDefinition,
        sources,
        filters: options?.filters,
        sorting: options?.sorting,
      });
    },
  };
}
