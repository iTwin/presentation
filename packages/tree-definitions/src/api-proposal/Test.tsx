/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useState, useMemo } from "react";
import { Props } from "@itwin/presentation-shared";
import { createClassificationsTree } from "./Proposal.js";
import {
  ClassificationsTreeIdsProvider,
  useSharedTreeContext,
  type ClassificationsTreeHierarchyConfiguration,
} from "./Shared.js";

function useState<T>(value: T | (() => T)): [T, (newValue: T) => void] {
  let x = typeof value === "function" ? (value as () => T)() : value;
  return [
    x,
    (newValue: T) => {
      x = newValue;
    },
  ];
}
function useCallback<T>(cb: (props?: any) => T, _deps: any[]): (props?: any) => T {
  return cb;
}

const hierarchyConfig: ClassificationsTreeHierarchyConfiguration = { rootClassificationSystemCode: "default" };

function useClassificationsIdsProviders() {
  const { getCachedIdsProvider } = useSharedTreeContext();
  return {
    getSharedIdsProvider: useCallback(
      (props: Props<NonNullable<Props<typeof createClassificationsTree>["getSharedIdsProvider"]>>) =>
        getCachedIdsProvider({
          imodelAccess: props.imodelAccess,
          cacheKey: JSON.stringify(props.hierarchyConfig),
          // may create my own provider, which uses default one;
          factory: () => props.createDefault(),
        }),
      [getCachedIdsProvider],
    ),
    getIdsProvider: useCallback(
      (props: Props<NonNullable<Props<typeof createClassificationsTree>["getIdsProvider"]>>) =>
        getCachedIdsProvider({
          imodelAccess: props.imodelAccess,
          cacheKey: JSON.stringify(props.hierarchyConfig),
          // may create my own provider, which uses default one; use props.sharedIdsProvider if needed
          factory: () => props.createDefault(),
        }),
      [getCachedIdsProvider],
    ),
  };
}

function Tree(props: { imodelAccess: any }) {
  const { getSharedIdsProvider, getIdsProvider } = useClassificationsIdsProviders();
  const [searchText, setSearchText] = useState("");
  const [modelsTree] = useState(() =>
    createClassificationsTree({
      imodelAccess: props.imodelAccess,
      hierarchyConfig,
      getSharedIdsProvider,
      getIdsProvider,
    }),
  );
  const { setFormatter, ...treeProps } = useIModelTree({
    imodelAccess: props.imodelAccess,
    getSearchPaths: useMemo(() => {
      return async ({ abortSignal }) =>
        searchText ? modelsTree.createSearchTree({ label: searchText, abortSignal }) : undefined;
    }, [searchText, modelsTree]),
    getHierarchyDefinition: useCallback(() => modelsTree.getHierarchyDefinition(), [modelsTree]),
  });
}

export function useCategoriesTree(props: UseCategoriesTreeProps): UseCategoriesTreeResult {
  const [viewType, setViewType] = useState<"2d" | "3d">(activeView.viewType === "2d" ? "2d" : "3d");

  const { getSharedIdsProvider, getIdsProvider } = useCategoriesIdsProviders({
    imodel: props.imodelAccess,
    activeViewType: activeView.viewType === "2d" ? "2d" : "3d",
    hierarchyConfig,
  });
  const [categoriesTree] = useState(() =>
    createClassificationsTree({
      imodelAccess: props.imodelAccess,
      hierarchyConfig,
      getSharedIdsProvider,
      getIdsProvider,
    }),
  );
  const idsCache = categoriesTree.idsProvider;

  const { visibilityHandlerFactory, onSearchPathsChanged } = useCategoriesCachedVisibility({
    activeView,
    viewType,
    idsCache,
    hierarchyConfig,
  });

  const onNodeExpanded = useCallback(() => {
    void idsCache.preloadDefinitionContainers();
    if (hierarchyConfig.elements.nodes === "include") {
      void idsCache.preloadElementModelCategories();
    }
  }, [idsCache, hierarchyConfig]);

  const { getPaths, searchError } = useSearchPaths({
    hierarchyConfig,
    searchText,
    searchLimit,
    idsCache,
    onSearchPathsChanged,
    viewType,
    onCategoriesFiltered,
    componentId,
  });

  return {
    treeProps: {
      treeName: "categories-tree-v2",
      getHierarchyDefinition: categoriesTree.getHierarchyDefinition,
      getSearchPaths: getPaths,
      visibilityHandlerFactory,
      highlightText: searchText,
      onNodeExpanded,
    },
  };
}

function useCategoriesIdsProviders({ activeViewType }: { activeViewType: "2d" | "3d" }) {
  const { getCachedIdsProvider } = useSharedTreeContext();
  return {
    getSharedIdsProvider: useCallback(
      (props: Props<NonNullable<Props<typeof createClassificationsTree>["getSharedIdsProvider"]>>) =>
        // getCachedIdsProvider ensures different trees / components reuse the same ids provider
        getCachedIdsProvider({
          imodelAccess: props.imodelAccess,
          cacheKey: JSON.stringify(props.hierarchyConfig),
          factory: () => props.createDefault(),
        }),
      [getCachedIdsProvider],
    ),
    getIdsProvider: useCallback(
      (props: Props<NonNullable<Props<typeof createClassificationsTree>["getIdsProvider"]>>) =>
        getCachedIdsProvider({
          imodelAccess: props.imodelAccess,
          cacheKey: JSON.stringify(props.hierarchyConfig),
          factory: () =>
            new CategoriesTreeIdsCache({
              baseIdsCache: props.createDefault(),
              type: activeViewType,
              queryExecutor: props.imodelAccess,
              hierarchyConfig: props.hierarchyConfig,
            }),
        }),
      [getCachedIdsProvider],
    ),
  };
}

class CategoriesTreeIdsCache implements ClassificationsTreeIdsProvider {
  public testProperty: string = "test";
  public constructor(props: any) {}
  public preloadDefinitionContainers() {}
  public preloadElementModelCategories() {}
}
