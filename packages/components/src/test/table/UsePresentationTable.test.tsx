/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ContentDescriptorRequestOptions, InstanceKey, Item, KeySet, RulesetVariable } from "@itwin/presentation-common";
import { Presentation, PresentationManager, SelectionManager } from "@itwin/presentation-frontend";
import { createStorage, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { createTestECInstanceKey, createTestPropertyInfo } from "../_helpers/Common.js";
import { createTestContentDescriptor, createTestContentItem, createTestPropertiesContentField } from "../_helpers/Content.js";
import { createTestECClassGroupingNodeKey, createTestECInstancesNodeKey } from "../_helpers/Hierarchy.js";
import { TableColumnDefinition, TableRowDefinition } from "../../presentation-components/table/Types.js";
import {
  usePresentationTable,
  UsePresentationTableProps,
  usePresentationTableWithUnifiedSelection,
  UsePresentationTableWithUnifiedSelectionProps,
} from "../../presentation-components/table/UsePresentationTable.js";
import { act, renderHook, waitFor } from "../TestUtils.js";

/* eslint-disable @typescript-eslint/no-deprecated */

describe("usePresentationTable", () => {
  const imodel = {
    key: "imodel_key",
  } as IModelConnection;
  const initialProps: UsePresentationTableProps<TableColumnDefinition, TableRowDefinition> = {
    imodel,
    keys: new KeySet([createTestECInstanceKey()]),
    ruleset: "ruleset_id",
    columnMapper: (col) => col,
    rowMapper: (row) => row,
    pageSize: 10,
  };

  let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;

  beforeEach(() => {
    presentationManager = sinon.createStubInstance(PresentationManager);
    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    }));
  });

  afterEach(() => {
    sinon.restore();
  });

  it("loads columns and rows", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item = createTestContentItem({
      values: { [propertiesField.name]: "test_value" },
      displayValues: { [propertiesField.name]: "Test value" },
    });

    presentationManager.getContentDescriptor.resolves(descriptor);
    presentationManager.getContentIterator.callsFake(async () => ({ descriptor, items: createAsyncIterator([item]), total: 1 }));

    const { result } = renderHook((props: UsePresentationTableProps<TableColumnDefinition, TableRowDefinition>) => usePresentationTable(props), {
      initialProps,
    });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.columns)
      .to.have.lengthOf(1)
      .and.containSubset([
        {
          name: propertiesField.name,
          label: propertiesField.label,
          field: propertiesField,
        },
      ]);
    expect(result.current.rows).to.have.lengthOf(1);
    expect(result.current.rows[0].cells)
      .to.have.lengthOf(1)
      .and.containSubset([
        {
          key: propertiesField.name,
        },
      ]);
  });
});

