/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { filter, find, firstValueFrom, from, map, merge, mergeAll, mergeMap, of, reduce, tap, toArray } from "rxjs";
import { Id64String } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import { createHierarchyFilteringHelper, HierarchyFilteringPath } from "../HierarchyFiltering.js";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import { IModelInstanceKey } from "../HierarchyNodeKey.js";
import { partition } from "../internal/operators/Partition.js";
import {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
  NodeParser,
  NodePostProcessor,
  NodePreProcessor,
} from "./IModelHierarchyDefinition.js";
import { ProcessedGroupingHierarchyNode, ProcessedHierarchyNode, SourceInstanceHierarchyNode } from "./IModelHierarchyNode.js";
import { defaultNodesParser } from "./TreeNodesReader.js";

interface FilteringHierarchyDefinitionProps {
  imodelAccess: ECClassHierarchyInspector & { imodelKey: string };
  source: HierarchyDefinition;
  nodeIdentifierPaths: HierarchyFilteringPath[];
}

/** @internal */
export class FilteringHierarchyDefinition implements HierarchyDefinition {
  private _imodelAccess: ECClassHierarchyInspector & { imodelKey: string };
  private _source: HierarchyDefinition;
  private _nodeIdentifierPaths: HierarchyFilteringPath[];

  public constructor(props: FilteringHierarchyDefinitionProps) {
    this._imodelAccess = props.imodelAccess;
    this._source = props.source;
    this._nodeIdentifierPaths = props.nodeIdentifierPaths;
  }

