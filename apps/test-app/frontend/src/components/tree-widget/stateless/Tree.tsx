/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./StatelessTreeWidget.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ControlledTree,
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
} from "@itwin/components-react";
import { BriefcaseConnection, IModelApp } from "@itwin/core-frontend";
import { FillCentered, TreeNode, UnderlinedButton } from "@itwin/core-react";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { SvgMoreVertical } from "@itwin/itwinui-icons-react";
import { DropdownMenu, IconButton, MenuItem, Text } from "@itwin/itwinui-react";
import { InfoTreeNodeItemType, isPresentationInfoTreeNodeItem } from "@itwin/presentation-components";
import { createECSqlQueryExecutor, createMetadataProvider, registerTxnListeners } from "@itwin/presentation-core-interop";
import {
  createLimitingECSqlQueryExecutor,
  HierarchyProvider,
  ILimitingECSqlQueryExecutor,
  IMetadataProvider,
  RowsLimitExceededError,
  TypedPrimitiveValue,
} from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { TreeWidgetHeader, TreeWidgetProps, useTreeHeight } from "../TreeWidget";
import { useControlledTreeComponentsState, useFormatter, useReload } from "./CustomHooks";
import { createInfoNode, createTreeNodeItem, getHierarchyNode } from "./TreeNodeItemUtils";
import { UnifiedSelectionTreeEventHandler } from "./UnifiedSelectionTreeEventHandler";

export function StatelessTreeWidget(props: Omit<TreeWidgetProps, "rulesetId">) {
  const [filter, setFilter] = useState("");
  const [filteringStatus, setFilteringStatus] = useState<"ready" | "filtering">("ready");
  const [queryExecutor, setQueryExecutor] = useState<ILimitingECSqlQueryExecutor>();
  const [metadataProvider, setMetadataProvider] = useState<IMetadataProvider>();
  const [hierarchyProvider, setHierarchyProvider] = useState<HierarchyProvider>();
  const [hierarchyLevelSizeLimit, setHierarchyLevelSizeLimit] = useState<{ [parentId: string]: number | "unbounded" | undefined }>({});
  useEffect(() => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(props.imodel.getRpcProps()));
    setQueryExecutor(createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(props.imodel), 1000));
    setMetadataProvider(createMetadataProvider(schemas));
  }, [props.imodel]);

  const { value: filteredPaths } = useDebouncedAsyncValue(
    useCallback(async () => {
      if (!metadataProvider || !queryExecutor) {
        return undefined;
      }
      if (filter !== "") {
        setFilteringStatus("filtering");
        return ModelsTreeDefinition.createInstanceKeyPaths({
          metadataProvider,
          queryExecutor,
          label: filter,
        });
      }
      setFilteringStatus("ready");
      return undefined;
    }, [metadataProvider, queryExecutor, filter]),
  );

  useEffect(() => {
    if (!metadataProvider || !queryExecutor) {
      return;
    }
    setHierarchyProvider(
      new HierarchyProvider({
        metadataProvider,
        hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
        queryExecutor,
        filtering: filteredPaths
          ? {
              paths: filteredPaths,
            }
          : undefined,
      }),
    );
  }, [queryExecutor, metadataProvider, filteredPaths]);

  const dataProvider = useMemo((): TreeDataProvider => {
    return async (node?: TreeNodeItem): Promise<TreeNodeItem[]> => {
      if (!hierarchyProvider) {
        return [];
      }
      const parent = node ? getHierarchyNode(node) : undefined;
      const parentId = node?.id;
      const limit = hierarchyLevelSizeLimit[parentId ?? ""];
      try {
        return (await hierarchyProvider.getNodes({ parentNode: parent, hierarchyLevelSizeLimit: limit })).map(createTreeNodeItem);
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
        throw e;
      }
    };
  }, [hierarchyProvider, hierarchyLevelSizeLimit]);

  const { componentsState, onReload } = useControlledTreeComponentsState(dataProvider);
  const treeModel = useTreeModel(componentsState.modelSource);

  const [eventHandler, setEventHandler] = useState<TreeEventHandler>(
    () =>
      new UnifiedSelectionTreeEventHandler({
        imodel: props.imodel,
        nodeLoader: componentsState.nodeLoader,
        collapsedChildrenDisposalEnabled: true,
      }),
  );
  useEffect(() => {
    const handler = new UnifiedSelectionTreeEventHandler({
      imodel: props.imodel,
      nodeLoader: componentsState.nodeLoader,
      collapsedChildrenDisposalEnabled: true,
    });
    setEventHandler(handler);
    return () => handler.dispose();
  }, [props.imodel, componentsState.nodeLoader, componentsState.modelSource]);

  const nodeRenderer = (nodeProps: TreeNodeRendererProps) => (
    <StatelessTreeNodeRenderer
      {...nodeProps}
      onLimitReset={(parentId?: string) => setHierarchyLevelSizeLimit((map) => ({ ...map, [parentId ?? ""]: "unbounded" }))}
    />
  );

  const { onItemsRendered, doReload } = useReload({
    dataProvider,
    modelSource: componentsState.modelSource,
    hierarchyProvider,
    onReload,
  });

  useEffect(() => {
    if (hierarchyProvider && props.imodel instanceof BriefcaseConnection) {
      return registerTxnListeners(props.imodel.txns, () => {
        hierarchyProvider.notifyDataSourceChanged();
        doReload();
      });
    }
    return undefined;
  }, [hierarchyProvider, props.imodel, doReload]);

  const [shouldUseCustomFormatter, setShouldUseCustomFormatter] = useState<boolean>(false);
  useFormatter({
    hierarchyProvider,
    formatter: shouldUseCustomFormatter ? customFormatter : undefined,
    reloadAction: doReload,
  });

  const { headerRef, treeHeight } = useTreeHeight(props.height);
  const noDataRenderer = filter ? () => <NoFilterMatchesRenderer filter={filter} /> : undefined;
  const filteringInputStatus =
    filteringStatus === "filtering"
      ? FilteringInputStatus.FilteringInProgress
      : filter
        ? FilteringInputStatus.FilteringFinished
        : FilteringInputStatus.ReadyToFilter;
  return (
    <>
      <div className="tree-widget-header-wrapper">
        <TreeWidgetHeader onFilterChange={setFilter} filteringStatus={filteringInputStatus} showFilteringInput={true} ref={headerRef} />
        <FormatterTogglerDropdown
          shouldUseCustomFormatter={shouldUseCustomFormatter}
          toggleCustomFormatter={() => setShouldUseCustomFormatter((state) => !state)}
        />
      </div>
      <div className="filtered-tree">
        {treeHeight && props.width && (
          <ControlledTree
            model={treeModel}
            eventsHandler={eventHandler}
            nodeLoader={componentsState.nodeLoader}
            treeRenderer={(treeProps) => <TreeRenderer {...treeProps} nodeRenderer={nodeRenderer} />}
            onItemsRendered={(items) => {
              setFilteringStatus("ready");
              onItemsRendered(items);
            }}
            noDataRenderer={noDataRenderer}
            selectionMode={SelectionMode.Extended}
            iconsEnabled={true}
            width={props.width}
            height={treeHeight}
          />
        )}
        {filteringStatus === "filtering" ? <div className="filtered-tree-overlay" /> : null}
      </div>
    </>
  );
}

