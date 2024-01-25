/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { RenderedItemsRange, TreeDataProvider, TreeModelSource, TreeNodeLoader } from "@itwin/components-react";
import { HierarchyProvider, IPrimitiveValueFormatter } from "@itwin/presentation-hierarchy-builder";
import { startTreeReload } from "./TreeReloader";

interface ControlledTreeComponents {
  nodeLoader: TreeNodeLoader<TreeDataProvider>;
  modelSource: TreeModelSource;
}

/** @internal */
export function useControlledTreeComponentsState(dataProvider: TreeDataProvider) {
  function createNewComponents(newDataProvider: TreeDataProvider): ControlledTreeComponents {
    const modelSource = new TreeModelSource();
    const nodeLoader = new TreeNodeLoader(newDataProvider, modelSource);
    return { modelSource, nodeLoader };
  }

  const [componentsState, setComponentsState] = useState<ControlledTreeComponents>(() => createNewComponents(dataProvider));

  useEffect(() => {
    setComponentsState(createNewComponents(dataProvider));
  }, [dataProvider]);

  const onReload = useCallback((reloadedTree: ReloadedTree) => {
    const nodeLoader = new TreeNodeLoader(reloadedTree.dataProvider, reloadedTree.modelSource);
    setComponentsState({
      modelSource: reloadedTree.modelSource,
      nodeLoader,
    });
  }, []);

  return { componentsState, onReload };
}

interface ReloadedTree {
  dataProvider: TreeDataProvider;
  modelSource: TreeModelSource;
}

interface FormatterProps {
  formatter?: IPrimitiveValueFormatter;
  hierarchyProvider?: HierarchyProvider;
  dataProvider: TreeDataProvider;
  modelSource: TreeModelSource;
  onReload: (reloadedTree: ReloadedTree) => void;
}

/** @internal */
export function useFormatter(props: FormatterProps) {
  const { formatter, hierarchyProvider, dataProvider, modelSource, onReload } = props;
  const renderedItems = useRef<RenderedItemsRange | undefined>(undefined);
  const onItemsRendered = useCallback((items: RenderedItemsRange) => {
    renderedItems.current = items;
  }, []);

  const startReloadProps = useRef({ dataProvider, modelSource, renderedItems, onReload });

  useEffect(() => {
    startReloadProps.current = { dataProvider, modelSource, renderedItems, onReload };
  }, [dataProvider, modelSource, renderedItems, onReload]);

  useEffect(() => {
    if (hierarchyProvider) {
      hierarchyProvider.setFormatter(formatter);
      startTreeReload(startReloadProps.current);
    }
  }, [formatter, hierarchyProvider]);

  return onItemsRendered;
}
