/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertyRecord } from "@itwin/appui-abstract";
import {
  ControlledTree,
  DelayLoadedTreeNodeItem,
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
import { TreeNode, UnderlinedButton } from "@itwin/core-react";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { Text } from "@itwin/itwinui-react";
import { InfoTreeNodeItemType, isPresentationInfoTreeNodeItem, PresentationInfoTreeNodeItem } from "@itwin/presentation-components";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyNode, HierarchyProvider, IECSqlQueryExecutor, IMetadataProvider, RowsLimitExceededError } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { TreeWidgetHeader, TreeWidgetProps, useTreeHeight } from "./TreeWidget";

export function StatelessTreeWidget(props: Omit<TreeWidgetProps, "rulesetId">) {
  const [filter, setFilter] = useState("");
  const [filteringStatus, setFilteringStatus] = useState(FilteringInputStatus.ReadyToFilter);
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
      const parentId = node?.id;
      const limit = hierarchyLevelSizeLimit[parentId ?? ""];
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
  const nodeRenderer = (nodeProps: TreeNodeRendererProps) => (
    <StatelessTreeNodeRenderer
      {...nodeProps}
      onLimitReset={(parentId?: string) => setHierarchyLevelSizeLimit((map) => ({ ...map, [parentId ?? ""]: "unbounded" }))}
    />
  );
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
  const id = `${parentNode ? parentNode.id : ""}/info-node/${message}`;
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