interface FormatterTogglerDropdownProps {
  shouldUseCustomFormatter: boolean;
  toggleCustomFormatter: () => void;
}

function FormatterTogglerDropdown(props: FormatterTogglerDropdownProps) {
  const dropdownMenuItems = (close: () => void) => [
    <MenuItem
      key={1}
      onClick={() => {
        props.toggleCustomFormatter();
        close();
      }}
    >
      {props.shouldUseCustomFormatter ? "Show default formatter" : "Show custom formatter"}
    </MenuItem>,
  ];
  return (
    <DropdownMenu menuItems={dropdownMenuItems}>
      <IconButton styleType="borderless" size="small" className="formatter-setter-dropdown">
        <SvgMoreVertical />
      </IconButton>
    </DropdownMenu>
  );
}

interface StatelessTreeNodeRendererProps extends TreeNodeRendererProps {
  onLimitReset: (parentId?: string) => void;
}

function StatelessTreeNodeRenderer(props: StatelessTreeNodeRendererProps) {
  const nodeItem = props.node.item;
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
                  <UnderlinedButton
                    onClick={() => {
                      props.onLimitReset(nodeItem.parentId);
                    }}
                  >
                    {`${IModelApp.localization.getLocalizedString("Sample:controls.tree-widget.remove-hierarchy-level-limit")}.`}
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
async function customFormatter(val: TypedPrimitiveValue) {
  return `THIS_IS_FORMATTED_${val ? JSON.stringify(val.value) : ""}_THIS_IS_FORMATTED`;
}

function NoFilterMatchesRenderer(props: { filter: string }) {
  const { filter } = props;
  return (
    <FillCentered>
      <p className="components-controlledTree-errorMessage">
        {IModelApp.localization.getLocalizedString("Sample:controls.tree-widget.no-matches-for-provided-filter")}: {filter}
      </p>
    </FillCentered>
  );
}
