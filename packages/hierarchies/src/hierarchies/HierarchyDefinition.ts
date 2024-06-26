/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { ECClassHierarchyInspector, ECSqlQueryDef, InstanceKey } from "@itwin/presentation-shared";
import {
  HierarchyNode,
  NonGroupingHierarchyNode,
  ParsedCustomHierarchyNode,
  ParsedInstanceHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "./HierarchyNode";
import { InstancesNodeKey } from "./HierarchyNodeKey";
import { concatMap, filter, firstValueFrom, from, mergeAll, mergeMap, toArray } from "rxjs";

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
   * to be built using `NodeSelectQueryFactory.createSelectClause`.
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
 * A type for a function that parses a `ParsedInstanceHierarchyNode` from provided ECSQL `row` object.
 * @beta
 */
export type NodeParser = (row: { [columnName: string]: any }) => ParsedInstanceHierarchyNode;

/**
 * A type for a function that pre-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one. Returning `undefined` omits the node
 * from the hierarchy.
 *
 * @beta
 */
export type NodePreProcessor = <TNode extends ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode>(node: TNode) => Promise<TNode | undefined>;

/**
 * A type for a function that post-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one.
 *
 * @beta
 */
export type NodePostProcessor = (node: ProcessedHierarchyNode) => Promise<ProcessedHierarchyNode>;

/**
 * A type of node that can be passed to `HierarchyDefinition.defineHierarchyLevel`. This basically means
 * a `HierarchyNode` that:
 * - knows nothing about its children,
 * - is either an instances node (key is of `InstancesNodeKey` type) or a custom node (key is of `string` type).
 * @beta
 */
type HierarchyDefinitionParentNode = Omit<NonGroupingHierarchyNode, "children">;

/**
 * Props for `HierarchyDefinition.defineHierarchyLevel`.
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
export interface HierarchyDefinition {
  /**
   * An optional function for parsing ECInstance node from ECSQL row.
   *
   * Should be used in situations when the `HierarchyDefinition` implementation
   * introduces additional ECSQL columns into the select clause and wants to assign additional
   * data to the nodes it produces.
   *
   * Defaults to a function that parses all `HierarchyNode` attributes from a query, whose SELECT
   * clause is created using `NodeSelectQueryFactory.createSelectClause`.
   */
  parseNode?: NodeParser;

  /**
   * An optional function for pre-processing nodes.
   *
   * Pre-processing happens immediately after the nodes are loaded based on `HierarchyLevelDefinition`
   * returned by this `HierarchyDefinition` and before their processing (hiding, grouping, sorting, etc.) starts.
   * The step allows assigning nodes additional data or excluding them from the hierarchy based on some attributes.
   */
  preProcessNode?: NodePreProcessor;

  /**
   * An optional function for post-processing nodes.
   *
   * Post-processing happens after the loaded nodes go through all the merging, hiding and grouping
   * steps, but before sorting them. This step allows `HierarchyDefinition` implementations to assign additional data
   * to nodes after they're processed. This is especially true for grouping nodes as they're only created during
   * processing.
   */
  postProcessNode?: NodePostProcessor;

  /** A function to create a hierarchy level definition for given parent node. */
  defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition>;
}

/**
 * Props for defining child hierarchy level for specific parent instance node.
 * @see `createClassBasedHierarchyDefinition`
 * @beta
 */
export type DefineInstanceNodeChildHierarchyLevelProps = Omit<DefineHierarchyLevelProps, "parentNode"> & {
  /** The parent instance node. */
  parentNode: Omit<HierarchyDefinitionParentNode, "key"> & { key: InstancesNodeKey };

  /**
   * Full name of the parent instance node class.
   *
   * The `parentNode.key` also contains information about the instances the parent node is based on. However,
   * an instance node may be based on instances of multiple classes. In case that happens, parent node's instance
   * keys are grouped by class and a hierarchy level definition is requested for each combination of class and
   * instance IDs (with the same `parentNode`).
   */
  parentNodeClassName: string;

  /**
   * ECInstanceIds of the parent instance node.
   *
   * The `parentNode.key` also contains information about the instances the parent node is based on. However,
   * an instance node may be based on instances of multiple classes. In case that happens, parent node's instance
   * keys are grouped by class and a hierarchy level definition is requested for each combination of class and
   * instance IDs (with the same `parentNode`).
   */
  parentNodeInstanceIds: Id64String[];
};

/**
 * A definition of a hierarchy level that should be used for specific class of parent instance nodes.
 * @beta
 */
interface InstancesNodeChildHierarchyLevelDefinition {
  /**
   * Full name of the parent instance node's class to match against when checking if this hierarchy
   * level should be used for specific parent instance node.
   *
   * The check is polymorphic, so `BisCore.Element` class would match `BisCore.GeometricElement`, `BisCore.Category` and
   * all other element classes.
   */
  parentNodeClassName: string;

