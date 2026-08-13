/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { Localization } from "@itwin/core-common";
import { Presentation } from "@itwin/presentation-frontend";
import { LOCALIZATION_NAMESPACE } from "../../presentation-components/common/LocalizedStrings.js";
import { translate } from "../../presentation-components/common/Utils.js";

describe("translate", () => {
  it("prepends the versioned namespace to the string id", () => {
    const getLocalizedString = vi.fn((key: string) => key);
    vi.spyOn(Presentation, "localization", "get").mockReturnValue({ getLocalizedString } as unknown as Localization);

    const result = translate("tree.filter-hierarchy-level");

    expect(getLocalizedString).toHaveBeenCalledWith(`${LOCALIZATION_NAMESPACE}:tree.filter-hierarchy-level`, undefined);
    expect(result).toEqual(`${LOCALIZATION_NAMESPACE}:tree.filter-hierarchy-level`);
  });
});
