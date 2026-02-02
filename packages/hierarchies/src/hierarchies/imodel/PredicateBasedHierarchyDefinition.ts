/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, filter, firstValueFrom, from, mergeAll, mergeMap, toArray } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type { ECClassHierarchyInspector, InstanceKey } from "@itwin/presentation-shared";
import { HierarchyNode } from "../HierarchyNode.js";
import type { GenericNodeKey, InstancesNodeKey } from "../HierarchyNodeKey.js";
import type {
  DefineHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
  NodeParser,
  NodePostProcessor,
  NodePreProcessor,
} from "./IModelHierarchyDefinition.js";

/**
 * Props for defining child hierarchy level for specific parent instance node.
 * @see `createPredicateBasedHierarchyDefinition`
 * @public
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
 * @see `createPredicateBasedHierarchyDefinition`
 * @public
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
 * Props for defining child hierarchy level for specific generic parent node.
 * @see `createPredicateBasedHierarchyDefinition`
 * @public
 */
export type DefineGenericNodeChildHierarchyLevelProps = Omit<DefineHierarchyLevelProps, "parentNode"> & {
  /** The parent generic node. */
  parentNode: Omit<HierarchyDefinitionParentNode, "key"> & { key: GenericNodeKey };
};

/**
 * A definition of a hierarchy level for that should be used for specific generic parent nodes.
 * @see `createPredicateBasedHierarchyDefinition`
 * @public
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
 * A hierarchy level definition associated with specific parent instance or generic node. *
 * @see `createPredicateBasedHierarchyDefinition`
 * @public
 */
type PredicateBasedHierarchyLevelDefinition = InstancesNodeChildHierarchyLevelDefinition | GenericNodeChildHierarchyLevelDefinition;

/**
 * Props for defining root hierarchy level.
 * @see `createPredicateBasedHierarchyDefinition`
 * @public
 */
export type DefineRootHierarchyLevelProps = Omit<DefineHierarchyLevelProps, "parentNode">;

/**
 * Props for `createPredicateBasedHierarchyDefinition`.
 * @public
 */
interface PredicateBasedHierarchyDefinitionProps extends Pick<HierarchyDefinition, "parseNode" | "preProcessNode" | "postProcessNode"> {
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
    childNodes: PredicateBasedHierarchyLevelDefinition[];
  };
}

/**
 * Creates an instance of `HierarchyDefinition` that uses a somewhat declarative approach to define the
 * hierarchy - each hierarchy level is defined by specifying a parent node predicate and child hierarchy
 * level definitions, that are used when the predicate passes.
 *
 * @public
 */
export function createPredicateBasedHierarchyDefinition(props: PredicateBasedHierarchyDefinitionProps): HierarchyDefinition {
  return new PredicateBasedHierarchyDefinition(props);
}

class PredicateBasedHierarchyDefinition implements HierarchyDefinition {
  public parseNode: NodeParser | undefined;
  public preProcessNode: NodePreProcessor | undefined;
  public postProcessNode: NodePostProcessor | undefined;

  public constructor(private _props: PredicateBasedHierarchyDefinitionProps) {
    if (this._props.parseNode) {
      this.parseNode = this._props.parseNode;
    }
    if (this._props.preProcessNode) {
      this.preProcessNode = this._props.preProcessNode;
    }
    if (this._props.postProcessNode) {
      this.postProcessNode = this._props.postProcessNode;
    }
  }

  /**
   * Create hierarchy level definitions for specific hierarchy level.
   * @param parentNode Parent node to create children definitions for.
   */
  public async defineHierarchyLevel(props: DefineHierarchyLevelProps): Promise<HierarchyLevelDefinition> {
    const { parentNode } = props;

    if (parentNode && HierarchyNode.isGeneric(parentNode)) {
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

    if (parentNode && HierarchyNode.isInstancesNode(parentNode)) {
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

    return this._props.hierarchy.rootNodes(props);
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

function isGenericNodeChildHierarchyLevelDefinition(def: PredicateBasedHierarchyLevelDefinition): def is GenericNodeChildHierarchyLevelDefinition {
  return !!(def as GenericNodeChildHierarchyLevelDefinition).parentGenericNodePredicate;
}

function isInstancesNodeChildHierarchyLevelDefinition(def: PredicateBasedHierarchyLevelDefinition): def is InstancesNodeChildHierarchyLevelDefinition {
  return !!(def as InstancesNodeChildHierarchyLevelDefinition).parentInstancesNodePredicate;
}
