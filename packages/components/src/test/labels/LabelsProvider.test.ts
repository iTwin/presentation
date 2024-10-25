/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { DEFAULT_KEYS_BATCH_SIZE, InstanceKey } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { PresentationLabelsProvider } from "../../presentation-components/labels/LabelsProvider";
import { createTestECInstanceKey } from "../_helpers/Common";

describe("PresentationLabelsProvider", () => {
  let provider: PresentationLabelsProvider;
  let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;
  const imodel = {} as IModelConnection;

  beforeEach(() => {
    presentationManager = sinon.createStubInstance(PresentationManager);
    const localization = new EmptyLocalization();
    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(Presentation, "localization").get(() => localization);
    provider = new PresentationLabelsProvider({ imodel });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getLabel", () => {
    it("calls manager to get result and returns it", async () => {
      const key = createTestECInstanceKey();
      const result = "Label";

      presentationManager.getDisplayLabelDefinition.resolves({ displayValue: result, rawValue: result, typeName: "string" });
      expect(await provider.getLabel(key)).to.eq(result);
    });

    it("calls manager only once for the same key", async () => {
      const key = createTestECInstanceKey();
      const result = "Label";
      presentationManager.getDisplayLabelDefinition.resolves({ displayValue: result, rawValue: result, typeName: "string" });

      expect(await provider.getLabel(key)).to.eq(result);
      expect(await provider.getLabel(key)).to.eq(result);
      expect(presentationManager.getDisplayLabelDefinition).to.be.calledOnce;
    });

    it("calls manager for every different key", async () => {
      const key1 = createTestECInstanceKey({ id: "0x1" });
      const key2 = createTestECInstanceKey({ id: "0x2" });
      const result1 = "Label 1";
      const result2 = "Label 2";

      presentationManager.getDisplayLabelDefinition.callsFake(async ({ key }) => {
        if (key === key1) {
          return { displayValue: result1, rawValue: result1, typeName: "string" };
        }
        if (key === key2) {
          return { displayValue: result2, rawValue: result2, typeName: "string" };
        }
        return { displayValue: "", rawValue: "", typeName: "string" };
      });

      expect(await provider.getLabel(key1)).to.eq(result1);
      expect(await provider.getLabel(key2)).to.eq(result2);
    });
  });

  describe("getLabels", () => {
    describe("when `getDisplayLabelDefinitionsIterator` is available", () => {
      it("calls manager to get result and returns it", async () => {
        const keys = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
        const result = ["Label 1", "Label 2"];

        presentationManager.getDisplayLabelDefinitionsIterator.resolves({
          total: result.length,
          items: createAsyncIterator(result.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }))),
        });
        expect(await provider.getLabels(keys)).to.deep.eq(result);
      });

      it("calls manager only once for the same key", async () => {
        const keys = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
        const result = ["Label 1", "Label 2"];

        presentationManager.getDisplayLabelDefinitionsIterator.resolves({
          total: result.length,
          items: createAsyncIterator(result.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }))),
        });
        expect(await provider.getLabels(keys)).to.deep.eq(result);
        expect(await provider.getLabels(keys)).to.deep.eq(result);
        expect(presentationManager.getDisplayLabelDefinitionsIterator).to.be.calledOnce;
      });

      it("calls manager for every different list of keys", async () => {
        const keys1 = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
        const keys2 = [createTestECInstanceKey({ id: "0x3" }), createTestECInstanceKey({ id: "0x4" })];
        const result1 = ["Label 1", "Label 2"];
        const result2 = ["Label 3", "Label 4"];

        presentationManager.getDisplayLabelDefinitionsIterator.callsFake(async ({ keys }) => {
          if (sameKeys(keys, keys1)) {
            return {
              total: result1.length,
              items: createAsyncIterator(result1.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }))),
            };
          }
          if (sameKeys(keys, keys2)) {
            return {
              total: result2.length,
              items: createAsyncIterator(result2.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }))),
            };
          }
          return { total: 0, items: createAsyncIterator([]) };
        });

        expect(await provider.getLabels(keys1)).to.deep.eq(result1);
        expect(await provider.getLabels(keys2)).to.deep.eq(result2);
      });

      it("requests labels in batches when keys count exceeds max and returns expected results", async () => {
        const inputKeys = [];
        const results = [];
        // create a key set of such size that we need 3 content requests
        for (let i = 0; i < 2 * DEFAULT_KEYS_BATCH_SIZE + 1; ++i) {
          inputKeys.push(createTestECInstanceKey({ id: `0x${i}` }));
          results.push(`Label_${i}`);
        }

        const keys1 = inputKeys.slice(0, DEFAULT_KEYS_BATCH_SIZE);
        const keys2 = inputKeys.slice(DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE);
        const keys3 = inputKeys.slice(2 * DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE + 1);
        const result1 = results.slice(0, DEFAULT_KEYS_BATCH_SIZE);
        const result2 = results.slice(DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE);
        const result3 = results.slice(2 * DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE + 1);

        presentationManager.getDisplayLabelDefinitionsIterator.callsFake(async ({ keys }) => {
          if (sameKeys(keys, keys1)) {
            return {
              total: result1.length,
              items: createAsyncIterator(result1.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }))),
            };
          }
          if (sameKeys(keys, keys2)) {
            return {
              total: result2.length,
              items: createAsyncIterator(result2.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }))),
            };
          }
          if (sameKeys(keys, keys3)) {
            return {
              total: result3.length,
              items: createAsyncIterator(result3.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }))),
            };
          }
          return { total: 0, items: createAsyncIterator([]) };
        });

        const result = await provider.getLabels(inputKeys);
        expect(result).to.deep.eq(results);

        expect(presentationManager.getDisplayLabelDefinitionsIterator).to.be.calledThrice;
      });
    });

    describe("when `getDisplayLabelDefinitionsIterator` is not available", () => {
      beforeEach(() => {
        Object.assign(presentationManager, { getDisplayLabelDefinitionsIterator: undefined });
      });

      /* eslint-disable @typescript-eslint/no-deprecated */
      it("calls manager to get result and returns it", async () => {
        const keys = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
        const result = ["Label 1", "Label 2"];

        presentationManager.getDisplayLabelDefinitions.resolves(result.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" })));
        expect(await provider.getLabels(keys)).to.deep.eq(result);
      });

      it("calls manager only once for the same key", async () => {
        const keys = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
        const result = ["Label 1", "Label 2"];

        presentationManager.getDisplayLabelDefinitions.resolves(result.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" })));
        expect(await provider.getLabels(keys)).to.deep.eq(result);
        expect(await provider.getLabels(keys)).to.deep.eq(result);
        expect(presentationManager.getDisplayLabelDefinitions).to.be.calledOnce;
      });

      it("calls manager for every different list of keys", async () => {
        const keys1 = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
        const keys2 = [createTestECInstanceKey({ id: "0x3" }), createTestECInstanceKey({ id: "0x4" })];
        const result1 = ["Label 1", "Label 2"];
        const result2 = ["Label 3", "Label 4"];

        presentationManager.getDisplayLabelDefinitions.callsFake(async ({ keys }) => {
          if (sameKeys(keys, keys1)) {
            return result1.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }));
          }
          if (sameKeys(keys, keys2)) {
            return result2.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }));
          }
          return [];
        });

        expect(await provider.getLabels(keys1)).to.deep.eq(result1);
        expect(await provider.getLabels(keys2)).to.deep.eq(result2);
      });

      it("requests labels in batches when keys count exceeds max and returns expected results", async () => {
        const inputKeys = [];
        const results = [];
        // create a key set of such size that we need 3 content requests
        for (let i = 0; i < 2 * DEFAULT_KEYS_BATCH_SIZE + 1; ++i) {
          inputKeys.push(createTestECInstanceKey({ id: `0x${i}` }));
          results.push(`Label_${i}`);
        }

        const keys1 = inputKeys.slice(0, DEFAULT_KEYS_BATCH_SIZE);
        const keys2 = inputKeys.slice(DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE);
        const keys3 = inputKeys.slice(2 * DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE + 1);
        const result1 = results.slice(0, DEFAULT_KEYS_BATCH_SIZE);
        const result2 = results.slice(DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE);
        const result3 = results.slice(2 * DEFAULT_KEYS_BATCH_SIZE, 2 * DEFAULT_KEYS_BATCH_SIZE + 1);

        presentationManager.getDisplayLabelDefinitions.callsFake(async ({ keys }) => {
          if (sameKeys(keys, keys1)) {
            return result1.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }));
          }
          if (sameKeys(keys, keys2)) {
            return result2.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }));
          }
          if (sameKeys(keys, keys3)) {
            return result3.map((value) => ({ rawValue: value, displayValue: value, typeName: "string" }));
          }
          return [];
        });

        const result = await provider.getLabels(inputKeys);
        expect(result).to.deep.eq(results);

        expect(presentationManager.getDisplayLabelDefinitions).to.be.calledThrice;
      });
      /* eslint-enable @typescript-eslint/no-deprecated */
    });
  });
});

function sameKeys(lhs: InstanceKey[], rhs: InstanceKey[]) {
  for (let i = 0; i < lhs.length; ++i) {
    if (lhs[i].id !== rhs[i].id) {
      return false;
    }
  }
  return true;
}
