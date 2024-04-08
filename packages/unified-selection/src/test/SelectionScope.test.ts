/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ECSqlBinding, ECSqlQueryReader, ECSqlQueryReaderOptions, ECSqlQueryRow } from "../unified-selection/queries/ECSqlCore";
import { SelectableInstanceKey } from "../unified-selection/Selectable";
import { SelectionScope } from "../unified-selection/SelectionScope";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

describe("SelectionScope", () => {
  const queryExecutor = {
    createQueryReader: sinon.stub<[string, ECSqlBinding[] | undefined, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
  };

  describe("getSelectionScopes", () => {
    it("returns expected selection scopes", async () => {
      const result = SelectionScope.getSelectionScopes();
      expect(result.map((s) => s.id)).to.deep.eq(["element", "assembly", "top-assembly" /* , "category", "model" */]);
    });
  });

  describe("computeSelection", () => {
    function createFakeQueryReader<TRow extends object>(rows: TRow[]): ECSqlQueryReader {
      return (async function* () {
        for (const row of rows) {
          yield row;
        }
      })();
    }

    function mockQuery(targetQueryContent: string, result: SelectableInstanceKey[]) {
      queryExecutor.createQueryReader
        .withArgs(sinon.match((query: string) => query.includes(targetQueryContent)))
        // eslint-disable-next-line @typescript-eslint/naming-convention
        .returns(createFakeQueryReader<ECSqlQueryRow>(result.map((key) => ({ ECInstanceId: key.id, ClassName: key.className }))));
    }

    async function computeSelection(keys: SelectableInstanceKey[], scope: string): Promise<SelectableInstanceKey[]> {
      const selectables: SelectableInstanceKey[] = [];
      for await (const selectable of SelectionScope.computeSelection(
        queryExecutor,
        keys.map((k) => k.id),
        scope,
      )) {
        selectables.push(selectable);
      }
      return selectables;
    }

    function selectionScopeTestCases(scope: string, query: string) {
      it("returns element keys", async () => {
        const keys = [createSelectableInstanceKey(), createSelectableInstanceKey()];
        mockQuery(query, keys);

        const result = await computeSelection(keys, scope);
        expect(result.length).to.eq(2);
        expect(result).to.have.deep.members(keys);
      });

      it("skips transient element ids", async () => {
        const keys = [createSelectableInstanceKey(), { className: "any:class", id: "0xffffff0000000001" }];
        mockQuery(query, keys);

        const result = await computeSelection(keys, scope);
        expect(result.length).to.eq(2);
        expect(result).to.deep.contain(keys[0]);
      });
    }

    it("throws on invalid scopeId", async () => {
      await expect(computeSelection([], "invalid")).to.eventually.be.rejected;
    });

    describe("scope: 'element'", () => {
      selectionScopeTestCases("element", "Element");
    });

    describe("scope: 'assembly'", () => {
      selectionScopeTestCases("assembly", "Element");
    });

    describe("scope: 'top-assembly'", () => {
      selectionScopeTestCases("top-assembly", "Element");
    });

    describe("scope: 'category'", () => {
      selectionScopeTestCases("category", "Category");
    });

    describe("scope: 'model'", () => {
      selectionScopeTestCases("model", "Model");
    });

    describe("scope: 'functional'", () => {
      selectionScopeTestCases("functional", "Functional");
    });

    describe("scope: 'functional-element'", () => {
      selectionScopeTestCases("functional-element", "Functional");
    });

    describe("scope: 'functional-assembly'", () => {
      selectionScopeTestCases("functional-assembly", "Functional");
    });

    describe("scope: 'functional-top-assembly'", () => {
      selectionScopeTestCases("functional-top-assembly", "Functional");
    });
  });
});
