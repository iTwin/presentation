/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  CustomHierarchyNodeDefinition,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  IHierarchyLevelDefinitionsFactory,
  INodeParser,
  INodePostProcessor,
  INodePreProcessor,
  InstanceNodesQueryDefinition,
} from "../HierarchyDefinition";
import { HierarchyNode, HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath } from "../HierarchyNode";
import { IMetadataProvider } from "../Metadata";
import { ConcatenatedValue } from "../values/ConcatenatedValue";
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
export interface FilteredHierarchyNode<TLabel = string> extends HierarchyNode<TLabel> {
  filteredChildrenIdentifierPaths?: HierarchyNodeIdentifiersPath[];
}

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
    return async (node: FilteredHierarchyNode) => {
      const processedNode = this._source.preProcessNode ? await this._source.preProcessNode(node) : node;
      if (processedNode?.params?.hideInHierarchy && node.filteredChildrenIdentifierPaths?.length === 0) {
        // an existing empty `node.filteredChildrenIdentifierPaths` means the node is our filter target - we
        // want to hide such nodes if they have `hideInHierarchy` param
        return undefined;
      }
      return processedNode;
    };
  }

  public get postProcessNode(): INodePostProcessor {
    return (node: HierarchyNode) => {
      const processedNode = this._source.postProcessNode ? this._source.postProcessNode(node) : node;
      if (
        // instance nodes get the auto-expand flag in `parseNode`, but grouping ones need to be handled during post-processing
        HierarchyNode.isClassGroupingNode(node) &&
        Array.isArray(node.children) &&
        node.children.some((child: FilteredHierarchyNode) => !!child.filteredChildrenIdentifierPaths)
      ) {
        return { ...processedNode, autoExpand: true };
      }
      return processedNode;
    };
  }

  public get parseNode(): INodeParser {
    return (row: { [columnName: string]: any }): FilteredHierarchyNode<string | ConcatenatedValue> => {
      const parsedFilteredChildrenIdentifierPaths = row[ECSQL_COLUMN_NAME_FilteredChildrenPaths]
        ? JSON.parse(row[ECSQL_COLUMN_NAME_FilteredChildrenPaths])
        : undefined;
      const defaultNode = (this._source.parseNode ?? defaultNodesParser)(row);
      return {
        ...defaultNode,
        ...(parsedFilteredChildrenIdentifierPaths?.length ? { autoExpand: true } : undefined),
        filteredChildrenIdentifierPaths: parsedFilteredChildrenIdentifierPaths,
      };
    };
  }

  public async defineHierarchyLevel(parentNode: HierarchyNode | undefined): Promise<HierarchyLevelDefinition> {
    const sourceDefinitions = await this._source.defineHierarchyLevel(parentNode);
    const filteredNodePaths = this.getFilteringProps(parentNode);
    if (!filteredNodePaths || filteredNodePaths.length === 0) {
      return sourceDefinitions;
    }

    const filteredDefinitions: HierarchyLevelDefinition = [];
    await Promise.all(
      sourceDefinitions.map(async (definition) => {
        let matchedDefinition: HierarchyNodesDefinition | undefined;
        if (HierarchyNodesDefinition.isCustomNode(definition)) {
          matchedDefinition = await matchFilters<{ key: string }>(
            definition,
            filteredNodePaths,
            async (id) => {
              if (!HierarchyNodeIdentifier.isCustomNodeIdentifier(id)) {
                return false;
              }
              return id.key === definition.node.key;
            },
            (def, matchingFilters) => {
              const filteredChildrenIdentifierPaths = matchingFilters.reduce(
                (r, c) => [...r, ...c.childrenIdentifierPaths],
                new Array<HierarchyNodeIdentifiersPath>(),
              );
              return {
                node: {
                  ...def.node,
                  ...(filteredChildrenIdentifierPaths.length > 0 ? { autoExpand: true } : undefined),
                  filteredChildrenIdentifierPaths,
                } as FilteredHierarchyNode,
              };
            },
          );
        } else {
          const queryClass = await getClass(this._metadataProvider, definition.fullClassName);
          matchedDefinition = await matchFilters<InstanceKey>(
            definition,
            filteredNodePaths,
            async (id) => {
              if (!HierarchyNodeIdentifier.isInstanceNodeIdentifier(id)) {
                return false;
              }
              const pathClass = await getClass(this._metadataProvider, id.className);
              return pathClass.is(queryClass);
            },
            (def, matchingFilters) => applyECInstanceIdsFilter(def, matchingFilters),
          );
        }
        if (matchedDefinition) {
          filteredDefinitions.push(matchedDefinition);
        }
      }),
    );
    return filteredDefinitions;
  }

  private getFilteringProps(parentNode: FilteredHierarchyNode | undefined): HierarchyNodeIdentifiersPath[] | undefined {
    if (!parentNode) {
      return this._nodeIdentifierPaths;
    }
    return parentNode.filteredChildrenIdentifierPaths;
  }
}

async function matchFilters<
  TIdentifier extends HierarchyNodeIdentifier,
  TDefinition = TIdentifier extends InstanceKey ? InstanceNodesQueryDefinition : CustomHierarchyNodeDefinition,
>(
  definition: TDefinition,
  filterPaths: HierarchyNodeIdentifiersPath[],
  predicate: (id: HierarchyNodeIdentifier) => Promise<boolean>,
  matchedDefinitionProcessor: (
    def: TDefinition,
    matchingFilters: Array<{ id: TIdentifier; childrenIdentifierPaths: HierarchyNodeIdentifiersPath[] }>,
  ) => TDefinition,
): Promise<TDefinition | undefined> {
  let isFilterTarget = false;
  const matchingFilters: Array<{ id: TIdentifier; childrenIdentifierPaths: HierarchyNodeIdentifiersPath[] }> = [];
  for (const path of filterPaths) {
    if (path.length === 0) {
      isFilterTarget = true;
      continue;
    }
    const nodeId = path[0];
    if (await predicate(nodeId)) {
      let childrenIdentifierPaths = matchingFilters.find(({ id }) => HierarchyNodeIdentifier.equal(id, path[0]))?.childrenIdentifierPaths;
      if (!childrenIdentifierPaths) {
        childrenIdentifierPaths = [];
        // ideally, `predicate` would act as a type guard to guarantee that `id` is `TIdentifier`, but at the moment
        // async type guards aren't supported
        matchingFilters.push({ id: nodeId as TIdentifier, childrenIdentifierPaths });
      }
      const remainingPath = path.slice(1);
      if (remainingPath.length > 0) {
        childrenIdentifierPaths.push(remainingPath);
      }
    }
  }
  if (matchingFilters.length > 0) {
    return matchedDefinitionProcessor(definition, matchingFilters);
  }
  if (isFilterTarget) {
    return definition;
  }
  return undefined;
}

/** @internal */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ECSQL_COLUMN_NAME_FilteredChildrenPaths = "FilteredChildrenPaths";

/** @internal */
export function applyECInstanceIdsFilter(
  def: InstanceNodesQueryDefinition,
  matchingFilters: Array<{ id: InstanceKey; childrenIdentifierPaths: HierarchyNodeIdentifiersPath[] }>,
): InstanceNodesQueryDefinition {
  // return the filtered query
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
          [f].[FilteredChildrenPaths] AS [${ECSQL_COLUMN_NAME_FilteredChildrenPaths}]
        FROM (
          ${def.query.ecsql}
        ) [q]
        JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
      `,
    },
  };
}
