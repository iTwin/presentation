/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { PropsWithChildren } from "react";
import sinon from "sinon";
import * as moq from "typemoq";
import { IModelConnection } from "@itwin/core-frontend";
import { Content, KeySet } from "@itwin/presentation-common";
import { Presentation, PresentationManager, SelectionManager } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
import { TableColumnDefinition, TableRowDefinition } from "../../presentation-components/table/Types";
import {
  usePresentationTable, UsePresentationTableProps, usePresentationTableWithUnifiedSelection,
} from "../../presentation-components/table/UsePresentationTable";
import { UnifiedSelectionContextProvider } from "../../presentation-components/unified-selection/UnifiedSelectionContext";
import { createTestECInstanceKey, createTestPropertyInfo } from "../_helpers/Common";
import { createTestContentDescriptor, createTestContentItem, createTestPropertiesContentField } from "../_helpers/Content";
import { mockPresentationManager } from "../_helpers/UiComponents";

describe("usePresentationTable", () => {
  const imodel = {} as IModelConnection;
  const initialProps: UsePresentationTableProps<TableColumnDefinition, TableRowDefinition> = {
    imodel,
    keys: new KeySet([createTestECInstanceKey()]),
    ruleset: "ruleset_id",
    columnMapper: (col) => col,
    rowMapper: (row) => row,
    pageSize: 10,
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

  it("loads columns and rows", async () => {
    const propertiesField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [{ property: createTestPropertyInfo() }] });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item = createTestContentItem({
      values: { [propertiesField.name]: "test_value" },
      displayValues: { [propertiesField.name]: "Test value" },
    });
    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.isAny())).returns(async () => descriptor);
    presentationManagerMock.setup(async (x) => x.getContentAndSize(moq.It.isAny())).returns(async () => ({ content: new Content(descriptor, [item]), size: 1 }));

    const { result } = renderHook(
      (props: UsePresentationTableProps<TableColumnDefinition, TableRowDefinition>) => usePresentationTable(props),
      { initialProps },
    );

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.columns).to.have.lengthOf(1).and.containSubset([{
      name: propertiesField.name,
      label: propertiesField.label,
      field: propertiesField,
    }]);
    expect(result.current.rows).to.have.lengthOf(1);
    expect(result.current.rows[0].cells).to.have.lengthOf(1).and.containSubset([{
      key: propertiesField.name,
    }]);
  });
});

describe("usePresentationTableWithUnifiedSelection", () => {
  const imodel = {} as IModelConnection;
  const initialProps: Omit<UsePresentationTableProps<TableColumnDefinition, TableRowDefinition>, "keys"> = {
    imodel,
    ruleset: "ruleset_id",
    columnMapper: (col) => col,
    rowMapper: (row) => row,
    pageSize: 10,
  };

  let presentationManagerMock: moq.IMock<PresentationManager>;

  beforeEach(() => {
    const { presentationManager } = mockPresentationManager();
    presentationManagerMock = presentationManager;
    sinon.stub(Presentation, "presentation").get(() => presentationManagerMock.object);

    const selectionManager = new SelectionManager({ scopes: undefined as any });
    sinon.stub(Presentation, "selection").get(() => selectionManager);
  });

  function Wrapper({ children }: PropsWithChildren<{}>) {
    return <UnifiedSelectionContextProvider imodel={imodel}>{children}</UnifiedSelectionContextProvider>;
  }

  it("loads columns and rows with keys from unified selection", async () => {
    const propertiesField = createTestPropertiesContentField({ name: "first_field", label: "First Field", properties: [{ property: createTestPropertyInfo() }] });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item = createTestContentItem({
      values: { [propertiesField.name]: "test_value" },
      displayValues: { [propertiesField.name]: "Test value" },
    });

    const keys = new KeySet([createTestECInstanceKey()]);
    sinon.stub(Presentation.selection, "getSelection").returns(keys);

    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.is((options) => options.keys.size === keys.size))).returns(async () => descriptor);
    presentationManagerMock.setup(async (x) => x.getContentAndSize(moq.It.is((options) => options.keys.size === keys.size))).returns(async () => ({ content: new Content(descriptor, [item]), size: 1 }));

    const { result } = renderHook(
      () => usePresentationTableWithUnifiedSelection(initialProps),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.columns).to.have.lengthOf(1).and.containSubset([{
      name: propertiesField.name,
      label: propertiesField.label,
      field: propertiesField,
    }]);
    expect(result.current.rows).to.have.lengthOf(1);
    expect(result.current.rows[0].cells).to.have.lengthOf(1).and.containSubset([{
      key: propertiesField.name,
    }]);
  });

  it("loads columns and rows with no keys unified selection context is not available", async () => {
    presentationManagerMock.setup(async (x) => x.getContentDescriptor(moq.It.is((options) => options.keys.isEmpty))).returns(async () => undefined);
    presentationManagerMock.setup(async (x) => x.getContentAndSize(moq.It.is((options) => options.keys.isEmpty))).returns(async () => undefined);

    const { result } = renderHook(
      () => usePresentationTableWithUnifiedSelection(initialProps),
    );

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.columns).to.have.lengthOf(0);
    expect(result.current.rows).to.have.lengthOf(0);
  });
});
