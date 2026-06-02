/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { createStorage, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { IPresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider.js";
import { usePropertyDataProviderWithUnifiedSelection } from "../../presentation-components/propertygrid/UseUnifiedSelection.js";
import { createTestECInstanceKey } from "../_helpers/Common.js";
import { act, renderHook, waitFor } from "../TestUtils.js";

describe("usePropertyDataProviderWithUnifiedSelection", () => {
  const imodelKey = "test-imodel-key";
  const setKeysSpy = vi.fn<(newKeys: KeySet) => void>();
  const dataProvider = {
    set keys(newKeys: KeySet) {
      setKeysSpy(newKeys);
    },
    rulesetId: "test_ruleset_id",
    imodel: { key: imodelKey } as IModelConnection,
  };

  beforeEach(() => {
    setKeysSpy.mockReset();
  });

  function getProvider() {
    return dataProvider as unknown as IPresentationPropertyDataProvider;
  }

  describe("with unified selection storage", () => {
    let selectionStorage: SelectionStorage;

    beforeEach(() => {
      selectionStorage = createStorage();
    });

    it("doesn't set provider keys when selection storage has no selection", () => {
      vi.spyOn(selectionStorage, "getSelectionLevels").mockReturnValue([]);
      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      expect(result.current).toBeDefined();
      expect(result.current.isOverLimit).toBe(false);
      expect(result.current.numSelectedElements).toEqual(0);
      expect(setKeysSpy).not.toHaveBeenCalled();
    });

    it("sets empty keyset when selection storage has empty selection", async () => {
      vi.spyOn(selectionStorage, "getSelectionLevels").mockReturnValue([0]);
      vi.spyOn(selectionStorage, "getSelection").mockReturnValue(Selectables.create([]));

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(result.current).toBeDefined();
        expect(result.current.isOverLimit).toBe(false);
        expect(result.current.numSelectedElements).toEqual(0);
        expect(setKeysSpy.mock.calls[setKeysSpy.mock.calls.length - 1][0].isEmpty).toBe(true);
      });
    });

    it("sets keyset when selection storage has selection", async () => {
      const selectedInstances = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
      selectionStorage.addToSelection({ imodelKey, source: "test", selectables: selectedInstances });

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(result.current).toBeDefined();
        expect(result.current.isOverLimit).toBe(false);
        expect(result.current.numSelectedElements).toEqual(2);
        expect(
          equalKeySets(new KeySet(selectedInstances), setKeysSpy.mock.calls[setKeysSpy.mock.calls.length - 1][0]),
        ).toBe(true);
      });
    });

    it("sets empty keyset when selection storage contains more keys than set limit", async () => {
      const selectedInstances = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
      selectionStorage.addToSelection({ imodelKey, source: "test", selectables: selectedInstances });

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, requestedContentInstancesLimit: 1, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(result.current).toBeDefined();
        expect(result.current.isOverLimit).toBe(true);
        expect(result.current.numSelectedElements).toEqual(2);
        expect(setKeysSpy.mock.calls[setKeysSpy.mock.calls.length - 1][0].isEmpty).toBe(true);
      });
    });

    it("changes KeySet according to selection", async () => {
      const selectedInstances1 = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
      const selectedInstances2 = [createTestECInstanceKey({ id: "0x3" }), createTestECInstanceKey({ id: "0x4" })];

      selectionStorage.addToSelection({ imodelKey, source: "test", selectables: selectedInstances1 });

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(
          equalKeySets(new KeySet(selectedInstances1), setKeysSpy.mock.calls[setKeysSpy.mock.calls.length - 1][0]),
        ).toBe(true);
        expect(result.current).toBeDefined();
        expect(result.current.isOverLimit).toBe(false);
        expect(result.current.numSelectedElements).toEqual(2);
      });

      act(() => {
        selectionStorage.replaceSelection({ imodelKey, source: "test", selectables: selectedInstances2 });
      });
      await waitFor(async () => {
        expect(
          equalKeySets(new KeySet(selectedInstances2), setKeysSpy.mock.calls[setKeysSpy.mock.calls.length - 1][0]),
        ).toBe(true);
      });
    });
  });
});

function equalKeySets(lhs: KeySet, rhs: KeySet) {
  return lhs.size === rhs.size && lhs.hasAll(rhs);
}