  /**
   * Called to create a hierarchy level definition when the class check passes (see `parentNodeClassName`).
   */
  definitions: (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;

  /**
   * If set to true, and node matches at least one of the previous definitions, this definition will not be applied.
   *
   * For example:
   * ```ts
   * {
   *   parentNodeClassName: "BisCore.GeometricElement3d",
   *   definitions: () => ...,
   * },
   * // This will apply to all elements, that are not BisCore.GeometricElement3d
   * {
   *   parentNodeClassName: "BisCore.Element",
   *   onlyIfNotHandled: true,
   *   definitions: () => ...,
   * }
   * ```
   */
  onlyIfNotHandled?: boolean;
}

/**
 * Props for defining child hierarchy level for specific parent custom node.
 * @see `createClassBasedHierarchyDefinition`
 * @beta
 */
export type DefineCustomNodeChildHierarchyLevelProps = Omit<DefineHierarchyLevelProps, "parentNode"> & {
  /** The parent custom node. */
  parentNode: Omit<HierarchyDefinitionParentNode, "key"> & { key: string };
};

/**
 * A definition of a hierarchy level for that should be used for specific custom parent nodes.
 * @beta
 */
interface CustomNodeChildHierarchyLevelDefinition {
  /**
   * `HierarchyNode.key` of the custom node that this child hierarchy level definition should be used for.
   */
  customParentNodeKey: string;

  /**
   * Called to create a hierarchy level definition when the node key check passes (see `customParentNodeKey`).
   */
  definitions: (requestProps: DefineCustomNodeChildHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;
}

/**
 * A hierarchy level definition associated with either parent instance node's class or custom
 * node's key.
 * @beta
 */
type ClassBasedHierarchyLevelDefinition = InstancesNodeChildHierarchyLevelDefinition | CustomNodeChildHierarchyLevelDefinition;

/**
 * Props for defining root hierarchy level.
 * @see `createClassBasedHierarchyDefinition`
 * @beta
 */
export type DefineRootHierarchyLevelProps = Omit<DefineHierarchyLevelProps, "parentNode">;

/**
 * Props for `createClassBasedHierarchyDefinition`.
 * @beta
 */
interface ClassBasedHierarchyDefinitionProps {
  /** Access to ECClass hierarchy in the iModel */
  classHierarchyInspector: ECClassHierarchyInspector;

  /** Hierarchy level definitions based on parent instance node's class or custom node's key. */
  hierarchy: {
    /** Called to create the root hierarchy level definition. */
    rootNodes: (props: DefineRootHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;

    /**
     * Called to get child hierarchy level definitions based on parent instance node's class
     * or custom node's key.
     */
    childNodes: ClassBasedHierarchyLevelDefinition[];
  };
}

/**
 * Creates an instance of `HierarchyDefinition` that uses a somewhat declarative approach to define the
 * hierarchy - each hierarchy level is assigned either an instance node's class or custom node's
 * key and they're used to assign hierarchy level definitions based on parent node.
 *
 * @beta
 */
export function createClassBasedHierarchyDefinition(props: ClassBasedHierarchyDefinitionProps): HierarchyDefinition {
  return new ClassBasedHierarchyDefinition(props);
}

class ClassBasedHierarchyDefinition implements HierarchyDefinition {
  public constructor(private _props: ClassBasedHierarchyDefinitionProps) {}

  /**
   * Create hierarchy level definitions for specific hierarchy level.
   * @param parentNode Parent node to create children definitions for.
   */
  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const { parentNode } = props;
    if (!parentNode) {
      return this._props.hierarchy.rootNodes(props);
    }

    if (HierarchyNode.isCustom(parentNode)) {
      const defs = this._props.hierarchy.childNodes
        .filter(isCustomNodeChildHierarchyLevelDefinition)
        .filter((def) => def.customParentNodeKey === parentNode.key);
      return (await Promise.all(defs.map(async (def) => def.definitions({ ...props, parentNode })))).flat();
    }

    // istanbul ignore else
    if (HierarchyNode.isInstancesNode(parentNode)) {
      const instanceIdsByClass = groupInstanceIdsByClass(parentNode.key.instanceKeys);
      const instancesParentNodeDefs = this._props.hierarchy.childNodes.filter(isInstancesNodeChildHierarchyLevelDefinition);
      return (
        await Promise.all(
          [...instanceIdsByClass.entries()].map(async ([parentNodeClassName, parentNodeInstanceIds]) =>
            createHierarchyLevelDefinitions(this._props.classHierarchyInspector, instancesParentNodeDefs, {
              ...props,
              parentNodeClassName,
              parentNodeInstanceIds,
              parentNode,
            }),
          ),
        )
      ).flat();
    }

    // istanbul ignore next
    return [];
  }
}

async function createHierarchyLevelDefinitions(
  classHierarchy: ECClassHierarchyInspector,
  defs: InstancesNodeChildHierarchyLevelDefinition[],
  requestProps: DefineInstanceNodeChildHierarchyLevelProps,
) {
  const obs = from(defs).pipe(
    mergeMap(async (def, idx) => {
      if (await classHierarchy.classDerivesFrom(requestProps.parentNodeClassName, def.parentNodeClassName)) {
        return { def, idx };
      }
      return undefined;
    }),
    filter((x): x is Exclude<typeof x, undefined> => !!x),
    toArray(),
    concatMap((x) => x.sort((a, b) => a.idx - b.idx).map(({ def }) => def)),
    filter((def, idx) => !def.onlyIfNotHandled || idx === 0),
    mergeMap(async (def) => def.definitions(requestProps)),
    mergeAll(),
  );
  return firstValueFrom(obs.pipe(toArray()));
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
