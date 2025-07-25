## API Report File for "@itwin/presentation-hierarchies-react"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { ComponentPropsWithoutRef } from 'react';
import { createIModelHierarchyProvider } from '@itwin/presentation-hierarchies';
import { GenericInstanceFilter } from '@itwin/presentation-hierarchies';
import { HierarchyDefinition } from '@itwin/presentation-hierarchies';
import { HierarchyFilteringPath } from '@itwin/presentation-hierarchies';
import { HierarchyNode } from '@itwin/presentation-hierarchies';
import { HierarchyProvider } from '@itwin/presentation-hierarchies';
import { InstanceKey } from '@itwin/presentation-shared';
import { IPrimitiveValueFormatter } from '@itwin/presentation-shared';
import { JSX as JSX_2 } from 'react/jsx-runtime';
import { NodeData } from '@itwin/itwinui-react';
import { Props } from '@itwin/presentation-shared';
import { PropsWithChildren } from 'react';
import { ReactElement } from 'react';
import { RefAttributes } from 'react';
import { SelectionStorage } from '@itwin/unified-selection';
import { Tree } from '@itwin/itwinui-react';
import { TreeNode } from '@itwin/itwinui-react';

// @public
export function createRenderedTreeNodeData(node: RenderedTreeNode, isNodeSelected: (nodeId: string) => boolean): NodeData<RenderedTreeNode>;

export { GenericInstanceFilter }

// @public
export interface HierarchyLevelDetails {
    getInstanceKeysIterator: (props?: {
        instanceFilter?: GenericInstanceFilter;
        hierarchyLevelSizeLimit?: number | "unbounded";
    }) => AsyncIterableIterator<InstanceKey>;
    hierarchyNode: HierarchyNode | undefined;
    instanceFilter?: GenericInstanceFilter;
    setInstanceFilter: (filter: GenericInstanceFilter | undefined) => void;
    setSizeLimit: (value: undefined | number | "unbounded") => void;
    sizeLimit?: number | "unbounded";
}

export { HierarchyNode }

export { HierarchyProvider }

// @public (undocumented)
type IModelAccess = IModelHierarchyProviderProps["imodelAccess"];

// @public (undocumented)
type IModelHierarchyProviderProps = Props<typeof createIModelHierarchyProvider>;

// @public
export function isPresentationHierarchyNode(node: PresentationTreeNode): node is PresentationHierarchyNode;

// @public
export function LocalizationContextProvider({ localizedStrings, children }: PropsWithChildren<LocalizationContextProviderProps>): JSX_2.Element;

// @public
interface LocalizationContextProviderProps {
    localizedStrings?: Partial<LocalizedStrings>;
}

// @public
interface LocalizedStrings {
    clearHierarchyLevelFilter: string;
    filterHierarchyLevel: string;
    increaseHierarchyLimit: string;
    increaseHierarchyLimitWithFiltering: string;
    loading: string;
    noFilteredChildren: string;
    resultLimitExceeded: string;
    resultLimitExceededWithFiltering: string;
    retry: string;
}

// @public
export interface PresentationGenericInfoNode {
    // (undocumented)
    id: string;
    // (undocumented)
    message: string;
    // (undocumented)
    parentNodeId: string | undefined;
    // (undocumented)
    type: "Unknown";
}

// @public
export interface PresentationHierarchyNode {
    // (undocumented)
    children: true | Array<PresentationTreeNode>;
    extendedData?: {
        [key: string]: any;
    };
    // (undocumented)
    id: string;
    // (undocumented)
    isExpanded: boolean;
    // (undocumented)
    isFilterable: boolean;
    // (undocumented)
    isFiltered: boolean;
    // (undocumented)
    isLoading: boolean;
    // (undocumented)
    label: string;
    nodeData: HierarchyNode;
}

// @public
export type PresentationInfoNode = PresentationGenericInfoNode | PresentationResultSetTooLargeInfoNode | PresentationNoFilterMatchesInfoNode;

// @public
interface PresentationNoFilterMatchesInfoNode {
    // (undocumented)
    id: string;
    // (undocumented)
    parentNodeId: string | undefined;
    // (undocumented)
    type: "NoFilterMatches";
}

// @public
export interface PresentationResultSetTooLargeInfoNode {
    // (undocumented)
    id: string;
    // (undocumented)
    parentNodeId: string | undefined;
    // (undocumented)
    resultSetSizeLimit: number;
    // (undocumented)
    type: "ResultSetTooLarge";
}

// @public
export type PresentationTreeNode = PresentationHierarchyNode | PresentationInfoNode;

// @public
interface ReloadTreeOptions {
    parentNodeId: string | undefined;
    state?: "keep" | "discard" | "reset";
}

// @public
export type RenderedTreeNode = PresentationTreeNode | {
    id: string;
    parentNodeId: string | undefined;
    type: "ChildrenPlaceholder";
};

// @public
type SelectionChangeType = "add" | "replace" | "remove";

// @public
type SelectionMode_2 = "none" | "single" | "extended" | "multiple";

export { SelectionStorage }

// @public (undocumented)
type TreeNodeProps = ComponentPropsWithoutRef<typeof TreeNode>;

// @public
export const TreeNodeRenderer: React.ForwardRefExoticComponent<TreeNodeRendererProps & RefAttributes<HTMLDivElement>>;

