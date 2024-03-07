/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { iModels } from "../Datasets";
import { StatelessHierarchyProvider } from "../StatelessHierarchyProvider";

describe("stateless hierarchy", () => {
  it("loads initial hierarchy", async () => {
    const iModel = iModels.get("Baytown.bim")!;
    const provider = new StatelessHierarchyProvider(iModel);
    await provider.loadInitialHierarchy();
  });

  it("loads full hierarchy", async () => {
    const iModel = iModels.get("Baytown.bim")!;
    const provider = new StatelessHierarchyProvider(iModel);
    await provider.loadFullHierarchy();
  });
});
