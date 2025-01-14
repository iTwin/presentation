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
import { SelectionStorage } from "@itwin/unified-selection";
import { UnifiedSelectionContextProvider } from "@itwin/unified-selection-react";
import { WithIModelKey } from "../../presentation-components/common/Utils.js";
import { InstanceKeyValueRenderer } from "../../presentation-components/properties/InstanceKeyValueRenderer.js";
import {
  UnifiedSelectionContextProvider as UnifiedSelectionContextProviderDeprecated,
} from "../../presentation-components/unified-selection/UnifiedSelectionContext.js";
import { act, cleanup, render, waitFor } from "../TestUtils.js";

describe("InstanceKeyValueRenderer", () => {
  const renderer = new InstanceKeyValueRenderer();

  function createPrimitiveValue(value?: Primitives.Value, displayValue?: string): PrimitiveValue {
    return { valueFormat: PropertyValueFormat.Primitive, value, displayValue };
  }

  function createNavigationPropertyRecord(value: PropertyValue): WithIModelKey<PropertyRecord> {
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
      sinon.stub(Presentation, "localization").get(() => new EmptyLocalization());
    });

    afterEach(() => {
      cleanup();
      sinon.restore();
    });

    describe("returned component", () => {
      const testIModel = {} as IModelConnection;
      const instanceKey: Primitives.InstanceKey = { className: "test_schema:test_class", id: "test_id" };

      describe("without unified selection context", () => {
        it("renders non-clickable display value", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey, "test_display_value"));
          const { getByText, queryByTitle } = render(renderer.render(record));
          expect(getByText("test_display_value")).not.to.be.null;
          expect(queryByTitle("instance-key-value-renderer.select-instance")).to.be.null;
        });
      });

      /* eslint-disable @typescript-eslint/no-deprecated */
      describe("with deprecated unified selection context", () => {
        beforeEach(() => {
          const selectionManager = new SelectionManager({ scopes: undefined as any });
          sinon.stub(Presentation, "selection").get(() => selectionManager);
        });

        it("renders empty when there is no display value", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          const { getByTitle } = render(
            <UnifiedSelectionContextProviderDeprecated imodel={testIModel}>{renderer.render(record)}</UnifiedSelectionContextProviderDeprecated>,
          );
          expect(getByTitle("instance-key-value-renderer.select-instance").textContent).to.be.empty;
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

          await waitFor(() => expect(Presentation.selection.getSelection(testIModel, 10).has(instanceKey)).to.be.true);
        });
      });
      /* eslint-enable @typescript-eslint/no-deprecated */

      describe("with unified selection context", () => {
        let selectionStorage: SelectionStorage;
        beforeEach(() => {
          selectionStorage = {
            replaceSelection: sinon.stub(),
          } as unknown as SelectionStorage;
        });

        it("renders empty when there is no display value", () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          record.imodelKey = "test-imodel-key";
          const { getByTitle } = render(
            <UnifiedSelectionContextProvider storage={selectionStorage}>{renderer.render(record)}</UnifiedSelectionContextProvider>,
          );
          expect(getByTitle("instance-key-value-renderer.select-instance").textContent).to.be.empty;
        });

        it("changes current selection when clicked", async () => {
          const record = createNavigationPropertyRecord(createPrimitiveValue(instanceKey));
          record.imodelKey = "test-imodel-key";

          const { getByTitle } = render(
            <UnifiedSelectionContextProvider storage={selectionStorage}>{renderer.render(record)}</UnifiedSelectionContextProvider>,
          );

          act(() => {
            getByTitle("instance-key-value-renderer.select-instance").click();
          });
          await waitFor(() =>
            expect(selectionStorage.replaceSelection).to.be.calledWith({
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
          record.imodelKey = "test-imodel-key";
          applyCustomTypeConverter(record, undefined);
          const { getByTitle } = render(
            <UnifiedSelectionContextProvider storage={{} as unknown as SelectionStorage}>{renderer.render(record)}</UnifiedSelectionContextProvider>,
          );
          expect(getByTitle("instance-key-value-renderer.select-instance").textContent).to.be.empty;
        });
      });
    });
  });
});
