/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  compareFullClassNames,
  createMainThreadReleaseOnTimePassedHandler,
  EC,
  ECClassHierarchyInspector,
  ECSchemaProvider,
  getClass,
} from "@itwin/presentation-shared";
import { HierarchyNode, ParentHierarchyNode } from "../../../HierarchyNode.js";
import { ClassGroupingNodeKey } from "../../../HierarchyNodeKey.js";
import { ProcessedInstanceHierarchyNode } from "../../IModelHierarchyNode.js";
import { GroupingHandler, GroupingHandlerResult } from "../Grouping.js";

/** @internal */
export async function getBaseClassGroupingECClasses(
  schemaProvider: ECSchemaProvider,
  parentNode: ParentHierarchyNode | undefined,
  nodes: ProcessedInstanceHierarchyNode[],
): Promise<EC.Class[]> {
  // Get all base class names that are provided in the grouping information
  const baseClassesFullClassNames = await getGroupingBaseClassNames(nodes);
  if (baseClassesFullClassNames.size === 0) {
    return [];
  }

  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  const baseClasses = [];
  for (const fullName of baseClassesFullClassNames) {
    await releaseMainThread();
    baseClasses.push(await getClass(schemaProvider, fullName));
  }
  const sortedClasses = await sortByBaseClass(baseClasses.filter((baseClass) => baseClass.isRelationshipClass() || baseClass.isEntityClass()));

  if (parentNode && HierarchyNode.isClassGroupingNode(parentNode)) {
    // if we have a class grouping node, we can cut the front of sortedClasses up to a point where our grouping class is
    const cutPosition = sortedClasses.findIndex((c) => compareFullClassNames(c.fullName, parentNode.key.className) === 0);
    if (cutPosition >= 0) {
      return sortedClasses.slice(cutPosition + 1);
    }
    return [];
  }

  return sortedClasses;
}

/** @internal */
export async function createBaseClassGroupsForSingleBaseClass(
  nodes: ProcessedInstanceHierarchyNode[],
  baseECClass: EC.Class,
  classHierarchyInspector: ECClassHierarchyInspector,
): Promise<GroupingHandlerResult> {
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  const groupedNodes = new Array<ProcessedInstanceHierarchyNode>();
  const ungroupedNodes = new Array<ProcessedInstanceHierarchyNode>();
  const baseClassFullName = baseECClass.fullName;
  for (const node of nodes) {
    await releaseMainThread();
    if (
      !node.processingParams?.grouping?.byBaseClasses ||
      !node.processingParams.grouping.byBaseClasses.fullClassNames.some((className) => compareFullClassNames(className, baseClassFullName) === 0)
    ) {
      ungroupedNodes.push(node);
      continue;
    }
    const fullCurrentNodeClassName = node.key.instanceKeys[0].className;

    const baseCheckerResult = classHierarchyInspector.classDerivesFrom(fullCurrentNodeClassName, baseClassFullName);
    /* c8 ignore next */
    const isCurrentNodeClassOfBase = baseCheckerResult instanceof Promise ? await baseCheckerResult : baseCheckerResult;

    if (isCurrentNodeClassOfBase) {
      groupedNodes.push(node);
    } else {
      ungroupedNodes.push(node);
    }
  }

  const result: GroupingHandlerResult = { grouped: [], ungrouped: ungroupedNodes, groupingType: "base-class" };
  if (groupedNodes.length > 0) {
    const groupingNodeKey: ClassGroupingNodeKey = {
      type: "class-grouping",
      className: baseClassFullName,
    };
    result.grouped.push({
      label: baseECClass.label ?? baseECClass.name,
      key: groupingNodeKey,
      parentKeys: [...groupedNodes[0].parentKeys],
      groupedInstanceKeys: groupedNodes.flatMap((groupedInstanceNode) => groupedInstanceNode.key.instanceKeys),
      children: groupedNodes.map((gn) => Object.assign(gn, { parentKeys: [...gn.parentKeys, groupingNodeKey] })),
    });
  }
  return result;
}

async function getGroupingBaseClassNames(nodes: ProcessedInstanceHierarchyNode[]) {
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  const baseClasses = new Set<string>();
  for (const node of nodes) {
    await releaseMainThread();
    if (node.processingParams?.grouping?.byBaseClasses) {
      for (const className of node.processingParams.grouping.byBaseClasses.fullClassNames) {
        baseClasses.add(className);
      }
    }
  }
  return baseClasses;
}

async function sortByBaseClass(classes: EC.Class[]): Promise<EC.Class[]> {
  if (classes.length === 0) {
    return classes;
  }
  const output: EC.Class[] = [classes[0]];
  for (let inputIndex = 1; inputIndex < classes.length; ++inputIndex) {
    let wasAdded = false;
    for (let outputIndex = output.length - 1; outputIndex >= 0; --outputIndex) {
      if (await classes[inputIndex].is(output[outputIndex])) {
        output.splice(outputIndex + 1, 0, classes[inputIndex]);
        wasAdded = true;
        break;
      }
    }
    if (!wasAdded) {
      output.splice(0, 0, classes[inputIndex]);
    }
  }

  return output;
}

/** @internal */
export async function createBaseClassGroupingHandlers(
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector,
  parentNode: ParentHierarchyNode | undefined,
  nodes: ProcessedInstanceHierarchyNode[],
): Promise<GroupingHandler[]> {
  const baseClassGroupingECClasses = await getBaseClassGroupingECClasses(imodelAccess, parentNode, nodes);
  return baseClassGroupingECClasses.map((baseECClass) => async (allNodes) => createBaseClassGroupsForSingleBaseClass(allNodes, baseECClass, imodelAccess));
}
