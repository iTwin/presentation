/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TreeNodeRenderer,
  TreeNodeRendererProps,
  TreeRenderer,
  useDebouncedAsyncValue,
  useTreeModel,
  useTreeModelSource,
  useTreeNodeLoader,
} from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { TreeNode, UnderlinedButton } from "@itwin/core-react";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { Tab, Tabs, Text } from "@itwin/itwinui-react";
import { DiagnosticsProps, InfoTreeNodeItemType, isPresentationInfoTreeNodeItem, PresentationInfoTreeNodeItem } from "@itwin/presentation-components";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import {
  HierarchyNode,
  HierarchyNodeKey,
  HierarchyProvider,
  IECSqlQueryExecutor,
  IMetadataProvider,
  RowsLimitExceededError,
} from "@itwin/presentation-hierarchy-builder";
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
        <div className="tree-widget">
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
  const { headerRef, treeHeight } = useTreeHeight(props.height);
  return (
    <>
      <TreeWidgetHeader
        onFilterChange={setFilter}
        filteringStatus={filteringStatus}
        showFilteringInput={!!rulesetId}
        ref={headerRef}
        onActiveMatchIndexChange={setActiveMatchIndex}
        matchesCount={matchesCount}
        onDiagnosticsOptionsChange={setDiagnosticsOptions}
      />
      <div className="filtered-tree">
        {rulesetId && props.width && treeHeight ? (
          <>
            <Tree
              imodel={imodel}
              rulesetId={rulesetId}
              diagnostics={diagnosticsOptions}
              filtering={{ filter, activeMatchIndex, onFilteringStateChange }}
              width={props.width}
              height={treeHeight}
            />
            {filteringStatus === FilteringInputStatus.FilteringInProgress ? <div className="filtered-tree-overlay" /> : null}
          </>
        ) : null}
      </div>
    </>
  );
}

export function StatelessTreeWidget(props: Omit<Props, "rulesetId">) {
  const [filter, setFilter] = useState("");
  const [filteringStatus, setFilteringStatus] = useState(FilteringInputStatus.ReadyToFilter);
  const [queryExecutor, setQueryExecutor] = useState<IECSqlQueryExecutor>();
  const [metadataProvider, setMetadataProvider] = useState<IMetadataProvider>();
  const [modelsTreeHierarchyProvider, setModelsTreeHierarchyProvider] = useState<HierarchyProvider>();
  const [hierarchyLevelSizeLimit, setHierarchyLevelSizeLimit] = useState<Map<string | undefined, { limit?: number | "unbounded" }>>(new Map());
  useEffect(() => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(props.imodel.getRpcProps()));
    setQueryExecutor(createECSqlQueryExecutor(props.imodel));
    setMetadataProvider(createMetadataProvider(schemas));
  }, [props.imodel]);

  const { value } = useDebouncedAsyncValue(
    useCallback(async () => {
      if (metadataProvider && queryExecutor && filter !== "") {
        setFilteringStatus(FilteringInputStatus.FilteringInProgress);
        return ModelsTreeDefinition.createInstanceKeyPaths({ metadataProvider, queryExecutor, label: filter });
      }
      return [];
    }, [metadataProvider, queryExecutor, filter]),
  );

  useEffect(() => {
    if (metadataProvider && queryExecutor) {
      const sharedProps = {
        metadataProvider,
        hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
        queryExecutor,
      };
      if (value) {
        setFilteringStatus(FilteringInputStatus.FilteringFinished);
        setModelsTreeHierarchyProvider(
          new HierarchyProvider({
            ...sharedProps,
            filtering: {
              paths: value,
            },
          }),
        );
      } else {
        setModelsTreeHierarchyProvider(new HierarchyProvider(sharedProps));
      }
    }
  }, [queryExecutor, metadataProvider, value]);

  const dataProvider = useMemo((): TreeDataProvider => {
    return async (node?: TreeNodeItem): Promise<TreeNodeItem[]> => {
      const parent: HierarchyNode | undefined = node ? (node as any).__internal : undefined;
      let lastNonGroupingNodeId: string | undefined;
      // Retrieve Id of last non grouping node
      if (parent) {
        let nodeKey = parent.key;
        if (HierarchyNode.isGroupingNode(parent)) {
          for (let i = parent.parentKeys.length - 1; i >= 0; --i) {
            if (!HierarchyNodeKey.isGrouping(parent.parentKeys[i])) {
              nodeKey = parent.parentKeys[i];
              break;
            }
          }
        }
        if (!HierarchyNodeKey.isGrouping(nodeKey)) {
          if (typeof nodeKey === "string") {
            lastNonGroupingNodeId = nodeKey;
          } else {
            lastNonGroupingNodeId = nodeKey.instanceKeys[0].id;
          }
        }
      }
      // Get limit that is set for lastNonGroupingNodeId
      const mapKeyValue = hierarchyLevelSizeLimit.get(lastNonGroupingNodeId);
      let limit: undefined | number | "unbounded";
      if (mapKeyValue === undefined) {
        hierarchyLevelSizeLimit.set(lastNonGroupingNodeId, { limit });
      } else {
        limit = mapKeyValue.limit;
      }
      try {
        if (modelsTreeHierarchyProvider) {
          return (await modelsTreeHierarchyProvider.getNodes({ parentNode: parent, hierarchyLevelSizeLimit: limit })).map(parseTreeNodeItem);
        }
        return [];
      } catch (e) {
        if (e instanceof RowsLimitExceededError) {
          return [
            createInfoNode(
              node,
              `${IModelApp.localization.getLocalizedString("Sample:controls.result-limit-exceeded")} ${limit!}`,
              InfoTreeNodeItemType.ResultSetTooLarge,
            ),
          ];
        }
        // eslint-disable-next-line no-console
        console.error(e);
        return [];
      }
    };
  }, [modelsTreeHierarchyProvider, hierarchyLevelSizeLimit]);
  const modelSource = useTreeModelSource(dataProvider);
  const nodeLoader = useTreeNodeLoader(dataProvider, modelSource);
  const eventHandler = useMemo(() => new TreeEventHandler({ nodeLoader, modelSource }), [nodeLoader, modelSource]);
  const treeModel = useTreeModel(modelSource);
  const nodeRenderer = useCallback((nodeProps: TreeNodeRendererProps) => {
    return (
      <StatelessTreeNodeRenderer
        {...nodeProps}
        onLimitReset={(parentId?: string) =>
          setHierarchyLevelSizeLimit((map) => {
            const newMap = new Map(map);
            newMap.set(parentId, { limit: "unbounded" });
            return newMap;
          })
        }
      />
    );
  }, []);
  const { headerRef, treeHeight } = useTreeHeight(props.height);
  return (
    <>
      <TreeWidgetHeader onFilterChange={setFilter} filteringStatus={filteringStatus} showFilteringInput={true} ref={headerRef} />
      <div className="filtered-tree">
        {treeHeight && props.width && (
          <ControlledTree
            model={treeModel}
            eventsHandler={eventHandler}
            nodeLoader={nodeLoader}
            treeRenderer={(treeProps) => <TreeRenderer {...treeProps} nodeRenderer={nodeRenderer} />}
            selectionMode={SelectionMode.Extended}
            iconsEnabled={true}
            width={props.width}
            height={treeHeight}
          />
        )}
        {filteringStatus === FilteringInputStatus.FilteringInProgress ? <div className="filtered-tree-overlay" /> : null}
      </div>
    </>
  );
}

