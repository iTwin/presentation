/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IMetadataProvider } from "./ECMetadata";
import { GenericInstanceFilter } from "./GenericInstanceFilter";
import {
  HierarchyNode,
  HierarchyNodeKey,
  InstancesNodeKey,
  ParsedCustomHierarchyNode,
  ParsedInstanceHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "./HierarchyNode";
import { getClass } from "./internal/GetClass";
import { parseFullClassName } from "./Metadata";
import { ECSqlQueryDef } from "./queries/ECSqlCore";
import { Id64String, InstanceKey } from "./values/Values";

/**
 * A nodes definition that returns a single custom defined node.
 * @beta
 */
export interface CustomHierarchyNodeDefinition {
  /** The node to be created in the hierarchy level */
  node: ParsedCustomHierarchyNode;
}

/**
 * A nodes definition that returns an ECSQL query for selecting nodes from an iModel.
 * @beta
 */
export interface InstanceNodesQueryDefinition {
  /**
   * Full name of the class whose instances are going to be returned. It's okay if the attribute
   * points to a base class of multiple different classes of instances returned by the query, however
   * the more specific this class is, the more efficient hierarchy building process is.
   */
  fullClassName: string;
  /**
   * An ECSQL query that selects nodes from an iModel. `SELECT` clause of the query is expected
   * to be built using [[NodeSelectQueryFactory.createSelectClause]].
   */
  query: ECSqlQueryDef;
}

/**
 * A definition of nodes included in a hierarchy level.
 * @beta
 */
export type HierarchyNodesDefinition = CustomHierarchyNodeDefinition | InstanceNodesQueryDefinition;
/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodesDefinition {
  export function isCustomNode(def: HierarchyNodesDefinition): def is CustomHierarchyNodeDefinition {
    return !!(def as CustomHierarchyNodeDefinition).node;
  }
  export function isInstanceNodesQuery(def: HierarchyNodesDefinition): def is InstanceNodesQueryDefinition {
    return !!(def as InstanceNodesQueryDefinition).query;
  }
}

/**
 * A definition of a hierarchy level, which may consist of multiple node definitions.
 * @beta
 */
export type HierarchyLevelDefinition = HierarchyNodesDefinition[];

/**
 * A type for a function that parses a [[ParsedInstanceHierarchyNode]] from provided ECSQL `row` object.
 * @beta
 */
export type INodeParser = (row: { [columnName: string]: any }) => ParsedInstanceHierarchyNode;

/**
 * A type for a function that pre-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one. Returning `undefined` omits the node
 * from the hierarchy.
 *
 * @beta
 */
export type INodePreProcessor = <TNode extends ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode>(node: TNode) => Promise<TNode | undefined>;

/**
 * A type for a function that post-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one.
 *
 * @beta
 */
export type INodePostProcessor = (node: ProcessedHierarchyNode) => Promise<ProcessedHierarchyNode>;

/**
 * A type of node that can be passed to [[IHierarchyLevelDefinitionsFactory.defineHierarchyLevel]]. This basically means
 * a [[HierarchyNode]] that:
 * - knows nothing about its children,
 * - is either an instances node (key is of [[InstancesNodeKey]] type) or a custom node (key is of `string` type).
 * @beta
 */
export type HierarchyDefinitionParentNode = Omit<HierarchyNode, "children" | "key"> & { key: InstancesNodeKey | string };

/**
 * Props for [[IHierarchyLevelDefinitionsFactory.defineHierarchyLevel]].
 * @beta
 */
export interface DefineHierarchyLevelProps {
  /** Parent node to get children for. Pass `undefined` to get root nodes. */
  parentNode: HierarchyDefinitionParentNode | undefined;
  /** Optional hierarchy level filter. */
  instanceFilter?: GenericInstanceFilter;
}

/**
 * An interface for a factory that knows how define a hierarchy based on a given parent node.
 * @beta
 */
export interface IHierarchyLevelDefinitionsFactory {
  /**
   * An optional function for parsing ECInstance node from ECSQL row.
   *
   * Should be used in situations when the [[IHierarchyLevelDefinitionsFactory]] implementation
   * introduces additional ECSQL columns into the select clause and wants to assign additional
   * data to the nodes it produces.
   *
   * Defaults to a function that parses all [[HierarchyNode]] attributes.
   */
  parseNode?: INodeParser;

  /**
   * An optional function for pre-processing nodes.
   *
   * Pre-processing happens immediately after the nodes are loaded based on [[HierarchyLevelDefinition]]
   * returned by this [[IHierarchyLevelDefinitionsFactory]]. The step allows assigning nodes additional data
   * or excluding them from the hierarchy based on some attributes.
   */
  preProcessNode?: INodePreProcessor;

  /**
   * An optional function for post-processing nodes.
   *
   * Post-processing happens after the loaded nodes go through all the merging, hiding, sorting and grouping
   * steps. This step allows [[IHierarchyLevelDefinitionsFactory]] implementations to assign additional data
   * to nodes after they're processed. This is especially true for grouping nodes as they're only created during
   * processing.
   */
  postProcessNode?: INodePostProcessor;

  /** A function to create a hierarchy level definition for given parent node. */
  defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition>;
}

/**
 * Props for [[InstancesNodeChildHierarchyLevelDefinition.definitions]] call.
 * @beta
 */
export type DefineInstanceNodeChildHierarchyLevelProps = DefineHierarchyLevelProps & {
  parentNodeInstanceIds: Id64String[];
  parentNode: HierarchyDefinitionParentNode;
};

/**
 * A definition of a hierarchy level for that should be used for specific class of parent instance nodes.
 * @beta
 */
export interface InstancesNodeChildHierarchyLevelDefinition {
  /**
   * Full name of the parent instance node's class to match against when checking if this hierarchy
   * level should be used for specific parent instance node.
   *
   * The check is polymorphic, so `bis.Element` class would match `bis.GeometricElement`, `bis.Category` and
   * all other element classes.
   */
  parentNodeClassName: string;

  /**
   * Called to create a hierarchy level definition when the class check passes (see [[parentNodeClassName]]).
   * @param requestProps Props for creating the hierarchy level definition.
   */
  definitions: (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;
}

/**
 * A definition of a hierarchy level for that should be used for specific custom nodes.
 * @beta
 */
export interface CustomNodeChildHierarchyLevelDefinition {
  /**
   * `HierarchyNode.key` of the custom node that this child hierarchy level definition should be used for.
   */
  customParentNodeKey: string;
  /**
   * Called to create a hierarchy level definition when the node key check passes (see [[customParentNodeKey]]).
   * @param requestProps Props for creating the hierarchy level definition.
   */
  definitions: (requestProps: DefineHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;
}

/**
 * A hierarchy level definition associated with either parent instance node's class or custom
 * node's key.
 *
 * @beta
 */
export type ClassBasedHierarchyLevelDefinition = InstancesNodeChildHierarchyLevelDefinition | CustomNodeChildHierarchyLevelDefinition;

/**
 * Props for [[ClassBasedHierarchyDefinition.rootNodes]] call.
 * @beta
 */
export type DefineRootHierarchyLevelProps = Omit<DefineHierarchyLevelProps, "parentNode">;

/**
 * Defines a hierarchy based on parent instance node's class or custom node's key.
 * @beta
 */
export interface ClassBasedHierarchyDefinition {
  /** Called to create the root hierarchy level definition. */
  rootNodes: (props: DefineRootHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;

  /**
   * Called to get child hierarchy level definitions based on parent instance node's class
   * or custom node's key.
   */
  childNodes: Array<ClassBasedHierarchyLevelDefinition>;
}

/**
 * Props for [[ClassBasedHierarchyLevelDefinitionsFactory]].
 * @beta
 */
export interface ClassBasedHierarchyDefinitionsFactoryProps {
  /** Access to iModel's metadata. */
  metadataProvider: IMetadataProvider;
  /** Hierarchy level definitions based on parent instance node's class or custom node's key. */
  hierarchy: ClassBasedHierarchyDefinition;
}

/**
 * A hierarchy level definitions factory that uses a somewhat declarative approach to define the
 * hierarchy - each hierarchy level is assigned either an instance node's class or custom node's
 * key and they're used to assign hierarchy level definitions based on parent node.
 *
 * @beta
 */
export class ClassBasedHierarchyLevelDefinitionsFactory implements IHierarchyLevelDefinitionsFactory {
  private _metadataProvider: IMetadataProvider;
  private _definition: ClassBasedHierarchyDefinition;

  public constructor(props: ClassBasedHierarchyDefinitionsFactoryProps) {
    this._metadataProvider = props.metadataProvider;
    this._definition = props.hierarchy;
  }

  /**
   * Create hierarchy level definitions for specific hierarchy level.
   * @param parentNode Parent node to create children definitions for.
   */
  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const { parentNode } = props;
    if (!parentNode) {
      return this._definition.rootNodes(props);
    }

    const parentKey = parentNode.key;

    if (HierarchyNodeKey.isCustom(parentKey)) {
      const defs = this._definition.childNodes.filter(isCustomNodeChildHierarchyLevelDefinition).filter((def) => def.customParentNodeKey === parentKey);
      return (await Promise.all(defs.map(async (def) => def.definitions(props)))).flat();
    }

    // istanbul ignore else
    if (HierarchyNodeKey.isInstances(parentKey)) {
      const instanceIdsByClass = groupInstanceIdsByClass(parentKey.instanceKeys);
      const instancesParentNodeDefs = this._definition.childNodes.filter(isInstancesNodeChildHierarchyLevelDefinition);
      return (
        await Promise.all(
          [...instanceIdsByClass.entries()].map(async ([parentNodeClassName, parentNodeInstanceIds]) =>
            createHierarchyLevelDefinitions(this._metadataProvider, instancesParentNodeDefs, parentNodeClassName, parentNodeInstanceIds, {
              ...props,
              parentNode,
            }),
          ),
        )
      ).flat();
    }

    // https://github.com/microsoft/TypeScript/issues/21985
    // istanbul ignore next
    return ((x: never) => x)(parentKey);
  }
}

async function createHierarchyLevelDefinitions(
  metadataProvider: IMetadataProvider,
  defs: InstancesNodeChildHierarchyLevelDefinition[],
  parentNodeClassName: string,
  parentNodeInstanceIds: Id64String[],
  requestProps: DefineHierarchyLevelProps & { parentNode: HierarchyDefinitionParentNode },
) {
  const parentNodeClass = await getClass(metadataProvider, parentNodeClassName);
  return (
    await Promise.all(
      defs.map(async (def) => {
        const { schemaName, className } = parseFullClassName(def.parentNodeClassName);
        if (await parentNodeClass.is(className, schemaName)) {
          return def.definitions({ ...requestProps, parentNodeInstanceIds });
        }
        return [];
      }),
    )
  ).flat();
}

function groupInstanceIdsByClass(instanceKeys: InstanceKey[]) {
  const instanceIdsByClass = new Map<string, Id64String[]>();
  instanceKeys.forEach((key) => {
    let instanceIds = instanceIdsByClass.get(key.className);
    if (!instanceIds) {
      instanceIds = [];
      instanceIdsByClass.set(key.className, instanceIds);
    }
    instanceIds.push(key.id);
  });
  return instanceIdsByClass;
}

function isCustomNodeChildHierarchyLevelDefinition(def: ClassBasedHierarchyLevelDefinition): def is CustomNodeChildHierarchyLevelDefinition {
  return !!(def as CustomNodeChildHierarchyLevelDefinition).customParentNodeKey;
}

function isInstancesNodeChildHierarchyLevelDefinition(def: ClassBasedHierarchyLevelDefinition): def is InstancesNodeChildHierarchyLevelDefinition {
  return !!(def as InstancesNodeChildHierarchyLevelDefinition).parentNodeClassName;
}
