/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/* tslint:disable:no-direct-imports */

import "@bentley/presentation-frontend/lib/test/_helpers/MockFrontendEnvironment";
import * as React from "react";
import { expect } from "chai";
import * as sinon from "sinon";
import { mount, shallow } from "enzyme";
import * as faker from "faker";
import * as moq from "@bentley/presentation-common/lib/test/_helpers/Mocks";
import {
  createRandomId,
  createRandomECInstanceKey,
  createRandomECInstanceNodeKey,
  createRandomDescriptor,
} from "@bentley/presentation-common/lib/test/_helpers/random";
import { ResolvablePromise } from "@bentley/presentation-common/lib/test/_helpers/Promises";
import { Id64String, Id64, Id64Arg, BeDuration } from "@bentley/bentleyjs-core";
import { ElementProps, Code } from "@bentley/imodeljs-common";
import { IModelConnection, SelectionSet, ViewState3d, NoRenderApp, SelectEventType } from "@bentley/imodeljs-frontend";
import { KeySet, DefaultContentDisplayTypes, SelectionInfo, Content, Item, InstanceKey, Descriptor } from "@bentley/presentation-common";
import {
  Presentation, PresentationManager,
  SelectionManager, SelectionChangeEvent, SelectionChangeEventArgs, SelectionChangeType,
} from "@bentley/presentation-frontend";
import { ViewportComponent } from "@bentley/ui-components";
import { IUnifiedSelectionComponent } from "../../common/IUnifiedSelectionComponent";
import { viewWithUnifiedSelection, ViewportSelectionHandler } from "../../viewport/WithUnifiedSelection";

// tslint:disable-next-line:variable-name naming-convention
const PresentationViewport = viewWithUnifiedSelection(ViewportComponent);

