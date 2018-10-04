/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import "@bentley/presentation-frontend/tests/_helpers/MockFrontendEnvironment";
import * as React from "react";
import { expect, spy } from "chai";
import { mount, shallow } from "enzyme";
import * as faker from "faker";
import * as moq from "@bentley/presentation-common/tests/_helpers/Mocks";
import { createRandomECInstanceNodeKey } from "@bentley/presentation-common/tests/_helpers/random";
import { createRandomTreeNodeItem } from "../_helpers/UiComponents";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { KeySet, BaseNodeKey, ECInstanceNodeKey } from "@bentley/presentation-common";
import {
    Presentation,
    SelectionHandler, SelectionManager, SelectionChangeEvent, ISelectionProvider, SelectionChangeEventArgs, SelectionChangeType,
} from "@bentley/presentation-frontend";
import { Tree, TreeNodeItem, UiComponents } from "@bentley/ui-components";
import { I18N } from "@bentley/imodeljs-i18n";
import { DataTreeProps as TreeProps } from "@bentley/ui-components/lib/tree/component/DataTree";
import IUnifiedSelectionComponent from "../../lib/common/IUnifiedSelectionComponent";
import { IPresentationTreeDataProvider, withUnifiedSelection, SelectionTarget } from "../../lib/tree";

// tslint:disable-next-line:variable-name naming-convention
const PresentationTree = withUnifiedSelection(Tree);