function useTreeHeight(height?: number) {
  const [treeHeight, setTreeHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heightOfHeader = headerRef.current?.clientHeight ?? 0;
    const heightToSet = height ? height - heightOfHeader : 0;
    setTreeHeight(heightToSet);
  }, [height]);
  return { headerRef, treeHeight };
}

interface HeaderProps {
  onFilterChange: (newFilter: string) => void;
  filteringStatus: FilteringInputStatus;
  showFilteringInput: boolean;
  onActiveMatchIndexChange?: (index: number) => void;
  matchesCount?: number;
  onDiagnosticsOptionsChange?: (options: DiagnosticsProps) => void;
}

const TreeWidgetHeader = forwardRef(function TreeWidgetHeader(props: HeaderProps, ref: React.ForwardedRef<HTMLDivElement>) {
  const { onFilterChange, filteringStatus, showFilteringInput } = props;
  return (
    <div ref={ref} className="tree-widget-header">
      {showFilteringInput && (
        <FilteringInput
          status={filteringStatus}
          onFilterCancel={() => {
            onFilterChange("");
          }}
          onFilterClear={() => {
            onFilterChange("");
          }}
          onFilterStart={(newFilter) => {
            onFilterChange(newFilter);
          }}
          resultSelectorProps={
            props.onActiveMatchIndexChange || props.matchesCount
              ? {
                  onSelectedChanged: (index) => (props.onActiveMatchIndexChange ? props.onActiveMatchIndexChange(index) : {}),
                  resultCount: props.matchesCount || 0,
                }
              : undefined
          }
        />
      )}
      {props.onDiagnosticsOptionsChange && <DiagnosticsSelector onDiagnosticsOptionsChanged={props.onDiagnosticsOptionsChange} />}
    </div>
  );
});

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

function createInfoNode(parentNode: TreeNodeItem | undefined, message: string, type?: InfoTreeNodeItemType): PresentationInfoTreeNodeItem {
  const id = parentNode ? `${parentNode.id}/info-node` : `/info-node/${message}`;
  return {
    id,
    parentId: parentNode?.id,
    label: PropertyRecord.fromString(message),
    message,
    isSelectionDisabled: true,
    children: undefined,
    type: type ?? InfoTreeNodeItemType.Unset,
  };
}

interface StatelessTreeNodeRendererProps extends TreeNodeRendererProps {
  onLimitReset: (parentId?: string) => void;
}

function StatelessTreeNodeRenderer(props: StatelessTreeNodeRendererProps) {
  const nodeItem = props.node.item;
  const parsedParentIds = nodeItem.parentId ? JSON.parse(nodeItem.parentId) : undefined;
  const parentId = parsedParentIds ? parsedParentIds[parsedParentIds.length - 1].instanceKeys[0].id : undefined;
  if (isPresentationInfoTreeNodeItem(nodeItem)) {
    return (
      <TreeNode
        isLeaf={true}
        label={
          <span>
            <Text isMuted>
              <span>{nodeItem.message}</span>
              {nodeItem.type === InfoTreeNodeItemType.ResultSetTooLarge && (
                <span>
                  <span> - </span>
                  <UnderlinedButton onClick={() => props.onLimitReset(parentId)}>
                    {`${IModelApp.localization.getLocalizedString("Sample:controls.remove-hierarchy-level-limit")}.`}
                  </UnderlinedButton>
                </span>
              )}
            </Text>
          </span>
        }
        level={props.node.depth}
        isHoverDisabled={true}
      />
    );
  }

  return <TreeNodeRenderer {...props} />;
}
