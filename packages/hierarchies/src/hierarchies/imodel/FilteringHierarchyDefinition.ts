/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import { HierarchyFilteringPath, HierarchyFilteringPathOptions } from "../HierarchyFiltering";
import { HierarchyNode } from "../HierarchyNode";
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
  classHierarchy: ECClassHierarchyInspector;
  source: HierarchyDefinition;
  nodeIdentifierPaths: HierarchyFilteringPath[];
}

/** @internal */
export class FilteringHierarchyDefinition implements HierarchyDefinition {
  private _classHierarchy: ECClassHierarchyInspector;
  private _source: HierarchyDefinition;
  private _nodeIdentifierPaths: HierarchyFilteringPath[];

  public constructor(props: FilteringHierarchyDefinitionProps) {
    this._classHierarchy = props.classHierarchy;
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
    return (row: { [columnName: string]: any }): SourceInstanceHierarchyNode => {
      const hasFilterTargetAncestor: boolean = !!row[ECSQL_COLUMN_NAME_HasFilterTargetAncestor];
      const isFilterTarget: boolean = !!row[ECSQL_COLUMN_NAME_IsFilterTarget];
      const filterTargetOptions: HierarchyFilteringPathOptions | undefined = row[ECSQL_COLUMN_NAME_FilterTargetOptions]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilterTargetOptions])
        : undefined;
      const filteredChildrenIdentifierPaths: HierarchyFilteringPath[] | undefined = row[ECSQL_COLUMN_NAME_FilteredChildrenPaths]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilteredChildrenPaths])
        : undefined;
      const defaultNode = (this._source.parseNode ?? defaultNodesParser)(row);
      return applyFilterAttributes({
        node: defaultNode,
        filteredChildrenIdentifierPaths,
        isFilterTarget,
        filterTargetOptions,
        hasFilterTargetAncestor,
      });
    };
  }

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const sourceDefinitions = await this._source.defineHierarchyLevel(props);
    const { filteredNodePaths, isDirectParentFilterTarget, hasFilterTargetAncestor } = this.getFilteringProps(props.parentNode);
    if (!filteredNodePaths) {
      return sourceDefinitions;
    }

    const filteredDefinitions: HierarchyLevelDefinition = [];
    await Promise.all(
      sourceDefinitions.map(async (definition) => {
        let matchedDefinition: HierarchyNodesDefinition | undefined;
        if (HierarchyNodesDefinition.isGenericNode(definition)) {
          matchedDefinition = await matchFilters<GenericNodeKey>(
            definition,
            { filteredNodePaths, isDirectParentFilterTarget },
            async (id) => HierarchyNodeIdentifier.equal(id, definition.node.key),
            this._classHierarchy,
            (def, matchingFilters) => {
              const filteredChildrenIdentifierPaths = matchingFilters.reduce(
                (r, c) => [...r, ...c.childrenIdentifierPaths],
                new Array<HierarchyFilteringPath>(),
              );
              return {
                ...def,
                node: applyFilterAttributes({
                  node: def.node,
                  filteredChildrenIdentifierPaths,
                  isFilterTarget: matchingFilters.some((mc) => mc.isFilterTarget),
                  hasFilterTargetAncestor,
                }),
              };
            },
          );
        } else {
          matchedDefinition = await matchFilters<InstanceKey>(
            definition,
            { filteredNodePaths, isDirectParentFilterTarget },
            async (id) => {
              if (!HierarchyNodeIdentifier.isInstanceNodeIdentifier(id)) {
                return false;
              }
              return this._classHierarchy.classDerivesFrom(id.className, definition.fullClassName);
            },
            this._classHierarchy,
            (def, matchingFilters) => applyECInstanceIdsFilter(def, matchingFilters, !!isDirectParentFilterTarget, !!hasFilterTargetAncestor),
          );
        }
        if (matchedDefinition) {
          filteredDefinitions.push(matchedDefinition);
        }
      }),
    );
    return filteredDefinitions;
  }

  private getFilteringProps(parentNode: Pick<HierarchyNode, "filtering"> | undefined) {
    if (!parentNode) {
      return { filteredNodePaths: this._nodeIdentifierPaths, isDirectParentFilterTarget: false, hasFilterTargetAncestor: false };
    }
    return {
      filteredNodePaths: parentNode.filtering?.filteredChildrenIdentifierPaths,
      isDirectParentFilterTarget: parentNode.filtering?.isFilterTarget,
      hasFilterTargetAncestor: !!parentNode.filtering?.hasFilterTargetAncestor,
    };
  }
}

