/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Id64, Id64Arg, Id64String } from "@itwin/core-bentley";
import { Code, ElementProps } from "@itwin/core-common";
import { IModelApp, IModelConnection, ViewManager, ViewState3d } from "@itwin/core-frontend";
import { ViewportComponent } from "@itwin/imodel-components-react";
import { KeySet } from "@itwin/presentation-common";
import {
  HiliteSet,
  HiliteSetProvider,
  Presentation,
  SelectionChangeEvent,
  SelectionChangeEventArgs,
  SelectionChangeType,
  SelectionManager,
} from "@itwin/presentation-frontend";
import { ViewportSelectionHandler } from "../../presentation-components/viewport/ViewportSelectionHandler.js";
import { ViewportSelectionHandlerContextProvider, viewWithUnifiedSelection } from "../../presentation-components/viewport/WithUnifiedSelection.js";
import { createTestECInstanceKey } from "../_helpers/Common.js";
import { render, waitFor } from "../TestUtils.js";

/* eslint-disable @typescript-eslint/no-deprecated */

const PresentationViewport = viewWithUnifiedSelection(ViewportComponent);

describe("Viewport withUnifiedSelection", () => {
  const viewDefinitionId = "0x1";

  const views = {
    load: vi.fn<IModelConnection.Views["load"]>(),
  };

  const imodel = {
    views,
    hilited: {
      clear: () => {},
      wantSyncWithSelectionSet: false,
    },
    selectionSet: {
      emptyAll: () => {},
    },
  } as unknown as IModelConnection;

  const selectionHandler = {
    imodel: {} as IModelConnection,
    applyCurrentSelection: () => {},
  } as ViewportSelectionHandler;

  beforeEach(() => {
    views.load.mockResolvedValue({ iModel: { isOpen: false, isBlank: false } } as unknown as ViewState3d);
  });

  afterEach(() => {
    views.load.mockReset();
  });

  it("renders", () => {
    render(
      <ViewportSelectionHandlerContextProvider selectionHandler={selectionHandler}>
        <PresentationViewport imodel={imodel} viewDefinitionId={viewDefinitionId} />
      </ViewportSelectionHandlerContextProvider>,
    );
  });

  it("creates and disposes default ViewportSelectionHandler implementation when not provided through props", () => {
    const selectionChangeEvent = new SelectionChangeEvent();
    const selectionManagerMock = {
      selectionChange: selectionChangeEvent,
      suspendIModelToolSelectionSync: () => ({ [Symbol.dispose]: () => {} }),
      *getHiliteSetIterator() {},
      setSyncWithIModelToolSelection: () => {},
    };
    vi.spyOn(Presentation, "selection", "get").mockReturnValue(selectionManagerMock as unknown as SelectionManager);

    expect(selectionChangeEvent.numberOfListeners).toBe(0);

    const { unmount } = render(<PresentationViewport imodel={imodel} viewDefinitionId={viewDefinitionId} />);

    // new 'ViewportSelectionHandler' should be listening to selection change event
    expect(selectionChangeEvent.numberOfListeners).toBe(1);
    unmount();

    // 'ViewportSelectionHandler' should not be listening to selection change event anymore
    expect(selectionChangeEvent.numberOfListeners).toBe(0);
  });

  it("sets ViewportSelectionHandler.imodel property when rendered with new imodel", () => {
    const { rerender } = render(
      <ViewportSelectionHandlerContextProvider selectionHandler={selectionHandler}>
        <PresentationViewport imodel={imodel} viewDefinitionId={viewDefinitionId} />
      </ViewportSelectionHandlerContextProvider>,
    );
    expect(selectionHandler.imodel).toBe(imodel);

    const newImodel = {} as IModelConnection;
    rerender(
      <ViewportSelectionHandlerContextProvider selectionHandler={selectionHandler}>
        <PresentationViewport imodel={newImodel} viewDefinitionId={viewDefinitionId} />
      </ViewportSelectionHandlerContextProvider>,
    );
    expect(selectionHandler.imodel).toBe(newImodel);
  });
});

