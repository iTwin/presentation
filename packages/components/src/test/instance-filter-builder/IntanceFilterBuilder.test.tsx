/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyDescription, PropertyValueFormat } from "@itwin/appui-abstract";
import {
  PropertyFilterBuilderActions,
  PropertyFilterBuilderRuleGroup,
  PropertyFilterRuleGroupOperator,
  PropertyFilterRuleOperator,
  UiComponents,
} from "@itwin/components-react";
import { BeEvent, BeUiEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { FormatterSpec, ParserSpec } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ClassInfo, Descriptor, KoqPropertyValueFormatter, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
import { SchemaMetadataContextProvider } from "../../presentation-components/common/SchemaMetadataContext";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import {
  InstanceFilterBuilder,
  useFilterBuilderNavigationPropertyEditorContext,
  usePresentationInstanceFilteringProps,
} from "../../presentation-components/instance-filter-builder/InstanceFilterBuilder";
import { INSTANCE_FILTER_FIELD_SEPARATOR } from "../../presentation-components/instance-filter-builder/Utils";
import { createTestECClassInfo, stubRaf } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../_helpers/Content";

describe("InstanceFilterBuilder", () => {
  stubRaf();
  const classInfos: ClassInfo[] = [
    { id: "0x1", name: "Schema:Class1", label: "Class1" },
    { id: "0x2", name: "Schema:Class2", label: "Class2" },
  ];

  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);

    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(UiComponents, "translate").callsFake((key) => key as string);
  });

  afterEach(async () => {
    sinon.restore();
  });

  const testImodel = {} as IModelConnection;
  const testDescriptor = {} as Descriptor;
  const testActions = {
    setRuleProperty: () => {},
    setRuleOperator: () => {},
    setRuleValue: () => {},
  } as unknown as PropertyFilterBuilderActions;
  const testRootGroup = {
    operator: PropertyFilterRuleGroupOperator.Or,
    id: "0",
    items: [],
  } as PropertyFilterBuilderRuleGroup;

  it("invokes 'onSelectedClassesChanged' when class is selected", async () => {
    const spy = sinon.spy();
    const { getByRole, getAllByRole } = render(
      <InstanceFilterBuilder
        classes={classInfos}
        selectedClasses={[]}
        properties={[]}
        onSelectedClassesChanged={spy}
        actions={testActions}
        rootGroup={testRootGroup}
        imodel={testImodel}
        descriptor={testDescriptor}
      />,
    );

    const selector = getAllByRole("combobox")[0];
    fireEvent.click(selector);

    const option = await waitFor(() => getByRole("option", { name: classInfos[0].label }));
    fireEvent.click(option);

    expect(spy).to.be.calledOnceWith([classInfos[0].id]);
  });

  it("invokes 'onSelectedClassesChanged' when class is deselected", async () => {
    const spy = sinon.spy();
    const { getByRole, getAllByRole } = render(
      <InstanceFilterBuilder
        classes={classInfos}
        selectedClasses={[classInfos[0]]}
        properties={[]}
        onSelectedClassesChanged={spy}
        actions={testActions}
        rootGroup={testRootGroup}
        imodel={testImodel}
        descriptor={testDescriptor}
      />,
    );

    const selector = getAllByRole("combobox")[0];
    fireEvent.click(selector);

    const option = await waitFor(() => getByRole("option", { name: classInfos[0].label }));
    fireEvent.click(option);

    expect(spy).to.be.calledOnceWith([]);
  });

  describe("UniqueValuesRenderer", () => {
    const property: PropertyDescription = {
      displayLabel: "Test Prop",
      name: "testProp",
      typename: "double",
    };

    it("renders <UniquePropertyValuesSelector /> when operator is `IsEqual`", async () => {
      const rootGroup: PropertyFilterBuilderRuleGroup = {
        id: "root-id",
        operator: PropertyFilterRuleGroupOperator.And,
        items: [
          {
            id: "item-id",
            groupId: "root-id",
            property,
            operator: PropertyFilterRuleOperator.IsEqual,
          },
        ],
      };

      const { queryByText } = render(
        <InstanceFilterBuilder
          classes={classInfos}
          selectedClasses={[]}
          properties={[property]}
          onSelectedClassesChanged={() => {}}
          actions={testActions}
          rootGroup={rootGroup}
          imodel={testImodel}
          descriptor={testDescriptor}
        />,
      );
      await waitFor(() => expect(queryByText("unique-values-property-editor.select-values")).to.not.be.null);
    });

    it("renders <UniquePropertyValuesSelector /> when operator is `IsNotEqual`", async () => {
      const rootGroup: PropertyFilterBuilderRuleGroup = {
        id: "root-id",
        operator: PropertyFilterRuleGroupOperator.And,
        items: [
          {
            id: "item-id",
            groupId: "root-id",
            property,
            operator: PropertyFilterRuleOperator.IsNotEqual,
          },
        ],
      };

      const { queryByText } = render(
        <InstanceFilterBuilder
          classes={classInfos}
          selectedClasses={[]}
          properties={[property]}
          onSelectedClassesChanged={() => {}}
          actions={testActions}
          rootGroup={rootGroup}
          imodel={testImodel}
          descriptor={testDescriptor}
        />,
      );
      await waitFor(() => expect(queryByText("unique-values-property-editor.select-values")).to.not.be.null);
    });
  });

  describe("quantity values", () => {
    const property: PropertyDescription = {
      displayLabel: "Test Prop",
      name: "testProp",
      typename: "double",
      quantityType: "koqName",
    };

    const rootGroup: PropertyFilterBuilderRuleGroup = {
      id: "root-id",
      operator: PropertyFilterRuleGroupOperator.And,
      items: [
        {
          id: "item-id",
          groupId: "root-id",
          property,
          operator: PropertyFilterRuleOperator.Less,
          value: { valueFormat: PropertyValueFormat.Primitive, value: 2.5, displayValue: "2.5" },
        },
      ],
    };

    beforeEach(() => {
      const formatterSpec = {
        applyFormatting: (raw: number) => `${raw} unit`,
      };
      sinon.stub(KoqPropertyValueFormatter.prototype, "getFormatterSpec").resolves(formatterSpec as FormatterSpec);

      const parserSpec = {
        parseToQuantityValue: (value: string) => ({ ok: true, value: Number(value) }),
      };
      sinon.stub(KoqPropertyValueFormatter.prototype, "getParserSpec").resolves(parserSpec as ParserSpec);

      sinon.stub(IModelApp, "quantityFormatter").get(() => ({
        onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
      }));
    });

    it("does not render quantity input if there is no schema metadata context", async () => {
      const { queryByDisplayValue } = render(
        <InstanceFilterBuilder
          classes={classInfos}
          selectedClasses={[]}
          properties={[property]}
          onSelectedClassesChanged={() => {}}
          actions={testActions}
          rootGroup={rootGroup}
          imodel={testImodel}
          descriptor={testDescriptor}
        />,
      );

      await waitFor(() => {
        expect(queryByDisplayValue(property.displayLabel)).to.not.be.null;
        expect(queryByDisplayValue("2.5")).to.not.be.null;
      });
    });

    it("renders quantity input", async () => {
      const imodel = {} as IModelConnection;
      const getSchemaContext = () => ({} as SchemaContext);
      const { queryByDisplayValue } = render(
        <SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={getSchemaContext}>
          <InstanceFilterBuilder
            classes={classInfos}
            selectedClasses={[]}
            properties={[property]}
            onSelectedClassesChanged={() => {}}
            actions={testActions}
            rootGroup={rootGroup}
            imodel={testImodel}
            descriptor={testDescriptor}
          />
        </SchemaMetadataContextProvider>,
      );

      await waitFor(() => {
        expect(queryByDisplayValue(property.displayLabel)).to.not.be.null;
        expect(queryByDisplayValue("2.5 unit")).to.not.be.null;
      });
    });
  });
});