type MatchedFilter<TIdentifier extends HierarchyNodeIdentifier> = {
  id: TIdentifier;
  childrenIdentifierPaths: HierarchyFilteringPath[];
} & ({ isFilterTarget: false } | { isFilterTarget: true; filterTargetOptions?: HierarchyFilteringPathOptions });

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : GenericHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filteringProps: { filteredNodePaths: HierarchyFilteringPath[]; isDirectParentFilterTarget?: boolean },
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  classHierarchy: ECClassHierarchyInspector,
  matchedDefinitionProcessor: (def: TDefinition, matchingFilters: Array<MatchedFilter<TIdentifier>>) => TDefinition,
): Promise<TDefinition | undefined> {
  const { filteredNodePaths, isDirectParentFilterTarget } = filteringProps;
  const matchingFilters: Array<MatchedFilter<TIdentifier>> = [];
  for (const filteredNodePath of filteredNodePaths) {
    const { path, options } = "path" in filteredNodePath ? filteredNodePath : { path: filteredNodePath, options: undefined };
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
          childrenIdentifierPaths: [],
          isFilterTarget: false,
        };
        matchingFilters.push(entry);
      }
      const remainingPath = path.slice(1);
      if (remainingPath.length > 0) {
        const remainingPathWithOptions = options ? { path: remainingPath, options } : remainingPath;
        entry.childrenIdentifierPaths.push(remainingPathWithOptions);
      } else if (entry.isFilterTarget) {
        entry.filterTargetOptions = mergeFilterTargetOptions(entry.filterTargetOptions, options);
      } else {
        Object.assign(entry, { isFilterTarget: true, filterTargetOptions: options });
      }
    }
  }
  if (isDirectParentFilterTarget || matchingFilters.length > 0) {
    return matchedDefinitionProcessor(definition, matchingFilters);
  }
  return undefined;
}

function mergeFilterTargetOptions(target?: HierarchyFilteringPathOptions, source?: HierarchyFilteringPathOptions): HierarchyFilteringPathOptions | undefined {
  // istanbul ignore next
  if (!target && !source) {
    return undefined;
  }
  // istanbul ignore next
  if (!target) {
    return source;
  }
  // istanbul ignore next
  if (!source) {
    return target;
  }
  return {
    autoExpand: ((): HierarchyFilteringPathOptions["autoExpand"] => {
      if (source.autoExpand === true) {
        return source.autoExpand;
      }
      if (typeof target.autoExpand === "object" && typeof source.autoExpand === "object" && source.autoExpand.depth > target.autoExpand.depth) {
        return source.autoExpand;
      }
      return target.autoExpand;
    })(),
  };
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

function applyFilterAttributes<TNode extends SourceHierarchyNode>({
  node,
  filteredChildrenIdentifierPaths,
  isFilterTarget,
  filterTargetOptions,
  hasFilterTargetAncestor,
}: {
  node: TNode;
  filteredChildrenIdentifierPaths: HierarchyFilteringPath[] | undefined;
  isFilterTarget?: boolean;
  filterTargetOptions?: HierarchyFilteringPathOptions;
  hasFilterTargetAncestor: boolean;
}): TNode {
  const shouldAutoExpand = !!filteredChildrenIdentifierPaths?.some((childPath) => {
    return "path" in childPath && childPath.path.length && childPath.options?.autoExpand;
  });
  const result = { ...node };
  if (shouldAutoExpand) {
    result.autoExpand = true;
  }
  if (isFilterTarget || hasFilterTargetAncestor || filteredChildrenIdentifierPaths?.length) {
    result.filtering = {
      ...(isFilterTarget ? { isFilterTarget, filterTargetOptions } : undefined),
      ...(hasFilterTargetAncestor ? { hasFilterTargetAncestor } : undefined),
      ...(!!filteredChildrenIdentifierPaths?.length ? { filteredChildrenIdentifierPaths } : undefined),
    };
  }
  return result;
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilteredChildrenPaths = "FilteredChildrenPaths";

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
export function applyECInstanceIdsFilter(
  def: InstanceNodesQueryDefinition,
  matchingFilters: Array<MatchedFilter<InstanceKey>>,
  isParentFilterTarget: boolean,
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
        `FilteringInfo(ECInstanceId, IsFilterTarget, FilterTargetOptions, FilteredChildrenPaths) AS (
          ${matchingFilters
            .map((mc) =>
              mc.isFilterTarget
                ? `VALUES (${mc.id.id}, 1, ${mc.filterTargetOptions ? `'${JSON.stringify(mc.filterTargetOptions)}'` : "CAST(NULL AS TEXT)"}, '${JSON.stringify(mc.childrenIdentifierPaths)}')`
                : `VALUES (${mc.id.id}, 0, CAST(NULL AS TEXT), '${JSON.stringify(mc.childrenIdentifierPaths)}')`,
            )
            .join(" UNION ALL ")}
        )`,
      ],
      ecsql: `
        SELECT
          [q].*,
          [f].[IsFilterTarget] AS [${ECSQL_COLUMN_NAME_IsFilterTarget}],
          [f].[FilterTargetOptions] AS [${ECSQL_COLUMN_NAME_FilterTargetOptions}],
          ${hasFilterTargetAncestor || isParentFilterTarget ? "1" : "0"} AS [${ECSQL_COLUMN_NAME_HasFilterTargetAncestor}],
          [f].[FilteredChildrenPaths] AS [${ECSQL_COLUMN_NAME_FilteredChildrenPaths}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        ${isParentFilterTarget ? "LEFT " : ""} JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
      `,
    },
  };
}
