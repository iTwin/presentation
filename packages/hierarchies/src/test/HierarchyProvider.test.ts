/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import sinon from "sinon";
import { createHierarchyProvider } from "../hierarchies/HierarchyProvider.js";
import { createTestGenericNode, createTestGenericNodeKey } from "./Utils.js";

import type { IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import type { HierarchyProvider } from "../hierarchies/HierarchyProvider.js";

describe("createHierarchyProvider", () => {
  it("creates a simple provider", async () => {
    const provider = createHierarchyProvider(() => ({
      async *getNodes({ parentNode }) {
        if (!parentNode) {
          yield createTestGenericNode({ key: createTestGenericNodeKey({ id: "root" }), label: "root" });
        }
      },
    }));
    expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "root" }), label: "root" }),
    ]);
  });

  it("calls provider implementation functions", async () => {
    const provider = createHierarchyProvider(() => ({
      getNodes: sinon.fake(async function* () {}),
      getNodeInstanceKeys: sinon.fake(async function* () {}),
      setFormatter: sinon.spy(),
      setHierarchySearch: sinon.spy(),
    }));

    provider.getNodes({ parentNode: undefined });
    expect(provider.getNodes).to.be.calledOnce;

    provider.getNodeInstanceKeys({ parentNode: undefined });
    expect(provider.getNodeInstanceKeys).to.be.calledOnce;

    provider.setFormatter(undefined);
    expect(provider.setFormatter).to.be.calledOnce;

    provider.setHierarchySearch(undefined);
    expect(provider.setHierarchySearch).to.be.calledOnce;
  });

  it("provides `hierarchyChanged` event access", async () => {
    const provider = createHierarchyProvider(({ hierarchyChanged }) => ({
      async *getNodes() {},
      setFormatter(formatter) {
        hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: formatter } });
      },
      setHierarchySearch(props) {
        hierarchyChanged.raiseEvent({ searchChange: { newSearch: props } });
      },
    }));

    const spy = sinon.spy();
    provider.hierarchyChanged.addListener(spy);

    provider.setFormatter(undefined);
    expect(spy.calledOnceWithExactly({ formatterChange: { newFormatter: undefined } })).to.be.true;
    spy.resetHistory();

    const searchProps = { paths: [] };
    provider.setHierarchySearch(searchProps);
    expect(spy.calledOnceWithExactly({ searchChange: { newSearch: searchProps } })).to.be.true;
  });

  it("allows providers with custom methods", async () => {
    const provider = createHierarchyProvider(() => ({
      async *getNodes() {},
      customMethod: sinon.spy(),
    }));
    provider.customMethod();
    expect(provider.customMethod).to.be.calledOnce;
  });

  it("allows class-based providers with custom methods", async () => {
    using provider = createHierarchyProvider(
      () =>
        new (class implements Pick<HierarchyProvider, "getNodes"> {
          public async *getNodes() {}
          public customMethod() {}
          public [Symbol.dispose]() {}
        })(),
    );
    const spy = sinon.spy(provider, "customMethod");
    provider.customMethod();
    expect(spy).to.be.calledOnce;
  });

  it("allows class-based providers use their private members", async () => {
    const provider = createHierarchyProvider(
      () =>
        new (class implements Pick<HierarchyProvider, "getNodes" | "setFormatter"> {
          private _formatter: IPrimitiveValueFormatter | undefined;
          public async *getNodes() {
            yield createTestGenericNode({
              key: createTestGenericNodeKey({ id: "root" }),
              label: (await this._formatter?.({ type: "String", value: "root" })) ?? "root",
            });
          }
          public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
            this._formatter = formatter;
          }
        })(),
    );

    expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "root" }), label: "root" }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
    provider.setFormatter(async (value) => `formatted ${value.value}`);
    expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "root" }), label: "formatted root" }),
    ]);
  });
});
