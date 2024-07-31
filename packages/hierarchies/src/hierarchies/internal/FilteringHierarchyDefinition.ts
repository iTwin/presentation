/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import {
  CustomHierarchyNodeDefinition,
  DefineHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstanceNodesQueryDefinition,
  NodeParser,
  NodePostProcessor,
  NodePreProcessor,
} from "../HierarchyDefinition";
import {
  GroupingHierarchyNode,
  HierarchyNode,
  ParsedHierarchyNode,
  ParsedInstanceHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
} from "../HierarchyNode";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "../HierarchyNodeIdentifier";
import { HierarchyFilteringPath } from "../HierarchyProvider";
import { defaultNodesParser } from "./TreeNodesReader";
import { HierarchyNodeKey } from "../HierarchyNodeKey";

/** @internal */
export interface FilteringQueryBuilderProps {
  classHierarchy: ECClassHierarchyInspector;
  source: HierarchyDefinition;
  nodeIdentifierPaths: HierarchyFilteringPath[];
}

/** @internal */
export class FilteringHierarchyDefinition implements HierarchyDefinition {
  private _classHierarchy: ECClassHierarchyInspector;
  private _source: HierarchyDefinition;
  private _nodeIdentifierPaths: HierarchyFilteringPath[];

  public constructor(props: FilteringQueryBuilderProps) {
    this._classHierarchy = props.classHierarchy;
    this._source = props.source;
    this._nodeIdentifierPaths = props.nodeIdentifierPaths;
  }

