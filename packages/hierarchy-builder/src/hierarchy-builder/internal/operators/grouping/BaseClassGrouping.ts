/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { Id64 } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../HierarchyNode";
import { getLogger } from "../../../Logging";
import { ECClass, IMetadataProvider } from "../../../Metadata";
import { createOperatorLoggingNamespace, getClass } from "../../Common";
import { sortNodesByLabel } from "../Sorting";

const OPERATOR_NAME = "Grouping.ByBaseClass";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createBaseClassGroupingOperator(metadata: IMetadataProvider) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    return nodes.pipe(
      log((n) => `in: ${n.label}`),
      // need all nodes in one place to group them
      toArray(),
      // group all nodes
      mergeMap((resolvedNodes) => from(createBaseClassGrouping(metadata, resolvedNodes))),
      mergeMap((resolvedNodes) => from(resolvedNodes)),
      // convert intermediate format into a nodes observable
      log((n) => `out: ${n.label}`),
    );
  };
}

async function createBaseClassGrouping(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<HierarchyNode[]> {
  let output = nodes;
  // Get all base class names that are provided in the grouping information
  const baseClassesFullClassNames = getAllBaseClasses(nodes);
  if (baseClassesFullClassNames.size === 0) {
    return nodes;
  }

  const baseECClassesArray = new Array<ECClass>();
  for (const fullName of baseClassesFullClassNames) {
    const specificClassNode = await getClass(metadata, fullName);
    baseECClassesArray.push(specificClassNode);
  }
  const baseECClassesSorted = await sortByBaseClass(baseECClassesArray);

  for (const baseECClass of baseECClassesSorted) {
    const [newHierarchy, hasChanged] = await createGroupingForSingleBaseClass(metadata, output, baseECClass);
    if (hasChanged) {
      output = sortNodesByLabel(newHierarchy);
    }
  }
  return output;
}

async function createGroupingForSingleBaseClass(
  metadata: IMetadataProvider,
  nodes: HierarchyNode[],
  baseECClass: ECClass,
): Promise<[nodes: HierarchyNode[], hasChanged: boolean]> {
  let hideIfNoOtherNodes = false;
  let hideIfSingleNodeInGrouping = false;
  let hasChanged = false;
  const finalHierarchy = new Array<HierarchyNode>();
  finalHierarchy.push({
    label: baseECClass.fullName,
    key: {
      type: "base-class-grouping",
      class: { id: Id64.invalid, name: baseECClass.fullName, label: baseECClass.label ?? baseECClass.name },
    },
    children: [],
  });
  for (const node of nodes) {
    // if node is a grouping node, then call this function for its children and update them if necessary
    if (HierarchyNode.isGroupingNode(node) && Array.isArray(node.children)) {
      const [newChildren, haveChildrenChanged] = await createGroupingForSingleBaseClass(metadata, node.children, baseECClass);
      if (haveChildrenChanged) {
        node.children = sortNodesByLabel(newChildren);
        hasChanged = true;
      }
    }
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.groupByBaseClass && node.params.grouping.baseClassInfo) {
      hideIfNoOtherNodes ||= !!node.params.grouping.hideIfNoOtherGroups;
      hideIfSingleNodeInGrouping ||= !!node.params.grouping.hideIfSingleNodeInGroup;

      let classNameIsInBaseClassInfo = false;
      // check if the node should be grouped by this baseClass
      for (const classInfo of node.params.grouping.baseClassInfo) {
        const specificClassName = `${classInfo.schemaName}.${classInfo.className}`;
        if (specificClassName === baseECClass.fullName) {
          classNameIsInBaseClassInfo = true;
          break;
        }
      }
      if (classNameIsInBaseClassInfo) {
        const fullCurrentNodeClassName = node.key.instanceKeys[0].className;
        const currentNodeECClass = await getClass(metadata, fullCurrentNodeClassName);
        if (await currentNodeECClass.is(baseECClass)) {
          if (finalHierarchy.length > 0 && Array.isArray(finalHierarchy[0].children)) {
            finalHierarchy[0].children.push(node);
            hasChanged = true;
            continue;
          }
        }
      }
    }
    finalHierarchy.push(node);
  }
  if (hideIfNoOtherNodes && finalHierarchy.length === 1 && Array.isArray(finalHierarchy[0].children)) {
    return [finalHierarchy[0].children, hasChanged];
  }
  if (hideIfSingleNodeInGrouping && Array.isArray(finalHierarchy[0].children) && finalHierarchy[0].children.length === 1) {
    return [finalHierarchy.splice(0, 1, finalHierarchy[0].children[0]), hasChanged];
  }
  if (Array.isArray(finalHierarchy[0].children) && finalHierarchy[0].children.length === 0) {
    finalHierarchy.splice(0, 1);
  }
  return [finalHierarchy, hasChanged];
}

function getAllBaseClasses(nodes: HierarchyNode[]): Set<string> {
  const baseClasses = new Set<string>();
  for (const node of nodes) {
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.groupByBaseClass && node.params.grouping.baseClassInfo) {
      for (const classInfo of node.params.grouping.baseClassInfo) {
        const specificClassName = `${classInfo.schemaName}.${classInfo.className}`;
        baseClasses.add(specificClassName);
      }
    }
  }
  return baseClasses;
}

async function sortByBaseClass(classes: ECClass[]) {
  const output: ECClass[] = [];
  const originalAmountOfClasses = classes.length;
  while (output.length < originalAmountOfClasses) {
    // Iterate through array of classes, if the element in the array is not parent class, it can be added to the outputArray and removed from the input array
    // Repeat this until all classes have been added to the outputArray
    for (let parentIndex = 0; parentIndex < classes.length; ++parentIndex) {
      let isParent = false;
      for (let childIndex = 0; childIndex < classes.length; ++childIndex) {
        if (childIndex !== parentIndex) {
          if (await classes[childIndex].is(classes[parentIndex])) {
            isParent = true;
            break;
          }
        }
      }
      if (!isParent) {
        output.push(classes[parentIndex]);
        classes.splice(parentIndex, 1);
        break;
      }
    }
  }
  // Output has all the classes, but parent classes have been added after their children. So the array has to be reversed.
  return output.reverse();
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
