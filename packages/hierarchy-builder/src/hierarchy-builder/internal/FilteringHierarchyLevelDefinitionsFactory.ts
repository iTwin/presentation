/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String, InstanceKeyPath } from "../EC";
import {
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  IHierarchyLevelDefinitionsFactory,
  INodeParser,
  INodePostProcessor,
  InstanceNodesQueryDefinition,
} from "../HierarchyDefinition";
import { HierarchyNode } from "../HierarchyNode";
import { IMetadataProvider } from "../Metadata";
import { getClass } from "./Common";
import { defaultNodesParser } from "./TreeNodesReader";

/** @internal */
export interface FilteringQueryBuilderProps {
  metadataProvider: IMetadataProvider;
  source: IHierarchyLevelDefinitionsFactory;
  instanceKeyPaths: InstanceKeyPath[];
}

/** @internal */
export interface FilteredHierarchyNode extends HierarchyNode {
  filteredChildrenPaths?: InstanceKeyPath[];
}

/** @internal */
export class FilteringHierarchyLevelDefinitionsFactory implements IHierarchyLevelDefinitionsFactory<FilteredHierarchyNode> {
  private _metadataProvider: IMetadataProvider;
  private _source: IHierarchyLevelDefinitionsFactory;
  private _instanceKeyPaths: InstanceKeyPath[];

  public constructor(props: FilteringQueryBuilderProps) {
    this._metadataProvider = props.metadataProvider;
    this._source = props.source;
    this._instanceKeyPaths = props.instanceKeyPaths;
  }

  public get postProcessNode(): INodePostProcessor {
    return (node: HierarchyNode): HierarchyNode => {
      const processedNode = this._source.postProcessNode ? this._source.postProcessNode(node) : node;
      if (
        // instance nodes' get auto-expanded in `parseNode`, but grouping ones need to be handled during post-processing
        HierarchyNode.isClassGroupingNode(node) &&
        Array.isArray(node.children) &&
        node.children.some((child: FilteredHierarchyNode) => !!child.filteredChildrenPaths)
      ) {
        return { ...processedNode, autoExpand: true };
      }
      return processedNode;
    };
  }

  public get parseNode(): INodeParser<FilteredHierarchyNode> {
    return (row: { [columnName: string]: any }): FilteredHierarchyNode => {
      const parsedFilteredChildrenPaths = row[ECSQL_COLUMN_NAME_FilteredChildrenPaths] ? JSON.parse(row[ECSQL_COLUMN_NAME_FilteredChildrenPaths]) : undefined;
      const defaultNode = (this._source.parseNode ?? defaultNodesParser)(row);
      return {
        ...defaultNode,
        autoExpand: defaultNode.autoExpand || (parsedFilteredChildrenPaths && !!parsedFilteredChildrenPaths.length),
        filteredChildrenPaths: parsedFilteredChildrenPaths,
      };
    };
  }

  public async defineHierarchyLevel(parentNode: HierarchyNode | undefined): Promise<HierarchyLevelDefinition> {
    const sourceDefinitions = await this._source.defineHierarchyLevel(parentNode);
    const filteredInstancePaths = this.getFilteringProps(parentNode);
    if (!filteredInstancePaths || filteredInstancePaths.length === 0) {
      return sourceDefinitions;
    }

    const filteredDefinitions: HierarchyLevelDefinition = [];
    await Promise.all(
      sourceDefinitions.map(async (definition) => {
        if (HierarchyNodesDefinition.isCustomNode(definition)) {
          filteredDefinitions.push(definition);
        } else if (HierarchyNodesDefinition.isInstanceNodesQuery(definition)) {
          const queryClass = await getClass(this._metadataProvider, definition.fullClassName);
          let hasFilterMatches = false;
          let isFilterTarget = false;
          const filterInfos: { [key: Id64String]: InstanceKeyPath[] } = {};
          for (const path of filteredInstancePaths) {
            if (path.length === 0) {
              isFilterTarget = true;
              continue;
            }
            const pathClass = await getClass(this._metadataProvider, path[0].className);
            if (await pathClass.is(queryClass)) {
              let childrenPaths = filterInfos[path[0].id];
              if (!childrenPaths) {
                childrenPaths = [];
                filterInfos[path[0].id] = childrenPaths;
              }
              const remainingPath = path.slice(1);
              if (remainingPath.length > 0) {
                childrenPaths.push(remainingPath);
              }
              hasFilterMatches = true;
            }
          }
          if (hasFilterMatches) {
            filteredDefinitions.push(applyECInstanceIdsFilter(definition, filterInfos));
          } else if (isFilterTarget) {
            filteredDefinitions.push(definition);
          }
        }
      }),
    );
    return filteredDefinitions;
  }

  private getFilteringProps(parentNode: FilteredHierarchyNode | undefined): InstanceKeyPath[] | undefined {
    if (!parentNode) {
      return this._instanceKeyPaths;
    }
    return parentNode.filteredChildrenPaths;
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const ECSQL_COLUMN_NAME_FilteredChildrenPaths = "FilteredChildrenPaths";

function applyECInstanceIdsFilter(def: InstanceNodesQueryDefinition, filterInfo: { [key: Id64String]: InstanceKeyPath[] }): InstanceNodesQueryDefinition {
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
          ${Object.keys(filterInfo)
            .map((id) => {
              const childrenPaths = filterInfo[id];
              return `VALUES (${id}, '${JSON.stringify(childrenPaths)}')`;
            })
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
