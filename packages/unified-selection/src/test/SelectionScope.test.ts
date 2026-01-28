/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { computeSelection } from "../unified-selection/SelectionScope.js";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

import type { ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow } from "@itwin/presentation-shared";
import type { SelectableInstanceKey } from "../unified-selection/Selectable.js";
import type { SelectionScope } from "../unified-selection/SelectionScope.js";

describe("SelectionScope", () => {
  const queryExecutor = {
    createQueryReader: sinon.stub<[ECSqlQueryDef, ECSqlQueryReaderOptions | undefined], ReturnType<ECSqlQueryExecutor["createQueryReader"]>>(),
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
      queryExecutor.createQueryReader
        .withArgs(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes(targetECSqlContent)))
        // eslint-disable-next-line @typescript-eslint/naming-convention
        .returns(createFakeQueryReader<ECSqlQueryRow>(result.map((key) => ({ ECInstanceId: key.id, ClassName: key.className }))));
    }

    async function getSelection(keys: SelectableInstanceKey[], scope: SelectionScope): Promise<SelectableInstanceKey[]> {
      const selectables: SelectableInstanceKey[] = [];
      for await (const selectable of computeSelection({
        queryExecutor,
        elementIds: keys.map((k) => k.id),
        scope,
      })) {
        selectables.push(selectable);
      }
      return selectables;
    }

    function selectionScopeTestCases(scope: SelectionScope, query: string) {
      it("returns element keys", async () => {
        const keys = [createSelectableInstanceKey(), createSelectableInstanceKey()];
        mockQuery(query, keys);

        const result = await getSelection(keys, scope);
        expect(result.length).to.eq(2);
        expect(result).to.have.deep.members(keys);
      });

      it("skips transient element ids", async () => {
        const keys = [createSelectableInstanceKey(), { className: "any:class", id: "0xffffff0000000001" }];
        mockQuery(query, keys);

        const result = await getSelection(keys, scope);
        expect(result.length).to.eq(2);
        expect(result).to.deep.contain(keys[0]);
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
