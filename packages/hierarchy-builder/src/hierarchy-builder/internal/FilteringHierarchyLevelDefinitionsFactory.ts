/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IMetadataProvider } from "../ECMetadata";
import {
  CustomHierarchyNodeDefinition,
  DefineHierarchyLevelProps,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  IHierarchyLevelDefinitionsFactory,
  INodeParser,
  INodePostProcessor,
  INodePreProcessor,
  InstanceNodesQueryDefinition,
} from "../HierarchyDefinition";
import {
  HierarchyNode,
  HierarchyNodeIdentifier,
  HierarchyNodeIdentifiersPath,
  ParsedHierarchyNode,
  ParsedInstanceHierarchyNode,
  ProcessedHierarchyNode,
} from "../HierarchyNode";
import { InstanceKey } from "../values/Values";
import { getClass } from "./Common";
import { defaultNodesParser } from "./TreeNodesReader";

/** @internal */
export interface FilteringQueryBuilderProps {
  metadataProvider: IMetadataProvider;
  source: IHierarchyLevelDefinitionsFactory;
  nodeIdentifierPaths: HierarchyNodeIdentifiersPath[];
}

/** @internal */
export type FilteredHierarchyNode<TNode = ProcessedHierarchyNode> = TNode & {
  isFilterTarget?: boolean;
  filteredChildrenIdentifierPaths?: HierarchyNodeIdentifiersPath[];
};

/** @internal */
export class FilteringHierarchyLevelDefinitionsFactory implements IHierarchyLevelDefinitionsFactory {
  private _metadataProvider: IMetadataProvider;
  private _source: IHierarchyLevelDefinitionsFactory;
  private _nodeIdentifierPaths: HierarchyNodeIdentifiersPath[];

  public constructor(props: FilteringQueryBuilderProps) {
    this._metadataProvider = props.metadataProvider;
    this._source = props.source;
    this._nodeIdentifierPaths = props.nodeIdentifierPaths;
  }

  public get preProcessNode(): INodePreProcessor {
    return async (node) => {
      const processedNode = this._source.preProcessNode ? await this._source.preProcessNode(node) : node;
      if (processedNode?.processingParams?.hideInHierarchy && (node as FilteredHierarchyNode).isFilterTarget) {
        // we want to hide target nodes if they have `hideInHierarchy` param
        return undefined;
      }
      return processedNode;
    };
  }

  public get postProcessNode(): INodePostProcessor {
    return async (node: ProcessedHierarchyNode) => {
      const processedNode = this._source.postProcessNode ? await this._source.postProcessNode(node) : node;
      if (
        // instance nodes get the auto-expand flag in `parseNode`, but grouping ones need to be handled during post-processing
        HierarchyNode.isClassGroupingNode(node) &&
        node.children.some((child: FilteredHierarchyNode) => child.isFilterTarget || child.filteredChildrenIdentifierPaths)
      ) {
        return { ...processedNode, autoExpand: true };
      }
      return processedNode;
    };
  }

