/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Dictionary } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import { extractFilteringProps, HierarchyFilteringPath, HierarchyFilteringPathOptions } from "../HierarchyFiltering";
import { HierarchyNodeFilteringProps } from "../HierarchyNode";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier";
import { GenericNodeKey } from "../HierarchyNodeKey";
import {
  DefineHierarchyLevelProps,
  GenericHierarchyNodeDefinition,
  HierarchyDefinition,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
  NodeParser,
  NodePostProcessor,
  NodePreProcessor,
} from "./IModelHierarchyDefinition";
import { ProcessedGroupingHierarchyNode, ProcessedHierarchyNode, SourceHierarchyNode, SourceInstanceHierarchyNode } from "./IModelHierarchyNode";
import { defaultNodesParser } from "./TreeNodesReader";

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
  private _pathsIdentifierPositions: Dictionary<HierarchyNodeIdentifier, Array<[number, number]>>;
  /**
   * Cache that is used for determining how many identifiers from two paths are similar.
   * Identifiers are similar if:
   * a) They are both of [[IModelInstanceKey]] type and:
   *  1. They have the same id's and imodelKeys.
   *  2. They have the same or related (derived) class.
   * b) They are both of [[GenericNodeKey]] type and:
   *  1. They have the same id's and sources.
   * For example, if provided these pathIndexes:
   * {lhsIndex: 0, rhsIndex: 1}
   * with these _nodeIdentifierPaths:
   * [[a, b, c, d, e], [a, b, c, e, f]]
   * This dictionary would return: 3, since both paths start with a, b, c identifiers (which are similar)
   */
  private _pathsSimilarityLengthCache: Dictionary<{ lhsIndex: number; rhsIndex: number }, number>;

  public constructor(props: FilteringHierarchyDefinitionProps) {
    this._imodelAccess = props.imodelAccess;
    this._source = props.source;
    this._nodeIdentifierPaths = props.nodeIdentifierPaths;
    this._pathsIdentifierPositions = this.createPathsIdentifierPositions(props.nodeIdentifierPaths);
    this._pathsSimilarityLengthCache = this.createPathsSimilarityLengthCache();
  }

  /**
   * Creates a dictionary of positions from nodeIdentifierPaths.
   * For example, if provided these nodeIdentifierPaths:
   * [[a, b, c], [d, c]], the following dictionary would be created:
   * {a: [[0, 0]], b: [[0, 1]], c: [[0, 2], [1, 1]], d: [[1, 0]]}.
   *
   * NOTE: This dictionary ignores classNames. In cases where identifiers are of [[InstanceNodeIdentifier]] type, share the same imodelKey and
   * id, resulting dictionary would have the same key for both identifiers. This is done, because it is not enough to compare className equality,
   * we need to also check if one class derives from the other or vice versa. To perform this check `imodelAccess.classDerivesFrom` function needs
   * to be used and since it is an async function, we can't use it in the constructor. The positions are later adjusted by [[parseNode]] function,
   * where `imodelAccess.classDerivesFrom` can be used, since it is async.
   */
  private createPathsIdentifierPositions(nodeIdentifierPaths: HierarchyFilteringPath[]): Dictionary<HierarchyNodeIdentifier, Array<[number, number]>> {
    const pathsIdentifiersPositionsDictionary = new Dictionary<HierarchyNodeIdentifier, Array<[number, number]>>(HierarchyNodeIdentifier.compare);

    nodeIdentifierPaths.forEach((nodeIdentifierPath, pathIndex) => {
      const normalizedPath = HierarchyFilteringPath.normalize(nodeIdentifierPath);
      if (normalizedPath.path.length === 0) {
        return;
      }
      normalizedPath.path.forEach((identifier, identifierIndex) => {
        const formattedIdentifier: HierarchyNodeIdentifier = HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier)
          ? {
              id: identifier.id,
              type: "generic",
              source: identifier.source ?? this._imodelAccess.imodelKey,
            }
          : {
              id: identifier.id,
              imodelKey: identifier.imodelKey ?? this._imodelAccess.imodelKey,
              className: "",
            };
        const entry = pathsIdentifiersPositionsDictionary.get(formattedIdentifier);
        if (!entry) {
          pathsIdentifiersPositionsDictionary.set(formattedIdentifier, [[pathIndex, identifierIndex]]);
        } else {
          entry.push([pathIndex, identifierIndex]);
        }
      });
    });
    return pathsIdentifiersPositionsDictionary;
  }

  private createPathsSimilarityLengthCache(): Dictionary<{ lhsIndex: number; rhsIndex: number }, number> {
    const compare = (lhs: { lhsIndex: number; rhsIndex: number }, rhs: { lhsIndex: number; rhsIndex: number }) => {
      // istanbul ignore next
      if (lhs.lhsIndex === rhs.lhsIndex && lhs.rhsIndex === rhs.rhsIndex) {
        return 0;
      }
      // istanbul ignore next
      if (lhs.rhsIndex === rhs.lhsIndex && lhs.lhsIndex === rhs.rhsIndex) {
        return 0;
      }
      if (lhs.lhsIndex !== rhs.lhsIndex) {
        // istanbul ignore next
        return lhs.lhsIndex > rhs.lhsIndex ? 1 : -1;
      }
      // istanbul ignore next
      return lhs.rhsIndex > rhs.rhsIndex ? 1 : -1;
    };
    return new Dictionary<{ lhsIndex: number; rhsIndex: number }, number>(compare);
  }

  private async getPathsSimilarityLength(lhsIndex: number, rhsIndex: number): Promise<number> {
    let entry = this._pathsSimilarityLengthCache.get({ lhsIndex, rhsIndex });
    // istanbul ignore if
    if (entry !== undefined) {
      return entry;
    }
    let similarityLength = 0;
    const lhsPath = HierarchyFilteringPath.normalize(this._nodeIdentifierPaths[lhsIndex]);
    const rhsPath = HierarchyFilteringPath.normalize(this._nodeIdentifierPaths[rhsIndex]);
    // istanbul ignore next
    const smallerLength = lhsPath.path.length > rhsPath.path.length ? rhsPath.path.length : lhsPath.path.length;
    for (let i = 0; i < smallerLength; ++i) {
      const lhsIdentifier = lhsPath.path[i];
      const rhsIdentifier = rhsPath.path[i];
      if (HierarchyNodeIdentifier.isInstanceNodeIdentifier(lhsIdentifier) && HierarchyNodeIdentifier.isInstanceNodeIdentifier(rhsIdentifier)) {
        if (
          lhsIdentifier.imodelKey !== rhsIdentifier.imodelKey ||
          lhsIdentifier.id !== rhsIdentifier.id ||
          (lhsIdentifier.className !== rhsIdentifier.className &&
            !(await this._imodelAccess.classDerivesFrom(lhsIdentifier.className, rhsIdentifier.className)) &&
            !(await this._imodelAccess.classDerivesFrom(rhsIdentifier.className, lhsIdentifier.className)))
        ) {
          break;
        }
        ++similarityLength;
        continue;
      }

      // istanbul ignore next
      if (HierarchyNodeIdentifier.isGenericNodeIdentifier(lhsIdentifier) && HierarchyNodeIdentifier.isGenericNodeIdentifier(rhsIdentifier)) {
        if (lhsIdentifier.source !== rhsIdentifier.source || lhsIdentifier.id !== rhsIdentifier.id) {
          break;
        }
        ++similarityLength;
        continue;
      }
      // istanbul ignore next
      break;
    }
    this._pathsSimilarityLengthCache.set({ lhsIndex, rhsIndex }, similarityLength);
    return similarityLength;
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
      // istanbul ignore next
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
        // istanbul ignore next
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
    return async (row: { [columnName: string]: any }): Promise<SourceInstanceHierarchyNode> => {
      const hasFilterTargetAncestor: boolean = !!row[ECSQL_COLUMN_NAME_HasFilterTargetAncestor];
      const isFilterTarget: boolean = !!row[ECSQL_COLUMN_NAME_IsFilterTarget];
      const filterTargetOptions: HierarchyFilteringPathOptions | undefined = row[ECSQL_COLUMN_NAME_FilterTargetOptions]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilterTargetOptions])
        : undefined;

      const { filteredChildrenIdentifierPaths, filteredChildrenIdentifierPathsIndex } =
        row[ECSQL_COLUMN_NAME_FilterECInstanceId] &&
        row[ECSQL_COLUMN_NAME_FilterClassName] &&
        row[ECSQL_COLUMN_NAME_FilterValidPathIndex] !== undefined &&
        row[ECSQL_COLUMN_NAME_FilterIdentifiersCountAfter] !== undefined
          ? await this.getChildrenIdentifierPathsAndIndex(
              {
                className: row[ECSQL_COLUMN_NAME_FilterClassName],
                id: row[ECSQL_COLUMN_NAME_FilterECInstanceId],
              },
              row[ECSQL_COLUMN_NAME_FilterValidPathIndex],
              row[ECSQL_COLUMN_NAME_FilterIdentifiersCountAfter],
            )
          : { filteredChildrenIdentifierPaths: [], filteredChildrenIdentifierPathsIndex: [] };

      const defaultNode = await (this._source.parseNode ?? defaultNodesParser)(row);
      return applyFilterAttributes({
        node: defaultNode,
        filteredChildrenIdentifierPaths,
        filteredChildrenIdentifierPathsIndex,
        isFilterTarget,
        filterTargetOptions,
        hasFilterTargetAncestor,
      });
    };
  }

  private async getChildrenIdentifierPathsAndIndex(providedIdentifier: InstanceKey, validPathIndex: number, identifiersCountAfter: number) {
    const { id, className } = providedIdentifier;
    // istanbul ignore next
    const allFilterPathsIdentifierPositions: Array<[number, number]> | undefined =
      this._pathsIdentifierPositions.get({
        id,
        className: "",
        imodelKey: this._imodelAccess.imodelKey,
      }) ?? [];

    // Need to filter out paths that are not supposed to be used:
    // 1. All identifiers before identifierIndex must be similar.
    // 2. Identifier at identifierIndex must be of related class as the providedIdentifier
    let filteredChildrenIdentifierPaths: HierarchyFilteringPath[] | undefined;
    let filteredChildrenIdentifierPathsIndex: number[] | undefined;
    for (const [pathIndex, identifierIndex] of allFilterPathsIdentifierPositions) {
      const path = HierarchyFilteringPath.normalize(this._nodeIdentifierPaths[pathIndex]);

      // Check if paths have the same identifiers before the current identifier
      const validPath = HierarchyFilteringPath.normalize(this._nodeIdentifierPaths[validPathIndex]);
      if (identifierIndex !== validPath.path.length - identifiersCountAfter - 1) {
        continue;
      }

      if (pathIndex !== validPathIndex) {
        const similarityLength = await this.getPathsSimilarityLength(pathIndex, validPathIndex);
        // istanbul ignore if
        if (similarityLength < identifierIndex) {
          continue;
        }
      }

      // _pathsIdentifierPositions doesn't care about classNames, we need to check if identifiers with the same id are
      // of the same class / derived class / is derived from class
      const identifier = path.path[identifierIndex];
      if (
        HierarchyNodeIdentifier.isInstanceNodeIdentifier(identifier) &&
        identifier.className !== className &&
        !(await this._imodelAccess.classDerivesFrom(identifier.className, className)) &&
        !(await this._imodelAccess.classDerivesFrom(className, identifier.className))
      ) {
        continue;
      }

      if (!filteredChildrenIdentifierPaths) {
        filteredChildrenIdentifierPaths = [];
      }
      if (!filteredChildrenIdentifierPathsIndex) {
        filteredChildrenIdentifierPathsIndex = [];
      }

      if (path.path.length > identifierIndex + 1) {
        filteredChildrenIdentifierPathsIndex.push(pathIndex);
        filteredChildrenIdentifierPaths.push(
          path.options ? { path: path.path.slice(identifierIndex + 1), options: path.options } : path.path.slice(identifierIndex + 1),
        );
      }
    }
    return { filteredChildrenIdentifierPaths, filteredChildrenIdentifierPathsIndex };
  }

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const sourceDefinitions = await this._source.defineHierarchyLevel(props);
    const filteringProps = extractFilteringProps(this._nodeIdentifierPaths, props.parentNode);
    if (!filteringProps) {
      return sourceDefinitions;
    }

    const filteredDefinitions: HierarchyLevelDefinition = [];
    await Promise.all(
      sourceDefinitions.map(async (definition) => {
        let matchedDefinition: HierarchyNodesDefinition | undefined;
        if (HierarchyNodesDefinition.isGenericNode(definition)) {
          matchedDefinition = await matchFilters<GenericNodeKey>(
            definition,
            filteringProps,
            async (id) => {
              return (
                HierarchyNodeIdentifier.isGenericNodeIdentifier(id) &&
                (!id.source || id.source === this._imodelAccess.imodelKey) &&
                id.id === definition.node.key
              );
            },
            this._imodelAccess,
            (def, matchingFilters) => {
              const filteredChildrenIdentifierPaths = new Array<HierarchyFilteringPath>();
              const filteredChildrenIdentifierPathsIndex = new Array<number>();
              for (const matchingFilter of matchingFilters) {
                filteredChildrenIdentifierPaths.push(...matchingFilter.childrenIdentifierPaths);
                filteredChildrenIdentifierPathsIndex.push(...new Array(matchingFilter.childrenIdentifierPaths.length).fill(matchingFilter.validPathIndex));
              }
              return {
                ...def,
                node: applyFilterAttributes({
                  node: def.node,
                  filteredChildrenIdentifierPaths,
                  filteredChildrenIdentifierPathsIndex,
                  isFilterTarget: matchingFilters.some((mc) => mc.isFilterTarget),
                  hasFilterTargetAncestor: filteringProps.hasFilterTargetAncestor,
                }),
              };
            },
          );
        } else {
          matchedDefinition = await matchFilters<InstanceKey>(
            definition,
            filteringProps,
            async (id) => {
              return (
                HierarchyNodeIdentifier.isInstanceNodeIdentifier(id) &&
                (!id.imodelKey || id.imodelKey === this._imodelAccess.imodelKey) &&
                (await this._imodelAccess.classDerivesFrom(id.className, definition.fullClassName))
              );
            },
            this._imodelAccess,
            (def, matchingFilters) => applyECInstanceIdsFilter(def, matchingFilters, !!filteringProps.hasFilterTargetAncestor),
            false,
          );
        }
        if (matchedDefinition) {
          filteredDefinitions.push(matchedDefinition);
        }
      }),
    );
    return filteredDefinitions;
  }
}

