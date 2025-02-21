/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ResolvablePromise } from "presentation-test-utilities";
import * as sinon from "sinon";
import { Id64, Id64Arg, Id64String } from "@itwin/core-bentley";
import { Code, ElementProps } from "@itwin/core-common";
import { IModelApp, IModelConnection, ViewState3d } from "@itwin/core-frontend";
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

// eslint-disable-next-line @typescript-eslint/no-deprecated
const PresentationViewport = viewWithUnifiedSelection(ViewportComponent);

describe("Viewport withUnifiedSelection", () => {
  const viewDefinitionId = "0x1";

  const views = {
    load: sinon.stub<Parameters<IModelConnection.Views["load"]>, ReturnType<IModelConnection.Views["load"]>>(),
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
    views.load.resolves({} as ViewState3d);
  });

  afterEach(() => {
    views.load.reset();
    sinon.restore();
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
    sinon.stub(Presentation, "selection").get(() => selectionManagerMock);

    expect(selectionChangeEvent.numberOfListeners).to.be.eq(0);

    const { unmount } = render(<PresentationViewport imodel={imodel} viewDefinitionId={viewDefinitionId} />);

    // new 'ViewportSelectionHandler' should be listening to selection change event
    expect(selectionChangeEvent.numberOfListeners).to.be.eq(1);
    unmount();

    // 'ViewportSelectionHandler' should not be listening to selection change event anymore
    expect(selectionChangeEvent.numberOfListeners).to.be.eq(0);
  });

  it("sets ViewportSelectionHandler.imodel property when rendered with new imodel", () => {
    const { rerender } = render(
      <ViewportSelectionHandlerContextProvider selectionHandler={selectionHandler}>
        <PresentationViewport imodel={imodel} viewDefinitionId={viewDefinitionId} />
      </ViewportSelectionHandlerContextProvider>,
    );
    expect(selectionHandler.imodel).to.be.eq(imodel);

    const newImodel = {} as IModelConnection;
    rerender(
      <ViewportSelectionHandlerContextProvider selectionHandler={selectionHandler}>
        <PresentationViewport imodel={newImodel} viewDefinitionId={viewDefinitionId} />
      </ViewportSelectionHandlerContextProvider>,
    );
    expect(selectionHandler.imodel).to.be.eq(newImodel);
  });
});

