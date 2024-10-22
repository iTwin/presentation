/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory, waitFor } from "presentation-test-utilities";
import { UiComponents } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { ClassInfo, DefaultContentDisplayTypes, KeySet } from "@itwin/presentation-common";
import { PresentationFilterBuilderValueRenderer } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { queryByText, render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { buildIModel, importSchema } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";

describe("Presentation filter builder value renderer", () => {
  before(async () => {
    await initialize();
    await UiComponents.initialize(new EmptyLocalization());
  });

  after(async () => {
    await terminate();
  });

  it("renders 'PresentationFilterBuilderValueRenderer' with correct property values when selected classes are provided", async function () {
    let schemaAlias = "";
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
      schemaAlias = schema.schemaAlias;
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
      name: `#pc_${schemaAlias}_MyPhysicalObjectParent_PropertyName`,
      displayLabel: "PropertyName",
      typename: "string",
    };

    const keys = new KeySet([
      { id: imodel.element1.id, className: imodel.element1.className },
      { id: imodel.element2.id, className: imodel.element2.className },
    ]);

    const testDescriptor = await Presentation.presentation.getContentDescriptor({
      imodel: imodel.imodel,
      rulesetOrId: {
        id: `Test descriptor ruleset`,
        rules: [
          {
            ruleType: "Content",
            specifications: [
              {
                specType: "SelectedNodeInstances",
              },
            ],
          },
        ],
      },
      displayType: DefaultContentDisplayTypes.PropertyPane,
      keys,
    });

    if (testDescriptor === undefined) {
      expect(false);
      return;
    }

    const selectedClasses: ClassInfo[] = [
      {
        id: imodel.element1.id,
        name: imodel.element1.className,
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
    await user.click(combobox);
    await waitFor(async () => {
      expect(queryByText(baseElement, "Value1")).to.not.be.null;
      expect(queryByText(baseElement, "Value2")).to.be.null;
    });
  });

  it("renders 'PresentationFilterBuilderValueRenderer' with correct property values when selected classes are provided without keys", async function () {
    let schemaAlias = "";
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
      schemaAlias = schema.schemaAlias;
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
      name: `#pc_${schemaAlias}_MyPhysicalObjectParent_PropertyName`,
      displayLabel: "PropertyName",
      typename: "string",
    };

    const keys = new KeySet([
      { id: imodel.element1.id, className: imodel.element1.className },
      { id: imodel.element2.id, className: imodel.element2.className },
    ]);

    const testDescriptor = await Presentation.presentation.getContentDescriptor({
      imodel: imodel.imodel,
      rulesetOrId: {
        id: `Test descriptor ruleset`,
        rules: [
          {
            ruleType: "Content",
            specifications: [
              {
                specType: "SelectedNodeInstances",
              },
            ],
          },
        ],
      },
      displayType: DefaultContentDisplayTypes.PropertyPane,
      keys,
    });

    if (testDescriptor === undefined) {
      expect(false);
      return;
    }

    const selectedClasses: ClassInfo[] = [
      {
        id: imodel.element1.id,
        name: imodel.element1.className,
        label: "Test Class",
      },
    ];

    const { baseElement, getByRole } = render(
      <PresentationFilterBuilderValueRenderer
        property={testProperty}
        onChange={() => {}}
        imodel={imodel.imodel}
        descriptor={testDescriptor}
        selectedClasses={selectedClasses}
        operator={"is-equal"}
      />,
    );

    // trigger loadTargets function
    const user = userEvent.setup();
    const combobox = await waitFor(() => getByRole("combobox"));
    await user.click(combobox);
    await waitFor(async () => {
      expect(queryByText(baseElement, "Value1")).to.not.be.null;
      expect(queryByText(baseElement, "Value2")).to.be.null;
    });
  });
});
