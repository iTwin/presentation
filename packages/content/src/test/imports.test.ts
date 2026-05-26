/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { it } from "vitest";

// The following files don't have any testable code, but we need to import them to make sure vitest
// counts them as covered by tests.
it("Import non-testable modules", async () => {
  await import("../content/extensions/BaseFieldsProvider.js");
  await import("../content/extensions/DescriptorTransformer.js");
  await import("../content/extensions/ExternalFieldsProvider.js");
  await import("../content/extensions/IModelFieldsProvider.js");
  await import("../content/extensions/QueryFilterer.js");
});