describe("Viewport withUnifiedSelection", () => {

  before(() => {
    NoRenderApp.startup();
    classNameGenerator = () => faker.random.word();
  });
  after(() => {
    NoRenderApp.shutdown();
  });

  let viewDefinitionId: Id64String;
  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const selectionHandlerMock = moq.Mock.ofType<ViewportSelectionHandler>();
  beforeEach(() => {
    viewDefinitionId = createRandomId();
    selectionHandlerMock.reset();
    const viewsMock = moq.Mock.ofInstance<IModelConnection.Views>(new IModelConnection.Views(imodelMock.object));
    viewsMock.setup((views) => views.load(moq.It.isAny())).returns(async () => moq.Mock.ofType<ViewState3d>().object);
    imodelMock.reset();
    let selectionSet: SelectionSet | undefined;
    imodelMock.setup((imodel) => imodel.selectionSet).returns((imodel) => {
      if (!selectionSet)
        selectionSet = new SelectionSet(imodel);
      return selectionSet;
    });
    imodelMock.setup((imodel) => imodel.views).returns(() => viewsMock.object);
  });

  it("mounts", () => {
    mount(<PresentationViewport
      imodel={imodelMock.object}
      rulesetId={faker.random.word()}
      viewDefinitionId={viewDefinitionId}
      selectionHandler={selectionHandlerMock.object}
    />);
  });

  it("uses data provider's imodel and rulesetId", () => {
    const rulesetId = faker.random.word();
    const component = shallow(<PresentationViewport
      imodel={imodelMock.object}
      rulesetId={rulesetId}
      viewDefinitionId={viewDefinitionId}
      selectionHandler={selectionHandlerMock.object}
    />).instance() as any as IUnifiedSelectionComponent;

    expect(component.imodel).to.equal(imodelMock.object);
    expect(component.rulesetId).to.equal(rulesetId);
  });

  it("renders correctly", () => {
    expect(shallow(<PresentationViewport
      imodel={imodelMock.object}
      rulesetId={faker.random.word()}
      viewDefinitionId={viewDefinitionId}
      selectionHandler={selectionHandlerMock.object}
    />)).to.matchSnapshot();
  });

  describe("selectionHandler", () => {

    it("creates default implementation when not provided through props", () => {
      const selectionManagerMock = moq.Mock.ofType<SelectionManager>();
      selectionManagerMock.setup((x) => x.selectionChange).returns(() => new SelectionChangeEvent());
      Presentation.selection = selectionManagerMock.object;

      const rulesetId = faker.random.word();

      const viewport = shallow(<PresentationViewport
        imodel={imodelMock.object}
        rulesetId={rulesetId}
        viewDefinitionId={viewDefinitionId}
      />).instance() as any as IUnifiedSelectionComponent;

      expect(viewport.selectionHandler).to.not.be.undefined;
      expect(viewport.selectionHandler!.rulesetId).to.eq(rulesetId);
      expect(viewport.selectionHandler!.imodel).to.eq(imodelMock.object);
    });

    it("disposes when component unmounts", () => {
      const viewport = shallow(<PresentationViewport
        imodel={imodelMock.object}
        rulesetId={faker.random.word()}
        viewDefinitionId={viewDefinitionId}
        selectionHandler={selectionHandlerMock.object}
      />);
      viewport.unmount();
      selectionHandlerMock.verify((x) => x.dispose(), moq.Times.once());
    });

    it("updates handler when component's props change", () => {
      const viewport = shallow(<PresentationViewport
        imodel={imodelMock.object}
        rulesetId={faker.random.word()}
        viewDefinitionId={viewDefinitionId}
        selectionHandler={selectionHandlerMock.object}
      />);

      const imodelMock2 = moq.Mock.ofType<IModelConnection>();
      const rulesetId2 = faker.random.word();

      viewport.setProps({
        imodel: imodelMock2.object,
        rulesetId: rulesetId2,
      });

      selectionHandlerMock.verify((x) => x.imodel = imodelMock2.object, moq.Times.once());
      selectionHandlerMock.verify((x) => x.rulesetId = rulesetId2, moq.Times.once());
    });

    it("returns undefined handler when not mounted", () => {
      const viewport = shallow(<PresentationViewport
        imodel={imodelMock.object}
        rulesetId={faker.random.word()}
        viewDefinitionId={viewDefinitionId}
        selectionHandler={selectionHandlerMock.object}
      />, { disableLifecycleMethods: true }).instance() as any as IUnifiedSelectionComponent;
      expect(viewport.selectionHandler).to.be.undefined;
    });

    it("handles missing handler when unmounts", () => {
      const viewport = shallow(<PresentationViewport
        imodel={imodelMock.object}
        rulesetId={faker.random.word()}
        viewDefinitionId={viewDefinitionId}
        selectionHandler={selectionHandlerMock.object}
      />, { disableLifecycleMethods: true });
      viewport.unmount();
    });

    it("handles missing handler when updates", () => {
      const viewport = shallow(<PresentationViewport
        imodel={imodelMock.object}
        rulesetId={faker.random.word()}
        viewDefinitionId={viewDefinitionId}
        selectionHandler={selectionHandlerMock.object}
      />, { disableLifecycleMethods: true });
      viewport.instance().componentDidUpdate!(viewport.props(), viewport.state()!);
    });

  });

});

