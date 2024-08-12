/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { isDeepStrictEqual } from "util";
import { Logger } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider, NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import { hasChildren } from "@itwin/presentation-hierarchies/lib/cjs/hierarchies/internal/Common";
import { InstanceKey } from "@itwin/presentation-shared";

const loggingNamespace = `Presentation.HierarchyBuilder.HierarchyValidation`;

export interface HierarchyDef<TNode> {
  node: TNode;
  children?: Array<HierarchyDef<TNode>> | boolean;
}

export type ExpectedHierarchyDef = HierarchyDef<(node: HierarchyNode) => void>;

function optionalBooleanToString(value: boolean | undefined) {
  return value === undefined ? "undefined" : value ? "TRUE" : "FALSE";
}

type FilterTarget = Exclude<HierarchyNode["filtering"], undefined>["filterTarget"];

// eslint-disable-next-line @typescript-eslint/no-redeclare
namespace FilterTarget {
  export function toString(filterTarget: FilterTarget): string {
    if (filterTarget === undefined || typeof filterTarget === "boolean") {
      return optionalBooleanToString(filterTarget);
    }

    return JSON.stringify(filterTarget, undefined, 2);
  }

  export function areEqual(expected: Exclude<FilterTarget, undefined>, actual: FilterTarget): boolean {
    if (typeof expected === "object") {
      return typeof actual === "object" && JSON.stringify(expected) === JSON.stringify(actual);
    }
    return expected === !!actual;
  }
}

export namespace NodeValidators {
  function validateBaseNodeAttributes(
    node: HierarchyNode,
    expectations: {
      label?: string | RegExp;
      autoExpand?: boolean;
      supportsFiltering?: boolean;
      filterTarget?: FilterTarget;
      extendedData?: { [key: string]: any };
      children?: ExpectedHierarchyDef[] | boolean;
    },
  ) {
    if (expectations.label) {
      const nodeLabel = node.label;
      if (typeof expectations.label === "string") {
        if (nodeLabel !== expectations.label) {
          throw new Error(`Expected node label to be "${expectations.label}", got "${nodeLabel}"`);
        }
      } else {
        if (!expectations.label.test(nodeLabel)) {
          throw new Error(`Expected node label to match "${expectations.label.toString()}", got "${nodeLabel}"`);
        }
      }
    }
    if (expectations.autoExpand !== undefined && !!node.autoExpand !== !!expectations.autoExpand) {
      throw new Error(
        `[${node.label}] Expected node's \`autoExpand\` flag to be ${optionalBooleanToString(expectations.autoExpand)}, got ${optionalBooleanToString(
          node.autoExpand,
        )}`,
      );
    }
    if (
      (HierarchyNode.isInstancesNode(node) || HierarchyNode.isCustom(node)) &&
      expectations.supportsFiltering !== undefined &&
      !!node.supportsFiltering !== !!expectations.supportsFiltering
    ) {
      throw new Error(
        `[${node.label}] Expected node's \`supportsFiltering\` flag to be ${optionalBooleanToString(
          expectations.supportsFiltering,
        )}, got ${optionalBooleanToString(node.supportsFiltering)}`,
      );
    }
    if (expectations.filterTarget !== undefined && !FilterTarget.areEqual(expectations.filterTarget, node.filtering?.filterTarget)) {
      throw new Error(
        `[${node.label}] Expected node's \`filtering.filterTarget\` to be ${FilterTarget.toString(
          expectations.filterTarget,
        )}, got ${FilterTarget.toString(node.filtering?.filterTarget)}`,
      );
    }
    if (expectations.extendedData !== undefined && !isDeepStrictEqual(node.extendedData, expectations.extendedData)) {
      throw new Error(
        `[${node.label}] Expected node's \`extendedData\` to be ${JSON.stringify(expectations.extendedData)}, got ${JSON.stringify(node.extendedData)}`,
      );
    }
    if (expectations.children !== undefined && hasChildren(expectations) !== hasChildren(node)) {
      throw new Error(`[${node.label}] Expected node to ${hasChildren(expectations) ? "" : "not "}have children but it does ${hasChildren(node) ? "" : "not"}`);
    }
  }

