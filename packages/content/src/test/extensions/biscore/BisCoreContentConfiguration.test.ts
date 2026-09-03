/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createBisCoreContentConfiguration } from "../../../content/extensions/biscore/BisCoreContentConfiguration.js";
import { createBisCoreDescriptorTransformers } from "../../../content/extensions/biscore/BisCoreDescriptorTransformers.js";
import { createBisCoreFieldsProviders } from "../../../content/extensions/biscore/BisCoreFieldsProviders.js";

describe("createBisCoreContentConfiguration", () => {
  it("returns the BisCore fields providers and descriptor transformers", () => {
    const config = createBisCoreContentConfiguration();
    expect(config.imodelFieldsProviders?.map((provider) => provider.id)).to.deep.equal(
      createBisCoreFieldsProviders().map((provider) => provider.id),
    );
    expect(config.descriptorTransformers).to.deep.equal(createBisCoreDescriptorTransformers());
  });

  it("does not configure external fields providers or query filterers", () => {
    const config = createBisCoreContentConfiguration();
    expect(config.externalFieldsProviders).to.be.undefined;
    expect(config.queryFilterers).to.be.undefined;
  });
});
