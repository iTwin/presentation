/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { HierarchyNode, HierarchyNodeKey, HierarchyProvider } from "@itwin/presentation-hierarchies";

interface NodeDefinition {
  nodeType: HierarchyNodeKey["type"];
  label: string;
  children?: NodeDefinition[];
  autoExpand?: boolean;
}

export async function collectHierarchy(provider: HierarchyProvider, parentNode?: HierarchyNode) {
  const result = new Array<NodeDefinition>();
  const nodes = await collect(provider.getNodes({ parentNode }));
  for (const node of nodes) {
    const def: NodeDefinition = {
      nodeType: node.key.type,
      label: node.label,
      ...(node.autoExpand === undefined ? undefined : { autoExpand: node.autoExpand }),
    };

    if (node.children) {
      def.children = await collectHierarchy(provider, node);
    }
    result.push(def);
  }
  return result;
}
