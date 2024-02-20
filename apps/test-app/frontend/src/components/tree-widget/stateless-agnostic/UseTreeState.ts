/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { TreeActions, TreeState } from "./TreeActions";

export interface UseTreeStateProps {
  hierarchyProvider?: HierarchyProvider;
}

export function useTreeState({ hierarchyProvider }: UseTreeStateProps) {
  const [state, setState] = useState<TreeState>({ model: { idToNode: {}, parentChildMap: new Map() }, rootNodes: undefined });
  const [actions] = useState<TreeActions>(() => new TreeActions((updater) => setState(updater)));

  useEffect(() => {
    actions.setHierarchyProvider(hierarchyProvider);
    actions.reloadTree();
    return () => {
      actions.dispose();
    };
  }, [actions, hierarchyProvider]);

  return {
    rootNodes: state.rootNodes,
    treeActions: actions,
  };
}
