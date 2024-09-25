/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, filter, firstValueFrom, from, mergeAll, mergeMap, toArray } from "rxjs";
import { Id64String } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { ECClassHierarchyInspector, ECSqlQueryDef, InstanceKey } from "@itwin/presentation-shared";
import { HierarchyNode, NonGroupingHierarchyNode } from "../HierarchyNode";
import { GenericNodeKey, InstancesNodeKey } from "../HierarchyNodeKey";
import {
  ProcessedGenericHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceGenericHierarchyNode,
  SourceInstanceHierarchyNode,
} from "./IModelHierarchyNode";

/**
 * A nodes definition that returns a single generic node.
 * @beta
 */
export interface GenericHierarchyNodeDefinition {
  /** The node to be created in the hierarchy level */
  node: SourceGenericHierarchyNode;
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
export type HierarchyNodesDefinition = GenericHierarchyNodeDefinition | InstanceNodesQueryDefinition;
/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodesDefinition {
  export function isGenericNode(def: HierarchyNodesDefinition): def is GenericHierarchyNodeDefinition {
    return !!(def as GenericHierarchyNodeDefinition).node;
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
 * A type for a function that parses a `SourceInstanceHierarchyNode` from provided ECSQL `row` object.
 * @beta
 */
export type NodeParser = (row: { [columnName: string]: any }) => SourceInstanceHierarchyNode;

/**
 * A type for a function that pre-processes given node. Unless the function decides not to make any modifications,
 * it should return a new - modified - node, rather than modifying the given one. Returning `undefined` omits the node
 * from the hierarchy.
 *
 * @beta
 */
export type NodePreProcessor = <TNode extends ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode>(node: TNode) => Promise<TNode | undefined>;

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
 * - is either an instances node (key is of `InstancesNodeKey` type) or a generic node (key is of `GenericNodeKey` type).
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
 * A definition of a hierarchy level that should be used for specific parent instance nodes.
 * @beta
 */
interface InstancesNodeChildHierarchyLevelDefinition {
  /**
   * A predicate for matching the parent instances node. This can be either a string or a predicate function:
   *
   * - The string version should specify full name of the parent instance node's class to match against when
   * checking if this hierarchy level should be used for specific parent instance node. The check is polymorphic,
   * so `BisCore.Element` class would match `BisCore.GeometricElement`, `BisCore.Category` and all other element classes.
   *
   * - The function version should return a boolean indicating whether this hierarchy level definition should be used
   * for the given parent node.
   */
  parentInstancesNodePredicate: string | ((parentNodeKey: InstancesNodeKey) => Promise<boolean>);

  /**
   * Called to create a hierarchy level definition when the `parentInstancesNodePredicate` predicate passes.
   */
  definitions: (requestProps: DefineInstanceNodeChildHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;

  /**
   * If set to true, and node matches at least one of the previous definitions, this definition will not be applied.
   *
   * For example:
   * ```ts
   * {
   *   parentInstancesNodePredicate: "BisCore.GeometricElement3d",
   *   definitions: () => ...,
   * },
   * // This will apply to all elements, that are not `BisCore.GeometricElement3d`
   * {
   *   parentInstancesNodePredicate: "BisCore.Element",
   *   onlyIfNotHandled: true,
   *   definitions: () => ...,
   * }
   * ```
   */
  onlyIfNotHandled?: boolean;
}

/**
 * Props for defining child hierarchy level for specific parent generic node.
 * @see `createClassBasedHierarchyDefinition`
 * @beta
 */
export type DefineGenericNodeChildHierarchyLevelProps = Omit<DefineHierarchyLevelProps, "parentNode"> & {
  /** The parent generic node. */
  parentNode: Omit<HierarchyDefinitionParentNode, "key"> & { key: GenericNodeKey };
};

/**
 * A definition of a hierarchy level for that should be used for specific generic parent nodes.
 * @beta
 */
interface GenericNodeChildHierarchyLevelDefinition {
  /**
   * A function that indicates whether this hierarchy level definition should be used for
   * specific parent generic node.
   */
  parentGenericNodePredicate: (parentNodeKey: GenericNodeKey) => Promise<boolean>;

  /**
   * Called to create a hierarchy level definition when the `parentInstancesNodePredicate` predicate passes.
   */
  definitions: (requestProps: DefineGenericNodeChildHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;
}

/**
 * A hierarchy level definition associated with either parent instance node's class or generic
 * node's key.
 *
 * @beta
 */
type ClassBasedHierarchyLevelDefinition = InstancesNodeChildHierarchyLevelDefinition | GenericNodeChildHierarchyLevelDefinition;

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

  /** Hierarchy level definitions */
  hierarchy: {
    /** Called to create the root hierarchy level definition. */
    rootNodes: (props: DefineRootHierarchyLevelProps) => Promise<HierarchyLevelDefinition>;

    /**
     * A list of child hierarchy level definitions. The list is first filtered based on
     * the parent node and then is used to create child hierarchy level definitions.
     */
    childNodes: ClassBasedHierarchyLevelDefinition[];
  };
}

/**
 * Creates an instance of `HierarchyDefinition` that uses a somewhat declarative approach to define the
 * hierarchy - each hierarchy level is defined by specifying a parent node predicate and child hierarchy
 * level definitions, that are used when the predicate passes.
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

    if (HierarchyNode.isGeneric(parentNode)) {
      return firstValueFrom(
        from(this._props.hierarchy.childNodes).pipe(
          filter(isGenericNodeChildHierarchyLevelDefinition),
          mergeMap(async (def) => {
            if (await def.parentGenericNodePredicate(parentNode.key)) {
              return def.definitions({ ...props, parentNode });
            }
            return [];
          }),
          mergeAll(),
          toArray(),
        ),
      );
    }

    // istanbul ignore else
    if (HierarchyNode.isInstancesNode(parentNode)) {
      const instancesParentNodeDefs = this._props.hierarchy.childNodes.filter(isInstancesNodeChildHierarchyLevelDefinition);
      return firstValueFrom(
        from(groupInstanceIdsByClass(parentNode.key.instanceKeys).entries()).pipe(
          mergeMap(async ([parentNodeClassName, parentNodeInstanceIds]) =>
            createHierarchyLevelDefinitions(this._props.classHierarchyInspector, instancesParentNodeDefs, {
              ...props,
              parentNodeClassName,
              parentNodeInstanceIds,
              parentNode,
            }),
          ),
          mergeAll(),
          toArray(),
        ),
      );
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
  return from(defs).pipe(
    mergeMap(async (def, idx) => {
      if (
        typeof def.parentInstancesNodePredicate === "string" &&
        (await classHierarchy.classDerivesFrom(requestProps.parentNodeClassName, def.parentInstancesNodePredicate))
      ) {
        return { def, idx };
      }
      if (typeof def.parentInstancesNodePredicate === "function" && (await def.parentInstancesNodePredicate(requestProps.parentNode.key))) {
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

function isGenericNodeChildHierarchyLevelDefinition(def: ClassBasedHierarchyLevelDefinition): def is GenericNodeChildHierarchyLevelDefinition {
  return !!(def as GenericNodeChildHierarchyLevelDefinition).parentGenericNodePredicate;
}

function isInstancesNodeChildHierarchyLevelDefinition(def: ClassBasedHierarchyLevelDefinition): def is InstancesNodeChildHierarchyLevelDefinition {
  return !!(def as InstancesNodeChildHierarchyLevelDefinition).parentInstancesNodePredicate;
}
