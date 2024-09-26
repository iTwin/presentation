/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory, waitFor } from "presentation-test-utilities";
import { UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { ClassInfo, Descriptor, KeySet, PropertiesField, PropertyValueFormat } from "@itwin/presentation-common";
import { PresentationFilterBuilderValueRenderer } from "@itwin/presentation-components";
import { queryByText, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildIModel, importSchema } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";

describe("Presentation filter builder value renderer", () => {
  before(async () => {
    await initialize();
    await UiComponents.initialize(new EmptyLocalization());
  });

  after(async () => {
    await terminate();
  });

  it("renders 'PresentationFilterBuilderValueRenderer' with correct property values when selected classes are provided", async function () {
    const imodel = await buildIModel(this, async (builder, mochaContext) => {
      const schema = await importSchema(
        mochaContext,
        builder,
        `
          <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
          <ECEntityClass typeName="MyPhysicalObjectParent">
            <BaseClass>bis:PhysicalElement</BaseClass>
            <ECProperty propertyName="PropertyName" typeName="string" />
          </ECEntityClass>
          <ECEntityClass typeName="MyPhysicalObject1">
            <BaseClass>MyPhysicalObjectParent</BaseClass>
          </ECEntityClass>
          <ECEntityClass typeName="MyPhysicalObject2">
            <BaseClass>MyPhysicalObjectParent</BaseClass>
          </ECEntityClass>
        `,
      );
      const physicalModel = insertPhysicalModelWithPartition({ builder, codeValue: "TestPhysicalModel" });
      const category = insertSpatialCategory({ builder, codeValue: "Test SpatialCategory" });
      const parentElement = insertPhysicalElement({
        builder,
        modelId: physicalModel.id,
        categoryId: category.id,
        classFullName: schema.items.MyPhysicalObjectParent.fullName,
        userLabel: "Parent Test Class",
        ["PropertyName"]: "Parent",
      });
      const element1 = insertPhysicalElement({
        builder,
        modelId: physicalModel.id,
        categoryId: category.id,
        classFullName: schema.items.MyPhysicalObject1.fullName,
        parentId: parentElement.id,
        userLabel: "Test Class",
        ["PropertyName"]: "Value1",
      });
      const element2 = insertPhysicalElement({
        builder,
        modelId: physicalModel.id,
        categoryId: category.id,
        classFullName: schema.items.MyPhysicalObject2.fullName,
        parentId: parentElement.id,
        userLabel: "Test Class 2",
        ["PropertyName"]: "Value2",
      });
      return { parentElement, element1, element2, category };
    });

    const testProperty = {
      name: "#PropertyName",
      displayLabel: "PropertyName",
      typename: "string",
    };

    const testClassInfos: ClassInfo[] = [{ id: imodel.parentElement.id, name: imodel.parentElement.className, label: "Parent Test Class" }];
    const testCategory = {
      name: "test-category",
      label: "Test SpatialCategory",
      description: "Test category description",
      priority: 0,
      expand: false,
    };
    const testField = new PropertiesField(
      testCategory,
      "PropertyName",
      "PropertyName",
      { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
      false,
      0,
      testClassInfos.map((classInfo) => ({ property: { classInfo, name: "PropertyName", type: "string" } })),
    );

    const testDescriptor = new Descriptor({
      connectionId: undefined,
      displayType: "",
      contentFlags: 0,
      selectClasses: [
        {
          selectClassInfo: testClassInfos[0],
          isSelectPolymorphic: false,
        },
      ],
      categories: [testCategory],
      fields: [testField],
    });

    const keys = new KeySet([
      { id: imodel.element1.id, className: imodel.element1.className },
      { id: imodel.element2.id, className: imodel.element2.className },
    ]);

    const selectedClasses: ClassInfo[] = [
      {
        id: imodel.element1.id,
        name: imodel.element1.className.replace(".", ":"),
        label: "Test Class",
      },
    ];

    const { baseElement, getByRole } = render(
      <PresentationFilterBuilderValueRenderer
        property={testProperty}
        onChange={() => {}}
        imodel={imodel.imodel}
        descriptor={testDescriptor}
        descriptorInputKeys={keys}
        selectedClasses={selectedClasses}
        operator={"is-equal"}
      />,
    );

    // trigger loadTargets function
    const user = userEvent.setup();
    const combobox = await waitFor(() => getByRole("combobox"));
    await waitFor(async () => {
      await user.click(combobox);
      expect(queryByText(baseElement, "Value1")).to.not.be.null;
      expect(queryByText(baseElement, "Value2")).to.be.null;
    });
  });
});