describe("ViewportSelectionHandler", () => {

  let rulesetId: string;
  let handler: ViewportSelectionHandler;
  const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
  const selectionManagerMock = moq.Mock.ofType<SelectionManager>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();

  before(() => {
    NoRenderApp.startup();
    Presentation.presentation = presentationManagerMock.object;
    Presentation.selection = selectionManagerMock.object;
    rulesetId = faker.random.word();
    const defaultClassName = faker.random.word();
    classNameGenerator = () => defaultClassName;
  });

  after(() => {
    NoRenderApp.shutdown();
  });

  beforeEach(() => {
    presentationManagerMock.reset();

    const selectionChangeEvent = new SelectionChangeEvent();
    selectionManagerMock.reset();
    selectionManagerMock.setup((x) => x.selectionChange).returns(() => selectionChangeEvent);

    mockIModel(imodelMock);

    handler = new ViewportSelectionHandler(imodelMock.object, rulesetId);
  });

  afterEach(() => {
    handler.dispose();
  });

  describe("imodel", () => {

    it("returns imodel handler is created with", () => {
      expect(handler.imodel).to.eq(imodelMock.object);
    });

    it("sets a different imodel", () => {
      const newConnection = moq.Mock.ofType<IModelConnection>();
      mockIModel(newConnection);
      handler.imodel = newConnection.object;
      expect(handler.imodel).to.eq(newConnection.object);
    });

  });

  describe("rulesetId", () => {

    it("returns rulesetId handler is created with", () => {
      expect(handler.rulesetId).to.eq(rulesetId);
    });

    it("sets a different rulesetId", () => {
      const newId = rulesetId + " (changed)";
      handler.rulesetId = newId;
      expect(handler.rulesetId).to.eq(newId);
    });

  });

  describe("reacting to unified selection changes", () => {

    let replaceSpy: any;
    beforeEach(() => {
      replaceSpy = sinon.spy(imodelMock.target.selectionSet, "replace");
    });

    it("ignores selection changes to other imodels", async () => {
      const otherImodel = moq.Mock.ofType<IModelConnection>();
      const selectionChangeArgs: SelectionChangeEventArgs = {
        imodel: otherImodel.object,
        changeType: SelectionChangeType.Clear,
        level: 0,
        source: faker.random.word(),
        timestamp: new Date(),
        keys: new KeySet(),
      };
      selectionManagerMock.target.selectionChange.raiseEvent(selectionChangeArgs, selectionManagerMock.object);
      selectionManagerMock.verify((x) => x.getSelection(imodelMock.object, moq.It.isAny()), moq.Times.never());
      expect(replaceSpy).to.not.be.called;
    });

    it("ignores selection changes to selection levels other than 0", async () => {
      const selectionChangeArgs: SelectionChangeEventArgs = {
        imodel: imodelMock.object,
        changeType: SelectionChangeType.Clear,
        level: 1,
        source: faker.random.word(),
        timestamp: new Date(),
        keys: new KeySet(),
      };
      selectionManagerMock.target.selectionChange.raiseEvent(selectionChangeArgs, selectionManagerMock.object);
      selectionManagerMock.verify((x) => x.getSelection(imodelMock.object, moq.It.isAny()), moq.Times.never());
      expect(replaceSpy).to.not.be.called;
    });

    it("replaces viewport selection with content of current unified selection", async () => {
      // the handler asks selection manager for overall selection
      const keys = new KeySet([createRandomECInstanceKey(), createRandomECInstanceNodeKey()]);
      selectionManagerMock.setup((x) => x.getSelection(imodelMock.object, 0)).returns(() => keys);

      // then it asks for content descriptor + content for that selection
      const selectionProviderName = faker.random.word();
      const selectionLevel = 0;
      const descriptor = createRandomDescriptor();
      descriptor.selectionInfo = {
        providerName: selectionProviderName,
        level: selectionLevel,
      };
      presentationManagerMock.setup((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
        DefaultContentDisplayTypes.VIEWPORT, keys, descriptor.selectionInfo)).returns(async () => descriptor);

      const content: Content = {
        descriptor,
        contentSet: [
          new Item([createRandomECInstanceKey(), createRandomECInstanceKey()], "", "", undefined, {}, {}, []),
          new Item([createRandomECInstanceKey()], "", "", undefined, {}, {}, []),
        ],
      };
      presentationManagerMock.setup((x) => x.getContentSetSize({ imodel: imodelMock.object, rulesetId }, descriptor, keys))
        .returns(async () => content.contentSet.length);
      presentationManagerMock.setup((x) => x.getContent({ imodel: imodelMock.object, rulesetId, paging: undefined }, descriptor, keys))
        .returns(async () => content);

      // trigger the selection change
      const selectionChangeArgs: SelectionChangeEventArgs = {
        imodel: imodelMock.object,
        changeType: SelectionChangeType.Add,
        level: selectionLevel,
        source: selectionProviderName,
        timestamp: new Date(),
        keys: new KeySet(),
      };
      selectionManagerMock.target.selectionChange.raiseEvent(selectionChangeArgs, selectionManagerMock.object);

      // wait for event handler to finish
      await waitForAllAsyncs([handler]);

      // verify viewport selection was changed with expected ids
      const ids = [
        content.contentSet[0].primaryKeys[0].id,
        content.contentSet[0].primaryKeys[1].id,
        content.contentSet[1].primaryKeys[0].id,
      ];
      expect(replaceSpy).to.be.calledWith(ids);
    });

    it("replaces viewport selection with empty list when there's no content for unified selection", async () => {
      // the handler asks selection manager for overall selection
      const keys = new KeySet();
      selectionManagerMock.setup((x) => x.getSelection(imodelMock.object, 0)).returns(() => keys);

      // then it asks for content descriptor + content for that selection - return undefined
      // descriptor for 'no content'
      const selectionInfo: SelectionInfo = {
        providerName: faker.random.word(),
        level: 0,
      };
      presentationManagerMock.setup((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
        DefaultContentDisplayTypes.VIEWPORT, keys, selectionInfo)).returns(async () => undefined);

      // trigger the selection change
      const selectionChangeArgs: SelectionChangeEventArgs = {
        imodel: imodelMock.object,
        changeType: SelectionChangeType.Add,
        level: selectionInfo.level!,
        source: selectionInfo.providerName,
        timestamp: new Date(),
        keys: new KeySet(),
      };
      selectionManagerMock.target.selectionChange.raiseEvent(selectionChangeArgs, selectionManagerMock.object);

      // wait for event handler to finish
      await waitForAllAsyncs([handler]);

      // verify viewport selection was changed with expected ids
      expect(replaceSpy).to.be.calledWith([]);
    });

    it("ignores viewport selection changes while reacting to unified selection changes", async () => {
      // the handler asks selection manager for overall selection
      const keys = new KeySet();
      selectionManagerMock.setup((x) => x.getSelection(imodelMock.object, 0)).returns(() => keys);

      // then it asks for content descriptor + content for that selection - return undefined
      // descriptor for 'no content'
      const selectionInfo: SelectionInfo = {
        providerName: faker.random.word(),
        level: 0,
      };
      presentationManagerMock.setup((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
        DefaultContentDisplayTypes.VIEWPORT, keys, selectionInfo)).returns(async () => undefined);

      // trigger the selection change
      const selectionChangeArgs: SelectionChangeEventArgs = {
        imodel: imodelMock.object,
        changeType: SelectionChangeType.Add,
        level: selectionInfo.level!,
        source: selectionInfo.providerName,
        timestamp: new Date(),
        keys: new KeySet(),
      };
      selectionManagerMock.target.selectionChange.raiseEvent(selectionChangeArgs, selectionManagerMock.object);

      // wait for event handler to finish
      await waitForAllAsyncs([handler]);

      // ensure this didn't result in any more unified selection changes
      selectionManagerMock.verify((x) => x.addToSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()), moq.Times.never());
      selectionManagerMock.verify((x) => x.replaceSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()), moq.Times.never());
      selectionManagerMock.verify((x) => x.removeFromSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()), moq.Times.never());
      selectionManagerMock.verify((x) => x.clearSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()), moq.Times.never());
    });

    it("ignores intermediate unified selection changes", async () => {
      // the handler asks selection manager for overall selection
      const keys = new KeySet();
      selectionManagerMock.setup((x) => x.getSelection(imodelMock.object, 0)).returns(() => keys);

      // then it asks for content descriptor + content for that selection - return undefined
      // descriptor for 'no content'
      const descriptorRequests = [1, 2].map(() => {
        const descriptor = new ResolvablePromise<Descriptor | undefined>();
        presentationManagerMock.setup((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
          DefaultContentDisplayTypes.VIEWPORT, keys, moq.It.isAny())).returns(async () => descriptor);
        return descriptor;
      });

      // trigger the selection change
      const selectionInfo = (name: string): SelectionInfo => ({
        providerName: name,
        level: 0,
      });
      const selectionChangeArgs = (name: string): SelectionChangeEventArgs => ({
        imodel: imodelMock.object,
        changeType: SelectionChangeType.Add,
        level: 0,
        source: name,
        timestamp: new Date(),
        keys: new KeySet(),
      });
      selectionManagerMock.target.selectionChange.raiseEvent(selectionChangeArgs("initial"), selectionManagerMock.object);

      // handler should now be waiting for the first descriptor request to resolve - ensure
      // viewport selection was not replaced yet
      presentationManagerMock.verify((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
        DefaultContentDisplayTypes.VIEWPORT, keys, selectionInfo("initial")), moq.Times.once());
      expect(replaceSpy).to.not.be.called;

      // trigger some intermediate selection changes
      for (let i = 1; i <= 10; ++i)
        selectionManagerMock.target.selectionChange.raiseEvent(selectionChangeArgs(i.toString()), selectionManagerMock.object);

      // ensure new content requests were not triggered
      presentationManagerMock.verify((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
        DefaultContentDisplayTypes.VIEWPORT, keys, moq.It.isAny()), moq.Times.once());

      // now resolve the first content request
      descriptorRequests[0].resolve(undefined);
      await waitForPendingAsyncs(handler);

      // ensure viewport selection change was made
      expect(replaceSpy).to.be.calledOnce;

      // ensure a new content request was made for the last selection change
      presentationManagerMock.verify((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
        DefaultContentDisplayTypes.VIEWPORT, keys, selectionInfo("10")), moq.Times.once());
      descriptorRequests[1].resolve(undefined);
      await waitForAllAsyncs([handler]);
      expect(replaceSpy).to.be.calledTwice;
    });

  });

  describe("reacting to viewport selection changes", () => {

    beforeEach(() => {
      const defaultArgs = {
        imodel: imodelMock.object,
        level: 0,
        timestamp: new Date(),
        keys: new KeySet(),
      };
      const callback = (args: SelectionChangeEventArgs) => {
        selectionManagerMock.target.selectionChange.raiseEvent(args, selectionManagerMock.object);
      };
      selectionManagerMock.setup((x) => x.addToSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()))
        .callback((source) => callback({ ...defaultArgs, changeType: SelectionChangeType.Add, source }));
      selectionManagerMock.setup((x) => x.replaceSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()))
        .callback((source) => callback({ ...defaultArgs, changeType: SelectionChangeType.Replace, source }));
      selectionManagerMock.setup((x) => x.removeFromSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()))
        .callback((source) => callback({ ...defaultArgs, changeType: SelectionChangeType.Remove, source }));
      selectionManagerMock.setup((x) => x.clearSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()))
        .callback((source) => callback({ ...defaultArgs, changeType: SelectionChangeType.Clear, source }));
    });

    it("ignores selection changes to other imodels", async () => {
      const otherImodel = moq.Mock.ofType<IModelConnection>();
      imodelMock.target.selectionSet.onChanged.raiseEvent(otherImodel.object, SelectEventType.Clear);
      selectionManagerMock.verify((x) => x.clearSelection(moq.It.isAny(), moq.It.isAny(), moq.It.isAny(), moq.It.isAny()), moq.Times.never());
    });

    it("handles adding to selection when viewport reports undefined ids added to selection", async () => {
      imodelMock.target.selectionSet.onChanged.raiseEvent(imodelMock.object, SelectEventType.Add, undefined);
      await waitForAllAsyncs([handler]);
      selectionManagerMock.verify((x) => x.addToSelection(moq.It.isAnyString(), imodelMock.object, [], 0, rulesetId), moq.Times.once());
    });

    it("clears unified selection when viewport selection is cleared", async () => {
      imodelMock.target.selectionSet.onChanged.raiseEvent(imodelMock.object, SelectEventType.Clear);
      await waitForAllAsyncs([handler]);
      selectionManagerMock.verify((x) => x.clearSelection(moq.It.isAnyString(), imodelMock.object, 0, rulesetId), moq.Times.once());
    });

    it("adds elements to unified selection when they're added to viewport's selection", async () => {
      const ids = [createRandomId(), createRandomId(), createRandomId()];
      const keys = createElementProps(ids);
      imodelMock.target.selectionSet.onChanged.raiseEvent(imodelMock.object, SelectEventType.Add, new Set(ids));
      await waitForAllAsyncs([handler]);
      selectionManagerMock.verify((x) => x.addToSelection(moq.It.isAnyString(), imodelMock.object, keys, 0, rulesetId), moq.Times.once());
    });

    it("replaces elements in unified selection when they're replaced in viewport's selection", async () => {
      const ids = [createRandomId(), createRandomId(), createRandomId()];
      const keys = createElementProps(ids);
      imodelMock.target.selectionSet.onChanged.raiseEvent(imodelMock.object, SelectEventType.Replace, new Set(ids));
      await waitForAllAsyncs([handler]);
      selectionManagerMock.verify((x) => x.replaceSelection(moq.It.isAnyString(), imodelMock.object, keys, 0, rulesetId), moq.Times.once());
    });

    it("removes elements from unified selection when they're removed from viewport's selection", async () => {
      const ids = [createRandomId(), createRandomId(), createRandomId()];
      const keys = createElementProps(ids);
      imodelMock.target.selectionSet.onChanged.raiseEvent(imodelMock.object, SelectEventType.Remove, new Set(ids));
      await waitForAllAsyncs([handler]);
      selectionManagerMock.verify((x) => x.removeFromSelection(moq.It.isAnyString(), imodelMock.object, keys, 0, rulesetId), moq.Times.once());
    });

    it("ignores unified selection changes while reacting to viewport selection changes", async () => {
      const selectionSetSpies = [
        sinon.spy(imodelMock.target.selectionSet, "add"),
        sinon.spy(imodelMock.target.selectionSet, "addAndRemove"),
        sinon.spy(imodelMock.target.selectionSet, "emptyAll"),
        sinon.spy(imodelMock.target.selectionSet, "invert"),
        sinon.spy(imodelMock.target.selectionSet, "remove"),
        sinon.spy(imodelMock.target.selectionSet, "replace"),
      ];
      const ids = [createRandomId()];
      imodelMock.target.selectionSet.onChanged.raiseEvent(imodelMock.object, SelectEventType.Add, new Set(ids));
      await waitForAllAsyncs([handler]);
      selectionSetSpies.forEach((s) => expect(s).to.not.be.called);
    });

    it("reacts to viewport selection changes after changing imodel", async () => {
      mockIModel(imodelMock);
      handler.imodel = imodelMock.object;
      imodelMock.target.selectionSet.onChanged.raiseEvent(imodelMock.object, SelectEventType.Clear);
      await waitForAllAsyncs([handler]);
      selectionManagerMock.verify((x) => x.clearSelection(moq.It.isAnyString(), imodelMock.object, 0, rulesetId), moq.Times.once());
    });

  });

});

