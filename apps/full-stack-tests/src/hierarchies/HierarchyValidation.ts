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
  GroupingHierarchyNode,
  HierarchyNode,
  HierarchyNodeKey,
  HierarchyProvider,
  HierarchySearchPathOptions,
  InstancesNodeKey,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import { ArrayElement, InstanceKey, OmitOverUnion } from "@itwin/presentation-shared";

const loggingNamespace = `Presentation.HierarchyBuilder.HierarchyValidation`;

type IModelInstanceKey = ArrayElement<InstancesNodeKey["instanceKeys"]>;

export interface HierarchyDef {
  node: HierarchyNode;
  children?: Array<HierarchyDef>;
}

export type ExpectedHierarchyDef = {
  node: (node: HierarchyNode) => void;
} & (
  | {
      children?: Array<ExpectedHierarchyDef> | boolean;
    }
  | {
      childrenUnordered?: Array<ExpectedHierarchyDef>;
    }
);

function optionalBooleanToString(value: boolean | undefined) {
  return value === undefined ? "undefined" : value ? "TRUE" : "FALSE";
}

type BaseNodeExpectations = {
  label?: string | RegExp;
  autoExpand?: boolean;
  extendedData?: { [key: string]: any };
} & OmitOverUnion<ExpectedHierarchyDef, "node">;

type NonGroupingNodeExpectations = BaseNodeExpectations & {
  supportsFiltering?: boolean;
  isSearchTarget?: boolean;
  searchTargetOptions?: HierarchySearchPathOptions;
};

type GroupingNodeExpectations = BaseNodeExpectations & {
  groupedInstanceKeys?: IModelInstanceKey[];
};

