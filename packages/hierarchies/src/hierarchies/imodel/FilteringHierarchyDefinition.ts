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
  HierarchyDefinitionParentNode,
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
    return async (row: { [columnName: string]: any }, parentNode?: HierarchyDefinitionParentNode): Promise<SourceInstanceHierarchyNode> => {
      const hasFilterTargetAncestor: boolean = !!row[ECSQL_COLUMN_NAME_HasFilterTargetAncestor];
      const isFilterTarget: boolean = !!row[ECSQL_COLUMN_NAME_IsFilterTarget];
      const filterTargetOptions: HierarchyFilteringPathOptions | undefined = row[ECSQL_COLUMN_NAME_FilterTargetOptions]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilterTargetOptions])
        : undefined;

      const filteredChildrenIdentifierPaths =
        row[ECSQL_COLUMN_NAME_FilterECInstanceId] && row[ECSQL_COLUMN_NAME_FilterClassName]
          ? await this.getChildrenIdentifierPaths(parentNode?.filtering?.filteredChildrenIdentifierPaths ?? this._nodeIdentifierPaths, {
              className: row[ECSQL_COLUMN_NAME_FilterClassName],
              id: row[ECSQL_COLUMN_NAME_FilterECInstanceId],
            })
          : [];

      const defaultNode = await (this._source.parseNode ?? defaultNodesParser)(row);
      return applyFilterAttributes({
        node: defaultNode,
        filteredChildrenIdentifierPaths,
        isFilterTarget,
        filterTargetOptions,
        hasFilterTargetAncestor,
      });
    };
  }

  private async getChildrenIdentifierPaths(filteredChildrenNodeIdentifierPaths: HierarchyFilteringPath[], providedIdentifier: InstanceKey) {
    const { id, className } = providedIdentifier;

    let filteredChildrenIdentifierPaths: HierarchyFilteringPath[] | undefined;
    for (const filteredChildrenNodeIdentifierPath of filteredChildrenNodeIdentifierPaths) {
      const path = HierarchyFilteringPath.normalize(filteredChildrenNodeIdentifierPath);
      // istanbul ignore if
      if (path.path.length === 0) {
        continue;
      }

      // We need to check if identifiers have the same id and imodelKey and are
      // of the same class / derived class / is derived from class
      const identifier = path.path[0];
      if (identifier.id !== id) {
        continue;
      }
      if (HierarchyNodeIdentifier.isInstanceNodeIdentifier(identifier)) {
        if (identifier.imodelKey && identifier.imodelKey !== this._imodelAccess.imodelKey) {
          continue;
        }
        if (
          identifier.className !== className &&
          !(await this._imodelAccess.classDerivesFrom(identifier.className, className)) &&
          !(await this._imodelAccess.classDerivesFrom(className, identifier.className))
        ) {
          continue;
        }
      }
      if (!filteredChildrenIdentifierPaths) {
        filteredChildrenIdentifierPaths = [];
      }
      if (path.path.length > 1) {
        filteredChildrenIdentifierPaths.push(path.options ? { path: path.path.slice(1), options: path.options } : path.path.slice(1));
      }
    }
    return filteredChildrenIdentifierPaths;
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
} & ({ isFilterTarget: false } | { isFilterTarget: true; filterTargetOptions?: HierarchyFilteringPathOptions });

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : GenericHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filteringProps: { filteredNodePaths: HierarchyFilteringPath[]; hasFilterTargetAncestor?: boolean },
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  classHierarchy: ECClassHierarchyInspector,
  matchedDefinitionProcessor: (def: TDefinition, matchingFilters: Array<MatchedFilter<TIdentifier>>) => TDefinition,
  extractChildrenIdentifierPaths: boolean = true,
): Promise<TDefinition | undefined> {
  const { filteredNodePaths, hasFilterTargetAncestor } = filteringProps;
  const matchingFilters: Array<MatchedFilter<TIdentifier>> = [];
  for (const filteredNodePath of filteredNodePaths) {
    const { path, options } = HierarchyFilteringPath.normalize(filteredNodePath);
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
        VALUES
          ${matchingFilters
            .map((mc) =>
              mc.isFilterTarget
                ? `(${mc.id.id}, 1, ${mc.filterTargetOptions ? `'${JSON.stringify(mc.filterTargetOptions)}'` : "CAST(NULL AS TEXT)"}, '${mc.id.className}')`
                : `(${mc.id.id}, 0, CAST(NULL AS TEXT), '${mc.id.className}')`,
            )
            .join(",\n")}
        )`,
      ],
      ecsql: `
        SELECT
          [q].*,
          [f].[IsFilterTarget] AS [${ECSQL_COLUMN_NAME_IsFilterTarget}],
          [f].[FilterTargetOptions] AS [${ECSQL_COLUMN_NAME_FilterTargetOptions}],
          ${hasFilterTargetAncestor ? "1" : "0"} AS [${ECSQL_COLUMN_NAME_HasFilterTargetAncestor}],
          IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
          [f].[FilterClassName] AS [${ECSQL_COLUMN_NAME_FilterClassName}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        ${hasFilterTargetAncestor ? "LEFT " : ""} JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
      `,
    },
  };
}
