/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expand, from, map, mergeMap, Observable, of, reduce, Subject, Subscription, zip } from "rxjs";
import { Guid } from "@itwin/core-bentley";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider, ParentNodeKey } from "@itwin/presentation-hierarchy-builder";

export interface PresentationNodeKey {
  id: string;
  nodeData: HierarchyNode;
}

export interface ModelNode extends PresentationNodeKey {
  label: string;
  children: boolean;
  isLoading?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
}

export interface TreeModel {
  parentChildMap: Map<string | undefined, string[]>;
  idToNode: { [id: string]: ModelNode };
}

export class HierarchyLoader {
  private _loader = new Subject<PresentationNodeKey | undefined>();
  private _subscription: Subscription;

  constructor(
    private _hierarchyProvider: HierarchyProvider,
    private _onLoad: (parent: PresentationNodeKey | undefined, model: TreeModel) => void,
  ) {
    this._subscription = this._loader
      .pipe(
        mergeMap(
          (parentNode) =>
            createNodesLoadObs({
              provider: this._hierarchyProvider,
              parentNode,
              shouldLoadChildren: (node: ModelNode) => !!node.nodeData.autoExpand,
              createModelNode: (node) => ({
                ...createBaseModelNode(node),
                isExpanded: !!node.autoExpand,
                isLoading: false,
              }),
            }),
          1,
        ),
      )
      .subscribe({
        next: ([hierarchyPartParent, model]) => {
          this._onLoad(hierarchyPartParent, model);
        },
      });
  }

  public dispose() {
    this._subscription.unsubscribe();
  }

  public loadNode(parent: PresentationNodeKey | undefined) {
    this._loader.next(parent);
  }
}

export function reloadTree(hierarchyProvider: HierarchyProvider, expandedNodes: PresentationNodeKey[]): Observable<TreeModel> {
  return createNodesLoadObs({
    provider: hierarchyProvider,
    parentNode: undefined,
    shouldLoadChildren: (node: ModelNode) => expandedNodes.findIndex((nodeToReload) => sameNodes(nodeToReload.nodeData, node.nodeData)) !== -1,
    createModelNode: (node) => ({
      ...createBaseModelNode(node),
      isExpanded: false,
      isLoading: false,
    }),
    onNodesLoaded: (model, { parentNode }) => {
      if (parentNode !== undefined) {
        model.idToNode[parentNode.id].isExpanded = true;
      }
    },
  }).pipe(map(([_, treeModel]) => treeModel));
}

interface LoadedHierarchyPart {
  parentNode: PresentationNodeKey | undefined;
  loadedNodes: ModelNode[];
}

interface CreateNodesLoadObsParams {
  provider: HierarchyProvider;
  parentNode: PresentationNodeKey | undefined;
  instanceFilter?: GenericInstanceFilter;
  hierarchyLevelSizeLimit?: number | "unbounded";
  shouldLoadChildren: (node: ModelNode) => boolean;
  createModelNode: (node: HierarchyNode) => ModelNode;
  onNodesLoaded?: (model: TreeModel, loadedPart: LoadedHierarchyPart) => void;
}

function createNodesLoadObs(params: CreateNodesLoadObsParams): Observable<[PresentationNodeKey | undefined, TreeModel]> {
  return zip(
    of(params.parentNode),
    loadChildren({
      provider: params.provider,
      parentNode: params.parentNode,
      instanceFilter: params.instanceFilter,
      hierarchyLevelSizeLimit: params.hierarchyLevelSizeLimit,
      mapHierarchyNode: params.createModelNode,
    }).pipe(
      expand((loadedPart) =>
        from(loadedPart.loadedNodes.filter(params.shouldLoadChildren)).pipe(
          mergeMap((node) =>
            loadChildren({
              provider: params.provider,
              parentNode: node,
              instanceFilter: params.instanceFilter,
              hierarchyLevelSizeLimit: params.hierarchyLevelSizeLimit,
              mapHierarchyNode: params.createModelNode,
            }),
          ),
        ),
      ),
      reduce(
        (treeModel, hierarchyPart) => {
          addNodesToModel(treeModel, hierarchyPart);
          params.onNodesLoaded && params.onNodesLoaded(treeModel, hierarchyPart);
          return treeModel;
        },
        {
          idToNode: {},
          parentChildMap: new Map(),
        } as TreeModel,
      ),
    ),
  );
}

interface LoadChildrenProps {
  provider: HierarchyProvider;
  parentNode: PresentationNodeKey | undefined;
  instanceFilter?: GenericInstanceFilter;
  hierarchyLevelSizeLimit?: number | "unbounded";
  mapHierarchyNode: (node: HierarchyNode) => ModelNode;
}

function loadChildren({ provider, parentNode, instanceFilter, hierarchyLevelSizeLimit, mapHierarchyNode }: LoadChildrenProps): Observable<LoadedHierarchyPart> {
  return from(provider.getNodes({ parentNode: parentNode?.nodeData, instanceFilter, hierarchyLevelSizeLimit })).pipe(
    map((childNodes) => ({
      parentNode,
      loadedNodes: childNodes.map(mapHierarchyNode),
    })),
  );
}

function addNodesToModel(model: TreeModel, hierarchyPart: LoadedHierarchyPart) {
  model.parentChildMap.set(
    hierarchyPart.parentNode?.id,
    hierarchyPart.loadedNodes.map((node) => node.id),
  );
  for (const node of hierarchyPart.loadedNodes) {
    model.idToNode[node.id] = node;
  }
}

function createBaseModelNode(hierarchyNode: HierarchyNode): ModelNode {
  return {
    id: Guid.createValue(),
    children: hierarchyNode.children,
    label: hierarchyNode.label,
    nodeData: hierarchyNode,
  };
}

function sameNodes(lhs: HierarchyNode, rhs: HierarchyNode): boolean {
  if (ParentNodeKey.compare(lhs.key, rhs.key) !== 0) {
    return false;
  }

  if (lhs.parentKeys.length !== rhs.parentKeys.length) {
    return false;
  }

  for (let i = lhs.parentKeys.length - 1; i >= 0; --i) {
    if (ParentNodeKey.compare(lhs.parentKeys[i], rhs.parentKeys[i]) !== 0) {
      return false;
    }
  }
  return true;
}
