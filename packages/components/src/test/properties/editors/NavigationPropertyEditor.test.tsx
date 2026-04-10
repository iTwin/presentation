/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyDescription } from "@itwin/appui-abstract";
import { PropertyValueRendererManager } from "@itwin/components-react";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Content, KeySet, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { IContentDataProvider } from "../../../presentation-components/common/ContentDataProvider.js";
import { NavigationPropertyTargetEditor } from "../../../presentation-components/properties/editors/NavigationPropertyEditor.js";
import {
  NavigationPropertyEditorContextProvider,
  NavigationPropertyEditorContextProviderProps,
  useNavigationPropertyEditorContextProviderProps,
} from "../../../presentation-components/properties/editors/NavigationPropertyEditorContext.js";
import { stubVirtualization } from "../../_helpers/Common.js";
import {
  createTestContentDescriptor,
  createTestContentItem,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../../_helpers/Content.js";
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
  const getContentStub = vi.fn<PresentationManager["getContent"]>();
  const testRecord = createTestPropertyRecord();

  stubVirtualization();
  beforeEach(() => {
    const localization = new EmptyLocalization();
    vi.spyOn(IModelApp, "initialized", "get").mockReturnValue(true);
    vi.spyOn(IModelApp, "localization", "get").mockReturnValue(localization);
    vi.spyOn(Presentation, "localization", "get").mockReturnValue(localization);
    vi.spyOn(Presentation, "presentation", "get").mockReturnValue({
      getContent: getContentStub,
    } as unknown as PresentationManager);

    getContentStub.mockReset();
    getContentStub.mockResolvedValue(undefined);
  });

  it("renders selector when rendered inside context", async () => {
    const { queryByRole } = render(<NavigationPropertyTargetEditor propertyRecord={testRecord} />, {});
    await waitFor(() => expect(queryByRole("combobox")).not.toBeNull());
  });

  it("uses default property renderer when rendered not in the context", () => {
    const rendererStub = vi.spyOn(PropertyValueRendererManager.defaultManager, "render");
    renderRTL(<NavigationPropertyTargetEditor propertyRecord={testRecord} />);
    expect(rendererStub).toHaveBeenCalledWith(testRecord);
  });

  it("renders nothing when property record is 'undefined'", () => {
    const { container } = render(<NavigationPropertyTargetEditor />, {});
    expect(container.firstChild).toBeNull();
  });

  it("invokes 'onCommit' when new target is selected changes", async () => {
    const contentItem = createTestContentItem({
      label: LabelDefinition.fromLabelString("TestLabel"),
      primaryKeys: [{ id: "1", className: "TestSchema:TestClass" }],
      values: {},
      displayValues: {},
    });
    getContentStub.mockResolvedValue(
      new Content(createTestContentDescriptor({ fields: [], categories: [] }), [contentItem]),
    );
    const spy = vi.fn();
    const { getByPlaceholderText, getByText, getByDisplayValue, user } = render(
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
    expect(spy).toHaveBeenCalledOnce();
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
      [Symbol.dispose]: () => {},
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
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: "test_prop",
      typename: "navigation",
    };
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

    const { result } = renderHook(
      ({ imodel, dataProvider }: Props) => useNavigationPropertyEditorContextProviderProps(imodel, dataProvider),
      { initialProps: { imodel: testImodel, dataProvider: testDataProvider } },
    );

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).toBe(navigationPropertyInfo);
  });

  it("returns undefined if non properties field is returned", async () => {
    const propertyDescription: PropertyDescription = {
      displayLabel: "TestProp",
      name: "test_prop",
      typename: "navigation",
    };
    testDataProvider.getFieldByPropertyDescription = async () => createTestSimpleContentField();

    const { result } = renderHook(
      ({ imodel, dataProvider }: Props) => useNavigationPropertyEditorContextProviderProps(imodel, dataProvider),
      { initialProps: { imodel: testImodel, dataProvider: testDataProvider } },
    );

    const info = await result.current.getNavigationPropertyInfo(propertyDescription);
    expect(info).toBeUndefined();
  });
});