  export function createForCustomNode<TChildren extends ExpectedHierarchyDef[] | boolean>(
    expectedNode: Partial<Omit<NonGroupingHierarchyNode, "label" | "children" | "filtering">> & {
      label?: string;
      isFilterTarget?: boolean;
      extendedData?: { [key: string]: any };
      children?: TChildren;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
        if (HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a custom node, got a standard "${node.key.type}" one`);
        }
        if (expectedNode.key !== undefined && node.key !== expectedNode.key) {
          throw new Error(`[${node.label}] Expected a custom node, got "${JSON.stringify(node.key)}" one`);
        }
        validateBaseNodeAttributes(node, expectedNode);
      },
      children: expectedNode.children,
    };
  }

  export function createForInstanceNode<TChildren extends ExpectedHierarchyDef[] | boolean>(props: {
    instanceKeys?: InstanceKey[];
    label?: string | RegExp;
    autoExpand?: boolean;
    supportsFiltering?: boolean;
    filterTarget?: FilterTarget;
    extendedData?: { [key: string]: any };
    children?: TChildren;
  }) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected an instance node, got a non-standard "${node.key as string}"`);
        }
        if (!HierarchyNode.isInstancesNode(node)) {
          throw new Error(`[${node.label}] Expected an instance node, got "${node.key.type}"`);
        }
        if (
          props.instanceKeys &&
          (node.key.instanceKeys.length !== props.instanceKeys.length ||
            !node.key.instanceKeys.every((nk) => props.instanceKeys!.some((ek) => InstanceKey.equals(nk, ek))))
        ) {
          throw new Error(
            `[${node.label}] Expected node to represent instance keys ${JSON.stringify(props.instanceKeys)}, got ${JSON.stringify(node.key.instanceKeys)}`,
          );
        }
        validateBaseNodeAttributes(node, props);
      },
      children: props.children,
    };
  }

  export function createForClassGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(props: {
    className?: string;
    label?: string;
    autoExpand?: boolean;
    extendedData?: { [key: string]: any };
    children?: TChildren;
  }) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a class grouping node, got a non-standard "${node.key as string}"`);
        }
        if (!HierarchyNode.isClassGroupingNode(node)) {
          throw new Error(`[${node.label}] Expected a class grouping node, got "${node.key.type}"`);
        }
        if (props.className && node.key.className !== props.className) {
          throw new Error(`[${node.label}] Expected node to represent class "${props.className}", got "${node.key.className}"`);
        }
        validateBaseNodeAttributes(node, props);
      },
      children: props.children,
    };
  }

  export function createForLabelGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(props: {
    label?: string;
    groupId?: string;
    autoExpand?: boolean;
    extendedData?: { [key: string]: any };
    children?: TChildren;
  }) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a label grouping node, got a non-standard "${node.key as string}"`);
        }
        if (!HierarchyNode.isLabelGroupingNode(node)) {
          throw new Error(`[${node.label}] Expected a label grouping node, got "${node.key.type}"`);
        }
        if (props.label && node.key.label !== props.label) {
          throw new Error(`[${node.label}] Expected node to represent label "${props.label}", got "${node.key.label}"`);
        }
        if (props.groupId && node.key.groupId !== props.groupId) {
          throw new Error(`[${node.label}] Expected node to have groupId = ${JSON.stringify(props.groupId)}, got ${JSON.stringify(node.key.groupId)}`);
        }
        validateBaseNodeAttributes(node, props);
      },
      children: props.children,
    };
  }

  export function createForPropertyOtherValuesGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(props: {
    label?: string;
    autoExpand?: boolean;
    extendedData?: { [key: string]: any };
    children?: TChildren;
  }) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a property other values grouping node, got a non-standard "${node.key as string}"`);
        }
        if (node.key.type !== "property-grouping:other") {
          throw new Error(`[${node.label}] Expected a property other values grouping node, got "${node.key.type}"`);
        }
        validateBaseNodeAttributes(node, props);
      },
      children: props.children,
    };
  }

  export function createForPropertyValueRangeGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(props: {
    label?: string;
    propertyName?: string;
    propertyClassName?: string;
    fromValue?: number;
    toValue?: number;
    autoExpand?: boolean;
    extendedData?: { [key: string]: any };
    children?: TChildren;
  }) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a property value range grouping node, got a non-standard "${node.key as string}"`);
        }
        if (node.key.type !== "property-grouping:range") {
          throw new Error(`[${node.label}] Expected a property value range grouping node, got "${node.key.type}"`);
        }
        if (props.propertyName && node.key.propertyName !== props.propertyName) {
          throw new Error(`[${node.label}] Expected node to have property name "${props.propertyName}", got "${node.key.propertyName}"`);
        }
        if (props.propertyClassName && node.key.propertyClassName !== props.propertyClassName) {
          throw new Error(`[${node.label}] Expected node to have propertyClassName "${props.propertyClassName}", got "${node.key.propertyClassName}"`);
        }
        if (props.fromValue && node.key.fromValue !== props.fromValue) {
          throw new Error(`[${node.label}] Expected node to have fromValue "${props.fromValue}", got "${node.key.fromValue}"`);
        }
        if (props.toValue && node.key.toValue !== props.toValue) {
          throw new Error(`[${node.label}] Expected node to have toValue "${props.toValue}", got "${node.key.toValue}"`);
        }
        validateBaseNodeAttributes(node, props);
      },
      children: props.children,
    };
  }

  export function createForPropertyValueGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(props: {
    label?: string;
    propertyName?: string;
    propertyClassName?: string;
    formattedPropertyValue?: string;
    autoExpand?: boolean;
    extendedData?: { [key: string]: any };
    children?: TChildren;
  }) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a property value grouping node, got a non-standard "${node.key as string}"`);
        }
        if (node.key.type !== "property-grouping:value") {
          throw new Error(`[${node.label}] Expected a property value grouping node, got "${node.key.type}"`);
        }
        if (props.propertyName && node.key.propertyName !== props.propertyName) {
          throw new Error(`[${node.label}] Expected node to have property name "${props.propertyName}", got "${node.key.propertyName}"`);
        }
        if (props.propertyClassName && node.key.propertyClassName !== props.propertyClassName) {
          throw new Error(`[${node.label}] Expected node to have propertyClassName "${props.propertyClassName}", got "${node.key.propertyClassName}"`);
        }
        if (props.formattedPropertyValue && node.key.formattedPropertyValue !== props.formattedPropertyValue) {
          throw new Error(
            `[${node.label}] Expected node to have formattedPropertyValue "${props.formattedPropertyValue}", got "${node.key.formattedPropertyValue}"`,
          );
        }
        validateBaseNodeAttributes(node, props);
      },
      children: props.children,
    };
  }
}

export async function validateHierarchy(props: { provider: HierarchyProvider; parentNode?: HierarchyNode; expect: ExpectedHierarchyDef[] }) {
  const parentIdentifier = props.parentNode ? props.parentNode.label : "<root>";
  const nodes = await collect(props.provider.getNodes({ parentNode: props.parentNode }));
  Logger.logInfo(loggingNamespace, `Received ${nodes.length} child nodes for ${parentIdentifier}`);

  if (nodes.length !== props.expect.length) {
    const truncatedNodeLabels = `${nodes
      .slice(0, 3)
      .map((n) => n.label)
      .join(", ")}${nodes.length > 3 ? ", ..." : ""}`;
    throw new Error(
      `[${parentIdentifier}] Expected ${props.expect.length} ${props.parentNode ? "child" : "root"} nodes, got ${nodes.length}: [${truncatedNodeLabels}]`,
    );
  }

  const resultHierarchy = new Array<HierarchyDef<HierarchyNode>>();

  for (let i = 0; i < nodes.length; ++i) {
    const node = nodes[i];
    resultHierarchy.push({ node });

    const expectation = props.expect[i];
    expectation.node(node);

    if (Array.isArray(expectation.children)) {
      resultHierarchy[resultHierarchy.length - 1].children = await validateHierarchy({
        ...props,
        parentNode: node,
        expect: expectation.children,
      });
    }
  }

  return resultHierarchy;
}

export function validateHierarchyLevel(props: { nodes: HierarchyNode[]; expect: Array<Omit<ExpectedHierarchyDef, "children"> & { children?: boolean }> }) {
  const { nodes, expect } = props;
  if (nodes.length !== expect.length) {
    throw new Error(`Expected ${expect.length} nodes, got ${nodes.length}`);
  }
  for (let i = 0; i < nodes.length; ++i) {
    const expectation = expect[i];
    expectation.node(nodes[i]);
  }
}
