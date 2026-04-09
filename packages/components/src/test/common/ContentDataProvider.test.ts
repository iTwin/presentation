/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator, ResolvablePromise } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from "vitest";
import { PrimitiveValue, PropertyDescription, PropertyRecord } from "@itwin/appui-abstract";
import { BeEvent, BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import { FormatsChangedArgs, FormatsProvider } from "@itwin/core-quantity";
import {
  ClientDiagnosticsAttribute,
  combineFieldNames,
  Content,
  ContentDescriptorRequestOptions,
  ContentRequestOptions,
  Descriptor,
  Item,
  KeySet,
  Paged,
  PropertyValueFormat,
  RegisteredRuleset,
  Ruleset,
  SelectionInfo,
  TypeDescription,
  VariableValue,
} from "@itwin/presentation-common";
import { IModelContentChangeEventArgs, Presentation, PresentationManager, RulesetManager, RulesetVariablesManager } from "@itwin/presentation-frontend";
import { CacheInvalidationProps, ContentDataProvider, ContentDataProviderProps } from "../../presentation-components/common/ContentDataProvider.js";
import { createTestECInstanceKey, createTestPropertyInfo, createTestRuleset } from "../_helpers/Common.js";
import {
  createTestContentDescriptor,
  createTestContentItem,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../_helpers/Content.js";
import { createMocked } from "../TestUtils.js";

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
  let invalidateCacheSpy: ReturnType<typeof vi.spyOn>;

  let presentationManager: Mocked<PresentationManager>;
  const onIModelContentChanged: PresentationManager["onIModelContentChanged"] = new BeEvent<(args: IModelContentChangeEventArgs) => void>();
  const onVariableChanged: RulesetVariablesManager["onVariableChanged"] = new BeEvent<
    (variableId: string, prevValue: VariableValue | undefined, currValue: VariableValue | undefined) => void
  >();
  const onRulesetModified: RulesetManager["onRulesetModified"] = new BeEvent<(curr: RegisteredRuleset, prev: Ruleset) => void>();
  const onActiveFormattingUnitSystemChanged: QuantityFormatter["onActiveFormattingUnitSystemChanged"] = new BeUiEvent<FormattingUnitSystemChangedArgs>();
  const onFormatsChanged: FormatsProvider["onFormatsChanged"] = new BeUiEvent<FormatsChangedArgs>();

  const rulesetManager = {
    onRulesetModified,
  };

  const imodelKey = "test-imodel-Key";
  const imodel = {
    key: imodelKey,
  } as IModelConnection;

  beforeEach(() => {
    presentationManager = createMocked(PresentationManager);
    Object.assign(presentationManager, { onIModelContentChanged });

    presentationManager.rulesets.mockReturnValue(rulesetManager as RulesetManager);
    presentationManager.vars.mockReturnValue({
      onVariableChanged,
    } as RulesetVariablesManager);

    vi.spyOn(Presentation, "presentation", "get").mockReturnValue(presentationManager);
    vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue({
      onActiveFormattingUnitSystemChanged,
    } as QuantityFormatter);
    vi.spyOn(IModelApp, "formatsProvider", "get").mockReturnValue({
      onFormatsChanged,
    } as FormatsProvider);

    provider = new Provider({ imodel, ruleset: rulesetId, displayType });
    invalidateCacheSpy = vi.spyOn(provider, "invalidateCache");
  });

  afterEach(() => {
    provider[Symbol.dispose]();
  });

  describe("constructor", () => {
    it("sets display type", () => {
      const type = "new_display_type";
      const p = new Provider({ imodel, ruleset: rulesetId, displayType: type });
      expect(p.displayType).toBe(type);
    });

    it("sets paging size", () => {
      const pagingSize = 50;
      const p = new Provider({ imodel, ruleset: rulesetId, displayType, pagingSize });
      expect(p.pagingSize).toBe(pagingSize);
    });
  });

  describe("rulesetId", () => {
    it("returns rulesetId provider is initialized with", () => {
      expect(provider.rulesetId).toBe(rulesetId);
    });

    it("sets a different rulesetId and clears caches", () => {
      const newId = `${rulesetId} (changed)`;
      provider.rulesetId = newId;
      expect(provider.rulesetId).toBe(newId);
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if setting to the same rulesetId", () => {
      const newId = `${rulesetId}`;
      provider.rulesetId = newId;
      expect(provider.rulesetId).toBe(newId);
      expect(invalidateCacheSpy).not.toHaveBeenCalled();
    });
  });

  describe("imodel", () => {
    it("returns imodel provider is initialized with", () => {
      expect(provider.imodel).toBe(imodel);
    });

    it("sets a different imodel and clears caches", () => {
      const newConnection = {} as IModelConnection;
      provider.imodel = newConnection;
      expect(provider.imodel).toBe(newConnection);
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if setting to the same imodel", () => {
      provider.imodel = imodel;
      expect(provider.imodel).toBe(imodel);
      expect(invalidateCacheSpy).not.toHaveBeenCalled();
    });
  });

  describe("selectionInfo", () => {
    it("sets a different selectionInfo and clears caches", () => {
      const info1: SelectionInfo = { providerName: "a" };
      provider.selectionInfo = info1;
      expect(provider.selectionInfo).toBe(info1);
      invalidateCacheSpy.mockClear();

      const info2: SelectionInfo = { providerName: "b" };
      provider.selectionInfo = info2;
      expect(provider.selectionInfo).toBe(info2);
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if setting to the same selectionInfo", () => {
      const info1: SelectionInfo = { providerName: "a" };
      provider.selectionInfo = info1;
      expect(provider.selectionInfo).toBe(info1);
      invalidateCacheSpy.mockClear();

      provider.selectionInfo = info1;
      expect(provider.selectionInfo).toBe(info1);
      expect(invalidateCacheSpy).not.toHaveBeenCalled();
    });
  });

  describe("keys", () => {
    it("sets keys and clears caches", () => {
      const keys = new KeySet([createTestECInstanceKey()]);
      provider.keys = keys;
      expect(provider.keys).toBe(keys);
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't clear caches if keys didn't change", () => {
      const keys = new KeySet();
      provider.keys = keys;
      invalidateCacheSpy.mockClear();
      provider.keys = keys;
      expect(invalidateCacheSpy).not.toHaveBeenCalled();
    });

    it("sets keys and clears caches when keys change in place", () => {
      const keys = new KeySet();
      provider.keys = keys;
      invalidateCacheSpy.mockClear();
      keys.add(createTestECInstanceKey());
      provider.keys = keys;
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });
  });

  describe("getContentDescriptor", () => {
    const selection: SelectionInfo = { providerName: "test" };

    beforeEach(() => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
    });

    it("requests presentation manager for descriptor and returns its copy", async () => {
      const result = createTestContentDescriptor({ displayType, fields: [] });
      presentationManager.getContentDescriptor.mockResolvedValue(result);

      provider.selectionInfo = selection;
      const descriptor = await provider.getContentDescriptor();

      expect(presentationManager.getContentDescriptor).toHaveBeenCalledWith(
        matchOptions<ContentDescriptorOptions>(
          (options) => options.imodel === imodel && options.rulesetOrId === rulesetId && options.displayType === displayType && options.selection === selection,
        ),
      );
      expect(descriptor).not.toBe(result);
      expect(descriptor).toEqual(result);
    });

    it("requests presentation manager for descriptor when keyset is empty and `shouldRequestContentForEmptyKeyset()` returns `true`", async () => {
      provider.keys = new KeySet();
      provider.shouldRequestContentForEmptyKeyset = () => true;
      presentationManager.getContentDescriptor.mockResolvedValue(undefined);
      const descriptor = await provider.getContentDescriptor();
      expect(presentationManager.getContentDescriptor).toHaveBeenCalled();
      expect(descriptor).toBeUndefined();
    });

    it("doesn't request presentation manager for descriptor when keyset is empty and `shouldRequestContentForEmptyKeyset()` returns `false`", async () => {
      provider.keys = new KeySet();
      presentationManager.getContentDescriptor.mockResolvedValue(undefined);
      const descriptor = await provider.getContentDescriptor();
      expect(presentationManager.getContentDescriptor).not.toHaveBeenCalled();
      expect(descriptor).toBeUndefined();
    });

    it("handles undefined descriptor returned by presentation manager", async () => {
      presentationManager.getContentDescriptor.mockResolvedValue(undefined);
      const descriptor = await provider.getContentDescriptor();
      expect(descriptor).toBeUndefined();
    });

    it("memoizes result", async () => {
      const resultPromiseContainer = new ResolvablePromise<Descriptor>();
      presentationManager.getContentDescriptor.mockReturnValue(resultPromiseContainer.promise);

      const requests = [provider.getContentDescriptor(), provider.getContentDescriptor()];
      const result = createTestContentDescriptor({ fields: [] });
      resultPromiseContainer.resolveSync(result);
      const descriptors = await Promise.all(requests);
      descriptors.forEach((descriptor) => expect(descriptor).toEqual(result));
      expect(presentationManager.getContentDescriptor).toHaveBeenCalledOnce();
    });
  });

  describe("getContentSetSize", () => {
    beforeEach(() => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
    });

    it("returns 0 when manager returns undefined descriptor", async () => {
      presentationManager.getContentDescriptor.mockResolvedValue(undefined);
      const size = await provider.getContentSetSize();
      expect(presentationManager.getContentSetSize).not.toHaveBeenCalled();
      expect(size).toBe(0);
    });

    describe("when `getContentIterator` is available", () => {
      it("requests presentation manager for size", async () => {
        const result = new ResolvablePromise<{ total: number; descriptor: Descriptor; items: AsyncIterableIterator<Item> }>();
        presentationManager.getContentIterator.mockReturnValue(result.promise);

        provider.pagingSize = 10;
        const contentAndContentSize = { total: 2, descriptor: createTestContentDescriptor({ fields: [] }), items: createAsyncIterator([]) };
        result.resolveSync(contentAndContentSize);
        const size = await provider.getContentSetSize();
        expect(size).toBe(contentAndContentSize.total);
        expect(presentationManager.getContentIterator).toHaveBeenCalledExactlyOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
      });

      it("memoizes result", async () => {
        const resultPromiseContainer = new ResolvablePromise<{ total: number; descriptor: Descriptor; items: AsyncIterableIterator<Item> }>();
        presentationManager.getContentIterator.mockReturnValue(resultPromiseContainer.promise);
        provider.pagingSize = 10;
        const requests = [provider.getContentSetSize(), provider.getContentSetSize()];
        const result = { descriptor: createTestContentDescriptor({ fields: [] }), items: createAsyncIterator([]), total: 2 };
        resultPromiseContainer.resolveSync(result);
        const sizes = await Promise.all(requests);
        sizes.forEach((size) => expect(size).toBe(result.total));
        expect(presentationManager.getContentIterator).toHaveBeenCalledExactlyOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
      });

      it("requests size and first page when paging size is set", async () => {
        const resultPromiseContainer = new ResolvablePromise<{ total: number; descriptor: Descriptor; items: AsyncIterableIterator<Item> }>();
        const pagingSize = 20;
        presentationManager.getContentIterator.mockReturnValue(resultPromiseContainer.promise);

        provider.pagingSize = pagingSize;
        const result = { descriptor: createTestContentDescriptor({ fields: [] }), items: createAsyncIterator([]), total: 2 };
        resultPromiseContainer.resolveSync(result);
        const size = await provider.getContentSetSize();
        expect(size).toBe(result.total);
        expect(presentationManager.getContentIterator).toHaveBeenCalledExactlyOnceWith(
          matchOptions(({ paging }) => paging?.start === 0 && paging.size === pagingSize),
        );
      });

      it("returns content size equal to content set size when page options are undefined", async () => {
        const descriptor = createTestContentDescriptor({ fields: [] });
        presentationManager.getContentIterator.mockResolvedValue({
          descriptor,
          items: createAsyncIterator([createTestContentItem({ values: {}, displayValues: {} })]),
          total: 1,
        });

        const size = await provider.getContentSetSize();
        expect(size).toEqual(1);
        expect(presentationManager.getContentSetSize).not.toHaveBeenCalled();
        expect(presentationManager.getContentIterator).toHaveBeenCalledExactlyOnceWith(matchOptions(({ paging }) => paging === undefined));
      });
    });

    describe("when `getContentIterator` is not available", () => {
      beforeEach(() => {
        Object.assign(presentationManager, { getContentIterator: undefined });
      });

      it("requests presentation manager for size", async () => {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContentAndSize.mockResolvedValue({ content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 2 });
        provider.pagingSize = 10;
        const size = await provider.getContentSetSize();
        expect(size).toBe(2);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContentAndSize).toHaveBeenCalledExactlyOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
      });

      it("memoizes result", async () => {
        const resultPromiseContainer = new ResolvablePromise<{ content: Content; size: number }>();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContentAndSize.mockReturnValue(resultPromiseContainer.promise);
        provider.pagingSize = 10;
        const requests = [provider.getContentSetSize(), provider.getContentSetSize()];
        const result = { content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 2 };
        resultPromiseContainer.resolveSync(result);
        const sizes = await Promise.all(requests);
        sizes.forEach((size) => expect(size).toBe(result.size));
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContentAndSize).toHaveBeenCalledExactlyOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
      });

      it("requests size and first page when paging size is set", async () => {
        const resultPromiseContainer = new ResolvablePromise<{ content: Content; size: number }>();
        const pagingSize = 20;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContentAndSize.mockReturnValue(resultPromiseContainer.promise);

        provider.pagingSize = pagingSize;
        const result = { content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 2 };
        resultPromiseContainer.resolveSync(result);
        const size = await provider.getContentSetSize();
        expect(size).toBe(result.size);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContentAndSize).toHaveBeenCalledExactlyOnceWith(
          matchOptions(({ paging }) => paging?.start === 0 && paging.size === pagingSize),
        );
      });

      it("returns content size equal to content set size when page options are undefined", async () => {
        const descriptor = createTestContentDescriptor({ fields: [] });
        const content = new Content(descriptor, [createTestContentItem({ values: {}, displayValues: {} })]);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContent.mockResolvedValue(content);

        const size = await provider.getContentSetSize();
        expect(size).toEqual(content.contentSet.length);
        expect(presentationManager.getContentSetSize).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContent).toHaveBeenCalledExactlyOnceWith(matchOptions(({ paging }) => paging === undefined));
      });
    });
  });

  describe("getContent", () => {
    beforeEach(() => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
    });

    describe("when `getContentIterator` is available", () => {
      it("returns undefined when manager returns undefined content", async () => {
        presentationManager.getContentIterator.mockResolvedValue(undefined);
        const c = await provider.getContent();
        expect(c).toBeUndefined();
      });

      it("requests presentation manager for content", async () => {
        const descriptor = createTestContentDescriptor({ fields: [] });
        const result: { total: number; descriptor: Descriptor; items: AsyncIterableIterator<Item> } = {
          descriptor,
          items: createAsyncIterator([]),
          total: 1,
        };

        presentationManager.getContentIterator.mockResolvedValue(result);
        const c = await provider.getContent({ start: 0, size: 10 });
        expect(presentationManager.getContentIterator).toHaveBeenCalledWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
        expect(c).toEqual(new Content(result.descriptor, []));
      });

      it("memoizes result", async () => {
        const descriptor = createTestContentDescriptor({ fields: [] });

        const resultNoPageOptions = new ResolvablePromise<{ total: number; descriptor: Descriptor; items: AsyncIterableIterator<Item> }>();
        const resultNoPageStartWithSize = new ResolvablePromise<{ total: number; descriptor: Descriptor; items: AsyncIterableIterator<Item> }>();
        const resultWithPageStart = new ResolvablePromise<{ total: number; descriptor: Descriptor; items: AsyncIterableIterator<Item> }>();

        presentationManager.getContentIterator.mockImplementation(async (options) => {
          if (!options.paging?.start && !options.paging?.size) {
            return resultNoPageOptions;
          }
          if (!options.paging?.start && options.paging.size) {
            return resultNoPageStartWithSize;
          }
          if (options.paging.start) {
            return resultWithPageStart;
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
        const noPageOptionsResponse = [createTestContentItem({ label: "1", values: {}, displayValues: {} })];
        // for 5'th request
        const noPageStartWithSizeResponse = [createTestContentItem({ label: "2", values: {}, displayValues: {} })];
        // for 6'th request
        const withPageStartResponse = [createTestContentItem({ label: "3", values: {}, displayValues: {} })];

        resultNoPageOptions.resolveSync({ total: 1, descriptor, items: createAsyncIterator(noPageOptionsResponse) });
        resultNoPageStartWithSize.resolveSync({ total: 1, descriptor, items: createAsyncIterator(noPageStartWithSizeResponse) });
        resultWithPageStart.resolveSync({ total: 1, descriptor, items: createAsyncIterator(withPageStartResponse) });
        const responses = await Promise.all(requests);

        expect(responses[0], "responses[1] should eq responses[0]").toEqual(responses[1]);
        expect(responses[0], "responses[2] should eq responses[0]").toEqual(responses[2]);
        expect(responses[0], "responses[3] should eq responses[0]").toEqual(responses[3]);
        expect(responses[0], "responses[0], responses[1], responses[2] and responses[3] should eq noPageOptionsResponse").toEqual(
          new Content(descriptor, noPageOptionsResponse),
        );
        expect(responses[4], "responses[4] should eq noPageStartWithSizeResponse").toEqual(new Content(descriptor, noPageStartWithSizeResponse));
        expect(responses[5], "responses[5] should eq withPageStartResponse").toEqual(new Content(descriptor, withPageStartResponse));

        expect(presentationManager.getContentIterator).toHaveBeenCalledTimes(3);
        expect(presentationManager.getContentIterator).toHaveBeenCalledWith(matchOptions(({ paging }) => paging === undefined));
        expect(presentationManager.getContentIterator).toHaveBeenCalledWith(matchOptions(({ paging }) => paging?.start === 1 && paging.size === 0));
        expect(presentationManager.getContentIterator).toHaveBeenCalledWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 1));
      });

      it("doesn't request for content when keyset is empty and `shouldRequestContentForEmptyKeyset()` returns `false`", async () => {
        provider.keys = new KeySet();
        await provider.getContent();
        expect(presentationManager.getContentDescriptor).not.toHaveBeenCalled();
        expect(presentationManager.getContentIterator).not.toHaveBeenCalled();
        expect(presentationManager.getContentIterator).not.toHaveBeenCalled();
      });
    });

    describe("when `getContentIterator` is not available", () => {
      beforeEach(() => {
        Object.assign(presentationManager, { getContentIterator: undefined });
      });

      it("returns undefined when manager returns undefined content", async () => {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContent.mockResolvedValue(undefined);
        const c = await provider.getContent();
        expect(c).toBeUndefined();
      });

      it("requests presentation manager for content", async () => {
        const descriptor = createTestContentDescriptor({ fields: [] });
        const result: { content: Content; size: number } = {
          content: new Content(descriptor, []),
          size: 1,
        };

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContentAndSize.mockResolvedValue(result);
        const c = await provider.getContent({ start: 0, size: 10 });
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContentAndSize).toHaveBeenCalledWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 10));
        expect(c).toEqual(result.content);
      });

      it("memoizes result", async () => {
        const resultContentFirstPagePromise0 = new ResolvablePromise<Content>();
        const resultContentNonFirstPagePromise = new ResolvablePromise<Content>();

        const resultContentFirstPagePromise1 = new ResolvablePromise<{ content: Content; size: number }>();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContentAndSize.mockReturnValue(resultContentFirstPagePromise1.promise);

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        presentationManager.getContent.mockImplementation(async (options) => {
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

        resultContentFirstPagePromise0.resolveSync(nonPagedContentStartingAt0Response);
        resultContentFirstPagePromise1.resolveSync(pagedContentAndSizeResponse);
        resultContentNonFirstPagePromise.resolveSync(nonPagedContentStartingAt1Response);
        const responses = await Promise.all(requests);

        expect(responses[0], "responses[1] should eq responses[0]").toEqual(responses[1]);
        expect(responses[0], "responses[2] should eq responses[0]").toEqual(responses[2]);
        expect(responses[0], "responses[3] should eq responses[0]").toEqual(responses[3]);

        expect(responses[0], "responses[0], responses[1], responses[2] and responses[3] should eq nonPagedContentStartingAt0Response").toEqual(
          nonPagedContentStartingAt0Response,
        );
        expect(responses[4], "responses[4] should eq pagedContentAndSizeResponse.content").toEqual(pagedContentAndSizeResponse.content);
        expect(responses[5], "responses[5] should eq nonPagedContentStartingAt1Response").toEqual(nonPagedContentStartingAt1Response);

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContent).toHaveBeenCalledTimes(2);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContent).toHaveBeenCalledWith(matchOptions(({ paging }) => paging === undefined));
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContent).toHaveBeenCalledWith(matchOptions(({ paging }) => paging?.start === 1 && paging.size === 0));

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContentAndSize).toHaveBeenCalledExactlyOnceWith(matchOptions(({ paging }) => paging?.start === 0 && paging.size === 1));
      });

      it("doesn't request for content when keyset is empty and `shouldRequestContentForEmptyKeyset()` returns `false`", async () => {
        provider.keys = new KeySet();
        await provider.getContent();
        expect(presentationManager.getContentDescriptor).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContent).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        expect(presentationManager.getContentAndSize).not.toHaveBeenCalled();
      });
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
      provider.getFieldByPropertyDescription = vi.fn(async () => field);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const actualField = await provider.getFieldByPropertyRecord(record);

      expect(provider.getFieldByPropertyDescription).toHaveBeenCalledExactlyOnceWith(record.property);
      expect(actualField).toBe(field);
    });
  });

  describe("getFieldByPropertyDescription", () => {
    let propertyDescription: PropertyDescription;

    beforeEach(() => {
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
      presentationManager.getContentDescriptor.mockResolvedValue(undefined);

      const field = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).toHaveBeenCalledOnce();
      expect(field).toBeUndefined();
    });

    it("return undefined when field is not found", async () => {
      const descriptor = createTestContentDescriptor({ fields: [] });
      presentationManager.getContentDescriptor.mockResolvedValue(descriptor);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).toHaveBeenCalledOnce();
      expect(resultField).toBeUndefined();
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

      presentationManager.getContentDescriptor.mockResolvedValue(descriptor);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).toHaveBeenCalledOnce();
      expect(resultField).toBe(field);
    });

    it("return a nested field", async () => {
      const nestedField = createTestSimpleContentField({ name: "nested-field" });
      const nestingField = createTestNestedContentField({
        name: "nesting-field",
        nestedFields: [nestedField],
      });
      const descriptor = createTestContentDescriptor({ fields: [nestingField] });
      propertyDescription.name = combineFieldNames(nestedField.name, nestingField.name);

      presentationManager.getContentDescriptor.mockResolvedValue(descriptor);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).toHaveBeenCalledOnce();
      expect(resultField).toBe(nestedField);
    });

    it("return a struct member field", async () => {
      const memberFieldType: TypeDescription = {
        valueFormat: PropertyValueFormat.Primitive,
        typeName: "string",
      };
      const memberField = createTestPropertiesContentField({
        name: "member-field",
        type: memberFieldType,
        properties: [
          {
            property: createTestPropertyInfo({ name: "test-member-property" }),
          },
        ],
      });
      const structFieldType: TypeDescription = {
        valueFormat: PropertyValueFormat.Struct,
        typeName: "TestStruct",
        members: [
          {
            name: "member",
            label: "Struct Member",
            type: memberFieldType,
          },
        ],
      };
      const structField = createTestPropertiesContentField({
        name: "struct-field",
        type: structFieldType,
        properties: [
          {
            property: createTestPropertyInfo({ name: "test-struct-property", type: structFieldType.typeName }),
          },
        ],
        memberFields: [memberField],
      });
      const descriptor = createTestContentDescriptor({ fields: [structField] });
      presentationManager.getContentDescriptor.mockResolvedValue(descriptor);

      propertyDescription.name = combineFieldNames(memberField.name, structField.name);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).toHaveBeenCalledOnce();
      expect(resultField).toBe(memberField);
    });

    it("return an array item field", async () => {
      const itemsFieldType: TypeDescription = {
        valueFormat: PropertyValueFormat.Primitive,
        typeName: "string",
      };
      const itemsField = createTestPropertiesContentField({
        name: "items-field",
        type: itemsFieldType,
        properties: [
          {
            property: createTestPropertyInfo({ name: "test-items-property" }),
          },
        ],
      });
      const arrayFieldType: TypeDescription = {
        valueFormat: PropertyValueFormat.Array,
        typeName: "TestArray",
        memberType: itemsFieldType,
      };
      const arrayField = createTestPropertiesContentField({
        name: "array-field",
        type: arrayFieldType,
        properties: [
          {
            property: createTestPropertyInfo({ name: "test-array-property", type: arrayFieldType.typeName }),
          },
        ],
        itemsField,
      });
      const descriptor = createTestContentDescriptor({ fields: [arrayField] });
      presentationManager.getContentDescriptor.mockResolvedValue(descriptor);

      propertyDescription.name = combineFieldNames(itemsField.name, arrayField.name);

      const resultField = await provider.getFieldByPropertyDescription(propertyDescription);
      expect(presentationManager.getContentDescriptor).toHaveBeenCalledOnce();
      expect(resultField).toBe(itemsField);
    });
  });

  describe("reacting to updates", () => {
    beforeEach(async () => {
      provider.keys = new KeySet([createTestECInstanceKey()]);
      invalidateCacheSpy.mockClear();

      // make sure that provider setup event listeners
      await provider.getContent();
    });

    it("doesn't react to imodel content updates to unrelated rulesets", async () => {
      onIModelContentChanged.raiseEvent({ rulesetId: "unrelated", updateInfo: "FULL", imodelKey });
      expect(invalidateCacheSpy).not.toHaveBeenCalled();
    });

    it("doesn't react to imodel content updates to unrelated imodels", async () => {
      onIModelContentChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey: "unrelated" });
      expect(invalidateCacheSpy).not.toHaveBeenCalled();
    });

    it("invalidates cache when imodel content change happens to related ruleset", async () => {
      onIModelContentChanged.raiseEvent({ rulesetId, updateInfo: "FULL", imodelKey });
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });

    it("doesn't react to unrelated ruleset modifications", async () => {
      const ruleset = new RegisteredRuleset(createTestRuleset(), "", () => {});
      onRulesetModified.raiseEvent(ruleset, { ...ruleset.toJSON() });
      expect(invalidateCacheSpy).not.toHaveBeenCalled();
    });

    it("invalidates cache when related ruleset is modified", async () => {
      const ruleset = new RegisteredRuleset({ ...createTestRuleset(), id: rulesetId }, "", () => {});
      onRulesetModified.raiseEvent(ruleset, { ...ruleset.toJSON() });
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });

    it("invalidates cache when related ruleset variables change", async () => {
      onVariableChanged.raiseEvent("var_id", "prev", "curr");
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith(CacheInvalidationProps.full());
    });

    it("invalidates cache when active unit system change", async () => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith({ formatting: true });
    });

    it("invalidates cache when formatting settings change", async () => {
      onFormatsChanged.raiseEvent({ formatsChanged: "all" });
      expect(invalidateCacheSpy).toHaveBeenCalledExactlyOnceWith({ formatting: true });
    });
  });

  describe("diagnostics", () => {
    it("passes rule diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = vi.fn();

      provider[Symbol.dispose]();
      provider = new Provider({
        imodel,
        ruleset: rulesetId,
        displayType,
        ruleDiagnostics: { severity: "error", handler: diagnosticsHandler },
      });
      vi.spyOn(provider, "shouldRequestContentForEmptyKeyset").mockReturnValue(true);

      const descriptor = createTestContentDescriptor({ fields: [] });
      presentationManager.getContentIterator.mockResolvedValue({
        descriptor,
        items: createAsyncIterator([createTestContentItem({ values: {}, displayValues: {} })]),
        total: 1,
      });

      await provider.getContentSetSize();
      expect(presentationManager.getContentIterator).toHaveBeenCalledExactlyOnceWith(
        matchOptions((options) => options.diagnostics?.editor === "error" && options.diagnostics?.handler === diagnosticsHandler),
      );
    });

    it("passes dev diagnostics options to presentation manager", async () => {
      const diagnosticsHandler = vi.fn();

      provider[Symbol.dispose]();
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
      vi.spyOn(provider, "shouldRequestContentForEmptyKeyset").mockReturnValue(true);

      const descriptor = createTestContentDescriptor({ fields: [] });
      presentationManager.getContentIterator.mockResolvedValue({
        descriptor,
        items: createAsyncIterator([createTestContentItem({ values: {}, displayValues: {} })]),
        total: 1,
      });

      await provider.getContentSetSize();
      expect(presentationManager.getContentIterator).toHaveBeenCalledExactlyOnceWith(
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
  return { asymmetricMatch: (actual: unknown) => pred(actual as TOptions) };
}
