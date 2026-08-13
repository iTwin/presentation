/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyDescription } from "@itwin/appui-abstract";
import {
  PropertyFilterBuilderActions,
  PropertyFilterBuilderRuleGroup,
  PropertyFilterRuleGroupOperator,
  UiComponents,
} from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ClassInfo, Descriptor } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { translate } from "../../presentation-components/common/Utils.js";
import {
  InstanceFilterBuilder,
  usePresentationInstanceFilteringProps,
} from "../../presentation-components/instance-filter-builder/InstanceFilterBuilder.js";
import { createTestECClassInfo, stubSchemaViewForClasses, stubVirtualization } from "../_helpers/Common.js";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestPropertiesContentField,
} from "../_helpers/Content.js";
import { act, fireEvent, render, renderHook, waitFor } from "../TestUtils.js";

describe("InstanceFilterBuilder", () => {
  stubVirtualization();
  const classInfos: ClassInfo[] = [
    { id: "0x1", name: "Schema:Class1", label: "Class1" },
    { id: "0x2", name: "Schema:Class2", label: "Class2" },
  ];

  beforeEach(async () => {
    const localization = new EmptyLocalization();
    vi.spyOn(IModelApp, "initialized", "get").mockReturnValue(true);
    vi.spyOn(IModelApp, "localization", "get").mockReturnValue(localization);

    vi.spyOn(Presentation, "localization", "get").mockReturnValue(localization);
    vi.spyOn(UiComponents, "translate").mockImplementation((key) => key as string);
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
    const spy = vi.fn();
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

    expect(spy).toHaveBeenCalledExactlyOnceWith([classInfos[0].id]);
  });

  it("renders appropriate text in class selector when no class is selected", async () => {
    const { getByPlaceholderText } = render(
      <InstanceFilterBuilder
        classes={classInfos}
        selectedClasses={[]}
        properties={[]}
        onSelectedClassesChanged={() => {}}
        actions={testActions}
        rootGroup={testRootGroup}
        imodel={testImodel}
        descriptor={testDescriptor}
      />,
    );

    await waitFor(() => getByPlaceholderText(translate("instance-filter-builder.select-classes-optional")));
  });

  it("renders appropriate text in class selector when class is selected", async () => {
    const { getByPlaceholderText } = render(
      <InstanceFilterBuilder
        classes={classInfos}
        selectedClasses={[createTestECClassInfo()]}
        properties={[]}
        onSelectedClassesChanged={() => {}}
        actions={testActions}
        rootGroup={testRootGroup}
        imodel={testImodel}
        descriptor={testDescriptor}
      />,
    );

    await waitFor(() => getByPlaceholderText(translate("instance-filter-builder.selected-classes")));
  });

  it("invokes 'onSelectedClassesChanged' when class is deselected", async () => {
    const spy = vi.fn();
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

    expect(spy).toHaveBeenCalledExactlyOnceWith([]);
  });

  describe("UniqueValuesRenderer", () => {
    const property: PropertyDescription = { displayLabel: "Test Prop", name: "testProp", typename: "double" };

    it("renders <UniquePropertyValuesSelector /> when operator is `IsEqual`", async () => {
      const rootGroup: PropertyFilterBuilderRuleGroup = {
        id: "root-id",
        operator: PropertyFilterRuleGroupOperator.And,
        items: [{ id: "item-id", groupId: "root-id", property, operator: "is-equal" }],
      };

      const { getByPlaceholderText } = render(
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
      await waitFor(() => getByPlaceholderText("unique-values-property-editor.select-values"));
    });

    it("renders <UniquePropertyValuesSelector /> when operator is `IsNotEqual`", async () => {
      const rootGroup: PropertyFilterBuilderRuleGroup = {
        id: "root-id",
        operator: PropertyFilterRuleGroupOperator.And,
        items: [{ id: "item-id", groupId: "root-id", property, operator: "is-not-equal" }],
      };

      const { getByPlaceholderText } = render(
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
      await waitFor(() => getByPlaceholderText("unique-values-property-editor.select-values"));
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
  const mergedPropertiesField = createTestPropertiesContentField({
    properties: [
      { property: { classInfo: concreteClass1, name: "mergedProp", type: "string" } },
      { property: { classInfo: concreteClass2, name: "mergedProp", type: "string" } },
    ],
    name: "mergedField",
    label: "MergedField",
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
    fields: [
      basePropertiesField,
      concretePropertiesField1,
      concretePropertiesField2,
      mergedPropertiesField,
      derivedPropertiesField,
    ],
  });

  const onCloseEvent = new BeEvent<() => void>();
  const imodelStub = {
    key: "test_imodel",
    onClose: onCloseEvent,
    getSchemaView: vi.fn().mockResolvedValue(stubSchemaViewForClasses([])),
  };
  let initialProps: HookProps;

  beforeEach(() => {
    const imodel = imodelStub as unknown as IModelConnection;

    initialProps = { descriptor, imodel };

    imodelStub.getSchemaView.mockResolvedValue(
      stubSchemaViewForClasses([
        { classInfo: baseClass },
        { classInfo: concreteClass1, baseClassFullName: baseClass.name },
        { classInfo: concreteClass2, baseClassFullName: baseClass.name },
        { classInfo: derivedClass, baseClassFullName: concreteClass1.name },
      ]),
    );
  });

  afterEach(() => {
    onCloseEvent.raiseEvent();
  });

  it("initializes class list from descriptor", () => {
    const { result } = renderHook(
      (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
      { initialProps },
    );

    expect(result.current.classes).toMatchObject([concreteClass1, concreteClass2]);
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
    const { result } = renderHook(
      (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
      { initialProps },
    );

    expect(result.current.classes).toMatchObject([concreteClass1]);
  });

  it("updates selected classes when 'onSelectedClassesChange' is called", async () => {
    const { result } = renderHook(
      (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
      { initialProps },
    );

    act(() => {
      result.current.onSelectedClassesChanged([concreteClass1.id]);
    });
    await waitFor(() => {
      expect(result.current.selectedClasses).toMatchObject([concreteClass1]);
    });
  });

  it("clears selected classes when new descriptor is provided", async () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
      { initialProps },
    );

    act(() => {
      result.current.onSelectedClassesChanged([concreteClass1.id]);
    });
    await waitFor(() => {
      expect(result.current.selectedClasses).toMatchObject([concreteClass1]);
    });

    const newDescriptor = createTestContentDescriptor({
      selectClasses: [{ selectClassInfo: concreteClass1, isSelectPolymorphic: false }],
      categories: [category],
      fields: [basePropertiesField],
    });
    // rerender with new descriptor
    rerender({ descriptor: newDescriptor, imodel: initialProps.imodel });
    expect(result.current.selectedClasses).toHaveLength(0);
  });

  it("does not clear selected classes on rerender when descriptor does not change", async () => {
    const { result, rerender } = renderHook(
      (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
      { initialProps },
    );

    act(() => {
      result.current.onSelectedClassesChanged([concreteClass1.id]);
    });
    await waitFor(() => {
      expect(result.current.selectedClasses).toMatchObject([concreteClass1]);
    });

    rerender({ descriptor: initialProps.descriptor, imodel: initialProps.imodel });
    expect(result.current.selectedClasses).toMatchObject([concreteClass1]);
  });

  describe("properties filtering", () => {
    it("returns properties only of selected class", async () => {
      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps },
      );

      act(() => {
        result.current.onSelectedClassesChanged([concreteClass2.id]);
      });
      await waitFor(() => expect(result.current.properties).toHaveLength(3));
    });

    it("return all properties when selected class contains all available properties", async () => {
      const testDescriptor = createTestContentDescriptor({
        selectClasses: [{ selectClassInfo: concreteClass1, isSelectPolymorphic: false }],
        categories: [category],
        fields: [basePropertiesField, concretePropertiesField1],
      });
      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps: { ...initialProps, descriptor: testDescriptor } },
      );

      await waitFor(() => expect(result.current.properties).toHaveLength(2));

      act(() => {
        result.current.onSelectedClassesChanged([concreteClass1.id]);
      });
      await waitFor(() => expect(result.current.properties).toHaveLength(2));
    });

    it("returns union of properties that are derived from two selected classes", async () => {
      const testDescriptor = createTestContentDescriptor({
        selectClasses: [
          { selectClassInfo: concreteClass1, isSelectPolymorphic: false },
          { selectClassInfo: concreteClass2, isSelectPolymorphic: false },
        ],
        categories: [category],
        fields: [basePropertiesField, concretePropertiesField1, concretePropertiesField2],
      });

      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps: { ...initialProps, descriptor: testDescriptor } },
      );

      act(() => {
        result.current.onSelectedClassesChanged([concreteClass1.id, concreteClass2.id]);
      });

      await waitFor(() => expect(result.current.properties).toHaveLength(3));
    });

    it("selects classes that have selected property", async () => {
      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps },
      );

      const property = result.current.properties.find(
        (prop) => prop.displayLabel === concretePropertiesField2.label,
      ) as PropertyDescription;

      act(() => {
        result.current.onRulePropertySelected(property);
      });
      await waitFor(() => {
        expect(result.current.selectedClasses).toMatchObject([concreteClass2]);
      });
    });

    it("selects all derived classes that have selected property", async () => {
      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps },
      );

      const property = result.current.properties.find(
        (prop) => prop.displayLabel === basePropertiesField.label,
      ) as PropertyDescription;

      act(() => {
        result.current.onRulePropertySelected(property);
      });
      await waitFor(() => {
        expect(result.current.selectedClasses).toMatchObject([concreteClass1, concreteClass2]);
      });
    });

    it("selects all classes that have selected property", async () => {
      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps },
      );

      const property = result.current.properties.find(
        (prop) => prop.displayLabel === mergedPropertiesField.label,
      ) as PropertyDescription;

      act(() => {
        result.current.onRulePropertySelected(property);
      });
      await waitFor(() => {
        expect(result.current.selectedClasses).toMatchObject([concreteClass1, concreteClass2]);
      });
    });

    it("does not change selected classes when selected property class is already selected", async () => {
      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps },
      );

      act(() => {
        result.current.onSelectedClassesChanged([concreteClass2.id]);
      });
      await waitFor(() => {
        expect(result.current.selectedClasses).toMatchObject([concreteClass2]);
      });

      const property = result.current.properties.find(
        (prop) => prop.displayLabel === concretePropertiesField2.label,
      ) as PropertyDescription;

      act(() => {
        result.current.onRulePropertySelected(property);
      });
      await waitFor(() => {
        expect(result.current.selectedClasses).toMatchObject([concreteClass2]);
      });
    });

    it("does not change selected classes when 'onPropertySelected' is invoked with invalid property", () => {
      const { result } = renderHook(
        (props: HookProps) => usePresentationInstanceFilteringProps(props.descriptor, props.imodel),
        { initialProps },
      );

      act(() => {
        result.current.onRulePropertySelected({ name: "invalidProp", displayLabel: "InvalidProp", typename: "string" });
      });
      expect(result.current.selectedClasses).toHaveLength(0);
    });
  });
});