describe("usePresentationInstanceFilteringProps", () => {
  interface HookProps {
    descriptor: Descriptor;
    imodel: IModelConnection;
  }

  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const baseClass = createTestECClassInfo({ id: "0x1", label: "Base", name: "schema:base" });
  const concreteClass1 = createTestECClassInfo({ id: "0x2", label: "Concrete1", name: "schema:concrete1" });
  const concreteClass2 = createTestECClassInfo({ id: "0x4", label: "Concrete2", name: "schema:concrete2" });
  const derivedClass = createTestECClassInfo({ id: "0x5", label: "Derived", name: "schema:derived" });
  const basePropertiesField = createTestPropertiesContentField({
    properties: [{ property: { classInfo: baseClass, name: "baseProp", type: "string" } }],
    name: "baseField",
    label: "BaseField",
    category,
  });
  const concretePropertiesField1 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: concreteClass1, name: "concreteProp1", type: "string" } }],
    name: "concreteField1",
    label: "ConcreteField1",
    category,
  });
  const concretePropertiesField2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: concreteClass2, name: "concreteProp2", type: "string" } }],
    name: "concreteField2",
    label: "ConcreteField2",
    category,
  });
  const derivedPropertiesField = createTestPropertiesContentField({
    properties: [{ property: { classInfo: derivedClass, name: "derivedProp", type: "string" } }],
    name: "derivedField",
    label: "DerivedField",
    category,
  });
  const descriptor = createTestContentDescriptor({
    selectClasses: [
      { selectClassInfo: concreteClass1, isSelectPolymorphic: false },
      { selectClassInfo: concreteClass2, isSelectPolymorphic: false },
    ],
    categories: [category],
    fields: [basePropertiesField, concretePropertiesField1, concretePropertiesField2, derivedPropertiesField],
  });

  const onCloseEvent = new BeEvent<() => void>();
  const imodelStub = {
    key: "test_imodel",
    onClose: onCloseEvent,
  };
  let initialProps: HookProps;

  beforeEach(() => {
    const imodel = imodelStub as unknown as IModelConnection;

    initialProps = {
      descriptor,
      imodel,
    };

    // stub metadataProvider for test imodel
    const metadataProvider = getIModelMetadataProvider(imodel);
    sinon.stub(metadataProvider, "getECClassInfo").callsFake(async (id) => {
      switch (id) {
        case baseClass.id:
          return new ECClassInfo(baseClass.id, baseClass.name, baseClass.label, new Set(), new Set([concreteClass1.id, concreteClass2.id, derivedClass.id]));
        case concreteClass1.id:
          return new ECClassInfo(concreteClass1.id, concreteClass1.name, concreteClass1.label, new Set([baseClass.id]), new Set([derivedClass.id]));
        case concreteClass2.id:
          return new ECClassInfo(concreteClass2.id, concreteClass2.name, concreteClass2.label, new Set([baseClass.id]), new Set());
        case derivedClass.id:
          return new ECClassInfo(derivedClass.id, derivedClass.name, derivedClass.label, new Set([baseClass.id, concreteClass1.id]), new Set());
      }
      return undefined;
    });
  });

  afterEach(() => {
    onCloseEvent.raiseEvent();
    sinon.restore();
  });

  it("initializes class list from descriptor", () => {
    const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

    expect(result.current.classes).to.have.lengthOf(2).and.to.containSubset([concreteClass1, concreteClass2]);
  });

  it("does not duplicate classes when descriptor contains multiple similar select classes", () => {
    initialProps.descriptor = createTestContentDescriptor({
      selectClasses: [
        // in practice these would be different by additional attributes like path to input class
        { selectClassInfo: concreteClass1, isSelectPolymorphic: false },
        { selectClassInfo: concreteClass1, isSelectPolymorphic: false },
      ],
      categories: [category],
      fields: [basePropertiesField],
    });
    const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

    expect(result.current.classes).to.have.lengthOf(1).and.to.containSubset([concreteClass1]);
  });

  it("updates selected classes when 'onSelectedClassesChange' is called", async () => {
    const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

    result.current.onSelectedClassesChanged([concreteClass1.id]);
    await waitFor(() => expect(result.current.selectedClasses).to.have.lengthOf(1).and.to.containSubset([concreteClass1]));
  });

  it("clears selected classes when new descriptor is provided", async () => {
    const { result, rerender } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

    result.current.onSelectedClassesChanged([concreteClass1.id]);
    await waitFor(() => expect(result.current.selectedClasses).to.have.lengthOf(1).and.to.containSubset([concreteClass1]));

    const newDescriptor = createTestContentDescriptor({
      selectClasses: [{ selectClassInfo: concreteClass1, isSelectPolymorphic: false }],
      categories: [category],
      fields: [basePropertiesField],
    });
    // rerender with new descriptor
    rerender({ descriptor: newDescriptor, imodel: initialProps.imodel });
    expect(result.current.selectedClasses).to.be.empty;
  });

  describe("properties filtering", () => {
    it("returns properties only of selected class", async () => {
      const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

      result.current.onSelectedClassesChanged([concreteClass2.id]);
      await waitFor(() => expect(result.current.properties).to.have.lengthOf(2));
    });

    it("return all properties when selected class contains all available properties", async () => {
      const testDescriptor = createTestContentDescriptor({
        selectClasses: [{ selectClassInfo: concreteClass1, isSelectPolymorphic: false }],
        categories: [category],
        fields: [basePropertiesField, concretePropertiesField1],
      });
      const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), {
        initialProps: { ...initialProps, descriptor: testDescriptor },
      });

      await waitFor(() => expect(result.current.properties).to.have.lengthOf(2));

      result.current.onSelectedClassesChanged([concreteClass1.id]);
      await waitFor(() => expect(result.current.properties).to.have.lengthOf(2));
    });

    it("selects classes that have selected property", async () => {
      const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

      const property = result.current.properties.find((prop) => prop.displayLabel === concretePropertiesField2.label) as PropertyDescription;
      result.current.onRulePropertySelected(property);
      await waitFor(() => expect(result.current.selectedClasses).to.have.lengthOf(1).and.containSubset([concreteClass2]));
    });

    it("selects all derived classes that have selected property", async () => {
      const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

      const property = result.current.properties.find((prop) => prop.displayLabel === basePropertiesField.label) as PropertyDescription;
      result.current.onRulePropertySelected(property);
      await waitFor(() => expect(result.current.selectedClasses).to.have.lengthOf(2).and.containSubset([concreteClass1, concreteClass2]));
    });

    it("does not change selected classes when selected property class is already selected", async () => {
      const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

      result.current.onSelectedClassesChanged([concreteClass2.id]);
      await waitFor(() => expect(result.current.selectedClasses).to.have.lengthOf(1).and.containSubset([concreteClass2]));

      const property = result.current.properties.find((prop) => prop.displayLabel === concretePropertiesField2.label) as PropertyDescription;
      result.current.onRulePropertySelected(property);
      expect(result.current.selectedClasses).to.have.lengthOf(1).and.containSubset([concreteClass2]);
    });

    it("does not change selected classes when 'onPropertySelected' is invoked with invalid property", () => {
      const { result } = renderHook((props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel), { initialProps });

      result.current.onRulePropertySelected({ name: "invalidProp", displayLabel: "InvalidProp", typename: "string" });
      expect(result.current.selectedClasses).to.be.empty;
    });
  });
});