describe("Integration: ViewportSelectionHandler", () => {

  let rulesetId: string;
  let key: InstanceKey;
  let selectionManager = new SelectionManager();
  const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
  const imodelMock = moq.Mock.ofType<IModelConnection>();

  before(() => {
    NoRenderApp.startup();
    Presentation.presentation = presentationManagerMock.object;
    rulesetId = faker.random.word();
    key = createRandomECInstanceKey();
    classNameGenerator = () => key.className;
  });

  after(() => {
    NoRenderApp.shutdown();
  });

  beforeEach(() => {
    presentationManagerMock.reset();
    mockIModel(imodelMock);
    Presentation.selection = selectionManager = new SelectionManager();
  });

  describe("multiple ViewportSelectionHandlers", () => {

    let handlers: ViewportSelectionHandler[];
    let unifiedSelectionChangedListener: sinon.SinonSpy;
    let viewportSelectionChangedListener: sinon.SinonSpy;
    let selectionInfo: SelectionInfo;

    const setupUnifiedSelection = () => {
      // we'll be listening for selection changes
      unifiedSelectionChangedListener = sinon.spy();
      selectionManager.selectionChange.addListener(unifiedSelectionChangedListener);

      // selection handler asks for content descriptor + content for the selection
      selectionInfo = {
        providerName: faker.random.word(),
        level: 0,
      };
      const descriptor = createRandomDescriptor();
      const content: Content = {
        descriptor,
        contentSet: [new Item([key], "", "", undefined, {}, {}, [])],
      };
      presentationManagerMock.setup((x) => x.getContentDescriptor({ imodel: imodelMock.object, rulesetId },
        DefaultContentDisplayTypes.VIEWPORT, moq.It.isAny(), moq.It.isAny())).returns(async () => descriptor);
      presentationManagerMock.setup((x) => x.getContent({ imodel: imodelMock.object, rulesetId, paging: undefined },
        moq.It.isAny(), moq.It.isAny())).returns(async () => content);
    };

    const setupViewportSelection = () => {
      // we'll be listening for the onChanged event
      viewportSelectionChangedListener = sinon.spy();
      imodelMock.target.selectionSet.onChanged.clear();
      imodelMock.target.selectionSet.onChanged.addListener(viewportSelectionChangedListener);
    };

    beforeEach(() => {
      setupUnifiedSelection();
      setupViewportSelection();
      handlers = [1, 2].map(() => new ViewportSelectionHandler(imodelMock.object, rulesetId));
    });

    afterEach(() => {
      handlers.forEach((h) => h.dispose());
      handlers = [];
    });

    it("should not trigger secondary unified selection changes", async () => {
      // trigger the selection change
      selectionManager.replaceSelection(selectionInfo.providerName,
        imodelMock.object, new KeySet([key]), selectionInfo.level!);
      await waitForAllAsyncs(handlers);

      // verify the listeners were called only once
      expect(unifiedSelectionChangedListener).to.be.calledOnce;
      expect(viewportSelectionChangedListener).to.be.calledOnce;
    });

    it("should not trigger secondary viewport selection set changes", async () => {
      // trigger a selection change
      imodelMock.target.selectionSet.replace(key.id);
      await waitForAllAsyncs(handlers);

      // verify the listeners were called only once
      expect(viewportSelectionChangedListener).to.be.calledOnce;
      expect(unifiedSelectionChangedListener).to.be.calledOnce;
    });

  });

});

