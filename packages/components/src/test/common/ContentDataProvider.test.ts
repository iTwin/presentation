/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { PrimitiveValue, PropertyDescription, PropertyRecord } from "@itwin/appui-abstract";
import { BeEvent, BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import {
  ClientDiagnosticsAttribute, Content, ContentDescriptorRequestOptions, ContentRequestOptions, Descriptor, FIELD_NAMES_SEPARATOR, KeySet, Paged,
  RegisteredRuleset, Ruleset, SelectionInfo, VariableValue,
} from "@itwin/presentation-common";
import {
  IModelContentChangeEventArgs, Presentation, PresentationManager, RulesetManager, RulesetVariablesManager,
} from "@itwin/presentation-frontend";
import { CacheInvalidationProps, ContentDataProvider, ContentDataProviderProps } from "../../presentation-components/common/ContentDataProvider";
import { createTestECInstanceKey, createTestPropertyInfo, createTestRuleset } from "../_helpers/Common";
import {
  createTestContentDescriptor, createTestContentItem, createTestNestedContentField, createTestPropertiesContentField, createTestSimpleContentField,
} from "../_helpers/Content";
import { PromiseContainer } from "../_helpers/Promises";

/**
 * The Provider class is used to make protected [[ContentDataProvider]]
 * function public so the tests can call and spy on them.
 */
class Provider extends ContentDataProvider {
  constructor(props: ContentDataProviderProps) {
    super(props);
  }
  public override invalidateCache(props: CacheInvalidationProps) {
    super.invalidateCache(props);
  }
  public override shouldRequestContentForEmptyKeyset() {
    return super.shouldRequestContentForEmptyKeyset();
  }
  public override async getDescriptorOverrides() {
    return super.getDescriptorOverrides();
  }
}

type ContentOptions = Paged<ContentRequestOptions<IModelConnection, Descriptor, KeySet> & ClientDiagnosticsAttribute>;
type ContentDescriptorOptions = ContentDescriptorRequestOptions<IModelConnection, KeySet> & ClientDiagnosticsAttribute;

describe("ContentDataProvider", () => {
  const rulesetId = "ruleset_id";
  const displayType = "test_display";
  let provider: Provider;
  let invalidateCacheSpy: sinon.SinonSpy<[CacheInvalidationProps], void>;

  let presentationManager: sinon.SinonStubbedInstance<PresentationManager>;
  const onIModelContentChanged: PresentationManager["onIModelContentChanged"] = new BeEvent<(args: IModelContentChangeEventArgs) => void>();
  const onVariableChanged: RulesetVariablesManager["onVariableChanged"] = new BeEvent<
    (variableId: string, prevValue: VariableValue | undefined, currValue: VariableValue | undefined) => void
  >();
  const onRulesetModified: RulesetManager["onRulesetModified"] = new BeEvent<(curr: RegisteredRuleset, prev: Ruleset) => void>();
  const onActiveFormattingUnitSystemChanged: QuantityFormatter["onActiveFormattingUnitSystemChanged"] = new BeUiEvent<FormattingUnitSystemChangedArgs>();

  const rulesetManager = {
    onRulesetModified,
  };

  const imodelKey = "test-imodel-Key";
  const imodel = {
    key: imodelKey,
  } as IModelConnection;

  beforeEach(() => {
    presentationManager = sinon.createStubInstance(PresentationManager);
    Object.assign(presentationManager, { onIModelContentChanged });

    presentationManager.rulesets.returns(rulesetManager as RulesetManager);
    presentationManager.vars.returns({
      onVariableChanged,
    } as RulesetVariablesManager);

    sinon.stub(Presentation, "presentation").get(() => presentationManager);
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged,
    }));

    provider = new Provider({ imodel, ruleset: rulesetId, displayType, enableContentAutoUpdate: true });
    invalidateCacheSpy = sinon.spy(provider, "invalidateCache");
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe("constructor", () => {
    it("sets display type", () => {
      const type = "new_display_type";
      const p = new Provider({ imodel, ruleset: rulesetId, displayType: type });
      expect(p.displayType).to.eq(type);
    });

    it("sets paging size", () => {
      const pagingSize = 50;
      const p = new Provider({ imodel, ruleset: rulesetId, displayType, pagingSize });
      expect(p.pagingSize).to.be.eq(pagingSize);
    });
  });

  describe("rulesetId", () => {
    it("returns rulesetId provider is initialized with", () => {
      expect(provider.rulesetId).to.eq(rulesetId);
    });

    it("sets a different rulesetId and clears caches", () => {
      const newId = `${rulesetId} (changed)`;
      provider.rulesetId = newId;
      expect(provider.rulesetId).to.eq(newId);
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if setting to the same rulesetId", () => {
      const newId = `${rulesetId}`;
      provider.rulesetId = newId;
      expect(provider.rulesetId).to.eq(newId);
      expect(invalidateCacheSpy).to.not.be.called;
    });
  });

  describe("imodel", () => {
    it("returns imodel provider is initialized with", () => {
      expect(provider.imodel).to.eq(imodel);
    });

    it("sets a different imodel and clears caches", () => {
      const newConnection = {} as IModelConnection;
      provider.imodel = newConnection;
      expect(provider.imodel).to.eq(newConnection);
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if setting to the same imodel", () => {
      provider.imodel = imodel;
      expect(provider.imodel).to.eq(imodel);
      expect(invalidateCacheSpy).to.not.be.called;
    });
  });

  describe("selectionInfo", () => {
    it("sets a different selectionInfo and clears caches", () => {
      const info1: SelectionInfo = { providerName: "a" };
      provider.selectionInfo = info1;
      expect(provider.selectionInfo).to.eq(info1);
      invalidateCacheSpy.resetHistory();

      const info2: SelectionInfo = { providerName: "b" };
      provider.selectionInfo = info2;
      expect(provider.selectionInfo).to.eq(info2);
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if setting to the same selectionInfo", () => {
      const info1: SelectionInfo = { providerName: "a" };
      provider.selectionInfo = info1;
      expect(provider.selectionInfo).to.eq(info1);
      invalidateCacheSpy.resetHistory();

      provider.selectionInfo = info1;
      expect(provider.selectionInfo).to.eq(info1);
      expect(invalidateCacheSpy).to.not.be.called;
    });
  });

  describe("keys", () => {
    it("sets keys and clears caches", () => {
      const keys = new KeySet([createTestECInstanceKey()]);
      provider.keys = keys;
      expect(provider.keys).to.eq(keys);
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if keys didn't change", () => {
      const keys = new KeySet();
      provider.keys = keys;
      invalidateCacheSpy.resetHistory();
      provider.keys = keys;
      expect(invalidateCacheSpy).to.not.be.called;
    });

    it("sets keys and clears caches when keys change in place", () => {
      const keys = new KeySet();
      provider.keys = keys;
      invalidateCacheSpy.resetHistory();
      keys.add(createTestECInstanceKey());
      provider.keys = keys;
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });
  });

  describe("getContentDescriptor", () => {
    const selection: SelectionInfo = { providerName: "test" };

    beforeEach(() => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
    });

    it("requests presentation manager for descriptor and returns its copy", async () => {
      const result = createTestContentDescriptor({ displayType, fields: [] });
      presentationManager.getContentDescriptor.resolves(result);

      provider.selectionInfo = selection;
      const descriptor = await provider.getContentDescriptor();

      expect(presentationManager.getContentDescriptor).to.be.calledWith(
        matchOptions<ContentDescriptorOptions>(
          (options) => options.imodel === imodel && options.rulesetOrId === rulesetId && options.displayType === displayType && options.selection === selection,
        ),
      );
      expect(descriptor).to.not.eq(result);
      expect(descriptor).to.deep.eq(result);
    });

    it("requests presentation manager for descriptor when keyset is empty and `shouldRequestContentForEmptyKeyset()` returns `true`", async () => {
      provider.keys = new KeySet();
      provider.shouldRequestContentForEmptyKeyset = () => true;
      presentationManager.getContentDescriptor.resolves(undefined);
      const descriptor = await provider.getContentDescriptor();
      expect(presentationManager.getContentDescriptor).to.be.called;
      expect(descriptor).to.be.undefined;
    });

    it("doesn't request presentation manager for descriptor when keyset is empty and `shouldRequestContentForEmptyKeyset()` returns `false`", async () => {
      provider.keys = new KeySet();
      presentationManager.getContentDescriptor.resolves(undefined);
      const descriptor = await provider.getContentDescriptor();
      expect(presentationManager.getContentDescriptor).to.not.be.called;
      expect(descriptor).to.be.undefined;
    });

    it("handles undefined descriptor returned by presentation manager", async () => {
      presentationManager.getContentDescriptor.resolves(undefined);
      const descriptor = await provider.getContentDescriptor();
      expect(descriptor).to.be.undefined;
    });

    it("memoizes result", async () => {
      const resultPromiseContainer = new PromiseContainer<Descriptor>();
      presentationManager.getContentDescriptor.returns(resultPromiseContainer.promise);

      const requests = [provider.getContentDescriptor(), provider.getContentDescriptor()];
      const result = createTestContentDescriptor({ fields: [] });
      resultPromiseContainer.resolve(result);
      const descriptors = await Promise.all(requests);
      descriptors.forEach((descriptor) => expect(descriptor).to.deep.eq(result));
      expect(presentationManager.getContentDescriptor).to.be.calledOnce;
    });
  });

  describe("getContentSetSize", () => {
    beforeEach(() => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
    });

    it("returns 0 when manager returns undefined descriptor", async () => {
      presentationManager.getContentDescriptor.resolves(undefined);
      const size = await provider.getContentSetSize();
      expect(presentationManager.getContentSetSize).to.not.be.called;
      expect(size).to.eq(0);
    });

    it("requests presentation manager for size", async () => {
      const result = new PromiseContainer<{ content: Content; size: number }>();
      presentationManager.getContentAndSize.returns(result.promise);

      provider.pagingSize = 10;
      const contentAndContentSize = { content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 2 };
      result.resolve(contentAndContentSize);
      const size = await provider.getContentSetSize();
      expect(size).to.eq(contentAndContentSize.size);
      expect(presentationManager.getContentAndSize).to.be.calledOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
    });

    it("memoizes result", async () => {
      const resultPromiseContainer = new PromiseContainer<{ content: Content; size: number }>();
      presentationManager.getContentAndSize.returns(resultPromiseContainer.promise);
      provider.pagingSize = 10;
      const requests = [provider.getContentSetSize(), provider.getContentSetSize()];
      const result = { content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 2 };
      resultPromiseContainer.resolve(result);
      const sizes = await Promise.all(requests);
      sizes.forEach((size) => expect(size).to.eq(result.size));
      expect(presentationManager.getContentAndSize).to.be.calledOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
    });

    it("requests size and first page when paging size is set", async () => {
      const resultPromiseContainer = new PromiseContainer<{ content: Content; size: number }>();
      const pagingSize = 20;
      presentationManager.getContentAndSize.returns(resultPromiseContainer.promise);

      provider.pagingSize = pagingSize;
      const result = { content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 2 };
      resultPromiseContainer.resolve(result);
      const size = await provider.getContentSetSize();
      expect(size).to.eq(result.size);
      expect(presentationManager.getContentAndSize).to.be.calledOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === pagingSize));
    });

    it("returns content size equal to content set size when page options are undefined", async () => {
      const descriptor = createTestContentDescriptor({ fields: [] });
      const content = new Content(descriptor, [createTestContentItem({ values: {}, displayValues: {} })]);
      presentationManager.getContent.resolves(content);

      const size = await provider.getContentSetSize();
      expect(size).to.equal(content.contentSet.length);
      expect(presentationManager.getContentSetSize).to.not.be.called;
      expect(presentationManager.getContent).to.be.calledOnceWith(matchOptions(({ paging }) => paging === undefined));
    });
  });

  describe("getContent", () => {
    beforeEach(() => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
    });

    it("returns undefined when manager returns undefined content", async () => {
      presentationManager.getContent.resolves(undefined);
      const c = await provider.getContent();
      expect(c).to.be.undefined;
    });

    it("requests presentation manager for content", async () => {
      const descriptor = createTestContentDescriptor({ fields: [] });
      const result: { content: Content; size: number } = {
        content: new Content(descriptor, []),
        size: 1,
      };

      presentationManager.getContentAndSize.resolves(result);
      const c = await provider.getContent({ start: 0, size: 10 });
      expect(presentationManager.getContentAndSize).to.be.calledWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
      expect(c).to.deep.eq(result.content);
    });

    it("memoizes result", async () => {
      const resultContentFirstPagePromise0 = new PromiseContainer<Content>();
      const resultContentNonFirstPagePromise = new PromiseContainer<Content>();

      const resultContentFirstPagePromise1 = new PromiseContainer<{ content: Content; size: number }>();
      presentationManager.getContentAndSize.returns(resultContentFirstPagePromise1.promise);

      presentationManager.getContent.callsFake(async (options) => {
        if (options.paging === undefined) {
          return resultContentFirstPagePromise0.promise;
        }
        if (options.paging.start === 1 && options.paging.size === 0) {
          return resultContentNonFirstPagePromise.promise;
        }
        return undefined;
      });

      const requests = [
        provider.getContent(undefined),
        provider.getContent({ start: undefined, size: 0 }),
        provider.getContent({ start: 0, size: undefined }),
        provider.getContent({ start: 0, size: 0 }),
        provider.getContent({ start: 0, size: 1 }),
        provider.getContent({ start: 1, size: 0 }),
      ];

      // for first 4 requests
      const descriptor = createTestContentDescriptor({ fields: [] });
      const nonPagedContentStartingAt0Response = new Content(descriptor, [createTestContentItem({ label: "1", values: {}, displayValues: {} })]);
      // for 5'th request
      const pagedContentAndSizeResponse = {
        content: new Content(descriptor, [createTestContentItem({ label: "2", values: {}, displayValues: {} })]),
        size: 1,
      };
      // for 6'th request
      const nonPagedContentStartingAt1Response = new Content(descriptor, [createTestContentItem({ label: "3", values: {}, displayValues: {} })]);

      resultContentFirstPagePromise0.resolve(nonPagedContentStartingAt0Response);
      resultContentFirstPagePromise1.resolve(pagedContentAndSizeResponse);
      resultContentNonFirstPagePromise.resolve(nonPagedContentStartingAt1Response);
      const responses = await Promise.all(requests);

      expect(responses[0])
        .to.deep.eq(responses[1], "responses[1] should eq responses[0]")
        .to.deep.eq(responses[2], "responses[2] should eq responses[0]")
        .to.deep.eq(responses[3], "responses[3] should eq responses[0]")
        .to.deep.eq(
          nonPagedContentStartingAt0Response,
          "responses[0], responses[1], responses[2] and responses[3] should eq nonPagedContentStartingAt0Response",
        );
      expect(responses[4]).to.deep.eq(pagedContentAndSizeResponse.content, "responses[4] should eq pagedContentAndSizeResponse.content");
      expect(responses[5]).to.deep.eq(nonPagedContentStartingAt1Response, "responses[5] should eq nonPagedContentStartingAt1Response");

      expect(presentationManager.getContent).to.be.calledTwice;
      expect(presentationManager.getContent).to.be.calledWith(matchOptions(({ paging }) => paging === undefined));
      expect(presentationManager.getContent).to.be.calledWith(matchOptions(({ paging }) => paging?.start === 1 && paging.size === 0));

      expect(presentationManager.getContentAndSize).to.be.calledOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 1));
    });

    it("doesn't request for content when keyset is empty and `shouldRequestContentForEmptyKeyset()` returns `false`", async () => {
      provider.keys = new KeySet();
      await provider.getContent();
      expect(presentationManager.getContentDescriptor).to.not.be.called;
      expect(presentationManager.getContent).to.not.be.called;
      expect(presentationManager.getContentAndSize).to.not.be.called;
    });
  });

  describe("[deprecated] getFieldByPropertyRecord", () => {
    it("passes record's description to `getFieldByPropertyDescription`", async () => {
      const value: PrimitiveValue = {
        displayValue: "displayValue",
        value: "rawValue",
        valueFormat: 0,
      };
      const description: PropertyDescription = {
        name: "propertyName",
        displayLabel: "labelString",
        typename: "number",
        editor: undefined,
      };
      const record = new PropertyRecord(value, description);

      const field = createTestPropertiesContentField({
        name: "test-field",
        properties: [
          {
            property: createTestPropertyInfo({ name: "test-property" }),
          },
        ],
      });
      provider.getFieldByPropertyDescription = sinon.fake(async () => field);

      // eslint-disable-next-line deprecation/deprecation
      const actualField = await provider.getFieldByPropertyRecord(record);

      expect(provider.getFieldByPropertyDescription).to.be.calledOnceWith(record.property);
      expect(actualField).to.eq(field);
    });
  });

  describe("getFieldByPropertyDescription", () => {
    let propertyDescription: PropertyDescription;

    before(() => {
      propertyDescription = {
        name: "propertyName",
        displayLabel: "labelString",
        typename: "number",
        editor: undefined,
      };
    });

    beforeEach(() => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
    });

    it("return undefined if descriptor is not set", async () => {
      presentationManager.getContentDescriptor.resolves(undefined);

      const field = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).to.be.calledOnce;
      expect(field).to.be.undefined;
    });

    it("return undefined when field is not found", async () => {
      const descriptor = createTestContentDescriptor({ fields: [] });
      presentationManager.getContentDescriptor.resolves(descriptor);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).to.be.calledOnce;
      expect(resultField).to.be.undefined;
    });

    it("return a field", async () => {
      const field = createTestPropertiesContentField({
        name: "test-field",
        properties: [
          {
            property: createTestPropertyInfo({ name: "test-property" }),
          },
        ],
      });
      const descriptor = createTestContentDescriptor({ fields: [field] });
      propertyDescription.name = "test-field";

      presentationManager.getContentDescriptor.resolves(descriptor);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).to.be.calledOnce;
      expect(resultField).to.eq(field);
    });

    it("return a nested field", async () => {
      const nestedField = createTestSimpleContentField({ name: "nested-field" });
      const nestingField = createTestNestedContentField({
        name: "nesting-field",
        nestedFields: [nestedField],
      });
      const descriptor = createTestContentDescriptor({ fields: [nestingField] });
      propertyDescription.name = `${nestingField.name}${FIELD_NAMES_SEPARATOR}${nestedField.name}`;

      presentationManager.getContentDescriptor.resolves(descriptor);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).to.be.calledOnce;
      expect(resultField).to.eq(nestedField);
    });
  });

  describe("reacting to updates", () => {
    beforeEach(async () => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
      invalidateCacheSpy.resetHistory();

      // make sure that provider setup event listeners
      await provider.getContent();
    });

    it("doesn't react to imodel content updates to unrelated rulesets", async () => {
      onIModelContentChanged.raiseEvent({ rulesetId: "unrelated", updateInfo: "FULL", imodelKey });
      expect(invalidateCacheSpy).to.not.be.called;
    });

    it("doesn't react to imodel content updates to unrelated imodels", async () => {
      onIModelContentChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey: "unrelated" });
      expect(invalidateCacheSpy).to.not.be.called;
    });

    it("invalidates cache when imodel content change happens to related ruleset", async () => {
      onIModelContentChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey });
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't react to unrelated ruleset modifications", async () => {
      const ruleset = new RegisteredRuleset(createTestRuleset(), "", () => {});
      onRulesetModified.raiseEvent(ruleset, { ...ruleset.toJSON() });
      expect(invalidateCacheSpy).to.not.be.called;
    });

    it("invalidates cache when related ruleset is modified", async () => {
      const ruleset = new RegisteredRuleset({ ...createTestRuleset(), id: rulesetId }, "", () => {});
      onRulesetModified.raiseEvent(ruleset, { ...ruleset.toJSON() });
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });

    it("invalidates cache when related ruleset variables change", async () => {
      onVariableChanged.raiseEvent("var_id", "prev", "curr");
      expect(invalidateCacheSpy).to.be.calledOnceWith(CacheInvalidationProps.full());
    });

    it("invalidates cache when active unit system change", async () => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
      expect(invalidateCacheSpy).to.be.calledOnceWith({ content: true });
    });
  });

  describe("diagnostics", () => {
    it("passes rule diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = sinon.stub();

      provider.dispose();
      provider = new Provider({
        imodel,
        ruleset: rulesetId,
        displayType,
        ruleDiagnostics: { severity: "error", handler: diagnosticsHandler },
      });
      sinon.stub(provider, "shouldRequestContentForEmptyKeyset").returns(true);

      const descriptor = createTestContentDescriptor({ fields: [] });
      const content = new Content(descriptor, [createTestContentItem({ values: {}, displayValues: {} })]);
      presentationManager.getContent.resolves(content);

      await provider.getContentSetSize();
      expect(presentationManager.getContent).to.be.calledOnceWith(
        matchOptions((options) => options.diagnostics?.editor === "error" && options.diagnostics?.handler === diagnosticsHandler),
      );
    });

    it("passes dev diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = sinon.stub();

      provider.dispose();
      provider = new Provider({
        imodel,
        ruleset: rulesetId,
        displayType,
        devDiagnostics: {
          backendVersion: true,
          perf: true,
          severity: "error",
          handler: diagnosticsHandler,
        },
      });
      sinon.stub(provider, "shouldRequestContentForEmptyKeyset").returns(true);

      const descriptor = createTestContentDescriptor({ fields: [] });
      const content = new Content(descriptor, [createTestContentItem({ values: {}, displayValues: {} })]);
      presentationManager.getContent.resolves(content);
      await provider.getContentSetSize();
      expect(presentationManager.getContent).to.be.calledOnceWith(
        matchOptions(
          (options) =>
            options.diagnostics?.backendVersion === true &&
            options.diagnostics?.perf === true &&
            options.diagnostics?.dev === "error" &&
            options.diagnostics?.handler === diagnosticsHandler,
        ),
      );
    });
  });
});

function matchOptions<TOptions = ContentOptions>(pred: (actual: TOptions) => boolean) {
  return sinon.match(pred);
}