export namespace NodeValidators {
  function toComparableInstanceKey(k: IModelInstanceKey) {
    return `${k.className}|${k.id}|${k.imodelKey ?? ""}`;
  }

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
    if (expectations.extendedData !== undefined && !isDeepStrictEqual(node.extendedData, expectations.extendedData)) {
      throw new Error(
        `[${node.label}] Expected node's \`extendedData\` to be ${JSON.stringify(expectations.extendedData)}, got ${JSON.stringify(node.extendedData)}`,
      );
    }
    if ("children" in expectations && expectations.children !== undefined && hasChildren(expectations) !== hasChildren(node)) {
      throw new Error(`[${node.label}] Expected node to ${hasChildren(expectations) ? "" : "not "}have children but it does ${hasChildren(node) ? "" : "not"}`);
    }
    if ("childrenOrdered" in expectations && expectations.childrenOrdered !== undefined && hasChildren(expectations) !== hasChildren(node)) {
      throw new Error(`[${node.label}] Expected node to ${hasChildren(expectations) ? "" : "not "}have children but it does ${hasChildren(node) ? "" : "not"}`);
    }
  }

  function validateNonGroupingNodeAttributes(node: NonGroupingHierarchyNode, expectations: NonGroupingNodeExpectations) {
    validateBaseNodeAttributes(node, expectations);
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
    if (expectations.isSearchTarget !== undefined && expectations.isSearchTarget !== !!node.search?.isSearchTarget) {
      throw new Error(
        `[${node.label}] Expected node's \`search.isSearchTarget\` to be ${optionalBooleanToString(
          expectations.isSearchTarget,
        )}, got ${optionalBooleanToString(node.search?.isSearchTarget)}`,
      );
    }
    if (expectations.searchTargetOptions !== undefined) {
      assert(node.search?.isSearchTarget, `[${node.label}] Expected node to be a search target`);
      expect(node.search.searchTargetOptions).to.deep.eq(
        expectations.searchTargetOptions,
        `[${node.label}] Nodes's 'search.searchTargetOptions' flag property doesn't match the expectation.`,
      );
    }
  }

  function validateGroupingNodeAttributes(node: GroupingHierarchyNode, expectations: GroupingNodeExpectations) {
    validateBaseNodeAttributes(node, expectations);
    if (expectations.groupedInstanceKeys !== undefined) {
      const actual = node.groupedInstanceKeys.map(toComparableInstanceKey).sort();
      const expected = expectations.groupedInstanceKeys.map(toComparableInstanceKey).sort();
      if (actual.length !== expected.length || !actual.every((v, i) => v === expected[i])) {
        throw new Error(
          `[${node.label}] Expected node's \`groupedInstanceKeys\` to be ${JSON.stringify(expectations.groupedInstanceKeys)}, got ${JSON.stringify(
            node.groupedInstanceKeys,
          )}`,
        );
      }
    }
  }

  export function createForGenericNode(
    props: Partial<Omit<NonGroupingHierarchyNode, "label" | "children" | "search" | "key">> &
      NonGroupingNodeExpectations & {
        key?: string | GenericNodeKey;
        label?: string;
      },
  ) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isGeneric(node)) {
          throw new Error(`[${node.label}] Expected a generic node, got a standard "${node.key.type}" one`);
        }
        if (props.key !== undefined) {
          if (typeof props.key === "string" && node.key.id !== props.key) {
            throw new Error(`[${node.label}] Expected a generic node with id "${props.key}", got "${node.key.id}"`);
          }
          if (typeof props.key === "object" && !HierarchyNodeKey.equals(node.key, props.key.source ? props.key : { ...props.key, source: node.key.source })) {
            throw new Error(`[${node.label}] Expected a generic node with attributes "${JSON.stringify(props.key)}", got "${JSON.stringify(node.key)}"`);
          }
        }
        validateNonGroupingNodeAttributes(node, props);
      },
      ...("children" in props ? { children: props.children } : undefined),
      ...("childrenUnordered" in props ? { childrenUnordered: props.childrenUnordered } : undefined),
    };
  }

  export function createForInstanceNode(
    props: NonGroupingNodeExpectations & {
      instanceKeys?: IModelInstanceKey[];
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
        validateNonGroupingNodeAttributes(node, props);
      },
      ...("children" in props ? { children: props.children } : undefined),
      ...("childrenUnordered" in props ? { childrenUnordered: props.childrenUnordered } : undefined),
    };
  }

  export function createForClassGroupingNode(
    props: GroupingNodeExpectations & {
      className?: string;
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
        validateGroupingNodeAttributes(node, props);
      },
      ...("children" in props ? { children: props.children } : undefined),
      ...("childrenUnordered" in props ? { childrenUnordered: props.childrenUnordered } : undefined),
    };
  }

  export function createForLabelGroupingNode(
    props: GroupingNodeExpectations & {
      label?: string;
      groupId?: string;
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
        validateGroupingNodeAttributes(node, props);
      },
      ...("children" in props ? { children: props.children } : undefined),
      ...("childrenUnordered" in props ? { childrenUnordered: props.childrenUnordered } : undefined),
    };
  }

  export function createForPropertyOtherValuesGroupingNode(props: GroupingNodeExpectations) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isPropertyOtherValuesGroupingNode(node)) {
          throw new Error(`[${node.label}] Expected a property other values grouping node, got "${node.key.type}"`);
        }
        validateGroupingNodeAttributes(node, props);
      },
      ...("children" in props ? { children: props.children } : undefined),
      ...("childrenUnordered" in props ? { childrenUnordered: props.childrenUnordered } : undefined),
    };
  }

  export function createForPropertyValueRangeGroupingNode(
    props: GroupingNodeExpectations & {
      propertyName?: string;
      propertyClassName?: string;
      fromValue?: number;
      toValue?: number;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isPropertyValueRangeGroupingNode(node)) {
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
        validateGroupingNodeAttributes(node, props);
      },
      ...("children" in props ? { children: props.children } : undefined),
      ...("childrenUnordered" in props ? { childrenUnordered: props.childrenUnordered } : undefined),
    };
  }

  export function createForPropertyValueGroupingNode(
    props: GroupingNodeExpectations & {
      propertyName?: string;
      propertyClassName?: string;
      formattedPropertyValue?: string;
    },
  ) {
    return {
      node: (node: HierarchyNode) => {
        if (!HierarchyNode.isPropertyValueGroupingNode(node)) {
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
        validateGroupingNodeAttributes(node, props);
      },
      ...("children" in props ? { children: props.children } : undefined),
      ...("childrenUnordered" in props ? { childrenUnordered: props.childrenUnordered } : undefined),
    };
  }

  function hasChildren<TNode extends { children?: boolean | Array<unknown> } | { childrenUnordered?: Array<unknown> }>(node: TNode) {
    return (
      ("children" in node && (node.children === true || (Array.isArray(node.children) && node.children.length > 0))) ||
      ("childrenUnordered" in node && Array.isArray(node.childrenUnordered) && node.childrenUnordered.length > 0)
    );
  }
}