const mockIModel = (mock: moq.IMock<IModelConnection>) => {
  const imodelElementsMock = moq.Mock.ofType<IModelConnection.Elements>();
  imodelElementsMock.setup((x) => x.getProps(moq.It.isAny())).returns(async (ids: Id64Arg) => createElementProps(ids));

  const selectionSet = new SelectionSet(mock.object);
  mock.reset();
  mock.setup((imodel) => imodel.selectionSet).returns(() => selectionSet);
  mock.setup((imodel) => imodel.elements).returns(() => imodelElementsMock.object);
};

let classNameGenerator = () => faker.random.word();
const createElementProps = (ids: Id64Arg): ElementProps[] => {
  return [...Id64.toIdSet(ids)].map((id: Id64String): ElementProps => ({
    id,
    classFullName: classNameGenerator(),
    code: Code.createEmpty(),
    model: id,
  }));
};

const waitForAllAsyncs = async (handlers: ViewportSelectionHandler[]) => {
  const recursiveWait = async () => {
    const havePendingAsyncs = handlers.some((h) => (h.pendingAsyncs.size > 0));
    if (havePendingAsyncs) {
      await BeDuration.wait(0);
      await waitForAllAsyncs(handlers);
    }
  };
  await recursiveWait();
};

const waitForPendingAsyncs = async (handler: ViewportSelectionHandler) => {
  const initialAsyncs = [...handler.pendingAsyncs];
  const recursiveWait = async () => {
    const haveMatchingAsyncs = initialAsyncs.filter((initial) => handler.pendingAsyncs.has(initial)).length > 0;
    if (haveMatchingAsyncs) {
      await BeDuration.wait(0);
      await recursiveWait();
    }
  };
  await recursiveWait();
};
