/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from, Subject, throwError } from "rxjs";
import { eachValueFrom } from "../../hierarchies/internal/EachValueFrom";
import { collect } from "../Utils";

describe("eachValueFrom", () => {
  it("returns observable values when they're emitted quicker than consumed", async () => {
    const obs = from([1, 2, 3]);
    expect(await collect(eachValueFrom(obs))).to.deep.eq([1, 2, 3]);
  });

  it("returns observable values when they're consumed quicker than emitted", async () => {
    const sub = new Subject<number>();
    const iter = eachValueFrom(sub);

    const value1 = iter.next();
    sub.next(4);
    expect(await value1).to.deep.eq({ value: 4, done: false });

    const value2 = iter.next();
    sub.next(5);
    expect(await value2).to.deep.eq({ value: 5, done: false });

    const value3 = iter.next();
    sub.complete();
    expect(await value3).to.deep.eq({ value: undefined, done: true });
  });

  it("throws if observable throws before being consumed", async () => {
    const obs = throwError(() => new Error());
    await expect(eachValueFrom(obs).next()).to.eventually.be.rejected;
  });

  it("throws if observable throws after being consumed", async () => {
    const sub = new Subject<number>();
    const iter = eachValueFrom(sub);

    const value = iter.next();
    sub.error(new Error());

    await expect(value).to.eventually.be.rejected;
  });
});
