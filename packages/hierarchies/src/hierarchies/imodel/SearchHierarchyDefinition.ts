/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defaultIfEmpty, defer, filter, firstValueFrom, map, merge, mergeAll, mergeMap, of, take, toArray } from "rxjs";
import { compareFullClassNames } from "@itwin/presentation-shared";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { createHierarchySearchHelper, HierarchySearchPath } from "../HierarchySearch.js";
import { HierarchyNodesDefinition } from "../imodel/IModelHierarchyDefinition.js";
import { NodeSelectClauseColumnNames } from "../imodel/NodeSelectQueryFactory.js";
import { defaultNodesParser } from "../imodel/TreeNodesReader.js";
import { fromPossiblyPromise } from "../internal/Common.js";
import { partition } from "../internal/operators/Partition.js";
import { ProcessedHierarchyNode } from "./IModelHierarchyNode.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import type { IModelInstanceKey } from "../HierarchyNodeKey.js";
import type {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../imodel/IModelHierarchyDefinition.js";
import type { RxjsHierarchyDefinition, RxjsNodeParser, RxjsNodePostProcessor, RxjsNodePreProcessor } from "../internal/RxjsHierarchyDefinition.js";
import type { ProcessedGroupingHierarchyNode } from "./IModelHierarchyNode.js";

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
    return (props) =>
      (this._source.preProcessNode ? this._source.preProcessNode(props) : of(props.node)).pipe(
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
    return (props) =>
      (this._source.postProcessNode ? this._source.postProcessNode(props) : of(props.node)).pipe(
        map((processedNode) => {
          const shouldAutoExpand = ProcessedHierarchyNode.isGroupingNode(processedNode)
            ? shouldAutoExpandGroupingNode({ node: processedNode })
            : (processedNode.search?.isSearchTarget && !!processedNode.search.searchTargetOptions?.autoExpand) ||
              shouldRevealNodeBasedOnSearchChildrenTargetPaths({
                childrenTargetPaths: processedNode.search?.childrenTargetPaths,
                parentKeys: processedNode.parentKeys,
              });
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
          const { row, parentNode: parentInstanceNode, imodelKey } = props;
          if (!row[ECSQL_COLUMN_NAME_SearchECInstanceId] || !row[ECSQL_COLUMN_NAME_SearchClassName]) {
            return of(parsedNode);
          }
          const rowInstanceKey = { className: row[ECSQL_COLUMN_NAME_SearchClassName], id: row[ECSQL_COLUMN_NAME_SearchECInstanceId] };
          return fromPossiblyPromise(
            createHierarchySearchHelper(this._targetPaths, parentInstanceNode).createChildNodeProps({
              nodeKey: parsedNode.key,
              asyncPathMatcher: (identifier: HierarchyNodeIdentifier): boolean | Promise<boolean> => {
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
            }),
          ).pipe(
            map((nodeExtraProps) => {
              if (nodeExtraProps?.search) {
                parsedNode.search = nodeExtraProps.search;
              }
              if (nodeExtraProps?.autoExpand) {
                parsedNode.autoExpand = nodeExtraProps.autoExpand;
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
                ...searchHelper.createChildNodeProps({
                  nodeKey: { type: "generic", id: definition.node.key },
                  pathMatcher: ({ id }: HierarchyNodeIdentifier) => id === definition.node.key,
                }),
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

function shouldAutoExpandGroupingNode({
  node,
  nodeGroupingLevel,
  nodeNonGroupingDepth,
}: {
  node: ProcessedGroupingHierarchyNode;
  nodeGroupingLevel?: number;
  nodeNonGroupingDepth?: number;
}): boolean {
  if (nodeGroupingLevel === undefined) {
    nodeGroupingLevel = 1;
    for (let i = node.parentKeys.length - 1; i >= 0; i--) {
      if (HierarchyNodeKey.isGrouping(node.parentKeys[i])) {
        nodeGroupingLevel++;
      } else {
        break;
      }
    }
  }
  if (nodeNonGroupingDepth === undefined) {
    nodeNonGroupingDepth = node.parentKeys.filter((k) => !HierarchyNodeKey.isGrouping(k)).length;
  }
  return node.children.some((child) => {
    if (ProcessedHierarchyNode.isGroupingNode(child)) {
      return shouldAutoExpandGroupingNode({ node: child, nodeGroupingLevel: nodeGroupingLevel + 1, nodeNonGroupingDepth });
    }

    if (!child.search) {
      return false;
    }

    // if direct child is search target, check if it has reveal option or if grouping level reveal option is satisfied
    if (child.search.isSearchTarget && child.search.searchTargetOptions) {
      // `reveal = true` means we should auto-expand the grouping node no matter what
      if (child.search.searchTargetOptions.reveal === true) {
        return true;
      }

      // if `reveal` is an object with `groupingLevel`, check if the grouping level condition is satisfied
      if (
        child.search.searchTargetOptions.reveal &&
        "groupingLevel" in child.search.searchTargetOptions.reveal &&
        child.search.searchTargetOptions.reveal.groupingLevel > nodeGroupingLevel
      ) {
        return true;
      }

      // if `reveal` is an object with `depthInPath`, check if the depth in path condition is satisfied
      if (
        child.search.searchTargetOptions.reveal &&
        "depthInPath" in child.search.searchTargetOptions.reveal &&
        child.search.searchTargetOptions.reveal.depthInPath >= nodeNonGroupingDepth
      ) {
        return true;
      }
    }

    return shouldRevealNodeBasedOnSearchChildrenTargetPaths({ childrenTargetPaths: child.search.childrenTargetPaths, nodeNonGroupingDepth });
  });
}

function shouldRevealNodeBasedOnSearchChildrenTargetPaths(
  props: { childrenTargetPaths: HierarchySearchPath[] | undefined } & ({ nodeNonGroupingDepth: number } | { parentKeys: HierarchyNodeKey[] }),
) {
  const nodeNonGroupingDepth =
    "nodeNonGroupingDepth" in props ? props.nodeNonGroupingDepth : props.parentKeys.filter((k) => !HierarchyNodeKey.isGrouping(k)).length + 1;
  return props.childrenTargetPaths?.some((target) => {
    const revealOption = HierarchySearchPath.normalize(target).options?.reveal;
    if (!revealOption) {
      return false;
    }
    return (
      revealOption === true ||
      ("depthInPath" in revealOption && revealOption.depthInPath >= nodeNonGroupingDepth) ||
      ("groupingLevel" in revealOption && !!revealOption.groupingLevel)
    );
  });
}
