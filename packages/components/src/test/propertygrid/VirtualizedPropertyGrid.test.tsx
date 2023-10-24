/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { useEffect, useState } from "react";
import { PropertyRecord } from "@itwin/appui-abstract";
import {
  CategorizedPropertyItem,
  FlatGridItemType,
  IPropertyDataProvider,
  PrimitivePropertyRenderer,
  PrimitivePropertyValueRenderer,
  PropertyCategory,
  PropertyCategoryRendererManager,
  PropertyCategoryRendererProps,
  PropertyData,
  PropertyDataChangeEvent,
  PropertyValueRendererContext,
  PropertyValueRendererManager,
  VirtualizedPropertyGridWithDataProvider,
} from "@itwin/components-react";
import { Orientation } from "@itwin/core-react";
import { InstanceKey } from "@itwin/presentation-common";
import { render, renderHook, waitFor } from "@testing-library/react";
import { PresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider";
import { createTestCategoryDescription } from "../_helpers/Content";
import { createPrimitiveStringProperty } from "../_helpers/Properties";

describe("Category renderer customization", () => {
  describe("documentation snippets", () => {
    function setupDataProvider(): IPropertyDataProvider {
      const rootCategory1: PropertyCategory = {
        name: "test_category",
        label: "test_category",
        expand: true,
        renderer: { name: "my_custom_renderer" },
      };
      return {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString("test_label"),
          description: "test_description",
          categories: [rootCategory1],
          records: {
            [rootCategory1.name]: [createPrimitiveStringProperty("rootCategory1Property", "Test", "Test")],
          },
          reusePropertyDataState: true,
        }),
      };
    }

    afterEach(() => {
      PropertyCategoryRendererManager.defaultManager.removeRenderer("my_custom_renderer");
    });

    it("works with most basic custom category renderer", async () => {
      // __PUBLISH_EXTRACT_START__ Presentation.Customization.BasicCategoryRenderer
      PropertyCategoryRendererManager.defaultManager.addRenderer("my_custom_renderer", () => MyCustomRenderer);

      const MyCustomRenderer: React.FC<PropertyCategoryRendererProps> = (props) => {
        const primitiveItems = props.categoryItem.getChildren().filter((item) => item.type === FlatGridItemType.Primitive) as CategorizedPropertyItem[];

        return (
          <>
            {primitiveItems.map((item) => {
              return (
                <PrimitivePropertyRenderer
                  key={item.key}
                  propertyRecord={item.derivedRecord}
                  valueElement={PropertyValueRendererManager.defaultManager.render(item.derivedRecord)}
                  orientation={props.gridContext.orientation}
                />
              );
            })}
          </>
        );
      };
      // __PUBLISH_EXTRACT_END__

      const dataProvider = setupDataProvider();
      const { queryByText } = render(
        <VirtualizedPropertyGridWithDataProvider dataProvider={dataProvider} width={500} height={1200} orientation={Orientation.Horizontal} />,
      );
      await waitFor(() => expect(queryByText("rootCategory1Property")).not.to.be.null);
    });

    it("compiles PropertyRecord to InstanceKey sample", async () => {
      function useInstanceKeys(props: PropertyCategoryRendererProps) {
        const [keys, setInstanceKeys] = useState<InstanceKey[][] | undefined>();
        // __PUBLISH_EXTRACT_START__ Presentation.Customization.PropertyRecordToInstanceKey
        // <Somewhere within MyCustomRenderer component>
        useEffect(
          () => {
            void (async () => {
              const properties = props.categoryItem.getChildren() as CategorizedPropertyItem[];
              const dataProvider = props.gridContext.dataProvider as PresentationPropertyDataProvider;
              const instanceKeys = properties.map(async ({ derivedRecord }) => dataProvider.getPropertyRecordInstanceKeys(derivedRecord));
              setInstanceKeys(await Promise.all(instanceKeys));
            })();
          },
          // eslint-disable-next-line react-hooks/exhaustive-deps
          [],
        );
        // __PUBLISH_EXTRACT_END__
        return keys;
      }

      const stubProps = {
        categoryItem: {
          getChildren() {
            return [];
          },
        },
        gridContext: {
          dataProvider: {
            async getPropertyRecordInstanceKeys() {
              return [];
            },
          },
        },
      };
      const { result } = renderHook(() => useInstanceKeys(stubProps as any));
      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
      });
    });
  });
});

describe("Property renderer customization", () => {
  describe("documentation snippets", () => {
    function setupDataProvider(): IPropertyDataProvider {
      const rootCategory = createTestCategoryDescription({
        name: "root-category",
        label: "Root Category",
        description: "Root Category Description",
        expand: true,
      });
      const property = createPrimitiveStringProperty("rootCategoryProperty", "TestValue");
      property.property.renderer = {
        name: "my-renderer",
      };
      return {
        onDataChanged: new PropertyDataChangeEvent(),
        getData: async (): Promise<PropertyData> => ({
          label: PropertyRecord.fromString("test_label"),
          description: "test_description",
          categories: [rootCategory],
          records: {
            [rootCategory.name]: [property],
          },
          reusePropertyDataState: true,
        }),
      };
    }

    afterEach(() => {
      PropertyValueRendererManager.defaultManager.unregisterRenderer("my-renderer");
    });

    it("works with custom property renderer", async () => {
      // __PUBLISH_EXTRACT_START__ Presentation.Content.Customization.PropertySpecification.Renderer.Register
      // The custom renderer renders the property value in red
      PropertyValueRendererManager.defaultManager.registerRenderer("my-renderer", {
        canRender: () => true,
        render: function myRenderer(record: PropertyRecord, ctx?: PropertyValueRendererContext) {
          const defaultRenderer = new PrimitivePropertyValueRenderer();
          return defaultRenderer.render(record, { ...ctx, style: { ...ctx?.style, color: "red" } });
        },
      });
      // __PUBLISH_EXTRACT_END__

      const dataProvider = setupDataProvider();
      const { findAllByText } = render(<VirtualizedPropertyGridWithDataProvider dataProvider={dataProvider} width={500} height={1200} />);
      const renderedElements = await findAllByText("TestValue");
      expect(renderedElements[0].style.color).to.eq("red");
    });
  });
});
