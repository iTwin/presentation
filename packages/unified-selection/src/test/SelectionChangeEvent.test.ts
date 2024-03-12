import { expect } from "chai";
import sinon from "sinon";
import { SelectionChangeEventImpl, StorageSelectionChangeEventArgs } from "../unified-selection/SelectionChangeEvent";
import { createStorage } from "../unified-selection/SelectionStorage";

describe("SelectionChangeEvent", () => {
  const storage = createStorage();
  let selectionChangeEvent: SelectionChangeEventImpl;

  beforeEach(() => {
    selectionChangeEvent = new SelectionChangeEventImpl();
  });

  it("invokes all listeners when event is raised", () => {
    const listenerSpy1 = sinon.spy(() => {});
    const listenerSpy2 = sinon.spy(() => {});
    selectionChangeEvent.addListener(listenerSpy1);
    selectionChangeEvent.addListener(listenerSpy2);
    selectionChangeEvent.raiseEvent({} as StorageSelectionChangeEventArgs, storage);
    expect(listenerSpy1).to.to.have.callCount(1);
    expect(listenerSpy2).to.to.have.callCount(1);
  });

  it("returns function to unregister listener", () => {
    const listenerSpy1 = sinon.spy(() => {});
    const unregister = selectionChangeEvent.addListener(listenerSpy1);
    unregister();
    selectionChangeEvent.raiseEvent({} as StorageSelectionChangeEventArgs, storage);
    expect(listenerSpy1).to.to.have.callCount(0);
  });

  it("removes subscribed listener", () => {
    const listenerSpy1 = sinon.spy(() => {});
    const listenerSpy2 = sinon.spy(() => {});
    selectionChangeEvent.addListener(listenerSpy1);
    selectionChangeEvent.addListener(listenerSpy2);
    selectionChangeEvent.removeListener(listenerSpy1);
    selectionChangeEvent.raiseEvent({} as StorageSelectionChangeEventArgs, storage);
    expect(listenerSpy1).to.to.have.callCount(0);
    expect(listenerSpy2).to.to.have.callCount(1);
  });
});
