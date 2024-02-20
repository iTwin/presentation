/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { enableMapSet } from "immer";
import { useEffect, useState } from "react";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { TreeActions, TreeState } from "./TreeActions";

enableMapSet();

export interface UseTreeStateProps {
  hierarchyProvider?: HierarchyProvider;
}

export function useTreeState({ hierarchyProvider }: UseTreeStateProps) {
  const [actions, setActions] = useState<TreeActions>();
  const [state, setState] = useState<TreeState>({ model: { idToNode: {}, parentChildMap: new Map() }, rootNodes: undefined });

  useEffect(() => {
    if (!hierarchyProvider) {
      return;
    }

    const treeActions = new TreeActions((updater) => setState(updater), hierarchyProvider);
    setState({ model: { idToNode: {}, parentChildMap: new Map() }, rootNodes: undefined });
    setActions(treeActions);

    treeActions.loadRootNodes();
    return () => {
      treeActions.dispose();
    };
  }, [hierarchyProvider]);

  return {
    rootNodes: state.rootNodes,
    treeActions: actions,
  };
}