type MatchedFilter<TIdentifier extends HierarchyNodeIdentifier> = {
  id: TIdentifier;
  childrenIdentifierPaths: HierarchyFilteringPath[];
  validPathIndex: number;
  identifiersCountAfter: number;
} & ({ isFilterTarget: false } | { isFilterTarget: true; filterTargetOptions?: HierarchyFilteringPathOptions });

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : GenericHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filteringProps: { filteredNodePaths: HierarchyFilteringPath[]; hasFilterTargetAncestor?: boolean; filteredNodePathsIndex?: number[] },
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  classHierarchy: ECClassHierarchyInspector,
  matchedDefinitionProcessor: (def: TDefinition, matchingFilters: Array<MatchedFilter<TIdentifier>>) => TDefinition,
  extractChildrenIdentifierPaths: boolean = true,
): Promise<TDefinition | undefined> {
  const { filteredNodePaths, hasFilterTargetAncestor, filteredNodePathsIndex } = filteringProps;
  const matchingFilters: Array<MatchedFilter<TIdentifier>> = [];
  for (let i = 0; i < filteredNodePaths.length; ++i) {
    const { path, options } = HierarchyFilteringPath.normalize(filteredNodePaths[i]);
    if (path.length === 0) {
      continue;
    }
    const nodeId = path[0];
    if (await predicate(nodeId)) {
      let entry = await findMatchingFilterEntry(matchingFilters, nodeId, classHierarchy);
      if (!entry) {
        entry = {
          // ideally, `predicate` would act as a type guard to guarantee that `id` is `TIdentifier`, but at the moment
          // async type guards aren't supported
          id: nodeId as TIdentifier,
          isFilterTarget: false,
          validPathIndex: filteredNodePathsIndex ? filteredNodePathsIndex[i] : i,
          identifiersCountAfter: path.length - 1,
          childrenIdentifierPaths: [],
        };
        matchingFilters.push(entry);
      }

      if (path.length > 1) {
        if (extractChildrenIdentifierPaths) {
          entry.childrenIdentifierPaths.push(options ? { path: path.slice(1), options } : path.slice(1));
        }
      } else if (entry.isFilterTarget) {
        entry.filterTargetOptions = HierarchyFilteringPath.mergeOptions(entry.filterTargetOptions, options);
      } else {
        Object.assign(entry, { isFilterTarget: true, filterTargetOptions: options });
      }
    }
  }
  if (hasFilterTargetAncestor || matchingFilters.length > 0) {
    return matchedDefinitionProcessor(definition, matchingFilters);
  }
  return undefined;
}