  public get preProcessNode(): NodePreProcessor {
    return async (node) => {
      const processedNode = this._source.preProcessNode ? await this._source.preProcessNode(node) : node;
      if (
        processedNode?.processingParams?.hideInHierarchy &&
        processedNode.filtering?.filterTarget === true &&
        !processedNode.filtering.hasFilterTargetAncestor
      ) {
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
      if (
        child.filtering.filterTarget === true ||
        (typeof child.filtering.filterTarget === "object" && !HierarchyNodeKey.equals(node.key, child.filtering.filterTarget.key))
      ) {
        return true;
      }
      if (!child.filtering.filteredChildrenIdentifierPaths?.length) {
        continue;
      }
      for (const path of child.filtering.filteredChildrenIdentifierPaths) {
        if ("path" in path && path.options && path.options.autoExpand) {
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
      if (HierarchyNode.isGroupingNode(node) && this.shouldExpandGroupingNode(node)) {
        Object.assign(processedNode, { autoExpand: true });
      }
      return processedNode;
    };
  }

  public get parseNode(): NodeParser {
    return (row: { [columnName: string]: any }): ParsedInstanceHierarchyNode => {
      const hasFilterTargetAncestor: boolean = !!row[ECSQL_COLUMN_NAME_HasFilterTargetAncestor];
      const filterTarget: boolean | GroupingHierarchyNode = row[ECSQL_COLUMN_NAME_FilterTarget] ? JSON.parse(row[ECSQL_COLUMN_NAME_FilterTarget]) : undefined;
      const parsedFilteredChildrenIdentifierPaths: HierarchyNodeIdentifiersPath[] | undefined = row[ECSQL_COLUMN_NAME_FilteredChildrenPaths]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilteredChildrenPaths])
        : undefined;
      const defaultNode = (this._source.parseNode ?? defaultNodesParser)(row);
      return applyFilterAttributes(defaultNode, parsedFilteredChildrenIdentifierPaths, filterTarget, hasFilterTargetAncestor);
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
        if (HierarchyNodesDefinition.isCustomNode(definition)) {
          matchedDefinition = await matchFilters<{ key: string }>(
            definition,
            { filteredNodePaths, isDirectParentFilterTarget },
            async (id) => {
              if (!HierarchyNodeIdentifier.isCustomNodeIdentifier(id)) {
                return false;
              }
              return id.key === definition.node.key;
            },
            this._classHierarchy,
            (def, matchingFilters) => {
              const filteredChildrenIdentifierPaths = matchingFilters.reduce(
                (r, c) => [...r, ...c.childrenIdentifierPaths],
                new Array<HierarchyFilteringPath>(),
              );
              let filterTarget: boolean | GroupingHierarchyNode = false;
              for (const matchingFilter of matchingFilters) {
                if (matchingFilter.filterTarget === true) {
                  filterTarget = true;
                  break;
                }
                if (matchingFilter.filterTarget) {
                  filterTarget = matchingFilter.filterTarget;
                }
              }
              return {
                ...def,
                node: applyFilterAttributes(def.node, filteredChildrenIdentifierPaths, filterTarget, !!hasFilterTargetAncestor),
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
      isDirectParentFilterTarget: parentNode.filtering?.filterTarget === true,
      hasFilterTargetAncestor: !!parentNode.filtering?.hasFilterTargetAncestor,
    };
  }
}

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : CustomHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filteringProps: { filteredNodePaths: HierarchyFilteringPath[]; isDirectParentFilterTarget?: boolean },
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  classHierarchy: ECClassHierarchyInspector,
  matchedDefinitionProcessor: (
    def: TDefinition,
    matchingFilters: Array<{
      id: TIdentifier;
      filterTarget: boolean | GroupingHierarchyNode;
      childrenIdentifierPaths: HierarchyFilteringPath[];
    }>,
  ) => TDefinition,
): Promise<TDefinition | undefined> {
  const { filteredNodePaths, isDirectParentFilterTarget } = filteringProps;
  const matchingFilters: Array<{
    id: TIdentifier;
    filterTarget: boolean | GroupingHierarchyNode;
    childrenIdentifierPaths: HierarchyFilteringPath[];
  }> = [];
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
          filterTarget: false,
        };
        matchingFilters.push(entry);
      }
      const remainingPath = path.slice(1);
      if (remainingPath.length > 0) {
        const remainingPathWithOptions = options ? { path: remainingPath, options } : remainingPath;
        entry.childrenIdentifierPaths.push(remainingPathWithOptions);
      } else if (entry.filterTarget !== true) {
        if (typeof options?.autoExpand === "object") {
          if (typeof entry.filterTarget === "object") {
            const previousDepth = entry.filterTarget.hierarchyDepth ?? 1;
            const newDepth = options.autoExpand.hierarchyDepth ?? 1;
            newDepth > previousDepth && (entry.filterTarget = options.autoExpand);
          } else {
            entry.filterTarget = options.autoExpand;
          }
        } else {
          entry.filterTarget = true;
        }
      }
    }
  }
  if (isDirectParentFilterTarget || matchingFilters.length > 0) {
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

function applyFilterAttributes<TNode extends ParsedHierarchyNode>(
  node: TNode,
  filteredChildrenIdentifierPaths: HierarchyFilteringPath[] | undefined,
  filterTarget: boolean | GroupingHierarchyNode,
  hasFilterTargetAncestor: boolean,
): TNode {
  const shouldAutoExpand = !!filteredChildrenIdentifierPaths?.some((childPath) => {
    return "path" in childPath && childPath.path.length && childPath.options?.autoExpand === true;
  });
  const result = { ...node };
  if (shouldAutoExpand) {
    result.autoExpand = true;
  }
  if (filterTarget || hasFilterTargetAncestor || filteredChildrenIdentifierPaths?.length) {
    result.filtering = {
      ...(filterTarget ? { filterTarget } : undefined),
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
export const ECSQL_COLUMN_NAME_FilterTarget = "FilterTarget";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_HasFilterTargetAncestor = "HasFilterTargetAncestor";

/** @internal */
export function applyECInstanceIdsFilter(
  def: InstanceNodesQueryDefinition,
  matchingFilters: Array<{
    id: InstanceKey;
    filterTarget: boolean | GroupingHierarchyNode;
    childrenIdentifierPaths: HierarchyFilteringPath[];
  }>,
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
        `FilteringInfo(ECInstanceId, FilterTarget, FilteredChildrenPaths) AS (
          ${matchingFilters
            .map(
              ({ id: key, filterTarget, childrenIdentifierPaths }) =>
                `VALUES (${key.id}, '${JSON.stringify(filterTarget)}', '${JSON.stringify(childrenIdentifierPaths)}')`,
            )
            .join(" UNION ALL ")}
        )`,
      ],
      ecsql: `
        SELECT
          [q].*,
          [f].[FilterTarget] AS [${ECSQL_COLUMN_NAME_FilterTarget}],
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
