/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { collect } from "presentation-test-utilities";
import { isDeepStrictEqual } from "util";
import { Logger } from "@itwin/core-bentley";
import {
  GenericNodeKey,
  GroupingNodeKey,
  HierarchyNode,
  HierarchyNodeKey,
  HierarchyProvider,
  InstancesNodeKey,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import { ArrayElement, InstanceKey } from "@itwin/presentation-shared";

const loggingNamespace = `Presentation.HierarchyBuilder.HierarchyValidation`;

type IModelInstanceKey = ArrayElement<InstancesNodeKey["instanceKeys"]>;

export interface HierarchyDef<TNode> {
  node: TNode;
  children?: Array<HierarchyDef<TNode>> | boolean;
}

export type ExpectedHierarchyDef = HierarchyDef<(node: HierarchyNode) => void>;

function optionalBooleanToString(value: boolean | undefined) {
  return value === undefined ? "undefined" : value ? "TRUE" : "FALSE";
}

interface BaseNodeExpectations {
  label?: string | RegExp;
  autoExpand?: boolean;
  supportsFiltering?: boolean;
  isFilterTarget?: boolean;
  filterTargetOptions?: {
    autoExpand?: { key: GroupingNodeKey; depth: number };
  };
  extendedData?: { [key: string]: any };
  children?: ExpectedHierarchyDef[] | boolean;
}

export namespace NodeValidators {
  function validateBaseNodeAttributes(node: HierarchyNode, expectations: BaseNodeExpectations) {
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
      (HierarchyNode.isInstancesNode(node) || HierarchyNode.isGeneric(node)) &&
      expectations.supportsFiltering !== undefined &&
      !!node.supportsFiltering !== !!expectations.supportsFiltering
    ) {
      throw new Error(
        `[${node.label}] Expected node's \`supportsFiltering\` flag to be ${optionalBooleanToString(
          expectations.supportsFiltering,
        )}, got ${optionalBooleanToString(node.supportsFiltering)}`,
      );
    }
    if (expectations.isFilterTarget !== undefined && expectations.isFilterTarget !== !!node.filtering?.isFilterTarget) {
      throw new Error(
        `[${node.label}] Expected node's \`filtering.isFilterTarget\` to be ${optionalBooleanToString(
          expectations.isFilterTarget,
        )}, got ${optionalBooleanToString(node.filtering?.isFilterTarget)}`,
      );
    }
    if (expectations.filterTargetOptions !== undefined) {
      assert(node.filtering?.isFilterTarget, `[${node.label}] Expected node to be a filter target`);
      expect(node.filtering.filterTargetOptions).to.deep.eq(
        expectations.filterTargetOptions,
        `[${node.label}] Nodes's 'filtering.filterTargetOptions' flag property doesn't match the expectation.`,
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

  export function createForGenericNode<TChildren extends ExpectedHierarchyDef[] | boolean>(
    expectedNode: Partial<Omit<NonGroupingHierarchyNode, "label" | "children" | "filtering" | "key">> &
      BaseNodeExpectations & {
        key?: string | GenericNodeKey;
        label?: string;
        children?: TChildren;
      },
  ) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isGeneric(node)) {
          throw new Error(`[${node.label}] Expected a generic node, got a standard "${node.key.type}" one`);
        }
        if (expectedNode.key !== undefined) {
          if (typeof expectedNode.key === "string" && node.key.id !== expectedNode.key) {
            throw new Error(`[${node.label}] Expected a generic node with id "${expectedNode.key}", got "${node.key.id}"`);
          }
          if (
            typeof expectedNode.key === "object" &&
            !HierarchyNodeKey.equals(node.key, expectedNode.key.source ? expectedNode.key : { ...expectedNode.key, source: node.key.source })
          ) {
            throw new Error(`[${node.label}] Expected a generic node with attributes "${JSON.stringify(expectedNode.key)}", got "${JSON.stringify(node.key)}"`);
          }
        }
        validateBaseNodeAttributes(node, expectedNode);
      },
      children: expectedNode.children,
    };
  }

  export function createForInstanceNode<TChildren extends ExpectedHierarchyDef[] | boolean>(
    props: BaseNodeExpectations & {
      instanceKeys?: IModelInstanceKey[];
      children?: TChildren;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isInstancesNode(node)) {
          throw new Error(`[${node.label}] Expected an instance node, got "${node.key.type}"`);
        }
        if (
          props.instanceKeys &&
          (node.key.instanceKeys.length !== props.instanceKeys.length ||
            !node.key.instanceKeys.every((nk) =>
              props.instanceKeys!.some((ek) => InstanceKey.equals(nk, ek) && (!ek.imodelKey || ek.imodelKey === nk.imodelKey)),
            ))
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

  export function createForClassGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(
    props: BaseNodeExpectations & {
      className?: string;
      children?: TChildren;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
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

  export function createForLabelGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(
    props: BaseNodeExpectations & {
      label?: string;
      groupId?: string;
      children?: TChildren;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
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

  export function createForPropertyOtherValuesGroupingNode(props: BaseNodeExpectations) {
    return {
      node: (node: HierarchyNode) => {
        if (node.key.type !== "property-grouping:other") {
          throw new Error(`[${node.label}] Expected a property other values grouping node, got "${node.key.type}"`);
        }
        validateBaseNodeAttributes(node, props);
      },
      children: props.children,
    };
  }

  export function createForPropertyValueRangeGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(
    props: BaseNodeExpectations & {
      propertyName?: string;
      propertyClassName?: string;
      fromValue?: number;
      toValue?: number;
      children?: TChildren;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
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

  export function createForPropertyValueGroupingNode<TChildren extends ExpectedHierarchyDef[] | boolean>(
    props: BaseNodeExpectations & {
      propertyName?: string;
      propertyClassName?: string;
      formattedPropertyValue?: string;
      children?: TChildren;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
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

  function hasChildren<TNode extends { children?: boolean | Array<unknown> }>(node: TNode) {
    return node.children === true || (Array.isArray(node.children) && node.children.length > 0);
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
  const { nodes, expect: expectations } = props;
  if (props.nodes.length !== props.expect.length) {
    throw new Error(`Expected ${expectations.length} nodes, got ${nodes.length}`);
  }
  for (let i = 0; i < nodes.length; ++i) {
    const expectation = expectations[i];
    expectation.node(nodes[i]);
  }
}
