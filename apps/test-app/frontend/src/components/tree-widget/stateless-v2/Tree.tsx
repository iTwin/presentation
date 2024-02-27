/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback, useEffect, useState } from "react";
import { useDebouncedAsyncValue } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { SvgFolder, SvgImodelHollow, SvgItem, SvgLayers, SvgModel } from "@itwin/itwinui-icons-react";
import { Button, Flex, ProgressRadial, SearchBox, Text, ToggleSwitch, Tree, TreeNode } from "@itwin/itwinui-react";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import {
  createLimitingECSqlQueryExecutor, HierarchyProvider, ILimitingECSqlQueryExecutor, IMetadataProvider, TypedPrimitiveValue,
} from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { isPresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { UseTreeResult, useUnifiedSelectionTree } from "./UseTree";

interface MetadataProviders {
  queryExecutor: ILimitingECSqlQueryExecutor;
  metadataProvider: IMetadataProvider;
}

export function StatelessTreeV2({ imodel, height, width }: { imodel: IModelConnection; height: number; width: number }) {
  const [metadata, setMetadata] = useState<MetadataProviders>();
  const [hierarchyProvider, setHierarchyProvider] = useState<HierarchyProvider>();
  const [filter, setFilter] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    setMetadata({
      queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
      metadataProvider: createMetadataProvider(schemas),
    });
  }, [imodel]);

  const { value: filteredPaths } = useDebouncedAsyncValue(
    useCallback(async () => {
      setIsFiltering(false);
      if (!metadata) {
        return undefined;
      }
      if (filter !== "") {
        setIsFiltering(true);
        const paths = await ModelsTreeDefinition.createInstanceKeyPaths({
          metadataProvider: metadata.metadataProvider,
          queryExecutor: metadata.queryExecutor,
          label: filter,
        });
        return paths;
      }
      return undefined;
    }, [metadata, filter]),
  );

  useEffect(() => {
    setIsFiltering(false);
    if (!metadata?.metadataProvider) {
      return;
    }

    setHierarchyProvider(
      new HierarchyProvider({
        metadataProvider: metadata.metadataProvider,
        queryExecutor: metadata.queryExecutor,
        hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider: metadata?.metadataProvider }),
        filtering: filteredPaths
          ? {
              paths: filteredPaths,
            }
          : undefined,
      }),
    );
  }, [metadata, filteredPaths]);

  const { rootNodes, isLoading, ...treeProps } = useUnifiedSelectionTree({
    hierarchyProvider,
  });

  const [shouldUseCustomFormatter, setShouldUseCustomFormatter] = useState<boolean>(false);
  const toggleFormatter = () => {
    if (!hierarchyProvider) {
      return;
    }
    const newValue = !shouldUseCustomFormatter;
    hierarchyProvider.setFormatter(newValue ? customFormatter : undefined);
    setShouldUseCustomFormatter(newValue);
    treeProps.reloadTree();
  };

  const renderContent = () => {
    if (rootNodes === undefined || isLoading || isFiltering) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <ProgressRadial size="large" />
        </Flex>
      );
    }

    if (rootNodes.length === 0 && filter) {
      return (
        <Flex alignItems="center" justifyContent="center" flexDirection="column" style={{ height: "100%" }}>
          <Text isMuted>There are no nodes matching filter text {filter}</Text>
        </Flex>
      );
    }

    return (
      <Flex.Item alignSelf="flex-start" style={{ width: "100%", overflow: "auto" }}>
        <TreeRenderer rootNodes={rootNodes} {...treeProps} />
      </Flex.Item>
    );
  };

  return (
    <Flex flexDirection="column" style={{ width, height }}>
      <Flex style={{ width: "100%", padding: "0.5rem" }}>
        <SearchBox inputProps={{ value: filter, onChange: (e) => setFilter(e.currentTarget.value) }} />
        <ToggleSwitch onChange={toggleFormatter} checked={shouldUseCustomFormatter} />
      </Flex>
      {renderContent()}
    </Flex>
  );
}

async function customFormatter(val: TypedPrimitiveValue) {
  return `THIS_IS_FORMATTED_${val ? JSON.stringify(val.value) : ""}_THIS_IS_FORMATTED`;
}

interface TreeRendererProps extends Omit<UseTreeResult, "rootNodes" | "isLoading"> {
  rootNodes: PresentationTreeNode[];
}

function TreeRenderer({ rootNodes, expandNode, selectNode, isNodeSelected, setHierarchyLevelLimit }: TreeRendererProps) {
  const nodeRenderer = useCallback<TreeProps<PresentationTreeNode>["nodeRenderer"]>(
    ({ node, ...restProps }) => {
      if (!isPresentationHierarchyNode(node)) {
        return (
          <TreeNode {...restProps} label={node.message} isDisabled={true} onExpanded={() => {}}>
            <Button
              onClick={() => {
                setHierarchyLevelLimit(node.parentNodeId, "unbounded");
              }}
            >
              Remove Limit
            </Button>
          </TreeNode>
        );
      }

      return (
        <TreeNode
          {...restProps}
          label={node.label}
          onExpanded={(_, isExpanded) => {
            expandNode(node.id, isExpanded);
          }}
          onSelected={(_, isSelected) => {
            selectNode(node.id, isSelected);
          }}
          icon={node.isLoading ? <ProgressRadial size="x-small" indeterminate /> : getIcon(node.extendedData?.imageId)}
        />
      );
    },
    [expandNode, selectNode, setHierarchyLevelLimit],
  );

  const getNode = useCallback<TreeProps<PresentationTreeNode>["getNode"]>(
    (node) => {
      if (!isPresentationHierarchyNode(node)) {
        return {
          nodeId: node.id,
          node,
          hasSubNodes: false,
          isExpanded: false,
          isSelected: false,
        };
      }
      return {
        nodeId: node.id,
        node,
        hasSubNodes: node.children === true || node.children.length > 0,
        subNodes: node.children !== true ? node.children : [],
        isExpanded: node.isExpanded,
        isSelected: isNodeSelected(node.id),
      };
    },
    [isNodeSelected],
  );

  return (
    <div
      style={{
        width: "100%",
        overflow: "auto",
      }}
    >
      <Tree<PresentationTreeNode> data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} enableVirtualization={true} />
    </div>
  );
}

function getIcon(icon: "icon-layers" | "icon-item" | "icon-ec-class" | "icon-imodel-hollow-2" | "icon-folder" | "icon-model") {
  switch (icon) {
    case "icon-layers":
      return <SvgLayers />;
    case "icon-item":
      return <SvgItem />;
    case "icon-ec-class":
      return <SvgItem />;
    case "icon-imodel-hollow-2":
      return <SvgImodelHollow />;
    case "icon-folder":
      return <SvgFolder />;
    case "icon-model":
      return <SvgModel />;
  }
}

type TreeProps<T> = ComponentPropsWithoutRef<typeof Tree<T>>;
