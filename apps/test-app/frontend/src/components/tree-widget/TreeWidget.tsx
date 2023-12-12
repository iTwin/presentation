/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Tab, Tabs } from "@itwin/itwinui-react";
import { DiagnosticsProps } from "@itwin/presentation-components";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { DiagnosticsSelector } from "../diagnostics-selector/DiagnosticsSelector";
import { Tree } from "./Tree";

interface Props {
  imodel: IModelConnection;
  rulesetId?: string;
  height?: number;
  width?: number;
}

export function TreeWidget(props: Omit<Props, "height" | "width">) {
  const [openTab, setOpenTab] = useState(0);
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  const tabsClassName = "tree-widget-tabs";
  const [heightOfTreeWidget, setHeightOfTreeWidget] = useState(0);
  useEffect(() => {
    const tabElements = ref.current?.getElementsByClassName(tabsClassName);
    const heightOfTab = tabElements && tabElements.length > 0 ? tabElements[0].clientHeight : 0;
    setHeightOfTreeWidget(height ? height - heightOfTab : 0);
    // When width changes tab height might change, so it needs to be included in dependency list
  }, [height, ref, width]);

  return (
    <div ref={ref}>
      <Tabs
        labels={[
          <Tab key={1} label={IModelApp.localization.getLocalizedString("Sample:controls.rules-driven-tree")} />,
          <Tab key={2} label={IModelApp.localization.getLocalizedString("Sample:controls.stateless-tree")} />,
        ]}
        onTabSelected={setOpenTab}
        contentClassName="tree-widget-tabs-content"
        tabsClassName={tabsClassName}
      >
        <div className="treewidget">
          {openTab === 0 ? (
            <RulesDrivenTreeWidget imodel={props.imodel} rulesetId={props.rulesetId} height={heightOfTreeWidget} width={width} />
          ) : (
            <StatelessTreeWidget imodel={props.imodel} height={heightOfTreeWidget} width={width} />
          )}
        </div>
      </Tabs>
    </div>
  );
}

export function RulesDrivenTreeWidget(props: Props) {
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
  const [heightToUse, setHeightToUse] = useState(0);
  const treeWidgetHeaderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heightOfHeader = treeWidgetHeaderRef.current?.clientHeight ?? 0;
    const heightToSet = props.height ? props.height - heightOfHeader : 0;
    setHeightToUse(heightToSet ?? 0);
  }, [props.height]);
  return (
    <>
      <div ref={treeWidgetHeaderRef} className="treewidget-header">
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
        <DiagnosticsSelector onDiagnosticsOptionsChanged={setDiagnosticsOptions} />
      </div>
      <div className="filteredTree">
        {rulesetId && props.width && heightToUse ? (
          <>
            <Tree
              imodel={imodel}
              rulesetId={rulesetId}
              diagnostics={diagnosticsOptions}
              filtering={{ filter, activeMatchIndex, onFilteringStateChange }}
              width={props.width}
              height={heightToUse}
            />
            {filteringStatus === FilteringInputStatus.FilteringInProgress ? <div className="filteredTreeOverlay" /> : null}
          </>
        ) : null}
      </div>
    </>
  );
}

export function StatelessTreeWidget(props: Omit<Props, "rulesetId">) {
  const dataProvider = useMemo((): TreeDataProvider => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(props.imodel.getRpcProps()));
    const metadataProvider = createMetadataProvider(schemas);
    const modelsTreeHierarchyProvider = new HierarchyProvider({
      metadataProvider,
      hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
      queryExecutor: createECSqlQueryExecutor(props.imodel),
    });
    return async (node?: TreeNodeItem): Promise<TreeNodeItem[]> => {
      const parent: HierarchyNode | undefined = node ? (node as any).__internal : undefined;
      try {
        return (await modelsTreeHierarchyProvider.getNodes({ parentNode: parent })).map(parseTreeNodeItem);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return [];
      }
    };
  }, [props.imodel]);
  const modelSource = useTreeModelSource(dataProvider);
  const nodeLoader = useTreeNodeLoader(dataProvider, modelSource);
  const eventHandler = useMemo(() => new TreeEventHandler({ nodeLoader, modelSource }), [nodeLoader, modelSource]);
  const treeModel = useTreeModel(modelSource);
  return (
    <div className="filteredTree">
      {props.height && props.width ? (
        <ControlledTree
          model={treeModel}
          eventsHandler={eventHandler}
          nodeLoader={nodeLoader}
          selectionMode={SelectionMode.Extended}
          iconsEnabled={true}
          width={props.width}
          height={props.height}
        />
      ) : null}
    </div>
  );
}

function parseTreeNodeItem(node: HierarchyNode): DelayLoadedTreeNodeItem {
  if (node.children === undefined) {
    throw new Error("Invalid node: children not determined");
  }
  return {
    __internal: node,
    id: JSON.stringify([...node.parentKeys, node.key]),
    label: PropertyRecord.fromString(node.label, "Label"),
    icon: node.extendedData?.imageId,
    hasChildren: !!node.children,
    autoExpand: node.autoExpand,
  } as DelayLoadedTreeNodeItem;
}
