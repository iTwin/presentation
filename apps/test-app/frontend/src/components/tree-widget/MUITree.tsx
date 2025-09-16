/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import {
  SvgFolder,
  SvgImodelHollow,
  SvgItem,
  SvgLayers,
  SvgLock,
  SvgLockUnlocked,
  SvgModel,
  SvgVisibilityHide,
  SvgVisibilityShow,
} from "@itwin/itwinui-icons-react";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { createIModelHierarchyProvider, createLimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import { PresentationHierarchyNode, TreeRendererProps, useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { createCachingECClassHierarchyInspector, Props } from "@itwin/presentation-shared";
import { IconButton, styled } from "@mui/material";
import {
  RichTreeView,
  TreeItem,
  TreeItemContent,
  TreeItemLabel,
  TreeItemProps,
  UseTreeItemContentSlotOwnProps,
  UseTreeItemLabelSlotOwnProps,
} from "@mui/x-tree-view";
import { Icon } from "@stratakit/foundations";
import { MyAppFrontend } from "../../api/MyAppFrontend";

type UseIModelTreeProps = Props<typeof useIModelUnifiedSelectionTree>;
type IModelAccess = Props<typeof createIModelHierarchyProvider>["imodelAccess"];

export function MUITree({ imodel, ...props }: { imodel: IModelConnection; height: number; width: number }) {
  const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
  useEffect(() => {
    const schemaProvider = createECSchemaProvider(imodel.schemaContext);
    setIModelAccess({
      imodelKey: imodel.key,
      ...schemaProvider,
      ...createCachingECClassHierarchyInspector({ schemaProvider }),
      ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
    });
  }, [imodel]);

  if (!imodelAccess) {
    return null;
  }

  return <Tree {...props} imodelAccess={imodelAccess} />;
}

function Tree({ height, width, imodelAccess }: { height: number; width: number; imodelAccess: IModelAccess }) {
  const treeProps = useIModelUnifiedSelectionTree({
    selectionStorage: MyAppFrontend.selectionStorage,
    sourceName: "MUITree",
    getHierarchyDefinition,
    imodelAccess,
  });

  if (treeProps.rootErrorRendererProps) {
    return <div>Error loading tree</div>;
  }

  const rendererProps = treeProps.treeRendererProps;
  if (rendererProps === undefined) {
    return null;
  }

  return <TreeImpl height={height} width={width} treeProps={rendererProps} />;
}

function TreeImpl({ height, width, treeProps }: { height: number; width: number; treeProps: TreeRendererProps }) {
  const { rootNodes, isNodeSelected, selectNodes, expandNode } = treeProps;

  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const selectedNodes = useMemo(() => traverseNodes(rootNodes, (node) => (isNodeSelected(node.id) ? node.id : undefined)), [rootNodes, isNodeSelected]);
  const expandedNodes = useMemo(() => traverseNodes(rootNodes, (node) => (node.isExpanded ? node.id : undefined)), [rootNodes]);

  const getActions = useCallback(
    (nodeId: string) => {
      const actionNode = findNode(rootNodes, nodeId);
      if (!actionNode) {
        return [];
      }
      return [
        {
          label: locked[nodeId] ? "Unlock" : "Lock",
          action: () => {
            setLocked((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
          },
          icon: locked[nodeId] ? <SvgLock /> : <SvgLockUnlocked />,
        },
        {
          label: visible[nodeId] ? "Hide" : "Show",
          action: () => {
            setVisible((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
          },
          icon: visible[nodeId] ? <SvgVisibilityHide /> : <SvgVisibilityShow />,
        },
      ] satisfies ActionDefinition[];
    },
    [rootNodes, locked, visible],
  );

  const getIcon = useCallback(
    (nodeId: string) => {
      const iconNode = findNode(rootNodes, nodeId);
      if (!iconNode) {
        return undefined;
      }
      return <Icon href={findTreeIcon(iconNode)} />;
    },
    [rootNodes],
  );

  return (
    <div style={{ height, width, overflow: "scroll" }}>
      <RichTreeView
        multiSelect
        items={rootNodes}
        selectedItems={selectedNodes}
        expandedItems={expandedNodes}
        onItemExpansionToggle={(e, nodeId, isExpanded) => {
          e?.stopPropagation();
          expandNode(nodeId, isExpanded);
        }}
        onSelectedItemsChange={(_, nodeIds) => {
          selectNodes(nodeIds, "replace");
        }}
        getItemChildren={(node) =>
          node.children === true
            ? [
                {
                  id: `${node.id}-loading`,
                  label: "Loading...",
                  children: [],
                  isLoading: true,
                  isDisabled: true,
                  isExpanded: false,
                  isFilterable: false,
                  isFiltered: false,
                  nodeData: {} as any,
                },
              ]
            : node.children
        }
        isItemEditable={() => true}
        expansionTrigger="iconContainer"
        slots={{ item: CustomTreeItem }}
        slotProps={{
          item: {
            getActions,
            getIcon,
          } as CustomItemProps,
        }}
      />
    </div>
  );
}

interface ActionDefinition {
  label: string;
  action: () => void;
  icon: React.ReactNode;
}

interface CustomItemProps extends TreeItemProps {
  getActions?: (nodeId: string) => ActionDefinition[];
  getIcon?: (nodeId: string) => ReactElement | undefined;
}

const CustomTreeItem = forwardRef(function CustomTreeItem({ getActions, getIcon, ...props }: CustomItemProps, ref: React.Ref<HTMLLIElement>) {
  const { itemId } = props;
  const actions = useMemo(() => {
    return getActions ? getActions(itemId) : undefined;
  }, [getActions, itemId]);

  const icon = useMemo(() => {
    return getIcon ? getIcon(itemId) : undefined;
  }, [getIcon, itemId]);

  return (
    <TreeItem
      {...props}
      ref={ref}
      slots={{
        label: CustomLabel,
        content: CustomContent,
      }}
      slotProps={{
        content: { actions } as CustomContentProps,
        label: { icon, sublabel: "Description" } as CustomLabelProps,
      }}
    />
  );
});

interface CustomContentProps extends UseTreeItemContentSlotOwnProps {
  children: React.ReactNode;
  actions?: ActionDefinition[];
}

const CustomContent = forwardRef(function CustomContent({ children, actions, ...props }: CustomContentProps, ref: React.Ref<HTMLDivElement>) {
  return (
    <TreeItemContent {...props} ref={ref}>
      {children}
      {actions?.map((action) => (
        <IconButton
          key={action.label}
          aria-label={action.label}
          onClick={(event) => {
            event?.stopPropagation();
            action.action();
          }}
        >
          {action.icon}
        </IconButton>
      ))}
    </TreeItemContent>
  );
});

interface CustomLabelProps extends UseTreeItemLabelSlotOwnProps {
  icon?: React.ReactElement;
  sublabel?: string;
}

const CustomLabel = forwardRef(function CustomLabel({ children, icon, sublabel, ...props }: CustomLabelProps, ref: React.Ref<HTMLDivElement>) {
  return (
    <TreeItemLabel {...props} ref={ref} sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {icon}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {children}
        {sublabel ? <CustomSublabel className="MuiTreeItem-sublabel">{sublabel}</CustomSublabel> : null}
      </div>
    </TreeItemLabel>
  );
});

// TODO: stable class name for the sublabel slot
const CustomSublabel = styled("div", {
  name: "MuiTreeItem",
  slot: "sublabel",
  overridesResolver: (_props, styles) => styles.root,
})(() => ({
  color: "var(--stratakit-color-text-neutral-secondary)",
}));

function findNode(nodes: PresentationHierarchyNode[], nodeId: string): PresentationHierarchyNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const childResult = node.children !== true ? findNode(node.children, nodeId) : undefined;
    if (childResult) {
      return childResult;
    }
  }
  return undefined;
}

function traverseNodes<T>(nodes: PresentationHierarchyNode[], collect: (node: PresentationHierarchyNode) => T | undefined): T[] {
  const result: T[] = [];
  for (const node of nodes) {
    const value = collect(node);
    if (value !== undefined) {
      result.push(value);
    }
    if (node.children && node.children !== true) {
      result.push(...traverseNodes(node.children, collect));
    }
  }
  return result;
}

const subjectSvg = new URL("@stratakit/icons/bis-subject.svg", import.meta.url).href;
const classSvg = new URL("@stratakit/icons/bis-class.svg", import.meta.url).href;
const modelSvg = new URL("@stratakit/icons/model-cube.svg", import.meta.url).href;
const categorySvg = new URL("@stratakit/icons/bis-category-3d.svg", import.meta.url).href;
const elementSvg = new URL("@stratakit/icons/bis-element.svg", import.meta.url).href;
const iModelSvg = new URL("@stratakit/icons/imodel.svg", import.meta.url).href;

function findTreeIcon(node: PresentationHierarchyNode): string | undefined {
  if (node.nodeData.extendedData?.imageId === undefined) {
    return undefined;
  }

  switch (node.nodeData.extendedData.imageId) {
    case "icon-layers":
      return categorySvg;
    case "icon-item":
      return elementSvg;
    case "icon-ec-class":
      return classSvg;
    case "icon-imodel-hollow-2":
      return iModelSvg;
    case "icon-folder":
      return subjectSvg;
    case "icon-model":
      return modelSvg;
  }

  return undefined;
}

function getHierarchyDefinition(props: Parameters<UseIModelTreeProps["getHierarchyDefinition"]>[0]) {
  return new ModelsTreeDefinition(props);
}
