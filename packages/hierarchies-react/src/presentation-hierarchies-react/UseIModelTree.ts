/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback } from "react";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { useTree, useUnifiedSelectionTree } from "./UseTree.js";

import type { HierarchyDefinition, HierarchySearchPath } from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";
import type { UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection.js";
import type { UseTreeProps, UseTreeResult } from "./UseTree.js";

/** @public */
type IModelHierarchyProviderProps = Props<typeof createIModelHierarchyProvider>;

/** @public */
type IModelAccess = IModelHierarchyProviderProps["imodelAccess"];

/**
 * Props for `useIModelTree` and `useIModelUnifiedSelectionTree` hooks.
 * @public
 */
type UseIModelTreeProps = Omit<UseTreeProps, "getHierarchyProvider" | "getSearchPaths"> &
  Pick<IModelHierarchyProviderProps, "localizedStrings" | "imodelAccess" | "imodelChanged"> & {
    /** Provides the hierarchy definition for the tree. */
    getHierarchyDefinition: (props: { imodelAccess: IModelAccess }) => HierarchyDefinition;

    /** Provides paths to target nodes. */
    getSearchPaths?: (props: {
      /** Object that provides access to the iModel schema and can run queries against the iModel. */
      imodelAccess: IModelAccess;
      /** Signal indicating that that the request was canceled */
      abortSignal: AbortSignal;
    }) => Promise<HierarchySearchPath[] | undefined>;
  };

/**
 * A React hook that creates state for a tree component whose displayed hierarchy is based on
 * iModel data.
 *
 * The hook uses `@itwin/presentation-hierarchies` package to load the hierarchy data and returns a
 * component-agnostic result which may be used to render the hierarchy using any UI framework.
 *
 * See `README.md` for an example
 *
 * @see `useTree`
 * @see `useIModelUnifiedSelectionTree`
 * @public
 */
export function useIModelTree(props: UseIModelTreeProps): UseTreeResult {
  const { imodelAccess, imodelChanged, getHierarchyDefinition, getSearchPaths, localizedStrings, ...rest } = props;
  return useTree({
    ...rest,
    ...useIModelTreeProps({ imodelAccess, imodelChanged, getHierarchyDefinition, getSearchPaths, localizedStrings }),
  });
}

/**
 * A React hook that creates state for a tree component whose displayed hierarchy is based on
 * iModel data and that is integrated with unified selection through the given selection
 * storage (previously the storage was provided through the, now deprecated, `UnifiedSelectionProvider`).
 *
 * The hook uses `@itwin/presentation-hierarchies` package to load the hierarchy data and returns a
 * component-agnostic result which may be used to render the hierarchy using any UI framework.
 *
 * See `README.md` for an example
 *
 * @see `useIModelTree`
 * @see `useUnifiedSelectionTree`
 * @see `UnifiedSelectionProvider`
 * @public
 */
export function useIModelUnifiedSelectionTree(props: UseIModelTreeProps & UseUnifiedTreeSelectionProps): UseTreeResult {
  const { imodelAccess, imodelChanged, getHierarchyDefinition, getSearchPaths, localizedStrings, ...rest } = props;
  return useUnifiedSelectionTree({
    ...rest,
    ...useIModelTreeProps({ imodelAccess, imodelChanged, getHierarchyDefinition, getSearchPaths, localizedStrings }),
  });
}

function useIModelTreeProps(
  props: Pick<UseIModelTreeProps, "imodelAccess" | "imodelChanged" | "getHierarchyDefinition" | "getSearchPaths" | "localizedStrings">,
): Pick<UseTreeProps, "getHierarchyProvider" | "getSearchPaths"> {
  const { imodelAccess, imodelChanged, getHierarchyDefinition, getSearchPaths, localizedStrings } = props;
  return {
    getHierarchyProvider: useCallback(
      () =>
        createIModelHierarchyProvider({
          imodelAccess,
          imodelChanged,
          hierarchyDefinition: getHierarchyDefinition({ imodelAccess }),
          localizedStrings,
        }),
      [imodelAccess, imodelChanged, getHierarchyDefinition, localizedStrings],
    ),
    getSearchPaths: useCallback(
      async ({ abortSignal }: { abortSignal: AbortSignal }) => getSearchPaths?.({ imodelAccess, abortSignal }),
      [imodelAccess, getSearchPaths],
    ),
  };
}