describe("ViewportSelectionHandler", () => {
  let handler: ViewportSelectionHandler;

  const hilited = {
    clear: sinon.stub<[], void>(),
    elements: {
      addIds: sinon.stub<[Id64Arg], void>(),
      deleteIds: sinon.stub<[Id64Arg], void>(),
    },
    models: {
      addIds: sinon.stub<[Id64Arg], void>(),
      deleteIds: sinon.stub<[Id64Arg], void>(),
    },
    subcategories: {
      addIds: sinon.stub<[Id64Arg], void>(),
      deleteIds: sinon.stub<[Id64Arg], void>(),
    },
  };

  const selectionSet = {
    emptyAll: sinon.stub<[], void>(),
    add: sinon.stub<[Id64Arg], void>(),
    remove: sinon.stub<[Id64Arg], void>(),
  };

  const imodelElements: IModelConnection.Elements = {
    getProps: sinon.stub().callsFake(async (ids: Id64Arg) => createElementProps(ids)),
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
    getHiliteSetIterator: sinon.stub<Parameters<SelectionManager["getHiliteSetIterator"]>, ReturnType<SelectionManager["getHiliteSetIterator"]>>(),
  };

  function resetHilitedStub() {
    hilited.clear.reset();
    hilited.elements.addIds.reset();
    hilited.elements.deleteIds.reset();
    hilited.models.addIds.reset();
    hilited.models.deleteIds.reset();
    hilited.subcategories.addIds.reset();
    hilited.subcategories.deleteIds.reset();
  }

  beforeEach(() => {
    sinon.stub(IModelApp, "viewManager").get(() => ({ onSelectionSetChanged: () => {} }));
    sinon.stub(Presentation, "selection").get(() => selectionManager);

    async function* emptyGenerator() {}
    selectionManager.getHiliteSetIterator.callsFake(() => emptyGenerator());
    handler = new ViewportSelectionHandler({ imodel: imodel as unknown as IModelConnection });
  });

  afterEach(() => {
    selectionManager.selectionChange.clear();

    resetHilitedStub();

    selectionSet.emptyAll.reset();
    selectionSet.add.reset();
    selectionSet.remove.reset();

    selectionManager.getHiliteSetIterator.reset();

    handler[Symbol.dispose]();
    sinon.restore();
  });

  describe("imodel", () => {
    it("returns imodel handler is created with", () => {
      expect(handler.imodel).to.eq(imodel);
    });

    it("does nothing when setting the same imodel", () => {
      const spy = sinon.spy(Presentation.selection, "setSyncWithIModelToolSelection");
      handler.imodel = imodel as unknown as IModelConnection;
      expect(spy).to.not.be.called;
    });

    it("sets a different imodel", () => {
      const newImodel = {
        hilited,
        selectionSet,
        elements: imodelElements,
      } as unknown as IModelConnection;
      handler.imodel = newImodel;
      expect(handler.imodel).to.eq(newImodel);
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
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      handler.applyCurrentSelection();

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.elements.addIds).to.be.calledOnceWith([instanceKey.id]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([instanceKey.id]);
      });
    });

    it("ignores selection changes to other imodels", async () => {
      const newImodel = {} as IModelConnection;
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, selectionImodel: newImodel });
      expect(selectionManager.getHiliteSetIterator).to.not.be.called;
      expect(hilited.clear).to.not.be.called;
      expect(hilited.models.addIds).to.not.be.called;
      expect(hilited.subcategories.addIds).to.not.be.called;
      expect(hilited.elements.addIds).to.not.be.called;
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
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      handler.imodel = newImodel;

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.elements.addIds).to.be.calledOnceWith([instanceKey.id]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([instanceKey.id]);
      });
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, selectionLevel: 1 });
      expect(selectionManager.getHiliteSetIterator).to.not.be.called;
      expect(hilited.clear).to.not.be.called;
      expect(hilited.models.addIds).to.not.be.called;
      expect(hilited.subcategories.addIds).to.not.be.called;
      expect(hilited.elements.addIds).to.not.be.called;
    });

    it("clears selection set when hilite list is empty", async () => {
      async function* generator() {}
      selectionManager.getHiliteSetIterator.callsFake(() => generator());
      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Clear });

      await waitFor(() => {
        expect(hilited.clear).to.be.calledOnce;
        // verify selection set was replaced
        expect(selectionSet.emptyAll).to.be.calledOnce;
      });
    });

    it("sets elements hilite after replace event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          elements: [id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.elements.addIds).to.be.calledOnceWith([id]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([id]);
      });
    });

    it("sets models hilite after replace event", async () => {
      const id = "0x1";
      async function* generator() {
        yield {
          models: [id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.models.addIds).to.be.calledOnceWith([id]);

        // verify selection set was cleared
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.not.be.calledOnce;
      });
    });

    it("sets subcategories hilite after replace event", async () => {
      const id = "0x1";
      async function* generator() {
        yield {
          subCategories: [id],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.subcategories.addIds).to.be.calledOnceWith([id]);

        // verify selection set was cleared
        expect(selectionSet.emptyAll).to.be.calledOnce;
        expect(selectionSet.add).to.not.be.calledOnce;
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
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.models.addIds).to.be.calledOnceWith([modelId]);
        expect(hilited.subcategories.addIds).to.be.calledOnceWith([subCategoryId]);
        expect(hilited.elements.addIds).to.be.calledOnceWith([elementId]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).to.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([elementId]);
      });
    });

    it("does not clear selection set if unified selection change was caused by viewport", async () => {
      const elementId = "0x1";
      async function* generator() {
        yield {
          elements: [elementId],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, sourceName: "Tool" });

      await waitFor(() => {
        // verify hilite was changed with expected ids
        expect(hilited.clear).to.be.calledOnce;
        expect(hilited.elements.addIds).to.be.calledOnceWith([elementId]);

        // verify selection set was replaced
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([elementId]);
      });
    });

    it("adds elements to hilite after add event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          elements: [id],
        } as HiliteSet;
      }
      sinon.stub(HiliteSetProvider.prototype, "getHiliteSetIterator").callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Add });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([id]);

        // verify selection set was updated
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.add).to.be.calledOnceWith([id]);
      });
    });

    it("adds models to hilite after add event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          models: [id],
        } as HiliteSet;
      }
      sinon.stub(HiliteSetProvider.prototype, "getHiliteSetIterator").callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Add });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.be.calledOnceWith([id]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("adds subcategories to hilite after add event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          subCategories: [id],
        } as HiliteSet;
      }
      sinon.stub(HiliteSetProvider.prototype, "getHiliteSetIterator").callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Add });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).to.not.be.called;
        expect(hilited.subcategories.addIds).to.be.calledOnceWith([id]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
      });
    });

    it("removes elements from hilite after remove event", async () => {
      const id = "0x2";
      async function* generator() {
        yield {
          elements: [id],
        } as HiliteSet;
      }
      sinon.stub(HiliteSetProvider.prototype, "getHiliteSetIterator").callsFake(() => generator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).to.not.be.called;
        expect(hilited.elements.deleteIds).to.be.calledOnceWith([id]);

        // verify selection set was updated
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.be.calledOnceWith([id]);
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
      sinon.stub(HiliteSetProvider.prototype, "getHiliteSetIterator").callsFake(() => removedGenerator());

      // mock still hilited element set
      async function* hilitedGenerator() {
        yield {
          elements: [hilitedId, removedIds[1]],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.reset();
      selectionManager.getHiliteSetIterator.callsFake(() => hilitedGenerator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).to.not.be.called;
        expect(hilited.elements.deleteIds).to.be.calledOnceWith([removedIds[0], removedIds[1]]);
        expect(hilited.elements.addIds).to.be.calledAfter(hilited.elements.deleteIds).and.calledOnceWith([hilitedId, removedIds[1]]);

        // verify selection set was updated
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.be.calledOnceWith([removedIds[0], removedIds[1]]);
        expect(selectionSet.add).to.be.calledAfter(selectionSet.remove).and.calledOnceWith([hilitedId, removedIds[1]]);
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
      sinon.stub(HiliteSetProvider.prototype, "getHiliteSetIterator").callsFake(() => removedGenerator());

      // mock still hilited element set
      async function* hilitedGenerator() {
        yield {
          models: [hilitedId, removedIds[1]],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.reset();
      selectionManager.getHiliteSetIterator.callsFake(() => hilitedGenerator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.deleteIds).to.be.calledOnceWith([removedIds[0], removedIds[1]]);
        expect(hilited.models.addIds).to.be.calledAfter(hilited.models.deleteIds).and.calledOnceWith([hilitedId, removedIds[1]]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
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
      sinon.stub(HiliteSetProvider.prototype, "getHiliteSetIterator").callsFake(() => removedGenerator());

      // mock still hilited element set
      async function* hilitedGenerator() {
        yield {
          subCategories: [hilitedId, removedIds[1]],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.reset();
      selectionManager.getHiliteSetIterator.callsFake(() => hilitedGenerator());

      // trigger the selection change and wait for event handler to finish
      triggerSelectionChange({ changeType: SelectionChangeType.Remove });

      await waitFor(() => {
        // verify hilite was updated with expected ids
        expect(hilited.clear).to.not.be.called;
        expect(hilited.subcategories.deleteIds).to.be.calledOnceWith([removedIds[0], removedIds[1]]);
        expect(hilited.subcategories.addIds).to.be.calledAfter(hilited.subcategories.deleteIds).and.calledOnceWith([hilitedId, removedIds[1]]);

        // verify selection set was not changed
        expect(selectionSet.emptyAll).to.not.be.called;
        expect(selectionSet.remove).to.not.be.called;
        expect(selectionSet.add).to.not.be.called;
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
      selectionManager.getHiliteSetIterator.reset();
      selectionManager.getHiliteSetIterator.callsFake(() => generator());

      // trigger the selection change
      triggerSelectionChange({ changeType: SelectionChangeType.Replace });

      // verify hilite set was not updated while waiting for first batch
      await waitFor(() => {
        expect(hilited.clear).to.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.not.be.called;
      });
      resetHilitedStub();

      await firstResult.resolve({ elements: [firstElementId] });

      // verify hilite set was updated with first batch result
      await waitFor(() => {
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([firstElementId]);
      });
      resetHilitedStub();

      await secondResult.resolve({ elements: [secondElementId] });

      // verify hilite set was updated with second batch result
      await waitFor(() => {
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([secondElementId]);
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
      selectionManager.getHiliteSetIterator.reset();
      selectionManager.getHiliteSetIterator.callsFake(() => initialGenerator());

      // trigger the selection change
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, sourceName: "initial" });
      expect(selectionManager.getHiliteSetIterator).to.be.calledOnce;

      await waitFor(() => {
        // ensure second selection handling is started
        expect(hilited.clear).to.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([initialElementId]);
      });
      resetHilitedStub();

      const newElementId = "0x3";
      async function* secondGenerator() {
        yield {
          elements: [newElementId],
        } as HiliteSet;
      }
      selectionManager.getHiliteSetIterator.reset();
      selectionManager.getHiliteSetIterator.callsFake(() => secondGenerator());
      triggerSelectionChange({ changeType: SelectionChangeType.Replace, sourceName: "next" });

      expect(selectionManager.getHiliteSetIterator).to.be.calledOnce;

      // ensure second selection was handled
      await waitFor(() => {
        // ensure second selection was handled
        expect(hilited.clear).to.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.be.calledOnceWith([newElementId]);
      });
      resetHilitedStub();

      // finish first selection
      await result.resolve({ elements: ["0x2"] });
      await waitFor(() => {
        // ensure nothing changed
        expect(hilited.clear).to.not.be.called;
        expect(hilited.models.addIds).to.not.be.called;
        expect(hilited.subcategories.addIds).to.not.be.called;
        expect(hilited.elements.addIds).to.not.be.called;
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