  public get preProcessNode(): NodePreProcessor {
    return async (node) => {
      const processedNode = this._source.preProcessNode ? await this._source.preProcessNode(node) : node;
      if (processedNode?.processingParams?.hideInHierarchy && processedNode.filtering?.isFilterTarget && !processedNode.filtering.hasFilterTargetAncestor) {
        // we want to hide target nodes if they have `hideInHierarchy` param, but only if they're not under another filter target
        return undefined;
      }
      return processedNode;
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
        const nodeDepth = node.parentKeys.length;
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

  public get postProcessNode(): NodePostProcessor {
    return async (node: ProcessedHierarchyNode) => {
      const processedNode = this._source.postProcessNode ? await this._source.postProcessNode(node) : node;
      // instance nodes get the auto-expand flag in `parseNode`, but grouping ones need to be handled during post-processing
      if (ProcessedHierarchyNode.isGroupingNode(node) && this.shouldExpandGroupingNode(node)) {
        Object.assign(processedNode, { autoExpand: true });
      }
      return processedNode;
    };
  }

  public get parseNode(): NodeParser {
    return async (row: { [columnName: string]: any }, parentNode?: HierarchyDefinitionParentNode): Promise<SourceInstanceHierarchyNode> => {
      const parsedNode = await (this._source.parseNode ?? defaultNodesParser)(row);

      const filteringHelper = createHierarchyFilteringHelper(this._nodeIdentifierPaths, parentNode);
      const nodeExtraProps =
        row[ECSQL_COLUMN_NAME_FilterECInstanceId] && row[ECSQL_COLUMN_NAME_FilterClassName]
          ? await (async () => {
              const rowInstanceKey = { className: row[ECSQL_COLUMN_NAME_FilterClassName], id: row[ECSQL_COLUMN_NAME_FilterECInstanceId] };
              return filteringHelper.createChildNodePropsAsync({
                pathMatcher: async (identifier) =>
                  HierarchyNodeIdentifier.isInstanceNodeIdentifier(identifier) &&
                  (!identifier.imodelKey || identifier.imodelKey === this._imodelAccess.imodelKey) &&
                  identifier.id === rowInstanceKey.id &&
                  (identifier.className === rowInstanceKey.className ||
                    (await this._imodelAccess.classDerivesFrom(identifier.className, rowInstanceKey.className)) ||
                    (await this._imodelAccess.classDerivesFrom(rowInstanceKey.className, identifier.className))),
              });
            })()
          : undefined;
      if (nodeExtraProps?.autoExpand) {
        parsedNode.autoExpand = true;
      }
      if (nodeExtraProps?.filtering) {
        parsedNode.filtering = nodeExtraProps.filtering;
      }

      return parsedNode;
    };
  }

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const sourceDefinitions = await this._source.defineHierarchyLevel(props);
    const filteringHelper = createHierarchyFilteringHelper(this._nodeIdentifierPaths, props.parentNode);
    const childNodeFilteringIdentifiers = filteringHelper.getChildNodeFilteringIdentifiers();
    if (!childNodeFilteringIdentifiers) {
      return sourceDefinitions;
    }

    const childNodeFilteringIdentifiersForThisSource = childNodeFilteringIdentifiers.filter((id) => {
      return (
        (HierarchyNodeIdentifier.isGenericNodeIdentifier(id) && (!id.source || id.source === this._imodelAccess.imodelKey)) ||
        (HierarchyNodeIdentifier.isInstanceNodeIdentifier(id) && (!id.imodelKey || id.imodelKey === this._imodelAccess.imodelKey))
      );
    });

    const [genericNodeDefinitions, instanceNodeDefinitions] = partition(sourceDefinitions, HierarchyNodesDefinition.isGenericNode);
    return firstValueFrom(
      merge(
        genericNodeDefinitions.pipe(
          map((definition) => {
            if (filteringHelper.hasFilterTargetAncestor) {
              return {
                ...definition,
                node: {
                  ...definition.node,
                  filtering: {
                    hasFilterTargetAncestor: true,
                  },
                },
              };
            }
            if (
              childNodeFilteringIdentifiersForThisSource.filter(HierarchyNodeIdentifier.isGenericNodeIdentifier).some(({ id }) => id === definition.node.key)
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
              return of(definition);
            }

            // otherwise, definition queries need to be filtered
            return from(childNodeFilteringIdentifiersForThisSource.filter(HierarchyNodeIdentifier.isInstanceNodeIdentifier)).pipe(
              // take only identifiers that match the definition
              mergeMap(async (pathIdentifier) => {
                if (
                  (await this._imodelAccess.classDerivesFrom(pathIdentifier.className, definition.fullClassName)) ||
                  (await this._imodelAccess.classDerivesFrom(definition.fullClassName, pathIdentifier.className))
                ) {
                  return pathIdentifier;
                }
                return undefined;
              }),
              filter((id): id is IModelInstanceKey => !!id),

              // make sure that we don't have path identifiers that only differ by class name, where
              // class names are in the same class hierarchy, e.g.:
              // [{ className: "bis.Element", id: "0x1" }, { className: "bis.Subject", id: "0x1" }]
              // are actually the same instance, so we only need to keep one of them, or otherwise the query will
              // duplicate it
              reduce(
                (accObservable, pathIdentifier) =>
                  accObservable.pipe(
                    mergeMap((acc) =>
                      from(acc).pipe(
                        filter(({ id }) => id === pathIdentifier.id),
                        mergeMap(
                          async (id) =>
                            id.className === pathIdentifier.className ||
                            (await this._imodelAccess.classDerivesFrom(id.className, pathIdentifier.className)) ||
                            (await this._imodelAccess.classDerivesFrom(pathIdentifier.className, id.className)),
                        ),
                        find((id) => !!id),
                        map((didFind) => ({ pathIdentifiers: acc, needsInsert: !didFind })),
                      ),
                    ),
                    tap(({ pathIdentifiers, needsInsert }) => {
                      if (needsInsert) {
                        pathIdentifiers.push(pathIdentifier);
                      }
                    }),
                    map(({ pathIdentifiers }) => pathIdentifiers),
                  ),
                of(new Array<InstanceKey>()),
              ),
              mergeAll(),

              // only take definitions that have matching path identifiers
              filter((pathIdentifiers) => pathIdentifiers.length > 0),

              // for each definition that we're going to use, apply query-level filter
              map((pathIdentifiers) => applyECInstanceIdsFilter(definition, pathIdentifiers)),
            );
          }),
        ),
      ).pipe(toArray()),
    );
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