async function findMatchingFilterEntry<TEntry extends { id: TIdentifier }, TIdentifier extends HierarchyNodeIdentifier>(
  filters: TEntry[],
  nodeId: TIdentifier,
  classHierarchy: ECClassHierarchyInspector,
): Promise<TEntry | undefined> {
  for (const filter of filters) {
    if (await identifiersEqual(filter.id, nodeId, classHierarchy)) {
      return filter;
    }
  }
  return undefined;
}

async function identifiersEqual<TIdentifier extends HierarchyNodeIdentifier>(lhs: TIdentifier, rhs: TIdentifier, classHierarchy: ECClassHierarchyInspector) {
  if (HierarchyNodeIdentifier.isInstanceNodeIdentifier(lhs) && HierarchyNodeIdentifier.isInstanceNodeIdentifier(rhs)) {
    return (
      lhs.id === rhs.id &&
      (lhs.className === rhs.className ||
        (await classHierarchy.classDerivesFrom(lhs.className, rhs.className)) ||
        (await classHierarchy.classDerivesFrom(rhs.className, lhs.className)))
    );
  }
  return HierarchyNodeIdentifier.equal(lhs, rhs);
}

function applyFilterAttributes<TNode extends SourceHierarchyNode>(props: {
  node: TNode;
  filteredChildrenIdentifierPaths: HierarchyFilteringPath[] | undefined;
  filteredChildrenIdentifierPathsIndex: number[] | undefined;
  isFilterTarget?: boolean;
  filterTargetOptions?: HierarchyFilteringPathOptions;
  hasFilterTargetAncestor: boolean;
}): TNode {
  const { node, filteredChildrenIdentifierPaths } = props;
  const result = { ...node };

  const shouldAutoExpand = !!filteredChildrenIdentifierPaths?.some((childPath) => {
    return !!HierarchyFilteringPath.normalize(childPath).options?.autoExpand;
  });
  if (shouldAutoExpand) {
    result.autoExpand = true;
  }

  const filteringProps = HierarchyNodeFilteringProps.create(props);
  if (filteringProps) {
    result.filtering = filteringProps;
  }

  return result;
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_IsFilterTarget = "IsFilterTarget";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilterTargetOptions = "FilterTargetOptions";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_HasFilterTargetAncestor = "HasFilterTargetAncestor";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilterECInstanceId = "FilterECInstanceId";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilterClassName = "FilterClassName";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilterValidPathIndex = "FilterValidPathIndex";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilterIdentifiersCountAfter = "FilterIdentifiersCountAfter";

/** @internal */
export function applyECInstanceIdsFilter(
  def: InstanceNodesQueryDefinition,
  matchingFilters: Array<MatchedFilter<InstanceKey>>,
  hasFilterTargetAncestor: boolean,
): InstanceNodesQueryDefinition {
  if (matchingFilters.length === 0) {
    return def;
  }
  return {
    ...def,
    query: {
      ...def.query,
      ctes: [
        ...(def.query.ctes ?? []),
        // note: generally we'd use `VALUES (1,1),(2,2)`, but that doesn't work in ECSQL (https://github.com/iTwin/itwinjs-backlog/issues/865),
        // so using UNION as a workaround
        `FilteringInfo(ECInstanceId, IsFilterTarget, FilterTargetOptions, FilterClassName, FilterValidPathIndex, FilterIdentifiersCountAfter) AS (
          ${matchingFilters
            .map((mc) =>
              mc.isFilterTarget
                ? `VALUES (${mc.id.id}, 1, ${mc.filterTargetOptions ? `'${JSON.stringify(mc.filterTargetOptions)}'` : "CAST(NULL AS TEXT)"}, '${mc.id.className}', ${mc.validPathIndex}, ${mc.identifiersCountAfter})`
                : `VALUES (${mc.id.id}, 0, CAST(NULL AS TEXT), '${mc.id.className}', ${mc.validPathIndex}, ${mc.identifiersCountAfter})`,
            )
            .join(" UNION ALL ")}
        )`,
      ],
      ecsql: `
        SELECT
          [q].*,
          [f].[IsFilterTarget] AS [${ECSQL_COLUMN_NAME_IsFilterTarget}],
          [f].[FilterTargetOptions] AS [${ECSQL_COLUMN_NAME_FilterTargetOptions}],
          ${hasFilterTargetAncestor ? "1" : "0"} AS [${ECSQL_COLUMN_NAME_HasFilterTargetAncestor}],
          IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
          [f].[FilterClassName] AS [${ECSQL_COLUMN_NAME_FilterClassName}],
          [f].[FilterValidPathIndex] AS [${ECSQL_COLUMN_NAME_FilterValidPathIndex}],
          [f].[FilterIdentifiersCountAfter] AS [${ECSQL_COLUMN_NAME_FilterIdentifiersCountAfter}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        ${hasFilterTargetAncestor ? "LEFT " : ""} JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
      `,
    },
  };
}
