/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, filter, from, map, merge, mergeAll, mergeMap, Observable, of, toArray } from "rxjs";
import { Id64String } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import { createHierarchyFilteringHelper, HierarchyFilteringPath } from "../HierarchyFiltering.js";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import { HierarchyNodeKey, IModelInstanceKey } from "../HierarchyNodeKey.js";
import {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
} from "../imodel/IModelHierarchyDefinition.js";
import { ProcessedGroupingHierarchyNode, ProcessedHierarchyNode } from "../imodel/IModelHierarchyNode.js";
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

  private shouldExpandGroupingNode(node: ProcessedGroupingHierarchyNode) {
    for (const child of node.children) {
      /* c8 ignore next 3 */
      if (!child.filtering) {
        continue;
      }

      if (child.filtering.isFilterTarget) {
        const childAutoExpand = child.filtering.filterTargetOptions?.autoExpand;

        // If child is a filter target and is has no `autoExpand` flag, then it's always to be expanded.
        if (childAutoExpand === true) {
          return true;
        }

        // If it's not an object and not `true`, then it's falsy - continue looking
        if (typeof childAutoExpand !== "object") {
          continue;
        }

        // If grouping node's child has `autoExpandUntil` flag,
        // auto-expand the grouping node only if it's depth is lower than that of the grouping node in associated with the target.
        const nodeDepth =
          "key" in childAutoExpand || childAutoExpand.includeGroupingNodes
            ? node.parentKeys.length
            : node.parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length;
        const filterTargetDepth = childAutoExpand.depth;
        if (nodeDepth < filterTargetDepth) {
          return true;
        }
      }

      if (!child.filtering.filteredChildrenIdentifierPaths) {
        /* c8 ignore next */
        continue;
      }

      for (const path of child.filtering.filteredChildrenIdentifierPaths) {
        if ("path" in path && path.options?.autoExpand) {
          return true;
        }
      }
    }
    return false;
  }

  public get postProcessNode(): RxjsNodePostProcessor {
    return (node) => {
      return (this._source.postProcessNode ? this._source.postProcessNode(node) : of(node)).pipe(
        map((processedNode) => {
          // instance nodes get the auto-expand flag in `parseNode`, but grouping ones need to be handled during post-processing
          if (ProcessedHierarchyNode.isGroupingNode(node) && this.shouldExpandGroupingNode(node)) {
            Object.assign(processedNode, { autoExpand: true });
          }
          return processedNode;
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
          const nodeExtraPropsPossiblyPromise = filteringHelper.createChildNodePropsAsync({
            pathMatcher: (identifier): boolean | Promise<boolean> => {
              if (identifier.id !== rowInstanceKey.id) {
                return false;
              }
              if (!HierarchyNodeIdentifier.isInstanceNodeIdentifier(identifier)) {
                return false;
              }
              if (identifier.imodelKey && identifier.imodelKey !== this._imodelAccess.imodelKey) {
                return false;
              }
              if (identifier.className === rowInstanceKey.className) {
                return true;
              }
              return Promise.all([
                this._imodelAccess.classDerivesFrom(identifier.className, rowInstanceKey.className),
                this._imodelAccess.classDerivesFrom(rowInstanceKey.className, identifier.className),
              ]).then(([isDerivedFrom, isDerivedTo]) => isDerivedFrom || isDerivedTo);
            },
          });
          return (nodeExtraPropsPossiblyPromise instanceof Promise ? from(nodeExtraPropsPossiblyPromise) : of(nodeExtraPropsPossiblyPromise)).pipe(
            map((nodeExtraProps) => {
              if (nodeExtraProps?.autoExpand) {
                const parentLength = !parentNode
                  ? 0
                  : nodeExtraProps.filtering?.includeGroupingNodes
                    ? 1 + parentNode.parentKeys.length
                    : 1 + parentNode.parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length;
                parsedNode.autoExpand =
                  nodeExtraProps.filtering?.autoExpandDepth !== undefined && parentLength >= nodeExtraProps.filtering.autoExpandDepth ? undefined : true;
              }
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
