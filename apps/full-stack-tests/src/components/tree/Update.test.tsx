/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { PrimitiveValue } from "@itwin/appui-abstract";
import {
  AbstractTreeNodeLoader,
  AbstractTreeNodeLoaderWithProvider,
  DelayLoadedTreeNodeItem,
  MutableTreeModelNode,
  Subscription,
  TreeModelNode,
  TreeModelRootNode,
  TreeModelSource,
  UiComponents,
} from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ChildNodeSpecificationTypes, Ruleset, RuleTypes } from "@itwin/presentation-common";
import { IPresentationTreeDataProvider, usePresentationTreeState, UsePresentationTreeStateProps } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { TestIModelConnection } from "@itwin/presentation-testing";
import { initialize, terminate } from "../../IntegrationTests.js";
import { renderHook, waitFor } from "../../RenderUtils.js";

describe("Tree update", () => {
  let imodel: IModelConnection;

  before(async () => {
    await initialize();
    const testIModelName: string = "assets/datasets/Properties_60InstancesWithUrl2.ibim";
    imodel = TestIModelConnection.openFile(testIModelName);
    expect(imodel).is.not.null;
  });

  after(async () => {
    await imodel.close();
    await terminate();
  });

  afterEach(async () => {
    sinon.restore();
    await Presentation.presentation.rulesets().clear();
  });

  describe("detection", () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    let defaultProps: Omit<UsePresentationTreeStateProps, "ruleset">;

    before(async () => {
      await UiComponents.initialize(IModelApp.localization);
    });

    after(() => {
      UiComponents.terminate();
    });

    beforeEach(() => {
      defaultProps = {
        imodel,
        pagingSize: 100,
      };
    });

    describe("on ruleset modification", () => {
      it("detects custom node change", async () => {
        const initialRuleset = await Presentation.presentation.rulesets().add({
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.CustomNode,
                  type: "T_NODE",
                  label: "test-1",
                },
              ],
            },
          ],
        });
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset: initialRuleset.id }, ["test-1"]);

        await Presentation.presentation.rulesets().modify(initialRuleset, {
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.CustomNode,
                  type: "T_NODE",
                  label: "test-2",
                },
              ],
            },
          ],
        });
        await hierarchy.verifyChange(["test-2"]);
      });

      it("detects ECInstance node change", async () => {
        const initialRuleset = await Presentation.presentation.rulesets().add({
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
                  classes: { schemaName: "Generic", classNames: ["PhysicalObject"] },
                  groupByClass: false,
                  groupByLabel: false,
                },
              ],
            },
          ],
        });
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset: initialRuleset.id }, ["Physical Object [0-38]", "Physical Object [0-39]"]);

        await Presentation.presentation.rulesets().modify(initialRuleset, {
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
                  classes: { schemaName: "Generic", classNames: ["PhysicalObject"] },
                  instanceFilter: `this.ECInstanceId = ${parseInt("0x75", 16)}`,
                  groupByClass: false,
                  groupByLabel: false,
                },
              ],
            },
          ],
        });
        await hierarchy.verifyChange(["Physical Object [0-39]"]);
      });

      it("detects ECClass grouping node change", async () => {
        const initialRuleset = await Presentation.presentation.rulesets().add({
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
                  classes: { schemaName: "Generic", classNames: ["PhysicalObject"] },
                  instanceFilter: `this.ECInstanceId = ${parseInt("0x74", 16)}`,
                  groupByClass: true,
                  groupByLabel: false,
                },
              ],
            },
          ],
        });
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset: initialRuleset.id }, [{ ["Physical Object"]: ["Physical Object [0-38]"] }]);

        await Presentation.presentation.rulesets().modify(initialRuleset, {
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
                  classes: { schemaName: "Generic", classNames: ["PhysicalObject"] },
                  instanceFilter: `this.ECInstanceId = ${parseInt("0x75", 16)}`,
                  groupByClass: true,
                  groupByLabel: false,
                },
              ],
            },
          ],
        });
        await hierarchy.verifyChange([{ ["Physical Object"]: ["Physical Object [0-39]"] }]);
      });
    });

    describe("on ruleset variables' modification", () => {
      it("detects a change in rule condition", async () => {
        const ruleset: Ruleset = {
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              subConditions: [
                {
                  condition: `GetVariableBoolValue("use_first")`,
                  specifications: [
                    {
                      specType: ChildNodeSpecificationTypes.CustomNode,
                      type: "T_NODE_1",
                      label: "test-1",
                    },
                  ],
                },
                {
                  condition: `GetVariableBoolValue("use_second")`,
                  specifications: [
                    {
                      specType: ChildNodeSpecificationTypes.CustomNode,
                      type: "T_NODE_2",
                      label: "test-2",
                    },
                  ],
                },
              ],
            },
          ],
        };
        await Presentation.presentation.vars(ruleset.id).setBool("use_first", false);
        await Presentation.presentation.vars(ruleset.id).setBool("use_second", false);
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset }, []);

        await Presentation.presentation.vars(ruleset.id).setBool("use_first", true);
        await hierarchy.verifyChange(["test-1"]);

        await Presentation.presentation.vars(ruleset.id).setBool("use_second", true);
        await hierarchy.verifyChange(["test-1", "test-2"]);

        await Presentation.presentation.vars(ruleset.id).setBool("use_first", false);
        await hierarchy.verifyChange(["test-2"]);
      });

      it("detects a change in instance filter", async () => {
        const ruleset: Ruleset = {
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
                  classes: { schemaName: "Generic", classNames: ["PhysicalObject"] },
                  instanceFilter: `GetVariableBoolValue("show_nodes")`,
                  groupByClass: false,
                  groupByLabel: false,
                },
              ],
            },
          ],
        };
        await Presentation.presentation.vars(ruleset.id).setBool("show_nodes", false);
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset }, []);

        await Presentation.presentation.vars(ruleset.id).setBool("show_nodes", true);
        await hierarchy.verifyChange(["Physical Object [0-38]", "Physical Object [0-39]"]);

        await Presentation.presentation.vars(ruleset.id).setBool("show_nodes", false);
        await hierarchy.verifyChange([]);
      });

      it("detects a change in customization rule's condition", async () => {
        const ruleset: Ruleset = {
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
                  classes: { schemaName: "Generic", classNames: ["PhysicalObject"] },
                  groupByClass: false,
                  groupByLabel: false,
                },
              ],
            },
            {
              ruleType: RuleTypes.ExtendedData,
              condition: `GetVariableBoolValue("should_customize")`,
              items: {
                color: `"Red"`,
              },
            },
          ],
        };
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset }, ["Physical Object [0-38]", "Physical Object [0-39]"]);

        await Presentation.presentation.vars(ruleset.id).setBool("should_customize", true);
        await hierarchy.verifyChange([
          { label: "Physical Object [0-38]", extendedData: { color: "Red" } },
          { label: "Physical Object [0-39]", extendedData: { color: "Red" } },
        ]);
      });

      it("detects a change in customization rule's value", async () => {
        const ruleset: Ruleset = {
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.InstanceNodesOfSpecificClasses,
                  classes: { schemaName: "Generic", classNames: ["PhysicalObject"] },
                  groupByClass: false,
                  groupByLabel: false,
                },
              ],
            },
            {
              ruleType: RuleTypes.ExtendedData,
              condition: `ThisNode.IsOfClass("PhysicalObject", "Generic")`,
              items: {
                color: `GetVariableStringValue("custom_color")`,
              },
            },
          ],
        };
        await Presentation.presentation.vars(ruleset.id).setString("custom_color", "Green");
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset }, [
          { label: "Physical Object [0-38]", extendedData: { color: "Green" } },
          { label: "Physical Object [0-39]", extendedData: { color: "Green" } },
        ]);

        await Presentation.presentation.vars(ruleset.id).setString("custom_color", "Red");
        await hierarchy.verifyChange([
          { label: "Physical Object [0-38]", extendedData: { color: "Red" } },
          { label: "Physical Object [0-39]", extendedData: { color: "Red" } },
        ]);

        await Presentation.presentation.vars(ruleset.id).setString("custom_color", "Blue");
        await hierarchy.verifyChange([
          { label: "Physical Object [0-38]", extendedData: { color: "Blue" } },
          { label: "Physical Object [0-39]", extendedData: { color: "Blue" } },
        ]);
      });

      it("detects changes of root and expanded nodes", async () => {
        const ruleset: Ruleset = {
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.CustomNode,
                  type: "T_ROOT_1",
                  label: "root-1",
                  hasChildren: "Unknown",
                },
                {
                  specType: ChildNodeSpecificationTypes.CustomNode,
                  type: "T_ROOT_2",
                  label: "root-2",
                  hasChildren: "Unknown",
                },
              ],
            },
            {
              ruleType: RuleTypes.ChildNodes,
              condition: `ParentNode.Type = "T_ROOT_1" ANDALSO GetVariableBoolValue("show_children")`,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.CustomNode,
                  type: "T_CHILD_1",
                  label: "child-1",
                },
              ],
            },
            {
              ruleType: RuleTypes.ChildNodes,
              condition: `ParentNode.Type = "T_ROOT_2" ANDALSO GetVariableBoolValue("show_children")`,
              specifications: [
                {
                  specType: ChildNodeSpecificationTypes.CustomNode,
                  type: "T_CHILD_2",
                  label: "child-2",
                },
              ],
            },
          ],
        };
        await Presentation.presentation.vars(ruleset.id).setBool("show_children", true);
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset }, [{ ["root-1"]: ["child-1"] }, { ["root-2"]: ["child-2"] }]);

        hierarchy.getModelSource().modifyModel((model) => {
          // expand only the `root-1` node
          (model.getNode(undefined, 0) as MutableTreeModelNode).isExpanded = true;
        });
        await Presentation.presentation.vars(ruleset.id).setBool("show_children", false);
        await hierarchy.verifyChange(["root-1", "root-2"]);
      });
    });

    describe("partial update", () => {
      it("handles node insertion", async () => {
        const ruleset = await Presentation.presentation.rulesets().add({
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [{ specType: ChildNodeSpecificationTypes.CustomNode, type: "T_NODE", label: "test-1" }],
            },
          ],
        });
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset: ruleset.id }, ["test-1"]);

        await Presentation.presentation.rulesets().modify(ruleset, {
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [
                { specType: ChildNodeSpecificationTypes.CustomNode, type: "T_NODE", label: "test-1" },
                { specType: ChildNodeSpecificationTypes.CustomNode, type: "T_NODE", label: "test-2" },
              ],
            },
          ],
        });
        await hierarchy.verifyChange(["test-1", "test-2"]);
      });

      it("handles node update", async () => {
        const ruleset = await Presentation.presentation.rulesets().add({
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [{ specType: ChildNodeSpecificationTypes.CustomNode, type: "T_NODE", label: "test-1" }],
            },
          ],
        });
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset: ruleset.id }, ["test-1"]);

        await Presentation.presentation.rulesets().modify(ruleset, {
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [{ specType: ChildNodeSpecificationTypes.CustomNode, type: "T_NODE", label: "test-updated" }],
            },
          ],
        });
        await hierarchy.verifyChange(["test-updated"]);
      });

      it("handles node removal", async () => {
        const ruleset = await Presentation.presentation.rulesets().add({
          id: "test_ruleset_id",
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [{ specType: ChildNodeSpecificationTypes.CustomNode, type: "T_NODE", label: "test-1" }],
            },
          ],
        });
        const hierarchy = await verifyHierarchy({ ...defaultProps, ruleset: ruleset.id }, ["test-1"]);

        await Presentation.presentation.rulesets().modify(ruleset, {
          rules: [
            {
              ruleType: RuleTypes.RootNodes,
              specifications: [],
            },
          ],
        });
        await hierarchy.verifyChange([]);
      });
    });

    interface VerifiedHierarchy {
      getModelSource(): TreeModelSource;

      verifyChange: (expectedTree: TreeHierarchy[]) => Promise<void>;
    }

    type TreeHierarchy =
      | string
      | {
          [label: string]: TreeHierarchy[];
        }
      | {
          label: string;
          children?: TreeHierarchy[];
          expanded?: true;
          color?: number;
          extendedData?: { [key: string]: any };
        };

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    async function verifyHierarchy(props: UsePresentationTreeStateProps, expectedTree: TreeHierarchy[]): Promise<VerifiedHierarchy> {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const { result } = renderHook((hookProps: UsePresentationTreeStateProps) => usePresentationTreeState(hookProps), {
        initialProps: props,
      });

      await waitFor(() => {
        expect(result.current).to.not.be.undefined;
      });
      await expectTree(result.current!.nodeLoader, expectedTree);

      return new (class implements VerifiedHierarchy {
        public getModelSource(): TreeModelSource {
          return result.current!.nodeLoader.modelSource;
        }

        public async verifyChange(expectedUpdatedTree: TreeHierarchy[]): Promise<void> {
          await waitFor(
            async () => {
              await expectTree(result.current!.nodeLoader, expectedUpdatedTree);
            },
            { timeout: 9999999 },
          );
        }
      })();
    }

    async function expectTree(
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>,
      expectedHierarchy: TreeHierarchy[],
    ): Promise<void> {
      await loadHierarchy(nodeLoader);

      const model = nodeLoader.modelSource.getModel();
      const actualHierarchy = buildActualHierarchy(undefined);
      expect(actualHierarchy).to.deep.equal(expectedHierarchy);

      function buildActualHierarchy(parentId: string | undefined): TreeHierarchy[] {
        const result: TreeHierarchy[] = [];
        for (const childId of model.getChildren(parentId) ?? []) {
          const node = model.getNode(childId) as TreeModelNode;
          const label = (node.label.value as PrimitiveValue).displayValue!;
          const children = buildActualHierarchy(childId);
          const additionalProperties: Partial<TreeHierarchy> = {};
          if (node.isExpanded) {
            additionalProperties.expanded = true;
          }

          if (node.item.style?.colorOverrides?.color !== undefined) {
            additionalProperties.color = node.item.style.colorOverrides.color;
          }

          if (node.item.extendedData !== undefined) {
            additionalProperties.extendedData = { ...node.item.extendedData };
          }

          if (Object.keys(additionalProperties).length > 0) {
            result.push({ label, ...additionalProperties, ...(children.length > 0 && { children }) });
          } else if (children.length > 0) {
            result.push({ [label]: children });
          } else {
            result.push(label);
          }
        }

        return result;
      }
    }

    async function loadHierarchy(loader: AbstractTreeNodeLoader): Promise<void> {
      await loadChildren(loader.modelSource.getModel().getRootNode());

      async function loadChildren(parent: TreeModelNode | TreeModelRootNode): Promise<void> {
        const numChildren = await getChildrenCount(parent);
        for (let i = 0; i < numChildren; ++i) {
          await waitForCompletion(loader.loadNode(parent, i).subscribe());
        }

        const children = loader.modelSource.getModel().getChildren(parent.id);
        if (children === undefined) {
          return;
        }

        for (const sparseValue of children.iterateValues()) {
          const child = loader.modelSource.getModel().getNode(sparseValue[0]);
          if (child && (child.item as DelayLoadedTreeNodeItem).hasChildren) {
            await loadChildren(child);
          }
        }
      }

      async function getChildrenCount(parent: TreeModelNode | TreeModelRootNode): Promise<number> {
        await waitForCompletion(loader.loadNode(parent, 0).subscribe());
        const treeModel = loader.modelSource.getModel();
        const node = parent.id ? treeModel.getNode(parent.id) : treeModel.getRootNode();
        return node!.numChildren!;
      }

      async function waitForCompletion(subscription: Subscription): Promise<void> {
        return new Promise((resolve) => subscription.add(resolve));
      }
    }
  });
});