  public get parseNode(): INodeParser {
    return (row: { [columnName: string]: any }): FilteredHierarchyNode<ParsedInstanceHierarchyNode> => {
      const isFilterTarget: boolean = !!row[ECSQL_COLUMN_NAME_IsFilterTarget];
      const parsedFilteredChildrenIdentifierPaths: HierarchyNodeIdentifiersPath[] | undefined = row[ECSQL_COLUMN_NAME_FilteredChildrenPaths]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilteredChildrenPaths])
        : undefined;
      const defaultNode = (this._source.parseNode ?? defaultNodesParser)(row);
      return applyFilterAttributes(defaultNode, parsedFilteredChildrenIdentifierPaths, isFilterTarget);
    };
  }

  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const sourceDefinitions = await this._source.defineHierarchyLevel(props);
    const { filteredNodePaths, isParentFilterTarget } = this.getFilteringProps(props.parentNode as FilteredHierarchyNode | undefined);
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
            { filteredNodePaths, isParentFilterTarget },
            async (id) => {
              if (!HierarchyNodeIdentifier.isCustomNodeIdentifier(id)) {
                return false;
              }
              return id.key === definition.node.key;
            },
            (def, matchingFilters, isFilterTarget) => {
              const filteredChildrenIdentifierPaths = matchingFilters.reduce(
                (r, c) => [...r, ...c.childrenIdentifierPaths],
                new Array<HierarchyNodeIdentifiersPath>(),
              );
              return {
                ...def,
                node: applyFilterAttributes(def.node, filteredChildrenIdentifierPaths, isFilterTarget),
              };
            },
          );
        } else {
          const queryClass = await getClass(this._metadataProvider, definition.fullClassName);
          matchedDefinition = await matchFilters<InstanceKey>(
            definition,
            { filteredNodePaths, isParentFilterTarget },
            async (id) => {
              if (!HierarchyNodeIdentifier.isInstanceNodeIdentifier(id)) {
                return false;
              }
              const pathClass = await getClass(this._metadataProvider, id.className);
              return pathClass.is(queryClass);
            },
            (def, matchingFilters, isFilterTarget) => applyECInstanceIdsFilter(def, matchingFilters, isFilterTarget, !!isParentFilterTarget),
          );
        }
        if (matchedDefinition) {
          filteredDefinitions.push(matchedDefinition);
        }
      }),
    );
    return filteredDefinitions;
  }

  private getFilteringProps(parentNode: FilteredHierarchyNode | undefined) {
    if (!parentNode) {
      return { filteredNodePaths: this._nodeIdentifierPaths, isParentFilterTarget: false };
    }
    return { filteredNodePaths: parentNode.filteredChildrenIdentifierPaths, isParentFilterTarget: parentNode.isFilterTarget };
  }
}

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : CustomHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filteringProps: { filteredNodePaths: HierarchyNodeIdentifiersPath[]; isParentFilterTarget?: boolean },
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  matchedDefinitionProcessor: (
    def: TDefinition,
    matchingFilters: Array<{ id: TIdentifier; childrenIdentifierPaths: HierarchyNodeIdentifiersPath[] }>,
    isFilterTarget: boolean,
  ) => TDefinition,
): Promise<TDefinition | undefined> {
  const { filteredNodePaths, isParentFilterTarget } = filteringProps;
  let isFilterTarget = false;
  const matchingFilters: Array<{ id: TIdentifier; childrenIdentifierPaths: HierarchyNodeIdentifiersPath[] }> = [];
  for (const path of filteredNodePaths) {
    if (path.length === 0) {
      continue;
    }
    const nodeId = path[0];
    if (await predicate(nodeId)) {
      let childrenIdentifierPaths = matchingFilters.find(({ id }) => HierarchyNodeIdentifier.equal(id, nodeId))?.childrenIdentifierPaths;
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
        childrenIdentifierPaths.push(remainingPath);
      } else {
        isFilterTarget = true;
      }
    }
  }
  if (isParentFilterTarget || matchingFilters.length > 0) {
    return matchedDefinitionProcessor(definition, matchingFilters, isFilterTarget);
  }
  return undefined;
}

function applyFilterAttributes<TNode extends ParsedHierarchyNode>(
  node: TNode,
  filteredChildrenIdentifierPaths: HierarchyNodeIdentifiersPath[] | undefined,
  isFilterTarget: boolean,
): TNode {
  const shouldAutoExpand = !!filteredChildrenIdentifierPaths?.some((path) => !!path.length);
  return {
    ...node,
    ...(isFilterTarget ? { isFilterTarget } : undefined),
    ...(shouldAutoExpand ? { autoExpand: true } : undefined),
    ...(!!filteredChildrenIdentifierPaths?.length ? { filteredChildrenIdentifierPaths } : undefined),
  };
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilteredChildrenPaths = "FilteredChildrenPaths";

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_IsFilterTarget = "IsFilterTarget";

/** @internal */
export function applyECInstanceIdsFilter(
  def: InstanceNodesQueryDefinition,
  matchingFilters: Array<{ id: InstanceKey; childrenIdentifierPaths: HierarchyNodeIdentifiersPath[] }>,
  isFilterTarget: boolean,
  isParentFilterTarget: boolean,
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
          [f].[FilteredChildrenPaths] AS [${ECSQL_COLUMN_NAME_FilteredChildrenPaths}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        ${isParentFilterTarget ? "LEFT " : ""} JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
      `,
    },
  };
}
