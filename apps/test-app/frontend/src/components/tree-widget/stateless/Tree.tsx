/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
  useTreeModelSource,
  useTreeNodeLoader,
} from "@itwin/components-react";
import { IModelApp } from "@itwin/core-frontend";
import { FillCentered, TreeNode, UnderlinedButton } from "@itwin/core-react";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { Text } from "@itwin/itwinui-react";
import { InfoTreeNodeItemType, isPresentationInfoTreeNodeItem } from "@itwin/presentation-components";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyProvider, IECSqlQueryExecutor, IMetadataProvider, RowsLimitExceededError } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { TreeWidgetHeader, TreeWidgetProps, useTreeHeight } from "../TreeWidget";
import { createInfoNode, createTreeNodeItem, getHierarchyNode } from "./TreeNodeItemUtils";
import { UnifiedSelectionTreeEventHandler } from "./UnifiedSelectionTreeEventHandler";

export function StatelessTreeWidget(props: Omit<TreeWidgetProps, "rulesetId">) {
  const [filter, setFilter] = useState("");
  const [filteringStatus, setFilteringStatus] = useState<"ready" | "filtering">("ready");
  const [queryExecutor, setQueryExecutor] = useState<IECSqlQueryExecutor>();
  const [metadataProvider, setMetadataProvider] = useState<IMetadataProvider>();
  const [modelsTreeHierarchyProvider, setModelsTreeHierarchyProvider] = useState<HierarchyProvider>();
  const [hierarchyLevelSizeLimit, setHierarchyLevelSizeLimit] = useState<{ [parentId: string]: number | "unbounded" | undefined }>({});
  useEffect(() => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(props.imodel.getRpcProps()));
    setQueryExecutor(createECSqlQueryExecutor(props.imodel));
    setMetadataProvider(createMetadataProvider(schemas));
  }, [props.imodel]);

  const { value: filteredPaths } = useDebouncedAsyncValue(
    useCallback(async () => {
      if (!metadataProvider || !modelsTreeHierarchyProvider) {
        return undefined;
      }
      if (filter !== "") {
        setFilteringStatus("filtering");
        return ModelsTreeDefinition.createInstanceKeyPaths({
          metadataProvider,
          queryExecutor: modelsTreeHierarchyProvider.limitingQueryExecutor,
          label: filter,
        });
      }
      setFilteringStatus("ready");
      return undefined;
    }, [metadataProvider, modelsTreeHierarchyProvider, filter]),
  );

  useEffect(() => {
    if (!metadataProvider || !queryExecutor) {
      return;
    }
    setModelsTreeHierarchyProvider(
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
      if (!modelsTreeHierarchyProvider) {
        return [];
      }
      const parent = node ? getHierarchyNode(node) : undefined;
      const parentId = node?.id;
      const limit = hierarchyLevelSizeLimit[parentId ?? ""];
      try {
        return (await modelsTreeHierarchyProvider.getNodes({ parentNode: parent, hierarchyLevelSizeLimit: limit })).map(createTreeNodeItem);
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
  }, [modelsTreeHierarchyProvider, hierarchyLevelSizeLimit]);

  const modelSource = useTreeModelSource(dataProvider);
  const treeModel = useTreeModel(modelSource);
  const nodeLoader = useTreeNodeLoader(dataProvider, modelSource);

  const [eventHandler, setEventHandler] = useState<TreeEventHandler>();
  useEffect(() => {
    const handler = new UnifiedSelectionTreeEventHandler({ imodel: props.imodel, nodeLoader, collapsedChildrenDisposalEnabled: true });
    setEventHandler(handler);
    return () => handler.dispose();
  }, [props.imodel, nodeLoader, modelSource]);

  const nodeRenderer = (nodeProps: TreeNodeRendererProps) => (
    <StatelessTreeNodeRenderer
      {...nodeProps}
      onLimitReset={(parentId?: string) => setHierarchyLevelSizeLimit((map) => ({ ...map, [parentId ?? ""]: "unbounded" }))}
    />
  );
  const { headerRef, treeHeight } = useTreeHeight(props.height);
  const noDataRenderer = filter ? () => <NoFilterMatchesRenderer filter={filter} /> : undefined;
  const filteringInputStatus =
    filteringStatus === "filtering"
      ? FilteringInputStatus.FilteringInProgress
      : filter
      ? FilteringInputStatus.FilteringFinished
      : FilteringInputStatus.ReadyToFilter;

  if (!eventHandler) {
    return null;
  }

  return (
    <>
      <TreeWidgetHeader onFilterChange={setFilter} filteringStatus={filteringInputStatus} showFilteringInput={true} ref={headerRef} />
      <div className="filtered-tree">
        {treeHeight && props.width && (
          <ControlledTree
            model={treeModel}
            eventsHandler={eventHandler}
            nodeLoader={nodeLoader}
            treeRenderer={(treeProps) => <TreeRenderer {...treeProps} nodeRenderer={nodeRenderer} />}
            onItemsRendered={() => setFilteringStatus("ready")}
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