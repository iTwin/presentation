/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyDescription } from "@itwin/appui-abstract";
import { PropertyValueRendererManager } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Content, KeySet, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { userEvent } from "@testing-library/user-event";
import { IContentDataProvider } from "../../../presentation-components/common/ContentDataProvider.js";
import { NavigationPropertyTargetEditor } from "../../../presentation-components/properties/editors/NavigationPropertyEditor.js";
import {
  NavigationPropertyEditorContextProvider,
  NavigationPropertyEditorContextProviderProps,
  useNavigationPropertyEditorContextProviderProps,
} from "../../../presentation-components/properties/editors/NavigationPropertyEditorContext.js";
import { createTestContentDescriptor, createTestContentItem, createTestPropertiesContentField, createTestSimpleContentField } from "../../_helpers/Content.js";
import { createTestPropertyRecord } from "../../_helpers/UiComponents.js";
import { renderHook, render as renderRTL, waitFor } from "../../TestUtils.js";

function createNavigationPropertyInfo(): NavigationPropertyInfo {
  return {
    classInfo: { name: "TestSchema:PropClass", label: "Prop Class", id: "1" },
    targetClassInfo: { name: "TestSchema:TargetClass", label: "Target Class", id: "2" },
    isForwardRelationship: true,
    isTargetPolymorphic: true,
  };
}

function render(ui: React.ReactElement, context?: Partial<NavigationPropertyEditorContextProviderProps>) {
  const props: NavigationPropertyEditorContextProviderProps = {
    getNavigationPropertyInfo: context?.getNavigationPropertyInfo ?? (async () => createNavigationPropertyInfo()),
    imodel: context?.imodel ?? ({} as IModelConnection),
  };
  return renderRTL(<NavigationPropertyEditorContextProvider {...props}>{ui}</NavigationPropertyEditorContextProvider>);
}

describe("<NavigationPropertyTargetEditor />", () => {
  const getContentStub = sinon.stub<Parameters<PresentationManager["getContent"]>, ReturnType<PresentationManager["getContent"]>>();
  const testRecord = createTestPropertyRecord();

  before(() => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(Presentation, "presentation").get(() => ({
      getContent: getContentStub,
    }));

    sinon.stub(window.Element.prototype, "getBoundingClientRect").returns({
      height: 20,
      width: 20,
      x: 0,
      y: 0,
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      toJSON: () => {},
    });
  });

  after(() => {
    sinon.restore();
  });

  beforeEach(() => {
    getContentStub.reset();
  });

  it("renders selector when rendered inside context", async () => {
    const { queryByRole } = render(<NavigationPropertyTargetEditor propertyRecord={testRecord} />, {});
    await waitFor(() => expect(queryByRole("combobox")).to.not.be.null);
  });

  it("uses default property renderer when rendered not in the context", () => {
    const rendererStub = sinon.stub(PropertyValueRendererManager.defaultManager, "render");
    renderRTL(<NavigationPropertyTargetEditor propertyRecord={testRecord} />);
    expect(rendererStub).to.be.calledWith(testRecord);
  });

  it("renders nothing when property record is 'undefined'", () => {
    const { container } = render(<NavigationPropertyTargetEditor />, {});
    expect(container.firstChild).to.be.null;
  });

  it("invokes 'onCommit' when new target is selected changes", async () => {
    const user = userEvent.setup();
    const contentItem = createTestContentItem({
      label: LabelDefinition.fromLabelString("TestLabel"),
      primaryKeys: [{ id: "1", className: "TestSchema:TestClass" }],
      values: {},
      displayValues: {},
    });
    getContentStub.resolves(new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]));
    const spy = sinon.spy();
    const { getByPlaceholderText, getByText, getByDisplayValue } = render(
      <NavigationPropertyTargetEditor propertyRecord={testRecord} onCancel={() => {}} onCommit={spy} />,
      {
        getNavigationPropertyInfo: async () => ({
          classInfo: { id: "1", label: "Class Label", name: "TestSchema:TestClass" },
          targetClassInfo: { id: "1", label: "Target Label", name: "TestSchema:TargetClass" },
          isForwardRelationship: true,
          isTargetPolymorphic: true,
        }),
      },
    );

    // open dropdown
    const select = await waitFor(() => getByPlaceholderText("navigation-property-editor.select-target-instance"));
    await user.click(select);

    // select option from dropdown
    const target = await waitFor(() => getByText(contentItem.label.displayValue));
    await user.click(target);

    await waitFor(() => getByDisplayValue(contentItem.label.displayValue));
    expect(spy).to.be.calledOnce;
  });
});

describe("useNavigationPropertyEditorContextProviderProps", () => {
  interface Props {
    imodel: IModelConnection;
    dataProvider: IContentDataProvider;
  }
  const testImodel = {} as IModelConnection;
  let testDataProvider: IContentDataProvider;

  beforeEach(() => {
    testDataProvider = {
      imodel: testImodel,
      rulesetId: "",
      displayType: "",
      dispose: () => {},
      getContent: async () => undefined,
      getContentDescriptor: async () => undefined,
      getContentSetSize: async () => 0,
      getFieldByPropertyRecord: async () => undefined,
      getFieldByPropertyDescription: async () => undefined,
      keys: new KeySet(),
      selectionInfo: undefined,
    };
  });

  it("returns navigation property info", async () => {
    const propertyDescription: PropertyDescription = { displayLabel: "TestProp", name: "test_prop", typename: "navigation" };
    const navigationPropertyInfo: NavigationPropertyInfo = {
      classInfo: { id: "1", label: "Class Label", name: "TestSchema:TestClass" },
      targetClassInfo: { id: "2", label: "Target Label", name: "TestSchema:TargetClass" },
      isForwardRelationship: true,
      isTargetPolymorphic: true,
    };

    testDataProvider.getFieldByPropertyDescription = async () =>
      createTestPropertiesContentField({
        properties: [
          {
            property: {
              classInfo: { id: "3", label: "Field Class", name: "TestSchema:FieldClass" },
              name: "Field Name",
              type: "navigation",
              navigationPropertyInfo,
            },
          },
        ],
      });

    const { result } = renderHook(({ imodel, dataProvider }: Props) => useNavigationPropertyEditorContextProviderProps(imodel, dataProvider), {
      initialProps: { imodel: testImodel, dataProvider: testDataProvider },
    });

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).to.be.eq(navigationPropertyInfo);
  });

  it("returns undefined if non properties field is returned", async () => {
    const propertyDescription: PropertyDescription = { displayLabel: "TestProp", name: "test_prop", typename: "navigation" };
    testDataProvider.getFieldByPropertyDescription = async () => createTestSimpleContentField();

    const { result } = renderHook(({ imodel, dataProvider }: Props) => useNavigationPropertyEditorContextProviderProps(imodel, dataProvider), {
      initialProps: { imodel: testImodel, dataProvider: testDataProvider },
    });

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).to.be.undefined;
  });
});
