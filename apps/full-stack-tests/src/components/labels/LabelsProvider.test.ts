/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IModelConnection } from "@itwin/core-frontend";
import { PresentationLabelsProvider } from "@itwin/presentation-components";
import { initialize, terminate } from "../../IntegrationTests.js";
import { TestIModelConnection } from "../../TestIModelSetup.js";

describe("LabelsProvider", async () => {
  let imodel: IModelConnection;
  let provider: PresentationLabelsProvider;

  beforeAll(async () => {
    await initialize();
    const testIModelName: string = "assets/datasets/Properties_60InstancesWithUrl2.ibim";
    imodel = TestIModelConnection.openFile(testIModelName);
    provider = new PresentationLabelsProvider({ imodel });
  });

  afterAll(async () => {
    await imodel.close();
    await terminate();
  });

  describe("getLabel", () => {
    it("returns correct label", async () => {
      const props = (await imodel.models.queryProps({ from: "bis.PhysicalModel" }))[0];
      const label = await provider.getLabel({ className: props.classFullName, id: props.id! });
      expect(label).toMatchSnapshot();
    });
  });

  describe("getLabels", () => {
    it("returns empty array for empty keys list", async () => {
      const labels = await provider.getLabels([]);
      expect(labels).toEqual([]);
    });

    it("returns model labels", async () => {
      const props = await imodel.models.queryProps({ from: "bis.Model", where: "ECInstanceId <> 1", only: false });
      const labels = await provider.getLabels(props.map((p) => ({ className: p.classFullName, id: p.id! })));
      expect(labels).toMatchSnapshot();
    });
  });
});
