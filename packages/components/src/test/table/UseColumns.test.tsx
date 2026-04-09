/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeySet } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { useColumns } from "../../presentation-components/table/UseColumns.js";
import { createTestECInstanceKey, TestErrorBoundary } from "../_helpers/Common.js";
import {
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../_helpers/Content.js";
import { createMocked, render, renderHook, waitFor } from "../TestUtils.js";

import type { Mocked } from "vitest";
import type { IModelConnection } from "@itwin/core-frontend";
import type { UseColumnsProps } from "../../presentation-components/table/UseColumns.js";

describe("useColumns", () => {
  const imodel = {} as IModelConnection;
  const initialProps: UseColumnsProps = {
    imodel,
    keys: new KeySet([createTestECInstanceKey()]),
    ruleset: "ruleset_id",
  };

  let presentationManager: Mocked<PresentationManager>;

  beforeEach(() => {
    presentationManager = createMocked(PresentationManager);
    vi.spyOn(Presentation, "presentation", "get").mockReturnValue(presentationManager);
  });

  it("loads columns", async () => {
    const contentField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [],
    });
    presentationManager.getContentDescriptor.mockResolvedValue(createTestContentDescriptor({ fields: [contentField] }));

    const { result } = renderHook((props) => useColumns(props), { initialProps });

    await waitFor(() => {
      expect(result.current).toMatchObject([
        { name: contentField.name, label: contentField.label, field: contentField },
      ]);
    });
  });

  it("loads columns only for properties fields", async () => {
    const propertyField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [],
    });
    const nestedField = createTestPropertiesContentField({
      name: "nested_field",
      label: "Nested Field",
      properties: [],
    });
    const nestingField = createTestNestedContentField({
      name: "nesting_field",
      label: "Nesting Field",
      nestedFields: [nestedField],
    });
    presentationManager.getContentDescriptor.mockResolvedValue(
      createTestContentDescriptor({ fields: [propertyField, nestingField] }),
    );

    const { result } = renderHook((props) => useColumns(props), { initialProps });

    await waitFor(() => {
      expect(result.current).toMatchObject([
        { name: propertyField.name, label: propertyField.label, field: propertyField },
      ]);
    });
  });

  it("returns empty column list if no keys provided", async () => {
    const propertyField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [],
    });
    presentationManager.getContentDescriptor.mockResolvedValue(
      createTestContentDescriptor({ fields: [propertyField] }),
    );

    const { result } = renderHook((props) => useColumns(props), {
      initialProps: { ...initialProps, keys: new KeySet() },
    });

    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it("returns empty column list if content descriptor was not loaded", async () => {
    presentationManager.getContentDescriptor.mockResolvedValue(undefined);

    const { result } = renderHook((props) => useColumns(props), { initialProps });

    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it("throws in React render loop on failure to get content descriptor", async () => {
    // stub console error to avoid warnings/errors in console
    const consoleErrorStub = vi.spyOn(console, "error").mockImplementation(() => {});
    presentationManager.getContentDescriptor.mockResolvedValue(undefined).mockRejectedValue(new Error("test error"));

    const errorSpy = vi.fn();
    function TestComponent() {
      useColumns(initialProps);
      return null;
    }
    render(
      <TestErrorBoundary onError={errorSpy}>
        <TestComponent />
      </TestErrorBoundary>,
    );

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledOnce();
      const [error] = errorSpy.mock.calls[0];
      expect((error as Error).message).toBe("test error");
    });
    consoleErrorStub.mockRestore();
  });
});
