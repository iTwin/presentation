/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

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
import { Dictionary } from "@itwin/core-bentley";

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

  public constructor(props: FilteringHierarchyDefinitionProps) {
    this._imodelAccess = props.imodelAccess;
    this._source = props.source;
    this._nodeIdentifierPaths = props.nodeIdentifierPaths;
    this._pathsIdentifierPositions = this.createPathsIdentifierPositions(props.nodeIdentifierPaths);
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
        continue;
      }

      // istanbul ignore if
      if (!child.filtering.filterPathsIdentifierPositions) {
        continue;
      }

      for (const [pathIndex, _] of child.filtering.filterPathsIdentifierPositions) {
        // istanbul ignore if
        if (this._nodeIdentifierPaths.length <= pathIndex) {
          continue;
        }

        if ("path" in this._nodeIdentifierPaths[pathIndex] && this._nodeIdentifierPaths[pathIndex].options?.autoExpand) {
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

      // istanbul ignore next
      const allFilterPathsIdentifierPositions: Array<[number, number]> | undefined = row[ECSQL_COLUMN_NAME_FilterECInstanceId]
        ? (this._pathsIdentifierPositions.get({
            id: `0x${row[ECSQL_COLUMN_NAME_FilterECInstanceId].toString(16)}`,
            className: "",
            imodelKey: this._imodelAccess.imodelKey,
          }) ?? [])
        : [];

      // _pathsIdentifierPositions doesn't care about classNames, we need to check if identifiers with the same id are
      // of the same class / derived class / is derived from class
      const verifiedFilterPathsIdentifierPositions = new Array<[number, number]>();
      const className: string = row[ECSQL_COLUMN_NAME_FilterClassName] ?? "";
      for (const [pathIndex, identifierIndex] of allFilterPathsIdentifierPositions) {
        // istanbul ignore if
        if (this._nodeIdentifierPaths.length <= pathIndex) {
          continue;
        }
        const path = HierarchyFilteringPath.normalize(this._nodeIdentifierPaths[pathIndex]);
        // istanbul ignore if
        if (path.path.length <= identifierIndex) {
          continue;
        }
        const identifier = path.path[identifierIndex];
        if (
          HierarchyNodeIdentifier.isInstanceNodeIdentifier(identifier) &&
          identifier.className !== className &&
          !(await this._imodelAccess.classDerivesFrom(identifier.className, className)) &&
          !(await this._imodelAccess.classDerivesFrom(className, identifier.className))
        ) {
          continue;
        }
        verifiedFilterPathsIdentifierPositions.push([pathIndex, identifierIndex]);
      }

      const defaultNode = await (this._source.parseNode ?? defaultNodesParser)(row);
      return applyFilterAttributes({
        node: defaultNode,
        filterPathsIdentifierPositions: verifiedFilterPathsIdentifierPositions,
        isFilterTarget,
        filterTargetOptions,
        hasFilterTargetAncestor,
        nodeIdentifierPaths: this._nodeIdentifierPaths,
      });
    };
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
              const filterPathsIdentifierPositions = matchingFilters.reduce((r, c) => {
                // istanbul ignore next
                const positions = this._pathsIdentifierPositions.get({ ...c.id, source: this._imodelAccess.imodelKey }) ?? [];
                return [...r, ...positions];
              }, new Array<[number, number]>());

              return {
                ...def,
                node: applyFilterAttributes({
                  node: def.node,
                  filterPathsIdentifierPositions,
                  isFilterTarget: matchingFilters.some((mc) => mc.isFilterTarget),
                  hasFilterTargetAncestor: filteringProps.hasFilterTargetAncestor,
                  nodeIdentifierPaths: this._nodeIdentifierPaths,
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
} & ({ isFilterTarget: false } | { isFilterTarget: true; filterTargetOptions?: HierarchyFilteringPathOptions });

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : GenericHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filteringProps: {
    nodeIdentifierPaths: HierarchyFilteringPath[];
    hasFilterTargetAncestor?: boolean;
    filterPathsIdentifierPositions?: Array<[number, number]>;
  },
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  classHierarchy: ECClassHierarchyInspector,
  matchedDefinitionProcessor: (def: TDefinition, matchingFilters: Array<MatchedFilter<TIdentifier>>) => TDefinition,
): Promise<TDefinition | undefined> {
  const { nodeIdentifierPaths, hasFilterTargetAncestor } = filteringProps;
  let { filterPathsIdentifierPositions } = filteringProps;
  if (filterPathsIdentifierPositions === undefined) {
    filterPathsIdentifierPositions = [];
    nodeIdentifierPaths.forEach((nodeIdentifierPath, pathIndex) => {
      const { path } = HierarchyFilteringPath.normalize(nodeIdentifierPath);
      if (path.length === 0) {
        return;
      }
      filterPathsIdentifierPositions!.push([pathIndex, -1]);
    });
  }

  const matchingFilters: Array<MatchedFilter<TIdentifier>> = [];
  for (const [pathIndex, nodeIndex] of filterPathsIdentifierPositions) {
    // istanbul ignore if
    if (nodeIdentifierPaths.length <= pathIndex) {
      continue;
    }

    const { path, options } = HierarchyFilteringPath.normalize(nodeIdentifierPaths[pathIndex]);
    // istanbul ignore if
    if (path.length <= nodeIndex + 1) {
      continue;
    }
    const nodeId = path[nodeIndex + 1];
    if (await predicate(nodeId)) {
      let entry = await findMatchingFilterEntry(matchingFilters, nodeId, classHierarchy);
      if (!entry) {
        entry = {
          // ideally, `predicate` would act as a type guard to guarantee that `id` is `TIdentifier`, but at the moment
          // async type guards aren't supported
          id: nodeId as TIdentifier,
          isFilterTarget: false,
        };
        matchingFilters.push(entry);
      }
      if (path.length === nodeIndex + 2) {
        if (entry.isFilterTarget) {
          entry.filterTargetOptions = HierarchyFilteringPath.mergeOptions(entry.filterTargetOptions, options);
        } else {
          Object.assign(entry, { isFilterTarget: true, filterTargetOptions: options });
        }
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
      lhs.imodelKey === rhs.imodelKey &&
      (lhs.className === rhs.className ||
        (await classHierarchy.classDerivesFrom(lhs.className, rhs.className)) ||
        (await classHierarchy.classDerivesFrom(rhs.className, lhs.className)))
    );
  }
  return HierarchyNodeIdentifier.equal(lhs, rhs);
}

function applyFilterAttributes<TNode extends SourceHierarchyNode>(props: {
  node: TNode;
  filterPathsIdentifierPositions: Array<[number, number]>;
  isFilterTarget?: boolean;
  filterTargetOptions?: HierarchyFilteringPathOptions;
  hasFilterTargetAncestor: boolean;
  nodeIdentifierPaths: HierarchyFilteringPath[];
}): TNode {
  const { node, filterPathsIdentifierPositions, nodeIdentifierPaths } = props;
  const result = { ...node };

  const shouldAutoExpand = filterPathsIdentifierPositions.some(([pathIndex, identifierIndex]) => {
    if (nodeIdentifierPaths.length > pathIndex) {
      const path = HierarchyFilteringPath.normalize(nodeIdentifierPaths[pathIndex]);
      if (path.path.length !== identifierIndex + 1) {
        return !!path.options?.autoExpand;
      }
    }
    // istanbul ignore next
    return false;
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
        `FilteringInfo(ECInstanceId, IsFilterTarget, FilterTargetOptions, FilterClassName) AS (
          ${matchingFilters
            .map((mc) =>
              mc.isFilterTarget
                ? `VALUES (${mc.id.id}, 1, ${mc.filterTargetOptions ? `'${JSON.stringify(mc.filterTargetOptions)}'` : "CAST(NULL AS TEXT)"}, '${mc.id.className}')`
                : `VALUES (${mc.id.id}, 0, CAST(NULL AS TEXT), '${mc.id.className}')`,
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
          [f].[ECInstanceId] AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
          [f].[FilterClassName] AS [${ECSQL_COLUMN_NAME_FilterClassName}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        ${hasFilterTargetAncestor ? "LEFT " : ""} JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
      `,
    },
  };
}
