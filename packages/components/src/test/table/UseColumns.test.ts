/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as moq from "typemoq";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { renderHook } from "@testing-library/react-hooks";
import { useColumns, UseColumnsProps } from "../../presentation-components/table/UseColumns";
import { createTestECInstanceKey } from "../_helpers/Common";
import { createTestContentDescriptor, createTestNestedContentField, createTestPropertiesContentField } from "../_helpers/Content";
import { mockPresentationManager } from "../_helpers/UiComponents";

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
    Presentation.setPresentationManager(presentationManagerMock.object);
  });

  it("loads columns", async () => {
    const contentField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [] });
    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny())).returns(async () => createTestContentDescriptor({ fields: [contentField] }));

    const { result, waitFor } = renderHook(
      (props) => useColumns(props),
      { initialProps }
    );

    await waitFor(() => result.current !== undefined);
    expect(result.current).to.have.lengthOf(1).and.containSubset([{
      name: contentField.name,
      label: contentField.label,
      field: contentField,
    }]);
  });

  it("loads columns only for properties fields", async () => {
    const propertyField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [] });
    const nestedField = createTestPropertiesContentField({ name: "nested_field", label: "Nested Field", properties: [] });
    const nestingField = createTestNestedContentField({ name: "nesting_field", label: "Nesting Field", nestedFields: [nestedField] });
    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny())).returns(async () => createTestContentDescriptor({ fields: [propertyField, nestingField] }));

    const { result, waitFor } = renderHook(
      (props) => useColumns(props),
      { initialProps }
    );

    await waitFor(() => result.current !== undefined);
    expect(result.current).to.have.lengthOf(1).and.containSubset([{
      name: propertyField.name,
      label: propertyField.label,
      field: propertyField,
    }]);
  });

  it("returns empty column list if no keys provided", async () => {
    const propertyField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [] });
    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny())).returns(async () => createTestContentDescriptor({ fields: [propertyField] }));

    const { result, waitFor } = renderHook(
      (props) => useColumns(props),
      { initialProps: { ...initialProps, keys: new KeySet() } }
    );

    await waitFor(() => result.current !== undefined);
    expect(result.current).to.have.lengthOf(0);
  });

  it("returns empty column list if content descriptor was not loaded", async () => {
    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny())).returns(async () => undefined);

    const { result, waitFor } = renderHook(
      (props) => useColumns(props),
      { initialProps }
    );

    await waitFor(() => result.current !== undefined);
    expect(result.current).to.have.lengthOf(0);
  });
});
