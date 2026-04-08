/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator } from "presentation-test-utilities";
import { beforeEach, describe, expect, it, Mocked, vi } from "vitest";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import { InstanceKey, Item, KeySet } from "@itwin/presentation-common";
import { Presentation, PresentationManager, SelectionManager } from "@itwin/presentation-frontend";
import { createStorage, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { TableColumnDefinition, TableRowDefinition } from "../../presentation-components/table/Types.js";
import {
  usePresentationTable,
  UsePresentationTableProps,
  usePresentationTableWithUnifiedSelection,
  UsePresentationTableWithUnifiedSelectionProps,
} from "../../presentation-components/table/UsePresentationTable.js";
import { createTestECInstanceKey, createTestPropertyInfo } from "../_helpers/Common.js";
import { createTestContentDescriptor, createTestContentItem, createTestPropertiesContentField } from "../_helpers/Content.js";
import { createTestECClassGroupingNodeKey, createTestECInstancesNodeKey } from "../_helpers/Hierarchy.js";
import { act, createMocked, renderHook, waitFor } from "../TestUtils.js";

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

  let presentationManager: Mocked<PresentationManager>;

  beforeEach(() => {
    presentationManager = createMocked(PresentationManager);
    vi.spyOn(Presentation, "presentation", "get").mockReturnValue(presentationManager);
    vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    } as unknown as QuantityFormatter);
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

    presentationManager.getContentDescriptor.mockResolvedValue(descriptor);
    presentationManager.getContentIterator.mockImplementation(async () => ({ descriptor, items: createAsyncIterator([item]), total: 1 }));

    const { result } = renderHook((props: UsePresentationTableProps<TableColumnDefinition, TableRowDefinition>) => usePresentationTable(props), {
      initialProps,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.columns).toHaveLength(1);
    expect(result.current.columns).toMatchObject([
      {
        name: propertiesField.name,
        label: propertiesField.label,
        field: propertiesField,
      },
    ]);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].cells).toHaveLength(1);
    expect(result.current.rows[0].cells).toMatchObject([
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

  let presentationManager: Mocked<PresentationManager>;

  beforeEach(() => {
    presentationManager = createMocked(PresentationManager);
    vi.spyOn(Presentation, "presentation", "get").mockReturnValue(presentationManager);
    vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    } as unknown as QuantityFormatter);
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

    presentationManager.getContentDescriptor.mockResolvedValue(descriptor);
    presentationManager.getContentIterator.mockImplementation(async () => ({ descriptor, items: createAsyncIterator([item]), total: 1 }));

    const selectedKey = createTestECInstanceKey();
    const selectionStorage = createStorage();
    selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [selectedKey] });

    const { result } = renderHook(() => usePresentationTableWithUnifiedSelection({ ...initialProps, selectionStorage }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.columns).toHaveLength(1);
    expect(result.current.columns).toMatchObject([
      {
        name: propertiesField.name,
        label: propertiesField.label,
        field: propertiesField,
      },
    ]);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].cells).toHaveLength(1);
    expect(result.current.rows[0].cells).toMatchObject([
      {
        key: propertiesField.name,
      },
    ]);

    expect(presentationManager.getContentDescriptor).toHaveBeenCalled();
    expect(presentationManager.getContentDescriptor.mock.lastCall![0].keys.has(selectedKey)).toBe(true);
    expect(presentationManager.getContentIterator).toHaveBeenCalled();
    expect(presentationManager.getContentIterator.mock.lastCall![0].keys.has(selectedKey)).toBe(true);
  });

  it("loads columns and rows with no keys when unified selection is empty", async () => {
    presentationManager.getContentDescriptor.mockResolvedValue(undefined);
    presentationManager.getContentIterator.mockImplementation(async () => undefined);

    const { result } = renderHook((props) => usePresentationTableWithUnifiedSelection(props), {
      initialProps: { ...initialProps, selectionStorage: createStorage() },
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.columns).toHaveLength(0);
    expect(result.current.rows).toHaveLength(0);
  });

  describe("with deprecated `SelectionManager` from `presentation-frontend` package", () => {
    beforeEach(() => {
      const selectionManager = new SelectionManager({ scopes: undefined as any });
      vi.spyOn(Presentation, "selection", "get").mockReturnValue(selectionManager);
    });

    it("loads data when grouping node is selected", async () => {
      const groupingKey = createTestECClassGroupingNodeKey();
      const keys = new KeySet([groupingKey]);

      vi.spyOn(Presentation.selection, "getSelection").mockReturnValue(keys);

      setupPresentationManager();

      const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.rows.length).toEqual(1);
      });

      expect(presentationManager.getContentDescriptor).toHaveBeenCalled();
      expect(presentationManager.getContentDescriptor.mock.lastCall![0].keys.hasAll(keys)).toBe(true);
      expect(presentationManager.getContentIterator).toHaveBeenCalled();
      expect(presentationManager.getContentIterator.mock.lastCall![0].keys.hasAll(keys)).toBe(true);
    });

    describe("updating unified selection on table selection changes (`onSelect` calls)", () => {
      it("adds passed keys to `SelectionManager`", async () => {
        const keys = new KeySet([createTestECInstanceKey()]);
        const stringifiedKeys: string[] = [];

        keys.forEach((key) => {
          stringifiedKeys.push(JSON.stringify(key));
        });

        vi.spyOn(Presentation.selection, "getSelection").mockReturnValue(keys);

        setupPresentationManager();

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        const replaceSpy = vi.spyOn(Presentation.selection, "replaceSelection");
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const expectedKeys = result.current.rows.map((row) => JSON.parse(row.key));
        act(() => {
          result.current.onSelect(stringifiedKeys);
        });
        expect(replaceSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("UnifiedSelectionTable"), imodel, expectedKeys, 1);
      });

      it("gets invalid keys and does not pass any to `SelectionManager`", async () => {
        const keys = ["this is not a valid key", ""];
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const replaceSpy = vi.spyOn(Presentation.selection, "replaceSelection");
        act(() => {
          result.current.onSelect(keys);
        });

        expect(replaceSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("UnifiedSelectionTable"), imodel, [], 1);
      });

      it("gets valid keys for rows that are not loaded and does not pass any to `SelectionManager`", async () => {
        const stringifiedKeys = [createTestECInstanceKey()].map((key) => JSON.stringify(key));

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        const replaceSpy = vi.spyOn(Presentation.selection, "replaceSelection");
        act(() => {
          result.current.onSelect(stringifiedKeys);
        });

        await waitFor(() => {
          expect(replaceSpy).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("UnifiedSelectionTable"), imodel, [], 1);
        });
      });
    });

    describe("reacting to unified selection changes", () => {
      it("loads rows when unified selection changes", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(0);
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
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(1);
        });
        expect(presentationManager.getContentDescriptor).toHaveBeenCalled();
        expect(presentationManager.getContentDescriptor.mock.lastCall![0].keys.hasAll(keySet)).toBe(true);
        expect(presentationManager.getContentIterator).toHaveBeenCalled();
        expect(presentationManager.getContentIterator.mock.lastCall![0].keys.hasAll(keySet)).toBe(true);
      });

      it("ignores selection changes on different imodel", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(0);
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
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(0);
          expect(presentationManager.getContentDescriptor).not.toHaveBeenCalled();
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
          expect(Presentation.selection.getSelection(imodel, 0).size).toBe(keys.size);
          expect(Presentation.selection.getSelection(imodel, 1).size).toBe(keys.size);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const resultAfterLoading = result.current.selectedRows;
          expect(resultAfterLoading.length).toEqual(1);
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
          expect(Presentation.selection.getSelection(imodel, 0).size).toBe(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).toBe(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(1);
        });

        act(() => {
          Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey2]), 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).toEqual(2);
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
          expect(Presentation.selection.getSelection(imodel, 0).size).toBe(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).toBe(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(1);
          expect(selectedRowsAfterLoading[0].key).toEqual(JSON.stringify(instanceKey1));
        });

        act(() => {
          Presentation.selection.replaceSelection(selectionSource, imodel, new KeySet([instanceKey2]), 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterReplacing = result.current.selectedRows;
          expect(selectedRowsAfterReplacing.length).toEqual(1);
          expect(selectedRowsAfterReplacing[0].key).toEqual(JSON.stringify(instanceKey2));
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
          expect(Presentation.selection.getSelection(imodel, 0).size).toBe(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).toBe(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(2);
        });

        act(() => {
          Presentation.selection.removeFromSelection(selectionSource, imodel, new KeySet([instanceKey1]), 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterRemoving = result.current.selectedRows;
          expect(selectedRowsAfterRemoving.length).toEqual(1);
          expect(selectedRowsAfterRemoving[0].key).toEqual(JSON.stringify(instanceKey2));
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
          expect(Presentation.selection.getSelection(imodel, 0).size).toBe(2);
          expect(Presentation.selection.getSelection(imodel, 1).size).toBe(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(2);
        });

        act(() => {
          Presentation.selection.clearSelection(selectionSource, imodel, 1);
        });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterClearing = result.current.selectedRows;
          expect(selectedRowsAfterClearing.length).toEqual(0);
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
          expect(Presentation.selection.getSelection(imodel, 0).size).toBe(1);
          expect(Presentation.selection.getSelection(imodel, 1).size).toBe(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toBe(1);
          expect(result.current.selectedRows.length).toBe(1);
        });

        setupPresentationManager([instanceKey1, instanceKey2]);
        act(() => {
          Presentation.selection.addToSelection(selectionSource, imodel, new KeySet([instanceKey2]), 0);
        });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toBe(2);
          expect(result.current.selectedRows.length).toBe(0);
        });
      });

      it("returns an empty array of selectedRows when keys are passed from the wrong level on selectionChange event", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
          Presentation.selection.addToSelection(selectionSource, initialProps.imodel, new KeySet([createTestECInstanceKey()]), 3);
        });

        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).toEqual(0);
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
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(true);

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
          const stringifiedKeys: string[] = [];
          selectionLevel0.forEach((key) => {
            stringifiedKeys.push(JSON.stringify(key));
          });
          result.current.onSelect(stringifiedKeys);
        });
        await waitFor(() => {
          expect(Selectables.hasAll(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }), selectionLevel0)).toBe(true);
        });
      });

      it("gets invalid keys and does not pass any to storage", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(true);

        act(() => {
          result.current.onSelect(["this is not a valid key", ""]);
        });
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(true);
      });

      it("gets valid keys for rows that are not loaded and does not pass any to storage", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(true);

        act(() => {
          const stringifiedKeys = [createTestECInstanceKey()].map((key) => JSON.stringify(key));
          result.current.onSelect(stringifiedKeys);
        });
        expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(true);
      });
    });

    describe("reacting to unified selection changes", () => {
      it("loads rows when unified selection changes", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(0);
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
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(1);
        });
        expect(presentationManager.getContentDescriptor).toHaveBeenCalled();
        expect(presentationManager.getContentDescriptor.mock.lastCall![0].keys.hasAll(selectablesInstanceKeys)).toBe(true);
        expect(presentationManager.getContentIterator).toHaveBeenCalled();
        expect(presentationManager.getContentIterator.mock.lastCall![0].keys.hasAll(selectablesInstanceKeys)).toBe(true);
      });

      it("ignores selection changes on different imodel", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(0);
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
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toEqual(0);
          expect(presentationManager.getContentDescriptor).not.toHaveBeenCalled();
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
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).toBe(1);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const resultAfterLoading = result.current.selectedRows;
          expect(resultAfterLoading.length).toEqual(1);
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
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).toBe(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(1);
        });

        act(() => {
          selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey2], level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).toEqual(2);
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
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).toBe(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(1);
          expect(selectedRowsAfterLoading[0].key).toEqual(JSON.stringify(instanceKey1));
        });

        act(() => {
          selectionStorage.replaceSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey2], level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterReplacing = result.current.selectedRows;
          expect(selectedRowsAfterReplacing.length).toEqual(1);
          expect(selectedRowsAfterReplacing[0].key).toEqual(JSON.stringify(instanceKey2));
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
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).toBe(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(2);
        });

        act(() => {
          selectionStorage.removeFromSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey1], level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterRemoving = result.current.selectedRows;
          expect(selectedRowsAfterRemoving.length).toEqual(1);
          expect(selectedRowsAfterRemoving[0].key).toEqual(JSON.stringify(instanceKey2));
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
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).toBe(2);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(2);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterLoading = result.current.selectedRows;
          expect(selectedRowsAfterLoading.length).toEqual(2);
        });

        act(() => {
          selectionStorage.clearSelection({ imodelKey: imodel.key, source: selectionSource, level: 1 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterClearing = result.current.selectedRows;
          expect(selectedRowsAfterClearing.length).toEqual(0);
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
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 0 }))).toBe(1);
          expect(Selectables.size(selectionStorage.getSelection({ imodelKey: imodel.key, level: 1 }))).toBe(1);
        });

        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toBe(1);
          expect(result.current.selectedRows.length).toBe(1);
        });

        setupPresentationManager([instanceKey1, instanceKey2]);
        act(() => {
          selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [instanceKey2], level: 0 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.rows.length).toBe(2);
          expect(result.current.selectedRows.length).toBe(0);
        });
      });

      it("returns an empty array of selectedRows when keys are passed from the wrong level on selectionChange event", async () => {
        const { result } = renderHook(() => usePresentationTableWithUnifiedSelection(initialProps));
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => {
          selectionStorage.addToSelection({ imodelKey: imodel.key, source: selectionSource, selectables: [createTestECInstanceKey()], level: 3 });
        });
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false);
          const selectedRowsAfterAdding = result.current.selectedRows;
          expect(selectedRowsAfterAdding.length).toEqual(0);
        });
      });
    });
  });

  /** Creates rows for the provided keys */
  function setupPresentationManager(keys: InstanceKey[] = [createTestECInstanceKey()]) {
    presentationManager.getContentDescriptor.mockReset();
    presentationManager.getContentIterator.mockReset();

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

    presentationManager.getContentDescriptor.mockResolvedValue(descriptor);
    presentationManager.getContentIterator.mockImplementation(async () => ({ descriptor, items: createAsyncIterator(items), total: keys.length }));
  }
});
