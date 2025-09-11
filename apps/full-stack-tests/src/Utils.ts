/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";
import { IModelConnection } from "@itwin/core-frontend";
import {
  ClientDiagnosticsAttribute,
  ContentRequestOptions,
  Descriptor,
  DescriptorOverrides,
  DisplayValueGroup,
  DistinctValuesRequestOptions,
  HierarchyRequestOptions,
  Item,
  KeySet,
  NodeKey,
  Paged,
  RulesetVariable,
} from "@itwin/presentation-common";
import { PresentationManager } from "@itwin/presentation-frontend";
import frontendPackageJson from "@itwin/presentation-frontend/package.json" with { type: "json" };

export function stubVirtualization() {
  let stubs: sinon.SinonStub[] = [];

  beforeEach(() => {
    stubs.push(sinon.stub(window.HTMLElement.prototype, "offsetHeight").get(() => 800));
    stubs.push(sinon.stub(window.HTMLElement.prototype, "offsetWidth").get(() => 800));

    stubs.push(
      sinon.stub(window.Element.prototype, "getBoundingClientRect").returns({
        height: 20,
        width: 20,
        x: 0,
        y: 0,
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        toJSON: () => {},
      }),
    );
  });

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs = [];
  });
}

export function safeDispose(disposable: {} | { [Symbol.dispose]: () => void } | { dispose: () => void }) {
  if ("dispose" in disposable) {
    disposable.dispose();
  } else if (Symbol.dispose in disposable) {
    disposable[Symbol.dispose]();
  }
}

// eslint-disable-next-line @typescript-eslint/no-deprecated
type GetNodesRequestOptions = HierarchyRequestOptions<IModelConnection, NodeKey, RulesetVariable> & ClientDiagnosticsAttribute;
type GetContentRequestOptions = ContentRequestOptions<IModelConnection, Descriptor | DescriptorOverrides, KeySet, RulesetVariable> & ClientDiagnosticsAttribute;
type GetDistinctValuesRequestOptions = DistinctValuesRequestOptions<IModelConnection, Descriptor | DescriptorOverrides, KeySet, RulesetVariable> &
  ClientDiagnosticsAttribute;

type MultipleValuesRequestOptions = Paged<{
  /**
   * Max number of requests that should be made to the backend to fulfill the whole request.
   * `undefined` means no limit, so in that case all requests are sent at once.
   */
  maxParallelRequests?: number;
  /**
   * Size of a single batch when fetching data through multiple requests. If not set,
   * the fall back is requested page size. If the page size is not set, the backend
   * decides how many items to return.
   */
  batchSize?: number;
}>;

type WithIterableMethods<T extends PresentationManager> = {
  getNodesIterator(requestOptions: GetNodesRequestOptions & MultipleValuesRequestOptions): Promise<{
    total: number;
    items: AsyncIterableIterator<Node>;
  }>;
  getContentIterator(requestOptions: GetContentRequestOptions & MultipleValuesRequestOptions): Promise<
    | {
        descriptor: Descriptor;
        total: number;
        items: AsyncIterableIterator<Item>;
      }
    | undefined
  >;
  getDistinctValuesIterator(requestOptions: GetDistinctValuesRequestOptions & MultipleValuesRequestOptions): Promise<{
    total: number;
    items: AsyncIterableIterator<DisplayValueGroup>;
  }>;
} & T;

export function isIterableManager(manager: PresentationManager): manager is WithIterableMethods<PresentationManager> {
  return "getNodesIterator" in manager && "getContentIterator" in manager && "getDistinctValuesIterator" in manager;
}

export function isSelectionStorageSupported() {
  // selection storage support was added in 4.5
  const [major, minor] = frontendPackageJson.version.split(".").map(Number.parseInt);
  return major > 4 || (major === 4 && minor >= 5);
}
