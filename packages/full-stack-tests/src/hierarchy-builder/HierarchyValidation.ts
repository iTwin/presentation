/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Logger } from "@itwin/core-bentley";
import { InstanceKey } from "@itwin/presentation-common";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { hasChildren } from "@itwin/presentation-hierarchy-builder/lib/cjs/hierarchy-builder/internal/Common";

const loggingNamespace = `Presentation.HierarchyBuilder.HierarchyValidation`;

export interface HierarchyDef<TNode> {
  node: TNode;
  children?: Array<HierarchyDef<TNode>> | boolean;
}

export type ExpectedHierarchyDef = HierarchyDef<(node: HierarchyNode) => void>;

export namespace NodeValidators {
  function optionalBooleanToString(value: boolean | undefined) {
    return value === undefined ? "undefined" : value ? "TRUE" : "FALSE";
  }
  function validateBaseNodeAttributes(
    node: HierarchyNode,
    expectations: {
      label?: string | RegExp;
      autoExpand?: boolean;
      supportsFiltering?: boolean;
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
    if (expectations.supportsFiltering !== undefined && !!node.supportsFiltering !== !!expectations.supportsFiltering) {
      throw new Error(
        `[${node.label}] Expected node's \`supportsFiltering\` flag to be ${optionalBooleanToString(
          expectations.supportsFiltering,
        )}, got ${optionalBooleanToString(node.supportsFiltering)}`,
      );
    }
    if (expectations.children !== undefined && hasChildren(expectations) !== hasChildren(node)) {
      throw new Error(`[${node.label}] Expected node to ${hasChildren(expectations) ? "" : "not "}have children but it does ${hasChildren(node) ? "" : "not"}`);
    }
  }

  export function createForCustomNode(
    expectedNode: Partial<Omit<HierarchyNode, "label" | "children">> & { label?: string; children?: ExpectedHierarchyDef[] | boolean },
  ): ExpectedHierarchyDef {
    return {
      node: (node) => {
        if (HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a custom node, got a standard "${node.key.type}" one`);
        }
        if (expectedNode.key !== undefined && node.key !== expectedNode.key) {
          throw new Error(`[${node.label}] Expected a custom node, got "${JSON.stringify(node.key)}" one`);
        }
        validateBaseNodeAttributes(node, {
          label: expectedNode.label,
          autoExpand: expectedNode.autoExpand,
          supportsFiltering: expectedNode.supportsFiltering,
          children: expectedNode.children,
        });
      },
      children: expectedNode.children,
    };
  }

  export function createForInstanceNode(props: {
    instanceKeys?: InstanceKey[];
    label?: string | RegExp;
    autoExpand?: boolean;
    supportsFiltering?: boolean;
    children?: ExpectedHierarchyDef[] | boolean;
  }): ExpectedHierarchyDef {
    return {
      node: (node) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected an instance node, got a non-standard "${node.key as string}"`);
        }
        if (!HierarchyNode.isInstancesNode(node)) {
          throw new Error(`[${node.label}] Expected an instance node, got "${node.key.type}"`);
        }
        if (
          props.instanceKeys &&
          (node.key.instanceKeys.length !== props.instanceKeys.length ||
            !node.key.instanceKeys.every((nk) => props.instanceKeys!.some((ek) => 0 === InstanceKey.compare(nk, ek))))
        ) {
          throw new Error(
            `[${node.label}] Expected node to represent instance keys ${JSON.stringify(props.instanceKeys)}, got ${JSON.stringify(node.key.instanceKeys)}`,
          );
        }
        validateBaseNodeAttributes(node, {
          label: props.label,
          autoExpand: props.autoExpand,
          supportsFiltering: props.supportsFiltering,
          children: props.children,
        });
      },
      children: props.children,
    };
  }

  export function createForClassGroupingNode(props: {
    className?: string;
    label?: string;
    autoExpand?: boolean;
    children?: ExpectedHierarchyDef[] | boolean;
  }): ExpectedHierarchyDef {
    return {
      node: (node) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a class grouping node, got a non-standard "${node.key as string}"`);
        }
        if (!HierarchyNode.isClassGroupingNode(node)) {
          throw new Error(`[${node.label}] Expected a class grouping node, got "${node.key.type}"`);
        }
        if (props.className && node.key.class.name !== props.className) {
          throw new Error(`[${node.label}] Expected node to represent class "${props.className}", got "${node.key.class.name}"`);
        }
        validateBaseNodeAttributes(node, {
          label: props.label,
          autoExpand: props.autoExpand,
          children: props.children,
        });
      },
      children: props.children,
    };
  }

  export function createForLabelGroupingNode(props: {
    label?: string;
    autoExpand?: boolean;
    children?: ExpectedHierarchyDef[] | boolean;
  }): ExpectedHierarchyDef {
    return {
      node: (node) => {
        if (!HierarchyNode.isStandard(node)) {
          throw new Error(`[${node.label}] Expected a label grouping node, got a non-standard "${node.key as string}"`);
        }
        if (!HierarchyNode.isLabelGroupingNode(node)) {
          throw new Error(`[${node.label}] Expected a label grouping node, got "${node.key.type}"`);
        }
        if (props.label && node.key.label !== props.label) {
          throw new Error(`[${node.label}] Expected node to represent label "${props.label}", got "${node.key.label}"`);
        }
        validateBaseNodeAttributes(node, {
          label: props.label,
          autoExpand: props.autoExpand,
          children: props.children,
        });
      },
      children: props.children,
    };
  }
}

export async function validateHierarchy(props: { provider: HierarchyProvider; parentNode?: HierarchyNode; expect: ExpectedHierarchyDef[] }) {
  const parentIdentifier = props.parentNode ? props.parentNode.label : "<root>";
  const nodes = await props.provider.getNodes({ parentNode: props.parentNode });
  Logger.logInfo(loggingNamespace, `Received ${nodes.length} child nodes for ${parentIdentifier}`);

  if (nodes.length !== props.expect.length) {
    throw new Error(`[${parentIdentifier}] Expected ${props.expect.length} ${props.parentNode ? "child" : "root"} nodes, got ${nodes.length}`);
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
