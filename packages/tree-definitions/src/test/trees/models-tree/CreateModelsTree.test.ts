/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { createModelsTree } from "../../../tree-definitions/trees/models-tree/CreateModelsTree.js";
import { ModelsTreeDefinition } from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";

describe("createModelsTree", () => {
  const imodelAccess = {
    createQueryReader: () => createAsyncIterator([]),
    getSchema: async () => undefined,
    getHiddenClassesTree: async () => [],
    classDerivesFrom: () => false,
  };

  it("passes tree props to instance key paths search", async () => {
    const pathsSearch = vi
      .spyOn(ModelsTreeDefinition, "createInstanceKeyPaths")
      .mockImplementation(() => createAsyncIterator([]));
    const tree = createModelsTree({ imodelAccess, uniqueId: "test-id" });
    await collect(tree.createInstanceKeyPaths({ targetItems: [], limit: 5 }));
    expect(pathsSearch).toHaveBeenCalledWith(
      expect.objectContaining({ targetItems: [], limit: 5, uniqueId: "test-id", imodelAccess }),
    );
  });
});