describe("useFilterBuilderNavigationPropertyEditorContext", () => {
  interface Props {
    imodel: IModelConnection;
    descriptor: Descriptor;
  }
  const testImodel = {} as IModelConnection;

  it("returns navigation property info", async () => {
    const navigationPropertyInfo: NavigationPropertyInfo = {
      classInfo: { id: "2", label: "Prop Class", name: "TestSchema:PropClass" },
      targetClassInfo: { id: "3", label: "Target Class", name: "TestSchema:TargetClass" },
      isForwardRelationship: true,
      isTargetPolymorphic: true,
    };
    const fieldName = "field_name";
    const testDescriptor = createTestContentDescriptor({
      fields: [
        createTestPropertiesContentField({
          name: fieldName,
          properties: [
            {
              property: {
                classInfo: { id: "1", label: "Field Class", name: "TestSchema:FieldClass" },
                name: "nav_prop",
                type: "navigation",
                navigationPropertyInfo,
              },
            },
          ],
        }),
      ],
    });
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: `test_category${INSTANCE_FILTER_FIELD_SEPARATOR}${fieldName}`,
      typename: "navigation",
    };

    const { result } = renderHook(({ imodel, descriptor }: Props) => useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor), {
      initialProps: { imodel: testImodel, descriptor: testDescriptor },
    });

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).to.be.deep.eq(navigationPropertyInfo);
  });

  it("returns `undefined` for non properties field", async () => {
    const fieldName = "field_name";
    const testDescriptor = createTestContentDescriptor({
      fields: [createTestSimpleContentField({ name: fieldName })],
    });
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: `test_category${INSTANCE_FILTER_FIELD_SEPARATOR}${fieldName}`,
      typename: "navigation",
    };

    const { result } = renderHook(({ imodel, descriptor }: Props) => useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor), {
      initialProps: { imodel: testImodel, descriptor: testDescriptor },
    });

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).to.be.undefined;
  });
});
