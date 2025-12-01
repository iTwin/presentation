/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defaultIfEmpty, defer, filter, firstValueFrom, from, map, merge, mergeAll, mergeMap, Observable, of, take, toArray } from "rxjs";
import { Id64String } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import { createHierarchyFilteringHelper, HierarchyFilteringPath, HierarchyFilteringPathOptions } from "../HierarchyFiltering.js";
import { HierarchyNodeFilteringProps, ParentHierarchyNode } from "../HierarchyNode.js";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import { GenericNodeKey, HierarchyNodeKey, IModelInstanceKey, InstancesNodeKey } from "../HierarchyNodeKey.js";
import {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
} from "../imodel/IModelHierarchyDefinition.js";
import {
  ProcessedGenericHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../imodel/IModelHierarchyNode.js";
import { NodeSelectClauseColumnNames } from "../imodel/NodeSelectQueryFactory.js";
import { defaultNodesParser } from "../imodel/TreeNodesReader.js";
import { partition } from "../internal/operators/Partition.js";
import { RxjsHierarchyDefinition, RxjsNodeParser, RxjsNodePostProcessor, RxjsNodePreProcessor } from "../internal/RxjsHierarchyDefinition.js";

interface FilteringHierarchyDefinitionProps {
  imodelAccess: ECClassHierarchyInspector & { imodelKey: string };
  source: RxjsHierarchyDefinition;
  nodeIdentifierPaths: HierarchyFilteringPath[];
  nodesParser?: RxjsNodeParser;
}

/** @internal */
export class FilteringHierarchyDefinition implements RxjsHierarchyDefinition {
  private _imodelAccess: ECClassHierarchyInspector & { imodelKey: string };
  private _source: RxjsHierarchyDefinition;
  private _nodeIdentifierPaths: HierarchyFilteringPath[];
  private _nodesParser: RxjsNodeParser;

  public constructor(props: FilteringHierarchyDefinitionProps) {
    this._imodelAccess = props.imodelAccess;
    this._source = props.source;
    this._nodeIdentifierPaths = props.nodeIdentifierPaths;
    this._nodesParser = props.nodesParser ?? this._source.parseNode ?? ((row) => of(defaultNodesParser(row)));
  }

  public get preProcessNode(): RxjsNodePreProcessor {
    return (node) => {
      return (this._source.preProcessNode ? this._source.preProcessNode(node) : of(node)).pipe(
        filter((processedNode) => {
          if (processedNode.processingParams?.hideInHierarchy && processedNode.filtering?.isFilterTarget && !processedNode.filtering.hasFilterTargetAncestor) {
            // we want to hide target nodes if they have `hideInHierarchy` param, but only if they're not under another filter target
            return false;
          }
          return true;
        }),
      );
    };
  }

  private pathMatcher({
    identifierFromPath,
    nodeKey,
  }: {
    identifierFromPath: HierarchyNodeIdentifier;
    nodeKey: GenericNodeKey | InstancesNodeKey;
  }): boolean | Promise<boolean> {
    // Check generic node case
    if (HierarchyNodeIdentifier.isGenericNodeIdentifier(identifierFromPath)) {
      if (!HierarchyNodeKey.isGeneric(nodeKey)) {
        return false;
      }
      return nodeKey.id === identifierFromPath.id;
    }
    if (HierarchyNodeKey.isGeneric(nodeKey)) {
      return false;
    }

    if (identifierFromPath.imodelKey && identifierFromPath.imodelKey !== this._imodelAccess.imodelKey) {
      return false;
    }
    // Find matching ids
    const instanceKeysMatchingIdentifier = nodeKey.instanceKeys.filter((instanceKey) => instanceKey.id === identifierFromPath.id);
    if (instanceKeysMatchingIdentifier.length === 0) {
      return false;
    }
    // If some of nodes' keys className exactly matches the className of identifier, we can return early
    if (instanceKeysMatchingIdentifier.some((instanceKey) => instanceKey.className === identifierFromPath.className)) {
      return true;
    }
    return firstValueFrom(
      from(instanceKeysMatchingIdentifier).pipe(
        mergeMap((instanceKey) => {
          const isDerivedFrom = this._imodelAccess.classDerivesFrom(identifierFromPath.className, instanceKey.className);
          const isDerivedTo = this._imodelAccess.classDerivesFrom(instanceKey.className, identifierFromPath.className);
          return merge(
            isDerivedFrom instanceof Promise ? from(isDerivedFrom) : of(isDerivedFrom),
            isDerivedTo instanceof Promise ? from(isDerivedTo) : of(isDerivedTo),
          ).pipe(filter((classDerives) => classDerives));
        }),
        defaultIfEmpty(false),
        take(1),
      ),
    );
  }

  private setAutoExpandForProcessedNode<T extends ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>(
    node: T,
    parentNode?: ParentHierarchyNode,
  ): Observable<T> {
    const filteringHelper = createHierarchyFilteringHelper(this._nodeIdentifierPaths, parentNode);
    const nodeAutoExpandPropPossiblyPromise = filteringHelper.createChildNodeProps({
      asyncPathMatcher: (identifier): boolean | Promise<boolean> => this.pathMatcher({ identifierFromPath: identifier, nodeKey: node.key }),
      parentKeys: node.parentKeys,
    });
    return (nodeAutoExpandPropPossiblyPromise instanceof Promise ? from(nodeAutoExpandPropPossiblyPromise) : of(nodeAutoExpandPropPossiblyPromise)).pipe(
      map((autoExpandProp) => {
        if (autoExpandProp?.autoExpand) {
          Object.assign(node, { autoExpand: true });
        }
        return node;
      }),
    );
  }

  private getFilteringPathsForGroupingNode(
    node: ProcessedGroupingHierarchyNode,
    parentNode?: ParentHierarchyNode,
  ): Observable<HierarchyFilteringPath[] | undefined> {
    const parentPaths = parentNode ? parentNode.filtering?.filteredChildrenIdentifierPaths : this._nodeIdentifierPaths;
    if (!parentPaths?.length) {
      return of(undefined);
    }
    const getNonGroupingChildren = (groupingNode: ProcessedGroupingHierarchyNode) => {
      const nonGroupingChildren = new Array<ProcessedInstanceHierarchyNode>();
      groupingNode.children.forEach((child) => {
        if (ProcessedHierarchyNode.isGroupingNode(child)) {
          nonGroupingChildren.push(...getNonGroupingChildren(child));
          return;
        }
        nonGroupingChildren.push(child);
      });
      return nonGroupingChildren;
    };
    const childNodeIdentifiers = getNonGroupingChildren(node);
    return from(parentPaths).pipe(
      mergeMap((path): Observable<undefined | HierarchyFilteringPath> => {
        const normalizedPath = HierarchyFilteringPath.normalize(path).path;
        /* c8 ignore next 3 */
        if (normalizedPath.length === 0) {
          return of(undefined);
        }
        const identifierFromPath = HierarchyFilteringPath.normalize(path).path[0];
        return from(childNodeIdentifiers).pipe(
          mergeMap((nodeKey) => {
            const matchesPossiblyPromise = this.pathMatcher({ identifierFromPath, nodeKey: nodeKey.key });
            return matchesPossiblyPromise instanceof Promise ? from(matchesPossiblyPromise) : of(matchesPossiblyPromise);
          }),
          filter((matches) => matches),
          defaultIfEmpty(false),
          take(1),
          map((matches): undefined | HierarchyFilteringPath => (matches ? path : undefined)),
        );
      }),
      filter((path) => path !== undefined),
      toArray(),
      map((matchingParentPaths) => {
        return matchingParentPaths.length > 0 ? matchingParentPaths : undefined;
      }),
    );
  }

  public get postProcessNode(): RxjsNodePostProcessor {
    return (node, parentNode) => {
      return (this._source.postProcessNode ? this._source.postProcessNode(node, parentNode) : of(node)).pipe(
        mergeMap((processedNode) => {
          if (!ProcessedHierarchyNode.isGroupingNode(processedNode)) {
            // auto-expand flag is set during post processing
            return this.setAutoExpandForProcessedNode(processedNode, parentNode);
          }

          return this.getFilteringPathsForGroupingNode(processedNode, parentNode).pipe(
            map((filteringPaths) => {
              // Grouping node does not have filtering attributes,
              // Assign them from parent node (exclude filter target attributes, since grouping node can't be a filter target)
              const filteringProp: Pick<HierarchyNodeFilteringProps, "filteredChildrenIdentifierPaths" | "hasFilterTargetAncestor"> = {
                ...(filteringPaths?.length ? { filteredChildrenIdentifierPaths: filteringPaths } : undefined),
                ...(parentNode?.filtering?.hasFilterTargetAncestor ? { hasFilterTargetAncestor: parentNode.filtering.hasFilterTargetAncestor } : undefined),
              };
              if (filteringProp.filteredChildrenIdentifierPaths || filteringProp.hasFilterTargetAncestor) {
                Object.assign(processedNode, { filtering: filteringProp });
              }
              if (shouldExpandGroupingNode(processedNode)) {
                Object.assign(processedNode, { autoExpand: true });
              }
              return processedNode;
            }),
          );
        }),
      );
    };
  }

  public get parseNode(): RxjsNodeParser {
    return (row, parentNode) => {
      return this._nodesParser(row).pipe(
        mergeMap((parsedNode) => {
          if (!row[ECSQL_COLUMN_NAME_FilterECInstanceId] || !row[ECSQL_COLUMN_NAME_FilterClassName]) {
            return of(parsedNode);
          }
          const rowInstanceKey = { className: row[ECSQL_COLUMN_NAME_FilterClassName], id: row[ECSQL_COLUMN_NAME_FilterECInstanceId] };
          const filteringHelper = createHierarchyFilteringHelper(this._nodeIdentifierPaths, parentNode);
          const nodeFilteringPropPossiblyPromise = filteringHelper.createChildNodeProps({
            asyncPathMatcher: (identifier): boolean | Promise<boolean> =>
              this.pathMatcher({
                identifierFromPath: identifier,
                nodeKey: { type: "instances", instanceKeys: [{ id: rowInstanceKey.id, className: rowInstanceKey.className }] },
              }),
          });
          return (nodeFilteringPropPossiblyPromise instanceof Promise ? from(nodeFilteringPropPossiblyPromise) : of(nodeFilteringPropPossiblyPromise)).pipe(
            map((nodeExtraProps) => {
              if (nodeExtraProps?.filtering) {
                parsedNode.filtering = nodeExtraProps.filtering;
              }
              return parsedNode;
            }),
          );
        }),
      );
    };
  }

  public defineHierarchyLevel(props: DefineHierarchyLevelProps): Observable<HierarchyLevelDefinition> {
    const sourceDefinitions = this._source.defineHierarchyLevel(props);

    const filteringHelper = createHierarchyFilteringHelper(this._nodeIdentifierPaths, props.parentNode);
    const childNodeFilteringIdentifiers = filteringHelper.getChildNodeFilteringIdentifiers();
    if (!childNodeFilteringIdentifiers) {
      return sourceDefinitions;
    }

    const [genericNodeDefinitions, instanceNodeDefinitions] = partition(sourceDefinitions.pipe(mergeAll()), HierarchyNodesDefinition.isGenericNode);
    return merge(
      genericNodeDefinitions.pipe(
        map((definition) => {
          if (
            filteringHelper.hasFilterTargetAncestor ||
            childNodeFilteringIdentifiers.some(
              (identifier) =>
                HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier) &&
                (!identifier.source || identifier.source === this._imodelAccess.imodelKey) &&
                identifier.id === definition.node.key,
            )
          ) {
            return {
              ...definition,
              node: {
                ...definition.node,
                ...filteringHelper.createChildNodeProps({ pathMatcher: ({ id }) => id === definition.node.key }),
              },
            };
          }
          return undefined;
        }),
        filter((def): def is GenericHierarchyNodeDefinition => !!def),
      ),

      instanceNodeDefinitions.pipe(
        mergeMap((definition) => {
          if (filteringHelper.hasFilterTargetAncestor) {
            // if we have a filter target ancestor, we don't need to filter the definitions - we use all of them
            return of(applyECInstanceIdsSelector(definition));
          }
          return defer(async () => {
            const imodelAccess = this._imodelAccess;
            const matches = new Map<Id64String, IModelInstanceKey[]>();
            async function getEntries(x: IModelInstanceKey) {
              let entries = matches.get(x.id);
              if (!entries) {
                entries = [];
                matches.set(x.id, entries);
              }
              // make sure that we don't have path identifiers that only differ by class name, where
              // class names are in the same class hierarchy, e.g.:
              // [{ className: "bis.Element", id: "0x1" }, { className: "bis.Subject", id: "0x1" }]
              // are actually the same instance, so we only need to keep one of them, or otherwise the query will
              // duplicate it
              for (const entry of entries) {
                if (
                  entry.className === x.className ||
                  (await imodelAccess.classDerivesFrom(entry.className, x.className)) ||
                  (await imodelAccess.classDerivesFrom(x.className, entry.className))
                ) {
                  return undefined;
                }
              }
              return entries;
            }
            for (const id of childNodeFilteringIdentifiers) {
              // take only identifiers that match the definition by type, source and class
              if (!HierarchyNodeIdentifier.isInstanceNodeIdentifier(id)) {
                continue;
              }
              if (id.imodelKey && id.imodelKey !== imodelAccess.imodelKey) {
                continue;
              }
              if (
                id.className !== definition.fullClassName &&
                !(await Promise.all([
                  imodelAccess.classDerivesFrom(id.className, definition.fullClassName),
                  imodelAccess.classDerivesFrom(definition.fullClassName, id.className),
                ]).then(([isDerivedFrom, isDerivedTo]) => isDerivedFrom || isDerivedTo))
              ) {
                continue;
              }
              const entriesTargetForPathIdentifier = await getEntries(id);
              if (entriesTargetForPathIdentifier) {
                entriesTargetForPathIdentifier.push(id);
              }
            }
            return Array.from(matches.values()).flat();
          }).pipe(
            // only take definitions that have matching path identifiers
            filter((pathIdentifiers) => pathIdentifiers.length > 0),

            // for each definition that we're going to use, apply query-level filter
            map((pathIdentifiers) => applyECInstanceIdsFilter(definition, pathIdentifiers)),
          );
        }),
      ),
    ).pipe(toArray());
  }
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilterECInstanceId = "FilterECInstanceId";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilterClassName = "FilterClassName";

function getClassECInstanceIds(filteredInstanceKeys: InstanceKey[]) {
  const classNameECInstanceIds = new Map<string, Id64String[]>();
  for (const key of filteredInstanceKeys) {
    const entry = classNameECInstanceIds.get(key.className);
    if (entry === undefined) {
      classNameECInstanceIds.set(key.className, [key.id]);
      continue;
    }
    entry.push(key.id);
  }
  return classNameECInstanceIds;
}

/** @internal */
export function applyECInstanceIdsFilter(def: InstanceNodesQueryDefinition, filteredInstanceKeys: InstanceKey[]): InstanceNodesQueryDefinition {
  const instanceIdsByClass = getClassECInstanceIds(filteredInstanceKeys);
  return {
    ...def,
    query: {
      ...def.query,
      ctes: [
        ...(def.query.ctes ?? []),
        `FilteringInfo(ECInstanceId, FilterClassName) AS (
          ${Array.from(instanceIdsByClass)
            .map(
              ([className, ecInstanceIds]) => `
                SELECT ECInstanceId, '${className}' AS FilterClassName
                FROM ${className}
                WHERE ECInstanceId IN (${ecInstanceIds.join(", ")})
              `,
            )
            .join(" UNION ALL ")}
        )`,
      ],
      ecsql: `
        SELECT
          [q].*,
          IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
          [f].[FilterClassName] AS [${ECSQL_COLUMN_NAME_FilterClassName}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
      `,
    },
  };
}

/** @internal */
export function applyECInstanceIdsSelector(def: InstanceNodesQueryDefinition): InstanceNodesQueryDefinition {
  return {
    ...def,
    query: {
      ...def.query,
      ecsql: `
        SELECT
          [q].*,
          IdToHex([q].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
          [q].[${NodeSelectClauseColumnNames.FullClassName}] AS [${ECSQL_COLUMN_NAME_FilterClassName}]
        FROM (${def.query.ecsql}) [q]
      `,
    },
  };
}

function shouldExpandGroupingNode(node: ProcessedGroupingHierarchyNode) {
  const getAutoExpand = ({
    groupingNode,
    numberOfNonGroupingParentNodes,
    numberOfParentNodes,
  }: {
    groupingNode: ProcessedGroupingHierarchyNode;
    numberOfNonGroupingParentNodes: number;
    numberOfParentNodes: number;
  }) => {
    for (const child of groupingNode.children) {
      if (ProcessedHierarchyNode.isGroupingNode(child)) {
        if (getAutoExpand({ groupingNode: child, numberOfNonGroupingParentNodes, numberOfParentNodes })) {
          return true;
        }
        continue;
      }

      /* c8 ignore next 3 */
      if (!child.filtering) {
        continue;
      }

      if (
        child.filtering.isFilterTarget &&
        getRevealAsTrueFalse(child.filtering.filterTargetOptions?.reveal, numberOfNonGroupingParentNodes, node.parentKeys.length)
      ) {
        return true;
      }

      if (!child.filtering.filteredChildrenIdentifierPaths) {
        /* c8 ignore next */
        continue;
      }

      for (const path of child.filtering.filteredChildrenIdentifierPaths) {
        if ("path" in path && getRevealAsTrueFalse(path.options?.reveal, numberOfNonGroupingParentNodes, node.parentKeys.length)) {
          return true;
        }
      }
    }
    return false;
  };
  return getAutoExpand({
    groupingNode: node,
    numberOfNonGroupingParentNodes: node.parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length,
    numberOfParentNodes: node.parentKeys.length,
  });
}

function getRevealAsTrueFalse(reveal: HierarchyFilteringPathOptions["reveal"], numberOfNonGroupingParentNodes: number, numberOfParentNodes: number): boolean {
  if (!reveal) {
    return false;
  }
  if (reveal === true) {
    return true;
  }
  if ("depthInHierarchy" in reveal) {
    return numberOfParentNodes < reveal.depthInHierarchy;
  }
  // When using depthInPath option, grouping nodes that are parents of node in depthInPath index, should be expanded
  // Because of this need to use depthInPath +1
  // When checking if non grouping node should be expanded, depthInPath can be used in the same way, but no need to add 1
  return numberOfNonGroupingParentNodes < reveal.depthInPath + 1;
}