describe("usePresentationTableWithUnifiedSelection", () => {
  const imodel = {
    key: "imodel_key",
  } as IModelConnection;
  const initialProps: UsePresentationTableWithUnifiedSelectionProps<TableColumnDefinition, TableRowDefinition> = {
    imodel,
    ruleset: "ruleset_id",
    columnMapper: (col) => col,
    rowMapper: (row) => row,
    pageSize: 10,
  };
  const selectionSource = "TestSource";

  let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;

  beforeEach(() => {
    presentationManager = sinon.createStubInstance(PresentationManager);
    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    }));
    IModelConnection.onOpen.raiseEvent(imodel);
  });

  it("loads columns and rows with keys from unified selection", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item = createTestContentItem({
      values: { [propertiesField.name]: "test_value" },
      displayValues: { [propertiesField.name]: "Test value" },
    });

    presentationManager.getContentDescriptor.resolves(descriptor);
    presentationManager.getContentIterator.callsFake(async () => ({ descriptor, items: createAsyncIterator([item]), total: 1 }));

    const selectedKey = createTestECInstanceKey();
    const selectionStorage = createStorage();
    selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [selectedKey] });

    const { result } = renderHook(() => usePresentationTableWithUnifiedSelection({ ...initialProps, selectionStorage }));

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.columns)
      .to.have.lengthOf(1)
      .and.containSubset([
        {
          name: propertiesField.name,
          label: propertiesField.label,
          field: propertiesField,
        },
      ]);
    expect(result.current.rows).to.have.lengthOf(1);
    expect(result.current.rows[0].cells)
      .to.have.lengthOf(1)
      .and.containSubset([
        {
          key: propertiesField.name,
        },
      ]);

    expect(presentationManager.getContentDescriptor).to.be.calledWith(
      sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.has(selectedKey)),
    );
    expect(presentationManager.getContentIterator).to.be.calledWith(
      sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.has(selectedKey)),
    );
  });

  it("loads columns and rows with no keys when unified selection is empty", async () => {
    presentationManager.getContentDescriptor.resolves(undefined);
    presentationManager.getContentIterator.callsFake(async () => undefined);

    const { result } = renderHook((props) => usePresentationTableWithUnifiedSelection(props), {
      initialProps: { ...initialProps, selectionStorage: createStorage() },
    });
    await waitFor(() => {
      expect(result.current.isLoading).to.be.false;
    });
    expect(result.current.columns).to.have.lengthOf(0);
    expect(result.current.rows).to.have.lengthOf(0);
  });

  describe("with deprecated `SelectionManager` from `presentation-frontend` package", () => {
    beforeEach(() => {
      const selectionManager = new SelectionManager({ scopes: undefined as any });
      sinon.stub(Presentation, "selection").get(() => selectionManager);
    });

    it("loads data when grouping node is selected", async () => {
      const groupingKey = createTestECClassGroupingNodeKey();
      const keys = new KeySet([groupingKey]);

      sinon.stub(Presentation.selection, "getSelection").returns(keys);

      setupPresentationManager();

      const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

      await waitFor(() => {
        expect(result.current.isLoading).to.be.false;
        expect(result.current.rows.length).to.be.equal(1);
      });

      expect(presentationManager.getContentDescriptor).to.be.calledWith(
        sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.hasAll(keys)),
      );
      expect(presentationManager.getContentIterator).to.be.calledWith(
        sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.hasAll(keys)),
      );
    });

    describe("updating unified selection on table selection changes (`onSelect` calls)", () => {
      it("adds passed keys to `SelectionManager`", async () => {
        const keys = new KeySet([createTestECInstanceKey()]);
        const stringifiedKeys: string[] = [];

        keys.forEach((key) => {
          stringifiedKeys.push(JSON.stringify(key));
        });

        sinon.stub(Presentation.selection, "getSelection").returns(keys);

        setupPresentationManager();

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        const replaceSpy = sinon.stub(Presentation.selection, "replaceSelection");
        await waitFor(() => expect(result.current.isLoading).to.be.false);

        const expectedKeys = result.current.rows.map((row) => JSON.parse(row.key));
        act(() => {
          result.current.onSelect(stringifiedKeys);
        });
        expect(replaceSpy).to.be.calledOnceWith(
          sinon.match((source: string) => source.includes("UnifiedSelectionTable")),
          imodel,
          expectedKeys,
          1,
        );
      });

      it("gets invalid keys and does not pass any to `SelectionManager`", async () => {
        const keys = ["this is not a valid key", ""];
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).to.be.false);

        const replaceSpy = sinon.stub(Presentation.selection, "replaceSelection");
        act(() => {
          result.current.onSelect(keys);
        });

        expect(replaceSpy).to.have.been.calledOnceWithExactly(
          sinon.match((source: string) => source.includes("UnifiedSelectionTable")),
          imodel,
          [],
          1,
        );
      });

      it("gets valid keys for rows that are not loaded and does not pass any to `SelectionManager`", async () => {
        const stringifiedKeys = [createTestECInstanceKey()].map((key) => JSON.stringify(key));

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).to.be.false);

        const replaceSpy = sinon.stub(Presentation.selection, "replaceSelection");
        act(() => {
          result.current.onSelect(stringifiedKeys);
        });

        await waitFor(() => {
          expect(replaceSpy).to.have.been.calledOnceWithExactly(
            sinon.match((source: string) => source.includes("UnifiedSelectionTable")),
            imodel,
            [],
            1,
          );
        });
      });
    });

    describe("reacting to unified selection changes", () => {
      it("loads rows when unified selection changes", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(0);
        });
        setupPresentationManager([createTestECInstanceKey()]);

        const selectionChangeInstanceKeys = [
          createTestECInstanceKey({ id: "0x123" }),
          createTestECInstanceKey({ id: "0x456" }),
          createTestECInstanceKey({ id: "0x789" }),
        ];

        const keySet = new KeySet([
          selectionChangeInstanceKeys[0],
          { classFullName: selectionChangeInstanceKeys[1].className, id: selectionChangeInstanceKeys[1].id },
          createTestECInstancesNodeKey({ instanceKeys: [selectionChangeInstanceKeys[2]] }),
        ]);

        act(() => {
          // select the row to get loaded onto the component
          Presentation.selection.addToSelection(selectionSource, imodel, keySet, 0);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(1);
        });
        expect(presentationManager.getContentDescriptor).to.be.calledWith(
          sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.hasAll(keySet)),
        );
        expect(presentationManager.getContentIterator).to.be.calledWith(
          sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.hasAll(keySet)),
        );
      });

      it("ignores selection changes on different imodel", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(0);
        });
        const instanceKey = createTestECInstanceKey();
        setupPresentationManager([instanceKey]);

        const otherIModel = { key: "other_imodel" } as IModelConnection;
        IModelConnection.onOpen.raiseEvent(otherIModel);
        act(() => {
          // select the row to get loaded onto the component
          Presentation.selection.addToSelection(selectionSource, otherIModel, new KeySet([instanceKey]), 0);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(0);
          expect(presentationManager.getContentDescriptor).to.not.be.called;
        });
      });

      it("returns an array of selectedRows when keys are passed before the table is loaded", async () => {
        const keys = new KeySet([createTestECInstanceKey()]);
        setupPresentationManager();

        // select the row to get loaded onto the component
        Presentation.selection.addToSelection(selectionSource, imodel, keys, 0);
        // add the instance to level 1 to make the row selected
        Presentation.selection.addToSelection(selectionSource, imodel, keys, 1);

        // wait for selection to be setup
        await waitFor(() => {
          expect(Presentation.selection.getSelection(imodel, 0).size).to.be.eq(keys.size);
          expect(Presentation.selection.getSelection(imodel, 1).size).to.be.eq(keys.size);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const resultAfterLoading = result.current.selectedRows;
          expect(resultAfterLoading.length).to.be.equal(1);
        });
      });

      it("returns an array of selectedRows when keys are added on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });

        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances at level 0 to get them displayed in the component
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1, instanceKey2]), 0);
        // select instanceKey1 at level 1 to get its row selected
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1]), 1);

        // wait for selection to be setup
        await waitFor(() => {
          expect(Presentation.selection.getSelection(imodel, 0).size).to.be.eq(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).to.be.eq(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(1);
        });

        act(() => {
          Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey2]), 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).to.be.equal(2);
        });
      });

      it("returns new array of selectedRows when keys are replaced on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });

        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances at level 0 to get them displayed in the component
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1, instanceKey2]), 0);
        // select instanceKey1 at level 1 to get its row selected
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1]), 1);

        // wait for selection to be setup
        await waitFor(() => {
          expect(Presentation.selection.getSelection(imodel, 0).size).to.be.eq(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).to.be.eq(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(1);
          expect(selectedRowsAfterLoading[0].key).to.be.equal(JSON.stringify(instanceKey1));
        });

        act(() => {
          Presentation.selection.replaceSelection(selectionSource, imodel, new KeySet([instanceKey2]), 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterReplacing = result.current.selectedRows;
          expect(selectedRowsAfterReplacing.length).to.be.equal(1);
          expect(selectedRowsAfterReplacing[0].key).to.be.equal(JSON.stringify(instanceKey2));
        });
      });

      it("returns smaller array of selectedRows when keys are removed on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });

        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances on both levels to make sure rows are loaded onto the component and selected on initial load.
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1, instanceKey2]), 0);
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1, instanceKey2]), 1);

        // wait for selection to be setup
        await waitFor(() => {
          expect(Presentation.selection.getSelection(imodel, 0).size).to.be.eq(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).to.be.eq(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(2);
        });

        act(() => {
          Presentation.selection.removeFromSelection(selectionSource, imodel, new KeySet([instanceKey1]), 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterRemoving = result.current.selectedRows;
          expect(selectedRowsAfterRemoving.length).to.be.equal(1);
          expect(selectedRowsAfterRemoving[0].key).to.be.equal(JSON.stringify(instanceKey2));
        });
      });

      it("returns new array of selectedRows when keys are cleared on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });

        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances on both levels to make sure rows are loaded onto the component and selected on initial load.
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1, instanceKey2]), 0);
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1, instanceKey2]), 1);

        // wait for selection to be setup
        await waitFor(() => {
          expect(Presentation.selection.getSelection(imodel, 0).size).to.be.eq(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).to.be.eq(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(2);
        });

        act(() => {
          Presentation.selection.clearSelection(selectionSource, imodel, 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterClearing = result.current.selectedRows;
          expect(selectedRowsAfterClearing.length).to.be.equal(0);
        });
      });

      it("clears selected rows when selection in 0 level changes", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });

        setupPresentationManager([instanceKey1]);

        // select both instances on both levels to make sure rows are loaded onto the component and selected on initial load.
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1]), 0);
        Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey1]), 1);

        // wait for selection to be setup
        await waitFor(() => {
          expect(Presentation.selection.getSelection(imodel, 0).size).to.be.eq(1);
          expect(Presentation.selection.getSelection(imodel, 1).size).to.be.eq(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.eq(1);
          expect(result.current.selectedRows.length).to.be.eq(1);
        });

        setupPresentationManager([instanceKey1, instanceKey2]);
        act(() => {
          Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey2]), 0);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.eq(2);
          expect(result.current.selectedRows.length).to.be.eq(0);
        });
      });

      it("returns an empty array of selectedRows when keys are passed from the wrong level on selectionChange event", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => expect(result.current.isLoading).to.be.false);

        act(() => {
          Presentation.selection.addToSelection(selectionSource, initialProps.imodel, new KeySet([createTestECInstanceKey()]), 3);
        });

        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).to.be.equal(0);
        });
      });
    });
  });

  describe("with unified selection storage from `unified-selection` package", () => {
    let selectionStorage: SelectionStorage;

    beforeEach(() => {
      selectionStorage = createStorage();
      initialProps.selectionStorage = selectionStorage;
    });

    describe("updating unified selection on table selection changes (`onSelect` calls)", () => {
      it("adds passed keys to storage", async () => {
        setupPresentationManager();

        const selectionLevel0 = [createTestECInstanceKey()];
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: "UnifiedSelectionTable", selectables: selectionLevel0, level: 0 });
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.be.true;

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).to.be.false);

        act(() => {
          const stringifiedKeys: string[] = [];
          selectionLevel0.forEach((key) => {
            stringifiedKeys.push(JSON.stringify(key));
          });
          result.current.onSelect(stringifiedKeys);
        });
        await waitFor(() => {
          expect(Selectables.hasAll(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }), selectionLevel0)).to.be.true;
        });
      });

      it("gets invalid keys and does not pass any to storage", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).to.be.false);
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.be.true;

        act(() => {
          result.current.onSelect(["this is not a valid key", ""]);
        });
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.be.true;
      });

      it("gets valid keys for rows that are not loaded and does not pass any to storage", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).to.be.false);
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.be.true;

        act(() => {
          const stringifiedKeys = [createTestECInstanceKey()].map((key) => JSON.stringify(key));
          result.current.onSelect(stringifiedKeys);
        });
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.be.true;
      });
    });

    describe("reacting to unified selection changes", () => {
      it("loads rows when unified selection changes", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(0);
        });
        setupPresentationManager([createTestECInstanceKey()]);

        const selectablesInstanceKeys = [createTestECInstanceKey({ id: "0x123" }), createTestECInstanceKey({ id: "0x456" })];

        act(() => {
          // select the row to get loaded onto the component
          selectionStorage.addToSelection({
            imodelKey: imodel.key,
            source: selectionSource,
            selectables: [
              selectablesInstanceKeys[0],
              { identifier: "custom", loadInstanceKeys: () => createAsyncIterator([selectablesInstanceKeys[1]]), data: undefined },
            ],
            level: 0,
          });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(1);
        });
        expect(presentationManager.getContentDescriptor).to.be.calledWith(
          sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.hasAll(selectablesInstanceKeys)),
        );
        expect(presentationManager.getContentIterator).to.be.calledWith(
          sinon.match((options: ContentDescriptorRequestOptions<IModelConnection, KeySet, RulesetVariable>) => options.keys.hasAll(selectablesInstanceKeys)),
        );
      });

      it("ignores selection changes on different imodel", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(0);
        });
        const instanceKey = createTestECInstanceKey();
        setupPresentationManager([instanceKey]);

        const otherIModel = { key: "other_imodel" } as IModelConnection;
        IModelConnection.onOpen.raiseEvent(otherIModel);
        act(() => {
          // select the row to get loaded onto the component
          selectionStorage.addToSelection({ imodelKey: otherIModel.key, source: selectionSource, selectables: [instanceKey], level: 0 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.equal(0);
          expect(presentationManager.getContentDescriptor).to.not.be.called;
        });
      });

      it("returns an array of selectedRows when keys are passed before the table is loaded", async () => {
        const instanceKey = createTestECInstanceKey();
        setupPresentationManager();

        // select the row to get loaded onto the component
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey], level: 0 });
        // add the instance to level 1 to make the row selected
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey], level: 1 });
        // wait for selection to be setup
        await waitFor(() => {
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).to.eq(1);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.eq(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const resultAfterLoading = result.current.selectedRows;
          expect(resultAfterLoading.length).to.be.equal(1);
        });
      });

      it("returns an array of selectedRows when keys are added on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });
        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances at level 0 to get them displayed in the component
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1, instanceKey2], level: 0 });
        // select instanceKey1 at level 1 to get its row selected
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1], level: 1 });
        // wait for selection to be setup
        await waitFor(() => {
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).to.eq(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.eq(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(1);
        });

        act(() => {
          selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey2], level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).to.be.equal(2);
        });
      });

      it("returns new array of selectedRows when keys are replaced on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });
        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances at level 0 to get them displayed in the component
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1, instanceKey2], level: 0 });
        // select instanceKey1 at level 1 to get its row selected
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1], level: 1 });
        // wait for selection to be setup
        await waitFor(() => {
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).to.eq(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.eq(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(1);
          expect(selectedRowsAfterLoading[0].key).to.be.equal(JSON.stringify(instanceKey1));
        });

        act(() => {
          selectionStorage.replaceSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey2], level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterReplacing = result.current.selectedRows;
          expect(selectedRowsAfterReplacing.length).to.be.equal(1);
          expect(selectedRowsAfterReplacing[0].key).to.be.equal(JSON.stringify(instanceKey2));
        });
      });

      it("returns smaller array of selectedRows when keys are removed on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });
        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances on both levels to make sure rows are loaded onto the component and selected on initial load.
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1, instanceKey2], level: 0 });
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1, instanceKey2], level: 1 });
        // wait for selection to be setup
        await waitFor(() => {
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).to.eq(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.eq(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(2);
        });

        act(() => {
          selectionStorage.removeFromSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1], level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterRemoving = result.current.selectedRows;
          expect(selectedRowsAfterRemoving.length).to.be.equal(1);
          expect(selectedRowsAfterRemoving[0].key).to.be.equal(JSON.stringify(instanceKey2));
        });
      });

      it("returns new array of selectedRows when keys are cleared on selectionChange event", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });
        setupPresentationManager([instanceKey1, instanceKey2]);

        // select both instances on both levels to make sure rows are loaded onto the component and selected on initial load.
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1, instanceKey2], level: 0 });
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1, instanceKey2], level: 1 });
        // wait for selection to be setup
        await waitFor(() => {
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).to.eq(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.eq(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).to.be.equal(2);
        });

        act(() => {
          selectionStorage.clearSelection({ imodelKey: imodel.key, source: selectionSource, level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterClearing = result.current.selectedRows;
          expect(selectedRowsAfterClearing.length).to.be.equal(0);
        });
      });

      it("clears selected rows when selection in 0 level changes", async () => {
        const instanceKey1 = createTestECInstanceKey({ id: "0x1" });
        const instanceKey2 = createTestECInstanceKey({ id: "0x2" });
        setupPresentationManager([instanceKey1]);

        // select both instances on both levels to make sure rows are loaded onto the component and selected on initial load.
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1], level: 0 });
        selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1], level: 1 });
        // wait for selection to be setup
        await waitFor(() => {
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).to.eq(1);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).to.eq(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.eq(1);
          expect(result.current.selectedRows.length).to.be.eq(1);
        });

        setupPresentationManager([instanceKey1, instanceKey2]);
        act(() => {
          selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey2], level: 0 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          expect(result.current.rows.length).to.be.eq(2);
          expect(result.current.selectedRows.length).to.be.eq(0);
        });
      });

      it("returns an empty array of selectedRows when keys are passed from the wrong level on selectionChange event", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).to.be.false);

        act(() => {
          selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [createTestECInstanceKey()], level: 3 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).to.be.false;
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).to.be.equal(0);
        });
      });
    });
  });

  /** Creates rows for the provided keys */
  function setupPresentationManager(keys: InstanceKey[] = [createTestECInstanceKey()]) {
    presentationManager.getContentDescriptor.reset();
    presentationManager.getContentIterator.reset();

    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });

    const items: Item[] = [];
    keys.forEach((key) => {
      items.push(
        createTestContentItem({
          values: { [propertiesField.name]: "test_value" },
          displayValues: { [propertiesField.name]: "Test value" },
          primaryKeys: [key] as InstanceKey[],
        }),
      );
    });

    presentationManager.getContentDescriptor.resolves(descriptor);
    presentationManager.getContentIterator.callsFake(async () => ({ descriptor, items: createAsyncIterator(items), total: keys.length }));
  }
});