// @public (undocumented)
interface TreeNodeRendererOwnProps {
    actionButtonsClassName?: string;
    filterButtonsVisibility?: "show-on-hover" | "hide";
    getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
    getLabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
    getSublabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
    node: RenderedTreeNode;
    onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
    onNodeClick?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
    onNodeKeyDown?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
    reloadTree?: (options: {
        parentNodeId: string | undefined;
        state: "reset";
    }) => void;
    size?: "default" | "small";
}

// @public (undocumented)
type TreeNodeRendererProps = Pick<UseTreeResult, "expandNode"> & Partial<Pick<UseTreeResult, "getHierarchyLevelDetails">> & Omit<TreeNodeProps, "label" | "onExpanded" | "onSelected" | "icon"> & TreeNodeRendererOwnProps;

// @public (undocumented)
type TreeNodeRendererProps_2 = ComponentPropsWithoutRef<typeof TreeNodeRenderer>;

// @public (undocumented)
type TreeProps = ComponentPropsWithoutRef<typeof Tree<RenderedTreeNode>>;

// @public
export function TreeRenderer({ rootNodes, expandNode, selectNodes, isNodeSelected, onFilterClick, getIcon, getLabel, getSublabel, getHierarchyLevelDetails, reloadTree, selectionMode, localizedStrings, size, filterButtonsVisibility, ...treeProps }: TreeRendererProps): JSX_2.Element;

// @public (undocumented)
interface TreeRendererOwnProps {
    rootNodes: PresentationTreeNode[];
    selectionMode?: SelectionMode_2;
}

// @public (undocumented)
type TreeRendererProps = Pick<ReturnType<typeof useTree>, "rootNodes" | "expandNode"> & Partial<Pick<ReturnType<typeof useTree>, "selectNodes" | "isNodeSelected" | "getHierarchyLevelDetails" | "reloadTree">> & Pick<TreeNodeRendererProps_2, "onFilterClick" | "getIcon" | "getLabel" | "getSublabel" | "filterButtonsVisibility"> & TreeRendererOwnProps & Omit<TreeProps, "data" | "nodeRenderer" | "getNode" | "enableVirtualization"> & ComponentPropsWithoutRef<typeof LocalizationContextProvider>;

// @public @deprecated
export function UnifiedSelectionProvider({ storage, children }: PropsWithChildren<{
    storage: SelectionStorage;
}>): JSX_2.Element;

// @public
export function useIModelTree(props: UseIModelTreeProps): UseTreeResult;

// @public
type UseIModelTreeProps = Omit<UseTreeProps, "getHierarchyProvider" | "getFilteredPaths"> & Pick<IModelHierarchyProviderProps, "localizedStrings" | "imodelAccess" | "imodelChanged"> & {
    getHierarchyDefinition: (props: {
        imodelAccess: IModelAccess;
    }) => HierarchyDefinition;
    getFilteredPaths?: (props: {
        imodelAccess: IModelAccess;
        abortSignal: AbortSignal;
    }) => Promise<HierarchyFilteringPath[] | undefined>;
};

// @public
export function useIModelUnifiedSelectionTree(props: UseIModelTreeProps & UseUnifiedTreeSelectionProps): UseTreeResult;

// @public
export function useSelectionHandler(props: UseSelectionHandlerProps): UseSelectionHandlerResult;

// @public
type UseSelectionHandlerProps = Pick<ReturnType<typeof useTree>, "rootNodes" | "selectNodes"> & {
    selectionMode: SelectionMode_2;
};

// @public
interface UseSelectionHandlerResult {
    onNodeClick: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
    onNodeKeyDown: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
}

// @public
export function useTree(props: UseTreeProps): UseTreeResult;

// @public (undocumented)
interface UseTreeProps {
    getFilteredPaths?: ({ abortSignal }: {
        abortSignal: AbortSignal;
    }) => Promise<HierarchyFilteringPath[] | undefined>;
    getHierarchyProvider: () => HierarchyProvider;
    onHierarchyLimitExceeded?: (props: {
        parentId?: string;
        filter?: GenericInstanceFilter;
        limit?: number | "unbounded";
    }) => void;
    onHierarchyLoadError?: (props: {
        parentId?: string;
        type: "timeout" | "unknown";
        error: unknown;
    }) => void;
    onPerformanceMeasured?: (action: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void;
}

// @public (undocumented)
interface UseTreeResult {
    expandNode: (nodeId: string, isExpanded: boolean) => void;
    getHierarchyLevelDetails: (nodeId: string | undefined) => HierarchyLevelDetails | undefined;
    getNode: (nodeId: string) => PresentationHierarchyNode | undefined;
    isLoading: boolean;
    isNodeSelected: (nodeId: string) => boolean;
    reloadTree: (options?: ReloadTreeOptions) => void;
    rootNodes: PresentationTreeNode[] | undefined;
    selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
    setFormatter: (formatter: IPrimitiveValueFormatter | undefined) => void;
}

// @public
export function useUnifiedSelectionTree({ sourceName, selectionStorage, ...props }: UseTreeProps & UseUnifiedTreeSelectionProps): UseTreeResult;

// @public (undocumented)
interface UseUnifiedTreeSelectionProps {
    selectionStorage?: SelectionStorage;
    sourceName: string;
}

// (No @packageDocumentation comment for this package)

```