describe("Tree withUnifiedSelection", () => {
    before(async () => {
        const i18n = new I18N([], "");
        await UiComponents.initialize(i18n);
    });

    let testRulesetId: string;
    const imodelMock = moq.Mock.ofType<IModelConnection>();
    const dataProviderMock = moq.Mock.ofType<IPresentationTreeDataProvider>();
    const selectionHandlerMock = moq.Mock.ofType<SelectionHandler>();
    beforeEach(() => {
        testRulesetId = faker.random.word();
        selectionHandlerMock.reset();
        setupDataProvider();
    });

    const setupDataProvider = (providerMock?: moq.IMock<IPresentationTreeDataProvider>, imodel?: IModelConnection, rulesetId?: string, rootNodes?: () => TreeNodeItem[], childNodes?: (parent: TreeNodeItem) => TreeNodeItem[]) => {
        if (!providerMock)
            providerMock = dataProviderMock;
        if (!imodel)
            imodel = imodelMock.object;
        if (!rulesetId)
            rulesetId = testRulesetId;
        if (!rootNodes)
            rootNodes = () => [];
        if (!childNodes)
            childNodes = () => [];
        providerMock.reset();
        providerMock.setup((x) => x.connection).returns(() => imodel!);
        providerMock.setup((x) => x.rulesetId).returns(() => rulesetId!);
        providerMock.setup((x) => x.onTreeNodeChanged).returns(() => undefined);
        providerMock.setup((x) => x.getNodeKey(moq.It.isAny())).returns((n: TreeNodeItem) => n.extendedData.key);
        providerMock.setup((x) => x.getRootNodes(moq.It.isAny())).returns(async () => rootNodes!());
        providerMock.setup((x) => x.getRootNodesCount()).returns(async () => rootNodes!().length);
        providerMock.setup((x) => x.getChildNodes(moq.It.isAny(), moq.It.isAny())).returns(async (p) => childNodes!(p));
        providerMock.setup((x) => x.getChildNodesCount(moq.It.isAny())).returns(async (p) => childNodes!(p).length);
    };

    it("mounts", () => {
        mount(<PresentationTree
            dataProvider={dataProviderMock.object}
            selectionHandler={selectionHandlerMock.object}
        />);
    });

    it("uses data provider's imodel and rulesetId", () => {
        const component = shallow(<PresentationTree
            dataProvider={dataProviderMock.object}
            selectionHandler={selectionHandlerMock.object}
        />).instance() as any as IUnifiedSelectionComponent;

        expect(component.imodel).to.equal(imodelMock.object);
        expect(component.rulesetId).to.equal(testRulesetId);
    });

    it("creates default implementation for selection handler when not provided through props", () => {
        const selectionManagerMock = moq.Mock.ofType<SelectionManager>();
        selectionManagerMock.setup((x) => x.selectionChange).returns(() => new SelectionChangeEvent());
        Presentation.selection = selectionManagerMock.object;

        const tree = shallow(<PresentationTree
            dataProvider={dataProviderMock.object}
        />).instance() as any as IUnifiedSelectionComponent;

        expect(tree.selectionHandler).to.not.be.undefined;
        expect(tree.selectionHandler!.name).to.not.be.undefined;
        expect(tree.selectionHandler!.rulesetId).to.eq(testRulesetId);
        expect(tree.selectionHandler!.imodel).to.eq(imodelMock.object);
    });

    it("renders correctly", () => {
        expect(shallow(<PresentationTree
            dataProvider={dataProviderMock.object}
            selectionHandler={selectionHandlerMock.object}
        />)).to.matchSnapshot();
    });

    it("disposes selection handler when unmounts", () => {
        const tree = shallow(<PresentationTree
            dataProvider={dataProviderMock.object}
            selectionHandler={selectionHandlerMock.object}
        />);
        tree.unmount();
        selectionHandlerMock.verify((x) => x.dispose(), moq.Times.once());
    });

    it("updates selection handler and data provider when props change", () => {
        const tree = shallow<TreeProps>(<PresentationTree
            dataProvider={dataProviderMock.object}
            selectionHandler={selectionHandlerMock.object}
        />);

        const imodelMock2 = moq.Mock.ofType<IModelConnection>();
        const rulesetId2 = faker.random.word();
        const providerMock2 = moq.Mock.ofType<IPresentationTreeDataProvider>();
        setupDataProvider(providerMock2, imodelMock2.object, rulesetId2);

        tree.setProps({
            dataProvider: providerMock2.object,
        });

        selectionHandlerMock.verify((x) => x.imodel = imodelMock2.object, moq.Times.once());
        selectionHandlerMock.verify((x) => x.rulesetId = rulesetId2, moq.Times.once());
    });

    it("handles missing selection handler when unmounts", () => {
        const component = shallow(<PresentationTree
            dataProvider={dataProviderMock.object}
            selectionHandler={selectionHandlerMock.object}
        />, { disableLifecycleMethods: true });
        component.unmount();
    });

    it("handles missing selection handler when updates", () => {
        const component = shallow(<PresentationTree
            dataProvider={dataProviderMock.object}
            selectionHandler={selectionHandlerMock.object}
        />, { disableLifecycleMethods: true });
        component.instance().componentDidUpdate!(component.props(), component.state()!);
    });

    describe("selection handling", () => {

        describe("checking if node should be selected", () => {

            it("returns true if node's id is in selectedNodes array prop", () => {
                const node = createRandomTreeNodeItem();
                const arr = [faker.random.uuid(), node.id, faker.random.uuid()];

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    selectedNodes={arr}
                />);

                const propCallback = tree.find(Tree).prop("selectedNodes") as ((node: TreeNodeItem) => boolean);
                const actualResult = propCallback(node);

                expect(actualResult).to.eq(true);
            });

            it("returns false if node's id is not in selectedNodes array prop", () => {
                const node = createRandomTreeNodeItem();
                const arr = [faker.random.uuid(), faker.random.uuid()];

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    selectedNodes={arr}
                />);

                const propCallback = tree.find(Tree).prop("selectedNodes") as ((node: TreeNodeItem) => boolean);
                const actualResult = propCallback(node);

                expect(actualResult).to.eq(false);
            });

            it("calls props callback and returns its result", () => {
                const node = createRandomTreeNodeItem();
                const result = faker.random.boolean();
                const callback = moq.Mock.ofType<(node: TreeNodeItem) => boolean>();
                callback.setup((x) => x(node)).returns(() => result).verifiable();

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    selectedNodes={callback.object}
                />);

                const propCallback = tree.find(Tree).prop("selectedNodes") as ((node: TreeNodeItem) => boolean);
                const actualResult = propCallback(node);

                callback.verifyAll();
                expect(actualResult).to.eq(result);
            });

            it("returns false when there's no selection handler", () => {
                const node = createRandomTreeNodeItem();
                selectionHandlerMock.setup((x) => x.getSelection()).returns(() => new KeySet());

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                />, { disableLifecycleMethods: true });

                const propCallback = tree.find(Tree).prop("selectedNodes") as ((node: TreeNodeItem) => boolean);
                const result = propCallback(node);
                expect(result).to.be.false;
            });

            it("returns true when node key is in selection", () => {
                const nodeKey = createRandomECInstanceNodeKey();
                const node = createRandomTreeNodeItem();
                node.extendedData.key = nodeKey;
                selectionHandlerMock.setup((x) => x.getSelection()).returns(() => new KeySet([nodeKey]));

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                />);

                const propCallback = tree.find(Tree).prop("selectedNodes") as ((node: TreeNodeItem) => boolean);
                const result = propCallback(node);
                expect(result).to.be.true;
            });

            it("returns true when ECInstance key of ECInstance node is in selection", () => {
                const nodeKey = createRandomECInstanceNodeKey();
                const node = createRandomTreeNodeItem();
                node.extendedData.key = nodeKey;
                selectionHandlerMock.setup((x) => x.getSelection()).returns(() => new KeySet([nodeKey.instanceKey]));

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                />);

                const propCallback = tree.find(Tree).prop("selectedNodes") as ((node: TreeNodeItem) => boolean);
                const result = propCallback(node);
                expect(result).to.be.true;
            });

            it("returns false when node key is not in selection and node is not ECInstance node", () => {
                const nodeKey: BaseNodeKey = {
                    type: faker.random.word(),
                    pathFromRoot: [],
                };
                const node = createRandomTreeNodeItem();
                node.extendedData.key = nodeKey;
                selectionHandlerMock.setup((x) => x.getSelection()).returns(() => new KeySet());

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                />);

                const propCallback = tree.find(Tree).prop("selectedNodes") as ((node: TreeNodeItem) => boolean);
                const result = propCallback(node);
                expect(result).to.be.false;
            });

        });

        describe("selecting nodes", () => {

            it("calls props callback and adds node keys to selection manager when callback returns true", () => {
                const nodes = [createRandomTreeNodeItem(), createRandomTreeNodeItem()];
                const callback = moq.Mock.ofType<(nodes: TreeNodeItem[], replace: boolean) => boolean>();
                callback.setup((x) => x(nodes, false)).returns(() => true).verifiable();

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    onNodesSelected={callback.object}
                />);

                tree.find(Tree).prop("onNodesSelected")!(nodes, false);

                selectionHandlerMock.verify((x) => x.addToSelection(nodes.map((n) => n.extendedData.key)), moq.Times.once());
                selectionHandlerMock.verify((x) => x.replaceSelection(moq.It.isAny()), moq.Times.never());
                callback.verifyAll();
            });

            it("calls props callback and aborts when it returns false", () => {
                const nodes = [createRandomTreeNodeItem(), createRandomTreeNodeItem()];
                const callback = moq.Mock.ofType<(nodes: TreeNodeItem[], replace: boolean) => boolean>();
                callback.setup((x) => x(nodes, true)).returns(() => false).verifiable();

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    onNodesSelected={callback.object}
                />);

                tree.find(Tree).prop("onNodesSelected")!(nodes, true);

                selectionHandlerMock.verify((x) => x.addToSelection(moq.It.isAny()), moq.Times.never());
                selectionHandlerMock.verify((x) => x.replaceSelection(moq.It.isAny()), moq.Times.never());
                callback.verifyAll();
            });

            it("returns false when there's no selection handler", () => {
                const nodes = [createRandomTreeNodeItem()];
                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                />, { disableLifecycleMethods: true });

                tree.find(Tree).prop("onNodesSelected")!(nodes, true);

                selectionHandlerMock.verify((x) => x.addToSelection(moq.It.isAny()), moq.Times.never());
                selectionHandlerMock.verify((x) => x.replaceSelection(moq.It.isAny()), moq.Times.never());
            });

            it("replaces ECInstance keys in selection manager when selection target is set to `ECInstance`", () => {
                const nodes = [createRandomTreeNodeItem(), createRandomTreeNodeItem()];
                nodes[0].extendedData.key = createRandomECInstanceNodeKey();
                nodes[1].extendedData.key = { type: faker.random.word(), pathFromRoot: [] };

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    selectionTarget={SelectionTarget.Instance}
                />);

                tree.find(Tree).prop("onNodesSelected")!(nodes, true);

                selectionHandlerMock.verify((x) => x.addToSelection(moq.It.isAny()), moq.Times.never());
                selectionHandlerMock.verify((x) => x.replaceSelection([
                    (nodes[0].extendedData.key as ECInstanceNodeKey).instanceKey,
                    nodes[1].extendedData.key,
                ]), moq.Times.once());
            });

        });

        describe("deselecting nodes", () => {

            it("calls props callback and removes node keys from selection manager when callback returns true", () => {
                const nodes = [createRandomTreeNodeItem(), createRandomTreeNodeItem()];
                const callback = moq.Mock.ofType<(nodes: TreeNodeItem[]) => boolean>();
                callback.setup((x) => x(nodes)).returns(() => true).verifiable();

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    onNodesDeselected={callback.object}
                />);

                tree.find(Tree).prop("onNodesDeselected")!(nodes);

                selectionHandlerMock.verify((x) => x.removeFromSelection(nodes.map((n) => n.extendedData.key)), moq.Times.once());
                callback.verifyAll();
            });

            it("calls props callback and aborts when it returns false", () => {
                const nodes = [createRandomTreeNodeItem(), createRandomTreeNodeItem()];
                const callback = moq.Mock.ofType<(nodes: TreeNodeItem[]) => boolean>();
                callback.setup((x) => x(nodes)).returns(() => false).verifiable();

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    onNodesDeselected={callback.object}
                />);

                tree.find(Tree).prop("onNodesDeselected")!(nodes);

                selectionHandlerMock.verify((x) => x.removeFromSelection(moq.It.isAny()), moq.Times.never());
                callback.verifyAll();
            });

            it("returns false when there's no selection handler", () => {
                const nodes = [createRandomTreeNodeItem()];
                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                />, { disableLifecycleMethods: true });

                tree.find(Tree).prop("onNodesDeselected")!(nodes);

                selectionHandlerMock.verify((x) => x.removeFromSelection(moq.It.isAny()), moq.Times.never());
            });

            it("removes ECInstance keys from selection manager when selection target is set to `ECInstance`", () => {
                const nodes = [createRandomTreeNodeItem(), createRandomTreeNodeItem()];
                nodes[0].extendedData.key = createRandomECInstanceNodeKey();
                nodes[1].extendedData.key = { type: faker.random.word(), pathFromRoot: [] };

                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                    selectionTarget={SelectionTarget.Instance}
                />);

                tree.find(Tree).prop("onNodesDeselected")!(nodes);

                selectionHandlerMock.verify((x) => x.removeFromSelection([
                    (nodes[0].extendedData.key as ECInstanceNodeKey).instanceKey,
                    nodes[1].extendedData.key,
                ]), moq.Times.once());
            });

        });

        describe("reacting to unified selection changes", () => {

            const triggerSelectionChange = (selectionLevel: number) => {
                const args: SelectionChangeEventArgs = {
                    changeType: SelectionChangeType.Clear,
                    imodel: imodelMock.object,
                    level: selectionLevel,
                    source: selectionHandlerMock.name,
                    timestamp: new Date(),
                    keys: new KeySet(),
                };
                const selectionProviderMock = moq.Mock.ofType<ISelectionProvider>();
                selectionProviderMock.setup((x) => x.getSelection(imodelMock.object, moq.It.isAny())).returns(() => new KeySet());
                selectionHandlerMock.target.onSelect!(args, selectionProviderMock.object);
            };

            it("re-renders tree on selection changes when selection level is 0", () => {
                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                />);
                const s = spy.on(tree.instance(), Tree.prototype.render.name);
                triggerSelectionChange(0);
                expect(s).to.be.called();
            });

            it("doesn't re-render tree on selection changes when selection level is not 0", () => {
                const tree = shallow(<PresentationTree
                    dataProvider={dataProviderMock.object}
                    selectionHandler={selectionHandlerMock.object}
                />);
                const s = spy.on(tree.instance(), Tree.prototype.render.name);
                triggerSelectionChange(1);
                expect(s).to.not.be.called();
            });

        });

    });

});
