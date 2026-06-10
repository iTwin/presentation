/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { SchemaView } from "@itwin/ecschema-metadata";
import { createECSchemaProvider } from "../core-interop/Metadata.js";

import type { Schema as CoreSchema, SchemaKey } from "@itwin/ecschema-metadata";

describe("createECSchemaProvider", () => {
  it("dispatches to SchemaContext provider when given a schema context", async () => {
    const schemaContext = {
      getSchema: vi.fn<(key: SchemaKey) => Promise<CoreSchema | undefined>>().mockResolvedValue(undefined),
    };
    const provider = createECSchemaProvider(schemaContext);
    await provider.getSchema("test");
    expect(schemaContext.getSchema).toHaveBeenCalledOnce();
  });

  it("dispatches to SchemaView provider when given a SchemaView instance", async () => {
    const sv: SchemaView = Object.create(SchemaView.prototype);
    const getSchemaSpy = vi.spyOn(sv, "getSchema").mockReturnValue(undefined);
    const provider = createECSchemaProvider(sv);
    await provider.getSchema("test");
    expect(getSchemaSpy).toHaveBeenCalledOnce();
  });
});