type ValidateHierarchyProps = {
  provider: HierarchyProvider;
  parentNode?: HierarchyNode;
} & (
  | {
      expect: ExpectedHierarchyDef[];
    }
  | {
      expectUnordered: ExpectedHierarchyDef[];
    }
);
export async function validateHierarchy(props: ValidateHierarchyProps) {
  const parentIdentifier = props.parentNode ? props.parentNode.label : "<root>";
  const nodes = await collect(props.provider.getNodes({ parentNode: props.parentNode }));
  Logger.logInfo(loggingNamespace, `Received ${nodes.length} child nodes for ${parentIdentifier}`);

  const expectLength = "expect" in props ? props.expect.length : props.expectUnordered.length;
  if (nodes.length !== expectLength) {
    const truncatedNodeLabels = `${nodes
      .slice(0, 3)
      .map((n) => n.label)
      .join(", ")}${nodes.length > 3 ? ", ..." : ""}`;
    throw new Error(
      `[${parentIdentifier}] Expected ${expectLength} ${props.parentNode ? "child" : "root"} nodes, got ${nodes.length}: [${truncatedNodeLabels}]`,
    );
  }

  const nodeValidator =
    "expect" in props
      ? new OrderedNodeValidator(props.provider, props.expect)
      : new UnorderedNodeValidator(props.provider, parentIdentifier, props.expectUnordered);

  const resultHierarchy = new Array<HierarchyDef>();
  for (let i = 0; i < nodes.length; ++i) {
    const node = nodes[i];
    resultHierarchy.push(await nodeValidator.validate(node, i));
  }
  return resultHierarchy;
}

export function validateHierarchyLevel(props: { nodes: HierarchyNode[]; expect: Array<Pick<ExpectedHierarchyDef, "node">> }) {
  const { nodes, expect: expectations } = props;
  if (props.nodes.length !== props.expect.length) {
    throw new Error(`Expected ${expectations.length} nodes, got ${nodes.length}`);
  }
  for (let i = 0; i < nodes.length; ++i) {
    const expectation = expectations[i];
    expectation.node(nodes[i]);
  }
}

async function validateNodeChildren({
  provider,
  parentNode,
  expectation,
}: {
  provider: HierarchyProvider;
  parentNode: HierarchyNode;
  expectation: ExpectedHierarchyDef;
}) {
  if ("children" in expectation && Array.isArray(expectation.children)) {
    return validateHierarchy({
      provider,
      parentNode,
      expect: expectation.children,
    });
  }
  if ("childrenUnordered" in expectation && Array.isArray(expectation.childrenUnordered)) {
    return validateHierarchy({
      provider,
      parentNode,
      expectUnordered: expectation.childrenUnordered,
    });
  }
  return undefined;
}

class OrderedNodeValidator {
  public constructor(
    private _provider: HierarchyProvider,
    private _expectations: ExpectedHierarchyDef[],
  ) {}
  public async validate(node: HierarchyNode, index: number): Promise<HierarchyDef> {
    const expectation = this._expectations[index];
    expectation.node(node);
    const children = await validateNodeChildren({ provider: this._provider, parentNode: node, expectation });
    return { node, children };
  }
}

class UnorderedNodeValidator {
  public constructor(
    private _provider: HierarchyProvider,
    private _parentIdentifier: string,
    private _expectations: ExpectedHierarchyDef[],
  ) {}
  public async validate(node: HierarchyNode, index: number): Promise<HierarchyDef> {
    const matchIndex = this._expectations.findIndex((expectation) => {
      try {
        expectation.node(node);
        return true;
      } catch {
        return false;
      }
    });
    if (matchIndex === -1) {
      throw new Error(`[${this._parentIdentifier}] None of the children expectations matched the actual node "${node.label}" at index ${index}.`);
    }
    const matchedExpectation = this._expectations.splice(matchIndex, 1);
    const children = await validateNodeChildren({ provider: this._provider, parentNode: node, expectation: matchedExpectation[0] });
    return { node, children };
  }
}
