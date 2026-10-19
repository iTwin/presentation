/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useState, useMemo, useCallback } from "react";
import { Props } from "@itwin/presentation-shared";
import { createClassificationsTree } from "./Proposal.js";
import { useSharedTreeContext, type ClassificationsTreeHierarchyConfiguration, } from "./Shared.js";

const hierarchyConfig: ClassificationsTreeHierarchyConfiguration = {
  rootClassificationSystemCode: "default",
};

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
  const [modelsTree] = useState(
    () => createClassificationsTree({
      imodelAccess: props.imodelAccess,
      hierarchyConfig,
      getSharedIdsProvider,
      getIdsProvider,
    }),
  );
  const { setFormatter, ...treeProps } = useIModelTree({
    imodelAccess: props.imodelAccess,
    getSearchPaths: useMemo(() => {
      return async ({ abortSignal }) => searchText ? modelsTree.createSearchTree({ label: searchText, abortSignal }) : undefined;
    }, [searchText, modelsTree]),
    getHierarchyDefinition: useCallback(
      () => modelsTree.getHierarchyDefinition(),
      [modelsTree],
    ),
  });
}
