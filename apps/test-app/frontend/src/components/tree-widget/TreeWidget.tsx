/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useMemo, useState } from "react";
import { useResizeDetector } from "react-resize-detector";
import { PropertyRecord } from "@itwin/appui-abstract";
import {
  ControlledTree,
  DelayLoadedTreeNodeItem,
  FilteringInput,
  FilteringInputStatus,
  SelectionMode,
  TreeDataProvider,
  TreeEventHandler,
  TreeNodeItem,
  useTreeModel,
  useTreeModelSource,
  useTreeNodeLoader,
} from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { DiagnosticsProps } from "@itwin/presentation-components";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { DiagnosticsSelector } from "../diagnostics-selector/DiagnosticsSelector";
import { Tree } from "./Tree";

interface Props {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function TreeWidget(props: Props) {
  const { rulesetId, imodel } = props;
  const [diagnosticsOptions, setDiagnosticsOptions] = useState<DiagnosticsProps>({ ruleDiagnostics: undefined, devDiagnostics: undefined });
  const [filter, setFilter] = useState("");
  const [filteringStatus, setFilteringStatus] = useState(FilteringInputStatus.ReadyToFilter);
  const [matchesCount, setMatchesCount] = useState<number>();
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const onFilteringStateChange = useCallback((isFiltering: boolean, newMatchesCount: number | undefined) => {
    setFilteringStatus(
      isFiltering
        ? FilteringInputStatus.FilteringInProgress
        : undefined !== newMatchesCount
        ? FilteringInputStatus.FilteringFinished
        : FilteringInputStatus.ReadyToFilter,
    );
    setMatchesCount(newMatchesCount);
  }, []);

  const { width, height, ref } = useResizeDetector();

  return (
    <div className="treewidget">
      <div className="treewidget-header">
        <h3>{IModelApp.localization.getLocalizedString("Sample:controls.tree")}</h3>
        <DiagnosticsSelector onDiagnosticsOptionsChanged={setDiagnosticsOptions} />
        {rulesetId ? (
          <FilteringInput
            status={filteringStatus}
            onFilterCancel={() => {
              setFilter("");
            }}
            onFilterClear={() => {
              setFilter("");
            }}
            onFilterStart={(newFilter) => {
              setFilter(newFilter);
            }}
            resultSelectorProps={{
              onSelectedChanged: (index) => setActiveMatchIndex(index),
              resultCount: matchesCount || 0,
            }}
          />
        ) : null}
      </div>
      <div ref={ref} className="filteredTree">
        {rulesetId && width && height ? (
          <>
            <Tree
              imodel={imodel}
              rulesetId={rulesetId}
              diagnostics={diagnosticsOptions}
              filtering={{ filter, activeMatchIndex, onFilteringStateChange }}
              width={width}
              height={height}
            />
            {filteringStatus === FilteringInputStatus.FilteringInProgress ? <div className="filteredTreeOverlay" /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ExperimentalModelsTree({ imodel }: { imodel: IModelConnection }) {
  const { width, height, ref } = useResizeDetector();
  const dataProvider = useMemo((): TreeDataProvider => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    const metadataProvider = createMetadataProvider(schemas);
    const modelsTreeHierarchyProvider = new HierarchyProvider({
      metadataProvider,
      hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
      queryExecutor: createECSqlQueryExecutor(imodel),
    });
    return async (node?: TreeNodeItem): Promise<TreeNodeItem[]> => {
      const parent: HierarchyNode | undefined = node ? (node as any).__internal : undefined;
      try {
        return (await modelsTreeHierarchyProvider.getNodes(parent)).map(parseTreeNodeItem);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return [];
      }
    };
  }, [imodel]);
  const modelSource = useTreeModelSource(dataProvider);
  const nodeLoader = useTreeNodeLoader(dataProvider, modelSource);
  const eventHandler = useMemo(() => new TreeEventHandler({ nodeLoader, modelSource }), [nodeLoader, modelSource]);
  const treeModel = useTreeModel(modelSource);

  return (
    <div className="treewidget">
      <div className="treewidget-header">
        <h3>{IModelApp.localization.getLocalizedString("Sample:controls.tree")}</h3>
      </div>
      <div ref={ref} className="filteredTree">
        {width && height ? (
          <ControlledTree
            model={treeModel}
            eventsHandler={eventHandler}
            nodeLoader={nodeLoader}
            selectionMode={SelectionMode.Extended}
            iconsEnabled={true}
            width={width}
            height={height}
          />
        ) : null}
      </div>
    </div>
  );
}

function parseTreeNodeItem(node: HierarchyNode): DelayLoadedTreeNodeItem {
  if (node.children === undefined) {
    throw new Error("Invalid node: children not determined");
  }
  return {
    __internal: node,
    id: JSON.stringify(node.key),
    label: PropertyRecord.fromString(node.label, "Label"),
    icon: node.extendedData?.imageId,
    hasChildren: !!node.children,
    autoExpand: node.autoExpand,
  } as DelayLoadedTreeNodeItem;
}
