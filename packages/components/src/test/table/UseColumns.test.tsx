/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { useColumns, UseColumnsProps } from "../../presentation-components/table/UseColumns";
import { createTestECInstanceKey, TestErrorBoundary } from "../_helpers/Common";
import { createTestContentDescriptor, createTestNestedContentField, createTestPropertiesContentField } from "../_helpers/Content";
import { mockPresentationManager } from "../_helpers/UiComponents";
import { render, renderHook, waitFor } from "../TestUtils";

describe("useColumns", () => {
  const imodel = {} as IModelConnection;
  const initialProps: UseColumnsProps = {
    imodel,
    keys: new KeySet([createTestECInstanceKey()]),
    ruleset: "ruleset_id",
  };

  let presentationManagerMock: moq.IMock<PresentationManager>;

  beforeEach(() => {
    const { presentationManager } = mockPresentationManager();
    presentationManagerMock = presentationManager;
    sinon.stub(Presentation, "presentation").get(() => presentationManagerMock.object);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("loads columns", async () => {
    const contentField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [] });
    presentationManagerMock
      .setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
      .returns(async () => createTestContentDescriptor({ fields: [contentField] }));

    const { result } = renderHook((props) => useColumns(props), { initialProps });

    await waitFor(() =>
      expect(result.current)
        .to.have.lengthOf(1)
        .and.containSubset([
          {
            name: contentField.name,
            label: contentField.label,
            field: contentField,
          },
        ]),
    );
  });

  it("loads columns only for properties fields", async () => {
    const propertyField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [] });
    const nestedField = createTestPropertiesContentField({ name: "nested_field", label: "Nested Field", properties: [] });
    const nestingField = createTestNestedContentField({ name: "nesting_field", label: "Nesting Field", nestedFields: [nestedField] });
    presentationManagerMock
      .setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
      .returns(async () => createTestContentDescriptor({ fields: [propertyField, nestingField] }));

    const { result } = renderHook((props) => useColumns(props), { initialProps });

    await waitFor(() =>
      expect(result.current)
        .to.have.lengthOf(1)
        .and.containSubset([
          {
            name: propertyField.name,
            label: propertyField.label,
            field: propertyField,
          },
        ]),
    );
  });

  it("returns empty column list if no keys provided", async () => {
    const propertyField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [] });
    presentationManagerMock
      .setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
      .returns(async () => createTestContentDescriptor({ fields: [propertyField] }));

    const { result } = renderHook((props) => useColumns(props), { initialProps: { ...initialProps, keys: new KeySet() } });

    await waitFor(() => expect(result.current).to.have.lengthOf(0));
  });

  it("returns empty column list if content descriptor was not loaded", async () => {
    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny())).returns(async () => undefined);

    const { result } = renderHook((props) => useColumns(props), { initialProps });

    await waitFor(() => expect(result.current).to.have.lengthOf(0));
  });

  it("throws in React render loop on failure to get content descriptor", async () => {
    presentationManagerMock
      .setup(async (x) => x.getContentDescriptor(moq.It.isAny()))
      .callback(() => {
        throw new Error("test error");
      })
      .returns(async () => undefined);

    const errorSpy = sinon.spy();
    function TestComponent() {
      useColumns(initialProps);
      return null;
    }
    render(
      <TestErrorBoundary onError={errorSpy}>
        <TestComponent />
      </TestErrorBoundary>,
    );

    await waitFor(() => {
      expect(errorSpy).to.be.calledOnce.and.calledWith(sinon.match((error: Error) => error.message === "test error"));
    });
  });
});
