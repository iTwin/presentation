import { ComponentPropsWithoutRef, useCallback, useEffect, useState } from "react";
import { SvgFolder, SvgImodelHollow, SvgItem, SvgLayers, SvgModel } from "@itwin/itwinui-icons-react";
import { Button, Flex, ProgressRadial, SearchBox, Tree, TreeNode } from "@itwin/itwinui-react";
import {
  createLimitingECSqlQueryExecutor,
  HierarchyProvider,
  ILimitingECSqlQueryExecutor,
  IMetadataProvider,
  TypedPrimitiveValue,
} from "@itwin/presentation-hierarchy-builder";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { PresentationNode, TreeActions, useTreeState } from "./UseTreeState";
import { useDebouncedAsyncValue } from "@itwin/components-react";

type TreeProps<T> = ComponentPropsWithoutRef<typeof Tree<T>>;

interface IModelRelatedState {
  queryExecutor: ILimitingECSqlQueryExecutor;
  metadataProvider: IMetadataProvider;
}

export function TreeComponent({ imodel, height, width }: { imodel: IModelConnection; height: number; width: number }) {
  const [imodelRelatedState, setIModelRelatedState] = useState<IModelRelatedState>();
  const [hierarchyProvider, setHierarchyProvider] = useState<HierarchyProvider>();
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    setIModelRelatedState({
      queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
      metadataProvider: createMetadataProvider(schemas),
    });
  }, [imodel]);

  const { value: filteredPaths } = useDebouncedAsyncValue(
    useCallback(async () => {
      if (!imodelRelatedState) {
        return undefined;
      }
      if (filter !== "") {
        return ModelsTreeDefinition.createInstanceKeyPaths({
          metadataProvider: imodelRelatedState.metadataProvider,
          queryExecutor: imodelRelatedState.queryExecutor,
          label: filter,
        });
      }
      return undefined;
    }, [imodelRelatedState, filter]),
  );

  useEffect(() => {
    if (!imodelRelatedState?.metadataProvider) {
      return;
    }

    setHierarchyProvider(
      new HierarchyProvider({
        metadataProvider: imodelRelatedState.metadataProvider,
        queryExecutor: imodelRelatedState.queryExecutor,
        hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider: imodelRelatedState?.metadataProvider }),
        filtering: filteredPaths
          ? {
              paths: filteredPaths,
            }
          : undefined,
      }),
    );
  }, [imodelRelatedState, filteredPaths]);

  const { rootNodes, treeActions } = useTreeState({
    hierarchyProvider,
  });

  const [shouldUseCustomFormatter, setShouldUseCustomFormatter] = useState<boolean>(false);
  const toggleFormatter = () => {
    if (!hierarchyProvider || !treeActions) {
      return;
    }
    hierarchyProvider.setFormatter(shouldUseCustomFormatter ? customFormatter : undefined);
    setShouldUseCustomFormatter((prev) => !prev);
    void treeActions.reloadTree();
  };

  if (rootNodes === undefined || treeActions === undefined) {
    return (
      <Flex alignItems="center" justifyContent="center" style={{ width, height }}>
        <ProgressRadial size="large" />
      </Flex>
    );
  }

  return (
    <Flex justifyContent="left" flexDirection="column" style={{ width, height }}>
      <Button onClick={toggleFormatter}>Toggle Formatter</Button>
      <SearchBox>
        <SearchBox.Input value={filter} onChange={(e) => setFilter(e.currentTarget.value)}></SearchBox.Input>
      </SearchBox>
      <Flex.Item alignSelf="flex-start" style={{ width: "100%", overflow: "auto" }}>
        <TreeRenderer rootNodes={rootNodes} treeActions={treeActions} />
      </Flex.Item>
    </Flex>
  );
}

async function customFormatter(val: TypedPrimitiveValue) {
  return `THIS_IS_FORMATTED_${val ? JSON.stringify(val.value) : ""}_THIS_IS_FORMATTED`;
}

function TreeRenderer({ rootNodes, treeActions }: { rootNodes: PresentationNode[]; treeActions: TreeActions }) {
  const nodeRenderer = useCallback<TreeProps<PresentationNode>["nodeRenderer"]>(
    ({ node, ...restProps }) => {
      return (
        <TreeNode
          label={node.label}
          onExpanded={(_, isExpanded) => {
            treeActions.expandNode(node, isExpanded);
          }}
          onSelected={(_, isSelected) => {
            treeActions.selectNode(node, isSelected);
          }}
          icon={node.isLoading ? <ProgressRadial size="x-small" indeterminate /> : getIcon(node.nodeData.extendedData?.imageId)}
          {...restProps}
        />
      );
    },
    [treeActions],
  );

  const getNode = useCallback<TreeProps<PresentationNode>["getNode"]>((node) => {
    return {
      nodeId: node.id,
      node,
      hasSubNodes: node.children === true || node.children.length > 0,
      subNodes: node.children !== true ? node.children : [],
      isExpanded: node.isExpanded,
      isSelected: node.isSelected,
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        overflow: "auto",
      }}
    >
      <Tree<PresentationNode> data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} />
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
