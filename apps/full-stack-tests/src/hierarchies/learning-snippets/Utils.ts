/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";

interface NodeDefinition {
  label: string;
  children?: NodeDefinition[];
}
export async function collectHierarchy(provider: HierarchyProvider, parentNode?: HierarchyNode) {
  const result = new Array<NodeDefinition>();
  const nodes = await collect(provider.getNodes({ parentNode }));
  for (const node of nodes) {
    const def: NodeDefinition = { label: node.label };
    if (node.children) {
      def.children = await collectHierarchy(provider, node);
    }
    result.push(def);
  }
  return result;
}
