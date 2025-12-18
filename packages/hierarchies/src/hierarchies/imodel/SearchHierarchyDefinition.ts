/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defaultIfEmpty, defer, filter, firstValueFrom, map, merge, mergeAll, mergeMap, Observable, of, take, toArray } from "rxjs";
import { Id64String } from "@itwin/core-bentley";
import { compareFullClassNames, ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import { HierarchyNodeKey, IModelInstanceKey } from "../HierarchyNodeKey.js";
import { createHierarchySearchHelper, HierarchySearchPath, shouldAutoExpandBasedOnReveal } from "../HierarchySearch.js";
import {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
} from "../imodel/IModelHierarchyDefinition.js";
import { ProcessedGroupingHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode } from "../imodel/IModelHierarchyNode.js";
import { NodeSelectClauseColumnNames } from "../imodel/NodeSelectQueryFactory.js";
import { defaultNodesParser } from "../imodel/TreeNodesReader.js";
import { fromPossiblyPromise } from "../internal/Common.js";
import { partition } from "../internal/operators/Partition.js";
import { RxjsHierarchyDefinition, RxjsNodeParser, RxjsNodePostProcessor, RxjsNodePreProcessor } from "../internal/RxjsHierarchyDefinition.js";

interface SearchHierarchyDefinitionProps {
  imodelAccess: ECClassHierarchyInspector;
  source: RxjsHierarchyDefinition;
  sourceName: string;
  targetPaths: HierarchySearchPath[];
  nodesParser?: RxjsNodeParser;
}

/** @internal */
export class SearchHierarchyDefinition implements RxjsHierarchyDefinition {
  private _imodelAccess: ECClassHierarchyInspector;
  private _source: RxjsHierarchyDefinition;
  private _targetPaths: HierarchySearchPath[];
  private _nodesParser: RxjsNodeParser;
  #sourceName: string;

  public constructor(props: SearchHierarchyDefinitionProps) {
    this._imodelAccess = props.imodelAccess;
    this._source = props.source;
    this.#sourceName = props.sourceName;
    this._targetPaths = props.targetPaths;
    this._nodesParser = props.nodesParser ?? this._source.parseNode ?? ((row) => of(defaultNodesParser(row)));
  }

  public get preProcessNode(): RxjsNodePreProcessor {
    return (node) =>
      (this._source.preProcessNode ? this._source.preProcessNode(node) : of(node)).pipe(
        filter((processedNode) => {
          if (processedNode.processingParams?.hideInHierarchy && processedNode.search?.isSearchTarget && !processedNode.search.hasSearchTargetAncestor) {
            // we want to hide target nodes if they have `hideInHierarchy` param, but only if they're not under another search target
            return false;
          }
          return true;
        }),
      );
  }

  public get postProcessNode(): RxjsNodePostProcessor {
    return (node) =>
      (this._source.postProcessNode ? this._source.postProcessNode(node) : of(node)).pipe(
        map((processedNode) => {
          const parentKeysWithoutGroupingNodesLength = processedNode.parentKeys.filter((key) => !HierarchyNodeKey.isGrouping(key)).length;
          const parentKeysLength = processedNode.parentKeys.length;
          const shouldAutoExpand = ProcessedHierarchyNode.isGroupingNode(processedNode)
            ? shouldAutoExpandGroupingNodeBasedOnNestedChildren({
                directOrIndirectChildren: processedNode.children,
                parentKeysWithoutGroupingNodesLength,
                parentKeysLength,
              })
            : (processedNode.search?.isSearchTarget && !!processedNode.search.searchTargetOptions?.autoExpand) ||
              processedNode.search?.childrenTargetPaths?.some((path) =>
                shouldAutoExpandBasedOnReveal({
                  reveal: HierarchySearchPath.normalize(path).options?.reveal,
                  nodePositionInPath: parentKeysWithoutGroupingNodesLength,
                  nodePositionInHierarchy: parentKeysLength,
                }),
              );
          if (shouldAutoExpand) {
            Object.assign(processedNode, { autoExpand: true });
          }

          return processedNode;
        }),
      );
  }

  public get parseNode(): RxjsNodeParser {
    return (props) =>
      this._nodesParser(props).pipe(
        mergeMap((parsedNode) => {
          const { row, parentNode, imodelKey } = props;
          if (!row[ECSQL_COLUMN_NAME_SearchECInstanceId] || !row[ECSQL_COLUMN_NAME_SearchClassName]) {
            return of(parsedNode);
          }
          const rowInstanceKey = { className: row[ECSQL_COLUMN_NAME_SearchClassName], id: row[ECSQL_COLUMN_NAME_SearchECInstanceId] };
          const searchHelper = createHierarchySearchHelper(this._targetPaths, parentNode);
          const nodeSearchPropPossiblyPromise = searchHelper.createChildNodeProps({
            asyncPathMatcher: (identifier): boolean | Promise<boolean> => {
              if (identifier.id !== rowInstanceKey.id) {
                return false;
              }
              if (!HierarchyNodeIdentifier.isInstanceNodeIdentifier(identifier)) {
                return false;
              }
              if (identifier.imodelKey && identifier.imodelKey !== imodelKey) {
                return false;
              }
              if (compareFullClassNames(identifier.className, rowInstanceKey.className) === 0) {
                return true;
              }
              return firstValueFrom(
                merge(
                  fromPossiblyPromise(this._imodelAccess.classDerivesFrom(identifier.className, rowInstanceKey.className)),
                  fromPossiblyPromise(this._imodelAccess.classDerivesFrom(rowInstanceKey.className, identifier.className)),
                ).pipe(
                  filter((classDerives) => classDerives),
                  defaultIfEmpty(false),
                  take(1),
                ),
              );
            },
          });
          return fromPossiblyPromise(nodeSearchPropPossiblyPromise).pipe(
            map((nodeExtraProps) => {
              if (nodeExtraProps?.search) {
                parsedNode.search = nodeExtraProps.search;
              }
              return parsedNode;
            }),
          );
        }),
      );
  }

  public defineHierarchyLevel(props: DefineHierarchyLevelProps): Observable<HierarchyLevelDefinition> {
    const sourceDefinitions = this._source.defineHierarchyLevel(props);

    const searchHelper = createHierarchySearchHelper(this._targetPaths, props.parentNode);
    const childNodeSearchIdentifiers = searchHelper.getChildNodeSearchIdentifiers();
    if (!childNodeSearchIdentifiers) {
      return sourceDefinitions;
    }

    const [genericNodeDefinitions, instanceNodeDefinitions] = partition(sourceDefinitions.pipe(mergeAll()), HierarchyNodesDefinition.isGenericNode);
    return merge(
      genericNodeDefinitions.pipe(
        map((definition) => {
          if (
            searchHelper.hasSearchTargetAncestor ||
            childNodeSearchIdentifiers.some(
              (identifier) =>
                HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier) &&
                (!identifier.source || identifier.source === this.#sourceName) &&
                identifier.id === definition.node.key,
            )
          ) {
            return {
              ...definition,
              node: {
                ...definition.node,
                ...searchHelper.createChildNodeProps({ pathMatcher: ({ id }) => id === definition.node.key }),
              },
            };
          }
          return undefined;
        }),
        filter((def): def is GenericHierarchyNodeDefinition => !!def),
      ),

      instanceNodeDefinitions.pipe(
        mergeMap((definition) => {
          if (searchHelper.hasSearchTargetAncestor) {
            // if we have a search target ancestor, we don't need to search the definitions - we use all of them
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
                  compareFullClassNames(entry.className, x.className) === 0 ||
                  (await imodelAccess.classDerivesFrom(entry.className, x.className)) ||
                  (await imodelAccess.classDerivesFrom(x.className, entry.className))
                ) {
                  return undefined;
                }
              }
              return entries;
            }
            for (const id of childNodeSearchIdentifiers) {
              // take only identifiers that match the definition by type, source and class
              if (!HierarchyNodeIdentifier.isInstanceNodeIdentifier(id)) {
                continue;
              }
              if (id.imodelKey && id.imodelKey !== props.imodelAccess.imodelKey) {
                continue;
              }
              if (
                compareFullClassNames(id.className, definition.fullClassName) !== 0 &&
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

            // for each definition that we're going to use, apply query-level search
            map((pathIdentifiers) => applyECInstanceIdsSearch(definition, pathIdentifiers)),
          );
        }),
      ),
    ).pipe(toArray());
  }
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_SearchECInstanceId = "SearchECInstanceId";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_SearchClassName = "SearchClassName";

function getClassECInstanceIds(targetInstanceKeys: InstanceKey[]) {
  const classNameECInstanceIds = new Map<string, Id64String[]>();
  for (const key of targetInstanceKeys) {
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
export function applyECInstanceIdsSearch(def: InstanceNodesQueryDefinition, targetInstanceKeys: InstanceKey[]): InstanceNodesQueryDefinition {
  const instanceIdsByClass = getClassECInstanceIds(targetInstanceKeys);
  return {
    ...def,
    query: {
      ...def.query,
      ctes: [
        ...(def.query.ctes ?? []),
        `SearchInfo(ECInstanceId, SearchClassName) AS (
          ${Array.from(instanceIdsByClass)
            .map(
              ([className, ecInstanceIds]) => `
                SELECT ECInstanceId, '${className}' AS SearchClassName
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
          IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_SearchECInstanceId}],
          [f].[SearchClassName] AS [${ECSQL_COLUMN_NAME_SearchClassName}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        JOIN SearchInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
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
          IdToHex([q].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_SearchECInstanceId}],
          [q].[${NodeSelectClauseColumnNames.FullClassName}] AS [${ECSQL_COLUMN_NAME_SearchClassName}]
        FROM (${def.query.ecsql}) [q]
      `,
    },
  };
}

function shouldAutoExpandGroupingNodeBasedOnNestedChildren({
  directOrIndirectChildren,
  parentKeysLength,
  parentKeysWithoutGroupingNodesLength,
}: {
  directOrIndirectChildren: Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>;
  parentKeysLength: number;
  parentKeysWithoutGroupingNodesLength: number;
}) {
  for (const child of directOrIndirectChildren) {
    if (ProcessedHierarchyNode.isGroupingNode(child)) {
      // Need to check if the same grouping node needs to be expanded, but check the indirect children instead
      if (
        shouldAutoExpandGroupingNodeBasedOnNestedChildren({ directOrIndirectChildren: child.children, parentKeysLength, parentKeysWithoutGroupingNodesLength })
      ) {
        return true;
      }
      continue;
    }

    /* c8 ignore next 3 */
    if (!child.search) {
      continue;
    }

    if (
      child.search.isSearchTarget &&
      shouldAutoExpandBasedOnReveal({
        reveal: child.search.searchTargetOptions?.reveal,
        nodePositionInHierarchy: parentKeysLength,
        // Grouping node is not in search path, but we can assume that it is at the position of 1 less than `parentKeysWithoutGroupingNodesLength`
        nodePositionInPath: parentKeysWithoutGroupingNodesLength - 1,
      })
    ) {
      return true;
    }

    if (!child.search.childrenTargetPaths) {
      /* c8 ignore next */
      continue;
    }

    for (const path of child.search.childrenTargetPaths) {
      if (
        "path" in path &&
        shouldAutoExpandBasedOnReveal({
          reveal: path.options?.reveal,
          nodePositionInHierarchy: parentKeysLength,
          // Grouping node is not in search path, but we can assume that it is at the position of 1 less than `parentKeysWithoutGroupingNodesLength`
          nodePositionInPath: parentKeysWithoutGroupingNodesLength - 1,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}
