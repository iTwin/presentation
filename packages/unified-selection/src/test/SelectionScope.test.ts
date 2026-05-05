/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow } from "@itwin/presentation-shared";
import { SelectableInstanceKey, TRANSIENT_ELEMENT_CLASSNAME } from "../unified-selection/Selectable.js";
import { computeSelection, SelectionScope } from "../unified-selection/SelectionScope.js";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

describe("SelectionScope", () => {
  const queryExecutor = {
    createQueryReader: vi.fn<(query: ECSqlQueryDef, options?: ECSqlQueryReaderOptions) => ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
  };

  describe("computeSelection", () => {
    function createFakeQueryReader<TRow extends object>(rows: TRow[]): ReturnType<ECSqlQueryExecutor["createQueryReader"]> {
      return (async function* () {
        for (const row of rows) {
          yield row;
        }
      })();
    }

    function mockQuery(targetECSqlContent: string, result: SelectableInstanceKey[]) {
      queryExecutor.createQueryReader.mockImplementation((query: ECSqlQueryDef) => {
        if (query.ecsql.includes(targetECSqlContent)) {
          return createFakeQueryReader<ECSqlQueryRow>(
            // eslint-disable-next-line @typescript-eslint/naming-convention
            result.map((key) => ({ ECInstanceId: key.id, ClassName: key.className })),
          );
        }
        return createFakeQueryReader([]);
      });
    }

    async function getSelection(keys: SelectableInstanceKey[], scope: SelectionScope): Promise<SelectableInstanceKey[]> {
      const selectables: SelectableInstanceKey[] = [];
      for await (const selectable of computeSelection({ queryExecutor, elementIds: keys.map((k) => k.id), scope })) {
        selectables.push(selectable);
      }
      return selectables;
    }

    function selectionScopeTestCases(scope: SelectionScope, query: string) {
      it("returns element keys", async () => {
        const keys = [createSelectableInstanceKey(), createSelectableInstanceKey()];
        mockQuery(query, keys);

        const result = await getSelection(keys, scope);
        expect(result).toHaveLength(2);
        expect(result).toEqual(expect.arrayContaining(keys));
      });

      it("returns persistent and transient element ids", async () => {
        const persistentKey = createSelectableInstanceKey();
        const transientId = "0xffffff0000000001";
        const keys = [persistentKey, { className: "any:class", id: transientId }];
        mockQuery(query, [persistentKey]);

        const result = await getSelection(keys, scope);
        expect(result).toHaveLength(2);
        expect(result).toEqual(expect.arrayContaining([persistentKey, { id: transientId, className: TRANSIENT_ELEMENT_CLASSNAME }]));
      });

      it("returns only transient keys when all element ids are transient", async () => {
        const transientId1 = "0xffffff0000000001";
        const transientId2 = "0xffffff0000000002";
        const keys = [
          { className: "any:class", id: transientId1 },
          { className: "any:class", id: transientId2 },
        ];
        mockQuery(query, []);

        const result = await getSelection(keys, scope);
        expect(result).toHaveLength(2);
        expect(result).toEqual(
          expect.arrayContaining([
            { id: transientId1, className: TRANSIENT_ELEMENT_CLASSNAME },
            { id: transientId2, className: TRANSIENT_ELEMENT_CLASSNAME },
          ]),
        );
      });
    }

    describe("scope: 'element'", () => {
      selectionScopeTestCases("element", "Element");

      describe("ancestor level = 1", () => {
        selectionScopeTestCases({ id: "element", ancestorLevel: 1 }, "Element");
      });

      describe("ancestor level = -1", () => {
        selectionScopeTestCases({ id: "element", ancestorLevel: -1 }, "Element");
      });
    });

    describe("scope: 'category'", () => {
      selectionScopeTestCases("category", "Category");
    });

    describe("scope: 'model'", () => {
      selectionScopeTestCases("model", "Model");
    });

    describe("scope: 'functional'", () => {
      selectionScopeTestCases("functional", "Functional");

      describe("ancestor level = 1", () => {
        selectionScopeTestCases({ id: "functional", ancestorLevel: 1 }, "Functional");
      });
      describe("ancestor level = -1", () => {
        selectionScopeTestCases({ id: "functional", ancestorLevel: -1 }, "Functional");
      });
    });
  });
});
