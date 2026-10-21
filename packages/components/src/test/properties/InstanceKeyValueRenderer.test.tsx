/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { TypeConverter, TypeConverterManager } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation, SelectionManager } from "@itwin/presentation-frontend";
import { UnifiedSelectionContextProvider } from "@itwin/unified-selection-react";
import { InstanceKeyValueRenderer } from "../../presentation-components/properties/InstanceKeyValueRenderer.js";
import { UnifiedSelectionContextProvider as UnifiedSelectionContextProviderDeprecated } from "../../presentation-components/unified-selection/UnifiedSelectionContext.js";
import { act, render, waitFor } from "../TestUtils.js";

import type { Primitives, PrimitiveValue, PropertyValue } from "@itwin/appui-abstract";
import type { IModelConnection } from "@itwin/core-frontend";
import type { SelectionStorage } from "@itwin/unified-selection";
import type { WithIModelKey } from "../../presentation-components/common/Utils.js";

describe("InstanceKeyValueRenderer", () => {
  const renderer = new InstanceKeyValueRenderer();

  function createPrimitiveValue(value?: Primitives.Value, displayValue?: string): PrimitiveValue {
    return { valueFormat: PropertyValueFormat.Primitive, value, displayValue };
  }

  function createNavigationPropertyRecord(value: PropertyValue): WithIModelKey<PropertyRecord> {
    return new PropertyRecord(value, { name: "", displayLabel: "", typename: "navigation" });
  }

  beforeAll(() => {
    const localization = new EmptyLocalization();
    vi.spyOn(IModelApp, "initialized", "get").mockReturnValue(true);
    vi.spyOn(IModelApp, "localization", "get").mockReturnValue(localization);
    vi.spyOn(Presentation, "localization", "get").mockReturnValue(localization);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  describe("canRender", () => {
    it("returns true if value is primitive and undefined", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue());
      expect(renderer.canRender(record)).toBe(true);
    });

    it("returns true if value is primitive instance key", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue({ className: "", id: "" }));
      expect(renderer.canRender(record)).toBe(true);
    });

    it("returns false if value is not primitive", () => {
      const record = createNavigationPropertyRecord({ valueFormat: PropertyValueFormat.Struct, members: {} });
      expect(renderer.canRender(record)).toBe(false);
    });

    it("returns false if value is primitive but not undefined or instance key", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue("test_value"));
      expect(renderer.canRender(record)).toBe(false);
    });
  });

  describe("render", () => {
    beforeEach(() => {
      vi.spyOn(Presentation, "localization", "get").mockReturnValue(new EmptyLocalization());
    });

    describe("returned component", () => {
      const testIModel = { key: "test-imodel" } as IModelConnection;
      const instanceKey: Primitives.InstanceKey = { className: "test_schema:test_class", id: "test_id" };

      describe("without unified selection context", () => {
        it("renders non-clickable display value", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey, "test_display_value"));
          const { getByText, queryByTitle } = render(renderer.render(record));
          expect(getByText("test_display_value")).not.toBeNull();
          expect(queryByTitle("instance-key-value-renderer.select-instance")).toBeNull();
        });
      });

      /* eslint-disable @typescript-eslint/no-deprecated */
      describe("with deprecated unified selection context", () => {
        beforeEach(() => {
          const selectionManager = new SelectionManager({ scopes: undefined as any });
          vi.spyOn(Presentation, "selection", "get").mockReturnValue(selectionManager);
        });

        it("renders empty when there is no display value", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          const { getByTitle } = render(
            <UnifiedSelectionContextProviderDeprecated imodel={testIModel}>
              {renderer.render(record)}
            </UnifiedSelectionContextProviderDeprecated>,
          );
          expect(getByTitle("instance-key-value-renderer.select-instance").textContent).toHaveLength(0);
        });

        it("changes current selection when clicked", async () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          const { getByTitle } = render(
            <UnifiedSelectionContextProviderDeprecated imodel={testIModel} selectionLevel={10}>
              {renderer.render(record)}
            </UnifiedSelectionContextProviderDeprecated>,
          );

          act(() => {
            getByTitle("instance-key-value-renderer.select-instance").click();
          });

          await waitFor(() => expect(Presentation.selection.getSelection(testIModel, 10).has(instanceKey)).toBe(true));
        });
      });
      /* eslint-enable @typescript-eslint/no-deprecated */

      describe("with unified selection context", () => {
        let selectionStorage: SelectionStorage;
        beforeEach(() => {
          selectionStorage = { replaceSelection: vi.fn() } as unknown as SelectionStorage;
        });

        it("renders empty when there is no display value", async () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          record.imodelKey = "test-imodel-key";
          const { getByTitle } = render(
            <UnifiedSelectionContextProvider storage={selectionStorage}>
              {renderer.render(record)}
            </UnifiedSelectionContextProvider>,
          );
          await waitFor(() =>
            expect(getByTitle("instance-key-value-renderer.select-instance").textContent).toHaveLength(0),
          );
        });

        it("changes current selection when clicked", async () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          record.imodelKey = "test-imodel-key";

          const { getByTitle } = render(
            <UnifiedSelectionContextProvider storage={selectionStorage}>
              {renderer.render(record)}
            </UnifiedSelectionContextProvider>,
          );

          const selector = await waitFor(() => getByTitle("instance-key-value-renderer.select-instance"));
          act(() => {
            selector.click();
          });
          await waitFor(() =>
            expect(selectionStorage.replaceSelection).toHaveBeenCalledWith({
              imodelKey: "test-imodel-key",
              source: "InstanceKeyValueRenderer",
              selectables: [instanceKey],
            }),
          );
        });
      });

      describe("with custom type converter", () => {
        function applyCustomTypeConverter(record: PropertyRecord, value: unknown): void {
          record.property.converter = { name: "test_converter", options: { value } };
        }

        beforeAll(() => {
          class TestTypeConverter extends TypeConverter {
            public override convertToStringWithOptions(_value?: Primitives.Value, options?: Record<string, any>) {
              return options?.value;
            }

            public sortCompare() {
              return 0;
            }
          }

          TypeConverterManager.registerConverter("navigation", TestTypeConverter, "test_converter");
        });

        afterAll(() => {
          TypeConverterManager.unregisterConverter("navigation", "test_converter");
        });

        it("uses type converter when there is no display value", async () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, "test_value");
          const { getByText } = render(renderer.render(record));
          await waitFor(() => expect(getByText("test_value")).not.toBeNull());
        });

        it("uses default value from context if converted value is undefined", async () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, undefined);
          const { getByText } = render(renderer.render(record, { defaultValue: "test_default_value" }));
          await waitFor(() => expect(getByText("test_default_value")).not.toBeNull());
        });

        it("renders empty if converted value is undefined and there is no default", async () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          record.imodelKey = "test-imodel-key";
          applyCustomTypeConverter(record, undefined);
          const { getByTitle } = render(
            <UnifiedSelectionContextProvider storage={{} as unknown as SelectionStorage}>
              {renderer.render(record)}
            </UnifiedSelectionContextProvider>,
          );
          await waitFor(() =>
            expect(getByTitle("instance-key-value-renderer.select-instance").textContent).toHaveLength(0),
          );
        });
      });
    });
  });
});