describe("ViewportSelectionHandler", () => {
  let handler: ViewportSelectionHandler;

  const hilited = {
    clear: vi.fn<() => void>(),
    elements: {
      addIds: vi.fn<(arg: Id64Arg) => void>(),
      deleteIds: vi.fn<(arg: Id64Arg) => void>(),
    },
    models: {
      addIds: vi.fn<(arg: Id64Arg) => void>(),
      deleteIds: vi.fn<(arg: Id64Arg) => void>(),
    },
    subcategories: {
      addIds: vi.fn<(arg: Id64Arg) => void>(),
      deleteIds: vi.fn<(arg: Id64Arg) => void>(),
    },
  };

  const selectionSet = {
    emptyAll: vi.fn<() => void>(),
    add: vi.fn<(arg: Id64Arg) => void>(),
    remove: vi.fn<(arg: Id64Arg) => void>(),
  };

  const imodelElements: IModelConnection.Elements = {
    getProps: vi.fn(async (ids: Id64Arg) => createElementProps(ids)),
  } as unknown as IModelConnection.Elements;

  const imodel = {
    hilited,
    selectionSet,
    elements: imodelElements,
  };

  const selectionManager = {
    selectionChange: new SelectionChangeEvent(),
    setSyncWithIModelToolSelection: () => {},
    suspendIModelToolSelectionSync: () => ({
      [Symbol.dispose]: () => {},
    }),
    getHiliteSetIterator: vi.fn<SelectionManager["getHiliteSetIterator"]>(),
  };

  function resetHilitedStub() {
    hilited.clear.mockReset();
    hilited.elements.addIds.mockReset();
    hilited.elements.deleteIds.mockReset();
    hilited.models.addIds.mockReset();
    hilited.models.deleteIds.mockReset();
    hilited.subcategories.addIds.mockReset();
    hilited.subcategories.deleteIds.mockReset();
  }

  beforeEach(() => {
    vi.spyOn(IModelApp, "viewManager", "get").mockReturnValue({ onSelectionSetChanged: () => {} } as unknown as ViewManager);
    vi.spyOn(Presentation, "selection", "get").mockReturnValue(selectionManager as unknown as SelectionManager);

    async function* emptyGenerator() {}
    selectionManager.getHiliteSetIterator.mockImplementation(() => emptyGenerator());
    handler = new ViewportSelectionHandler({ imodel: imodel as unknown as IModelConnection });
  });

  afterEach(() => {
    selectionManager.selectionChange.clear();

    resetHilitedStub();

    selectionSet.emptyAll.mockReset();
    selectionSet.add.mockReset();
    selectionSet.remove.mockReset();

    selectionManager.getHiliteSetIterator.mockReset();

    handler[Symbol.dispose]();
  });

  describe("imodel", () => {
    it("returns imodel handler is created with", () => {
      expect(handler.imodel).toBe(imodel);
    });

    it("does nothing when setting the same imodel", () => {
      const spy = vi.spyOn(Presentation.selection, "setSyncWithIModelToolSelection");
      handler.imodel = imodel as unknown as IModelConnection;
      expect(spy).not.toHaveBeenCalled();
    });

    it("sets a different imodel", () => {
      const newImodel = {
        hilited,
        selectionSet,
        elements: imodelElements,
      } as unknown as IModelConnection;
      handler.imodel = newImodel;
      expect(handler.imodel).toBe(newImodel);
    });
  });

  describe("reacting to unified selection changes", () => {
    const triggerSelectionChange = ({
      changeType,
      sourceName = "",
      selectionLevel = 0,
      selectionImodel = imodel as unknown as IModelConnection,
    }: {
      changeType: SelectionChangeType;
      sourceName?: string;
      selectionLevel?: number;
      selectionImodel?: IModelConnection;
    }) => {
      const selectionChangeArgs: SelectionChangeEventArgs = {
        imodel: selectionImodel,
        changeType,
        level: selectionLevel,
        source: sourceName,
        timestamp: new Date(),
        keys: new KeySet(),
      };
      Presentation.selection.selectionChange.raiseEvent(selectionChangeArgs, Presentation.selection);
    };

    it("applies hilite on current selection", async () => {
      const instanceKey = createTestECInstanceKey();

      async function* generator() {
        yield {
          elements: [instanceKey.id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      handler.applyCurrentSelection();

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).toHaveBeenCalledOnce();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([instanceKey.id]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith([instanceKey.id]);
      });
    });

    it("ignores selection changes to other imodels", async () => {
      const newImodel = {} as IModelConnection;
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, selectionImodel: newImodel });
      expect(selectionManager.getHiliteSetIterator).not.toHaveBeenCalled();
      expect(hilited.clear).not.toHaveBeenCalled();
      expect(hilited.models.addIds).not.toHaveBeenCalled();
      expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
      expect(hilited.elements.addIds).not.toHaveBeenCalled();
    });

    it("applies hilite on current selection after changing target imodel", async () => {
      const newImodel = {
        hilited,
        selectionSet,
        elements: imodelElements,
      } as unknown as IModelConnection;
      const instanceKey = createTestECInstanceKey();

      async function* generator() {
        yield {
          elements: [instanceKey.id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      handler.imodel = newImodel;

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).toHaveBeenCalledOnce();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([instanceKey.id]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith([instanceKey.id]);
      });
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, selectionLevel: 1 });
      expect(selectionManager.getHiliteSetIterator).not.toHaveBeenCalled();
      expect(hilited.clear).not.toHaveBeenCalled();
      expect(hilited.models.addIds).not.toHaveBeenCalled();
      expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
      expect(hilited.elements.addIds).not.toHaveBeenCalled();
    });

    it("clears selection set when hilite list is empty", async () => {
      async function* generator() {}
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());
      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Clear });

      await waitFor(() => {
        expect(hilited.clear).toHaveBeenCalledOnce();
        // verify selection set was replaced
        expect(selectionSet.emptyAll).toHaveBeenCalledOnce();
      });
    });

    it("sets elements hilite after replace event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          elements: [id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).toHaveBeenCalledOnce();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([id]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith([id]);
      });
    });

    it("sets models hilite after replace event", async () => {
      const id = "0x1";
      async function* generator() {
        yield {
          models: [id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).toHaveBeenCalledOnce();
        expect(hilited.models.addIds).toHaveBeenCalledExactlyOnceWith([id]);

        // verify selection set was cleared
        expect(selectionSet.emptyAll).toHaveBeenCalledOnce();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("sets subcategories hilite after replace event", async () => {
      const id = "0x1";
      async function* generator() {
        yield {
          subCategories: [id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).toHaveBeenCalledOnce();
        expect(hilited.subcategories.addIds).toHaveBeenCalledExactlyOnceWith([id]);

        // verify selection set was cleared
        expect(selectionSet.emptyAll).toHaveBeenCalledOnce();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("sets combined hilite after replace event", async () => {
      const modelId = "0x1";
      const subCategoryId = "0x2";
      const elementId = "0x3";
      async function* generator() {
        yield {
          models: [modelId],
          subCategories: [subCategoryId],
          elements: [elementId],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).toHaveBeenCalledOnce();
        expect(hilited.models.addIds).toHaveBeenCalledExactlyOnceWith([modelId]);
        expect(hilited.subcategories.addIds).toHaveBeenCalledExactlyOnceWith([subCategoryId]);
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([elementId]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith([elementId]);
      });
    });

    it("does not clear selection set if unified selection change was caused by viewport", async () => {
      const elementId = "0x1";
      async function* generator() {
        yield {
          elements: [elementId],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, sourceName: "Tool" });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).toHaveBeenCalledOnce();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([elementId]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith([elementId]);
      });
    });

    it("adds elements to hilite after add event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          elements: [id],
        } as HiliteSet;
      }
      vi.spyOn(HiliteSetProvider.prototype, "getHiliteSetIterator").mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Add });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([id]);

        // verify selection set was updated
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith([id]);
      });
    });

    it("adds models to hilite after add event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          models: [id],
        } as HiliteSet;
      }
      vi.spyOn(HiliteSetProvider.prototype, "getHiliteSetIterator").mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Add });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.models.addIds).toHaveBeenCalledExactlyOnceWith([id]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.remove).not.toHaveBeenCalled();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("adds subcategories to hilite after add event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          subCategories: [id],
        } as HiliteSet;
      }
      vi.spyOn(HiliteSetProvider.prototype, "getHiliteSetIterator").mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Add });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.subcategories.addIds).toHaveBeenCalledExactlyOnceWith([id]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.remove).not.toHaveBeenCalled();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("removes elements from hilite after remove event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          elements: [id],
        } as HiliteSet;
      }
      vi.spyOn(HiliteSetProvider.prototype, "getHiliteSetIterator").mockImplementation(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.elements.deleteIds).toHaveBeenCalledExactlyOnceWith([id]);

        // verify selection set was updated
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.remove).toHaveBeenCalledExactlyOnceWith([id]);
      });
    });

    it("removes and readds elements to hilite after remove event", async () => {
      const removedIds = ["0x2", "0x3"];
      const hilitedId = "0x1";

      // mock removed elements hilite set
      async function* removedGenerator() {
        yield {
          elements: removedIds,
        } as HiliteSet;
      }
      vi.spyOn(HiliteSetProvider.prototype, "getHiliteSetIterator").mockImplementation(() => removedGenerator());

      // mock still hilited element set
      async function* hilitedGenerator() {
        yield {
          elements: [hilitedId, removedIds[1]],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockReset();
      selectionManager.getHiliteSetIterator.mockImplementation(() => hilitedGenerator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.elements.deleteIds).toHaveBeenCalledExactlyOnceWith([removedIds[0], removedIds[1]]);
        expect(hilited.elements.deleteIds.mock.invocationCallOrder[0]).toBeLessThan(hilited.elements.addIds.mock.invocationCallOrder[0]);
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([hilitedId, removedIds[1]]);

        // verify selection set was updated
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.remove).toHaveBeenCalledExactlyOnceWith([removedIds[0], removedIds[1]]);
        expect(selectionSet.remove.mock.invocationCallOrder[0]).toBeLessThan(selectionSet.add.mock.invocationCallOrder[0]);
        expect(selectionSet.add).toHaveBeenCalledExactlyOnceWith([hilitedId, removedIds[1]]);
      });
    });

    it("removes and readds models to hilite after remove event", async () => {
      const removedIds = ["0x2", "0x3"];
      const hilitedId = "0x1";

      // mock removed elements hilite set
      async function* removedGenerator() {
        yield {
          models: removedIds,
        } as HiliteSet;
      }
      vi.spyOn(HiliteSetProvider.prototype, "getHiliteSetIterator").mockImplementation(() => removedGenerator());

      // mock still hilited element set
      async function* hilitedGenerator() {
        yield {
          models: [hilitedId, removedIds[1]],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockReset();
      selectionManager.getHiliteSetIterator.mockImplementation(() => hilitedGenerator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.models.deleteIds).toHaveBeenCalledExactlyOnceWith([removedIds[0], removedIds[1]]);
        expect(hilited.models.deleteIds.mock.invocationCallOrder[0]).toBeLessThan(hilited.models.addIds.mock.invocationCallOrder[0]);
        expect(hilited.models.addIds).toHaveBeenCalledExactlyOnceWith([hilitedId, removedIds[1]]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.remove).not.toHaveBeenCalled();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("removes and readds subcategories to hilite after remove event", async () => {
      const removedIds = ["0x2", "0x3"];
      const hilitedId = "0x1";

      // mock removed elements hilite set
      async function* removedGenerator() {
        yield {
          subCategories: removedIds,
        } as HiliteSet;
      }
      vi.spyOn(HiliteSetProvider.prototype, "getHiliteSetIterator").mockImplementation(() => removedGenerator());

      // mock still hilited element set
      async function* hilitedGenerator() {
        yield {
          subCategories: [hilitedId, removedIds[1]],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockReset();
      selectionManager.getHiliteSetIterator.mockImplementation(() => hilitedGenerator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.subcategories.deleteIds).toHaveBeenCalledExactlyOnceWith([removedIds[0], removedIds[1]]);
        expect(hilited.subcategories.deleteIds.mock.invocationCallOrder[0]).toBeLessThan(hilited.subcategories.addIds.mock.invocationCallOrder[0]);
        expect(hilited.subcategories.addIds).toHaveBeenCalledExactlyOnceWith([hilitedId, removedIds[1]]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).not.toHaveBeenCalled();
        expect(selectionSet.remove).not.toHaveBeenCalled();
        expect(selectionSet.add).not.toHaveBeenCalled();
      });
    });

    it("handles hilite set in batches", async () => {
      const firstElementId = "0x1";
      const firstResult = new ResolvablePromise<HiliteSet>();
      const secondElementId = "0x2";
      const secondResult = new ResolvablePromise<HiliteSet>();

      async function* generator() {
        yield await firstResult;
        yield await secondResult;
      }
      selectionManager.getHiliteSetIterator.mockReset();
      selectionManager.getHiliteSetIterator.mockImplementation(() => generator());

      // trigger the selection change
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      // verify hilite set was not updated while waiting for first batch
      await waitFor(() => {
        expect(hilited.clear).toHaveBeenCalled();
        expect(hilited.models.addIds).not.toHaveBeenCalled();
        expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
        expect(hilited.elements.addIds).not.toHaveBeenCalled();
      });
      resetHilitedStub();

      await firstResult.resolve({ elements: [firstElementId] });

      // verify hilite set was updated with first batch result
      await waitFor(() => {
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.models.addIds).not.toHaveBeenCalled();
        expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([firstElementId]);
      });
      resetHilitedStub();

      await secondResult.resolve({ elements: [secondElementId] });

      // verify hilite set was updated with second batch result
      await waitFor(() => {
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.models.addIds).not.toHaveBeenCalled();
        expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([secondElementId]);
      });
    });

    it("cancels ongoing selection change handling when selection changes again", async () => {
      const initialElementId = "0x1";
      const result = new ResolvablePromise<HiliteSet>();
      async function* initialGenerator() {
        yield {
          elements: [initialElementId],
        } as HiliteSet;
        yield await result;
      }
      selectionManager.getHiliteSetIterator.mockReset();
      selectionManager.getHiliteSetIterator.mockImplementation(() => initialGenerator());

      // trigger the selection change
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, sourceName: "initial" });
      expect(selectionManager.getHiliteSetIterator).toHaveBeenCalledOnce();

      await waitFor(() => {
        // ensure second selection handling is started
        expect(hilited.clear).toHaveBeenCalled();
        expect(hilited.models.addIds).not.toHaveBeenCalled();
        expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([initialElementId]);
      });
      resetHilitedStub();

      const newElementId = "0x3";
      async function* secondGenerator() {
        yield {
          elements: [newElementId],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.mockReset();
      selectionManager.getHiliteSetIterator.mockImplementation(() => secondGenerator());
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, sourceName: "next" });

      expect(selectionManager.getHiliteSetIterator).toHaveBeenCalledOnce();

      // ensure second selection was handled
      await waitFor(() => {
        // ensure second selection was handled
        expect(hilited.clear).toHaveBeenCalled();
        expect(hilited.models.addIds).not.toHaveBeenCalled();
        expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
        expect(hilited.elements.addIds).toHaveBeenCalledExactlyOnceWith([newElementId]);
      });
      resetHilitedStub();

      // finish first selection
      await result.resolve({ elements: ["0x2"] });
      await waitFor(() => {
        // ensure nothing changed
        expect(hilited.clear).not.toHaveBeenCalled();
        expect(hilited.models.addIds).not.toHaveBeenCalled();
        expect(hilited.subcategories.addIds).not.toHaveBeenCalled();
        expect(hilited.elements.addIds).not.toHaveBeenCalled();
      });
    });
  });
});

const createElementProps = (ids: Id64Arg): ElementProps[] => {
  return [...Id64.toIdSet(ids)].map(
    (id: Id64String): ElementProps => ({
      id,
      classFullName: "ElementSchema:ElementClass",
      code: Code.createEmpty(),
      model: id,
    }),
  );
};
