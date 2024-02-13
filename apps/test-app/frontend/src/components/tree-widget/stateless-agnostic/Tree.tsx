import { ComponentPropsWithoutRef, useCallback, useEffect, useState } from "react";
import { SvgFolder, SvgImodelHollow, SvgItem, SvgLayers, SvgModel } from "@itwin/itwinui-icons-react";
import { ProgressRadial, Tree, TreeNode } from "@itwin/itwinui-react";
import { createLimitingECSqlQueryExecutor, HierarchyProvider, ILimitingECSqlQueryExecutor, IMetadataProvider } from "@itwin/presentation-hierarchy-builder";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { PresentationNode, TreeActions, useTreeState } from "./UseTreeState";

type TreeProps<T> = ComponentPropsWithoutRef<typeof Tree<T>>;

interface IModelRelatedState {
  queryExecutor: ILimitingECSqlQueryExecutor;
  metadataProvider: IMetadataProvider;
}

export function TreeComponent({ imodel, height, width }: { imodel: IModelConnection; height: number; width: number }) {
  const [imodelRelatedState, setIModelRelatedState] = useState<IModelRelatedState>();
  const [hierarchyProvider, setHierarchyProvider] = useState<HierarchyProvider>();

  useEffect(() => {
    const schemas = new SchemaContext();
    schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
    setIModelRelatedState({
      queryExecutor: createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
      metadataProvider: createMetadataProvider(schemas),
    });
  }, [imodel]);

  useEffect(() => {
    if (!imodelRelatedState?.metadataProvider) {
      return;
    }

    setHierarchyProvider(
      new HierarchyProvider({
        metadataProvider: imodelRelatedState.metadataProvider,
        queryExecutor: imodelRelatedState.queryExecutor,
        hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider: imodelRelatedState?.metadataProvider }),
      }),
    );
  }, [imodelRelatedState]);

  const { rootNodes, treeActions } = useTreeState({
    hierarchyProvider,
  });

  if (rootNodes === undefined || treeActions === undefined) {
    return <ProgressRadial />;
  }

  return <TreeRenderer rootNodes={rootNodes} treeActions={treeActions} width={width} height={height} />;
}

function TreeRenderer({ rootNodes, treeActions, height, width }: { rootNodes: PresentationNode[]; treeActions: TreeActions; height: number; width: number }) {
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
        height,
        width,
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
