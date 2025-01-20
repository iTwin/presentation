/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { describe } from "mocha";
import { createStorage } from "@itwin/unified-selection";
import { renderHook } from "@testing-library/react";
import { UnifiedSelectionContextProvider, useUnifiedSelectionContext } from "../unified-selection-react/UnifiedSelectionContext.js";

describe("useUnifiedSelectionContext", () => {
  const storage = createStorage();

  it("returns `undefined` if context is not provided", () => {
    const { result } = renderHook(useUnifiedSelectionContext);
    expect(result.current).to.be.undefined;
  });

  it("returns provided context", () => {
    const { result } = renderHook(useUnifiedSelectionContext, {
      wrapper: (props) => <UnifiedSelectionContextProvider storage={storage}>{props.children}</UnifiedSelectionContextProvider>,
    });
    expect(result.current?.storage).to.eq(storage);
  });
});
