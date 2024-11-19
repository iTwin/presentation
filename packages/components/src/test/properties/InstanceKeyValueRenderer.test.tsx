/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Primitives, PrimitiveValue, PropertyRecord, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { TypeConverter, TypeConverterManager } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Presentation, SelectionManager } from "@itwin/presentation-frontend";
import { InstanceKeyValueRenderer } from "../../presentation-components/properties/InstanceKeyValueRenderer.js";
import { UnifiedSelectionContextProvider } from "../../presentation-components/unified-selection/UnifiedSelectionContext.js";
import { act, cleanup, render, waitFor } from "../TestUtils.js";

describe("InstanceKeyValueRenderer", () => {
  const renderer = new InstanceKeyValueRenderer();

  function createPrimitiveValue(value?: Primitives.Value, displayValue?: string): PrimitiveValue {
    return { valueFormat: PropertyValueFormat.Primitive, value, displayValue };
  }

  function createNavigationPropertyRecord(value: PropertyValue): PropertyRecord {
    return new PropertyRecord(value, { name: "", displayLabel: "", typename: "navigation" });
  }

  before(() => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
  });

  after(async () => {
    sinon.restore();
  });

  describe("canRender", () => {
    it("returns true if value is primitive and undefined", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue());
      expect(renderer.canRender(record)).to.be.true;
    });

    it("returns true if value is primitive instance key", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue({ className: "", id: "" }));
      expect(renderer.canRender(record)).to.be.true;
    });

    it("returns false if value is not primitive", () => {
      const record = createNavigationPropertyRecord({ valueFormat: PropertyValueFormat.Struct, members: {} });
      expect(renderer.canRender(record)).to.be.false;
    });

    it("returns false if value is primitive but not undefined or instance key", () => {
      const record = createNavigationPropertyRecord(createPrimitiveValue("test_value"));
      expect(renderer.canRender(record)).to.be.false;
    });
  });

  describe("render", () => {
    beforeEach(() => {
      const selectionManager = new SelectionManager({ scopes: undefined as any });
      sinon.stub(Presentation, "selection").get(() => selectionManager);
      sinon.stub(Presentation, "localization").get(() => new EmptyLocalization());
    });

    afterEach(() => {
      cleanup();
      sinon.restore();
    });

    describe("returned component", () => {
      const testIModel = {} as IModelConnection;
      const instanceKey: Primitives.InstanceKey = { className: "test_schema:test_class", id: "test_id" };

      it("renders display value", () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey, "test_display_value"));
        const { getByText } = render(renderer.render(record));
        expect(getByText("test_display_value")).not.to.be.null;
      });

      it("renders empty when there is no display value", () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
        const { getByTitle } = render(<UnifiedSelectionContextProvider imodel={testIModel}>{renderer.render(record)}</UnifiedSelectionContextProvider>);
        expect(getByTitle("instance-key-value-renderer.select-instance").textContent).to.be.empty;
      });

      it("changes current selection when clicked", async () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
        const { getByTitle } = render(
          <UnifiedSelectionContextProvider imodel={testIModel} selectionLevel={10}>
            {renderer.render(record)}
          </UnifiedSelectionContextProvider>,
        );

        act(() => {
          getByTitle("instance-key-value-renderer.select-instance").click();
        });

        await waitFor(() => expect(Presentation.selection.getSelection(testIModel, 10).has(instanceKey)).to.be.true);
      });

      it("renders non-clickable display value when UnifiedSelectionContext is not present", () => {
        const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey, "test_display_value"));
        const { getByText, queryByTitle } = render(renderer.render(record));
        expect(getByText("test_display_value")).not.to.be.null;
        expect(queryByTitle("instance-key-value-renderer.select-instance")).to.be.null;
      });

      describe("with custom type converter", () => {
        function applyCustomTypeConverter(record: PropertyRecord, value: unknown): void {
          record.property.converter = { name: "test_converter", options: { value } };
        }

        before(() => {
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

        after(() => {
          TypeConverterManager.unregisterConverter("navigation", "test_converter");
        });

        it("uses type converter when there is no display value", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, "test_value");
          const { getByText } = render(renderer.render(record));
          expect(getByText("test_value")).not.to.be.null;
        });

        it("uses default value from context if converted value is undefined", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, undefined);
          const { getByText } = render(renderer.render(record, { defaultValue: "test_default_value" }));
          expect(getByText("test_default_value")).not.to.be.null;
        });

        it("renders empty if converted value is undefined and there is no default", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          applyCustomTypeConverter(record, undefined);
          const { getByTitle } = render(<UnifiedSelectionContextProvider imodel={testIModel}>{renderer.render(record)}</UnifiedSelectionContextProvider>);
          expect(getByTitle("instance-key-value-renderer.select-instance").textContent).to.be.empty;
        });
      });
    });
  });
});
