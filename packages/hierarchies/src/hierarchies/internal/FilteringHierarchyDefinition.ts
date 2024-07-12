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
import { HierarchyNode, ParsedHierarchyNode, ParsedInstanceHierarchyNode, ProcessedHierarchyNode } from "../HierarchyNode";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "../HierarchyNodeIdentifier";
import { FilteringPath } from "../HierarchyProvider";
import { defaultNodesParser } from "./TreeNodesReader";

/** @internal */
export interface FilteringQueryBuilderProps {
  classHierarchy: ECClassHierarchyInspector;
  source: HierarchyDefinition;
  nodeIdentifierPaths: FilteringPath[];
}

/** @internal */
export class FilteringHierarchyDefinition implements HierarchyDefinition {
  private _classHierarchy: ECClassHierarchyInspector;
  private _source: HierarchyDefinition;
  private _nodeIdentifierPaths: FilteringPath[];

  public constructor(props: FilteringQueryBuilderProps) {
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

  public get postProcessNode(): NodePostProcessor {
    return async (node: ProcessedHierarchyNode) => {
      const processedNode = this._source.postProcessNode ? await this._source.postProcessNode(node) : node;
      if (
        // instance nodes get the auto-expand flag in `parseNode`, but grouping ones need to be handled during post-processing
        HierarchyNode.isClassGroupingNode(node) &&
        node.children.some(
          (child: ProcessedHierarchyNode) =>
            child.filtering &&
            (child.filtering.isFilterTarget || child.filtering.filteredChildrenIdentifierPaths?.some((path) => !("path" in path) || path.options?.autoExpand)),
        )
      ) {
        return Object.assign(processedNode, { autoExpand: true });
      }
      return processedNode;
    };
  }

  public get parseNode(): NodeParser {
    return (row: { [columnName: string]: any }): ParsedInstanceHierarchyNode => {
      const isFilterTarget: boolean = !!row[ECSQL_COLUMN_NAME_IsFilterTarget];
      const hasFilterTargetAncestor: boolean = !!row[ECSQL_COLUMN_NAME_HasFilterTargetAncestor];
      const parsedFilteredChildrenIdentifierPaths: HierarchyNodeIdentifiersPath[] | undefined = row[ECSQL_COLUMN_NAME_FilteredChildrenPaths]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilteredChildrenPaths])
        : undefined;
      const defaultNode = (this._source.parseNode ?? defaultNodesParser)(row);
      return applyFilterAttributes(defaultNode, parsedFilteredChildrenIdentifierPaths, isFilterTarget, hasFilterTargetAncestor);
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
            (def, matchingFilters, isFilterTarget) => {
              const filteredChildrenIdentifierPaths = matchingFilters.reduce((r, c) => [...r, ...c.childrenIdentifierPaths], new Array<FilteringPath>());
              return {
                ...def,
                node: applyFilterAttributes(def.node, filteredChildrenIdentifierPaths, isFilterTarget, !!hasFilterTargetAncestor),
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
            (def, matchingFilters, isFilterTarget) =>
              applyECInstanceIdsFilter(def, matchingFilters, isFilterTarget, !!isDirectParentFilterTarget, !!hasFilterTargetAncestor),
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

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : CustomHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filteringProps: { filteredNodePaths: FilteringPath[]; isDirectParentFilterTarget?: boolean },
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  classHierarchy: ECClassHierarchyInspector,
  matchedDefinitionProcessor: (
    def: TDefinition,
    matchingFilters: Array<{ id: TIdentifier; childrenIdentifierPaths: FilteringPath[] }>,
    isFilterTarget: boolean,
  ) => TDefinition,
): Promise<TDefinition | undefined> {
  const { filteredNodePaths, isDirectParentFilterTarget } = filteringProps;
  let isFilterTarget = false;
  const matchingFilters: Array<{ id: TIdentifier; childrenIdentifierPaths: FilteringPath[] }> = [];
  for (const filteredNodePath of filteredNodePaths) {
    const { path, options } = "path" in filteredNodePath ? filteredNodePath : { path: filteredNodePath, options: undefined };
    if (path.length === 0) {
      continue;
    }
    const nodeId = path[0];
    if (await predicate(nodeId)) {
      let childrenIdentifierPaths = await findChildrenIdentifierPaths(matchingFilters, nodeId, classHierarchy);
      if (!childrenIdentifierPaths) {
        childrenIdentifierPaths = [];
        matchingFilters.push({
          // ideally, `predicate` would act as a type guard to guarantee that `id` is `TIdentifier`, but at the moment
          // async type guards aren't supported
          id: nodeId as TIdentifier,
          childrenIdentifierPaths,
        });
      }
      const remainingPath = path.slice(1);
      if (remainingPath.length > 0) {
        const remainingPathWithOptions = options ? { path: remainingPath, options } : remainingPath;
        childrenIdentifierPaths.push(remainingPathWithOptions);
      } else {
        isFilterTarget = true;
      }
    }
  }
  if (isDirectParentFilterTarget || matchingFilters.length > 0) {
    return matchedDefinitionProcessor(definition, matchingFilters, isFilterTarget);
  }
  return undefined;
}

async function findChildrenIdentifierPaths<TIdentifier extends HierarchyNodeIdentifier>(
  filters: Array<{ id: TIdentifier; childrenIdentifierPaths: FilteringPath[] }>,
  nodeId: TIdentifier,
  classHierarchy: ECClassHierarchyInspector,
) {
  for (const filter of filters) {
    if (await identifiersEqual(filter.id, nodeId, classHierarchy)) {
      return filter.childrenIdentifierPaths;
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
  filteredChildrenIdentifierPaths: FilteringPath[] | undefined,
  isFilterTarget: boolean,
  hasFilterTargetAncestor: boolean,
): TNode {
  const shouldAutoExpand = !!filteredChildrenIdentifierPaths?.some((childPath) => {
    return "path" in childPath ? childPath.path.length && childPath.options?.autoExpand !== false : !!childPath.length;
  });
  const result = { ...node };
  if (shouldAutoExpand) {
    result.autoExpand = true;
  }
  if (isFilterTarget || hasFilterTargetAncestor || filteredChildrenIdentifierPaths?.length) {
    result.filtering = {
      ...(isFilterTarget ? { isFilterTarget } : undefined),
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
export const ECSQL_COLUMN_NAME_HasFilterTargetAncestor = "HasFilterTargetAncestor";

/** @internal */
export function applyECInstanceIdsFilter(
  def: InstanceNodesQueryDefinition,
  matchingFilters: Array<{ id: InstanceKey; childrenIdentifierPaths: FilteringPath[] }>,
  isFilterTarget: boolean,
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
        `FilteringInfo(ECInstanceId, FilteredChildrenPaths) AS (
          ${matchingFilters
            .map(({ id: key, childrenIdentifierPaths }) => `VALUES (${key.id}, '${JSON.stringify(childrenIdentifierPaths)}')`)
            .join(" UNION ALL ")}
        )`,
      ],
      ecsql: `
        SELECT
          [q].*,
          ${isFilterTarget ? "1" : "0"} AS [${ECSQL_COLUMN_NAME_IsFilterTarget}],
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
