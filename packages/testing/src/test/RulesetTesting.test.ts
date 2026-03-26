/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import path from "path";
import { Id64 } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { SchemaFormatsProvider } from "@itwin/ecschema-metadata";
import { Ruleset } from "@itwin/presentation-common";
import { ContentBuilder } from "../presentation-testing.js";
import { initialize, terminate } from "../presentation-testing/Helpers.js";
import { HierarchyBuilder } from "../presentation-testing/HierarchyBuilder.js";
import { TestIModelConnection } from "../presentation-testing/IModelUtilities.js";

let iModel: IModelConnection;

const iModelPath = "assets/datasets/Properties_60InstancesWithUrl2.ibim";

const MY_HIERARCHY_RULESET: Ruleset = {
  id: "my-test-hierarchy",
  rules: [
    {
      ruleType: "RootNodes",
      autoExpand: true,
      specifications: [
        {
          specType: "InstanceNodesOfSpecificClasses",
          classes: [
            {
              schemaName: "BisCore",
              classNames: ["Subject"],
              arePolymorphic: false,
            },
          ],
          instanceFilter: "this.Parent = NULL",
          groupByClass: false,
          groupByLabel: false,
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("Subject", "BisCore")`,
      onlyIfNotHandled: true,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "SubjectOwnsSubjects",
              },
              direction: "Forward",
            },
          ],
          groupByClass: false,
          groupByLabel: false,
        },
        {
          specType: "InstanceNodesOfSpecificClasses",
          classes: {
            schemaName: "BisCore",
            classNames: ["Model"],
            arePolymorphic: true,
          },
          relatedInstances: [
            {
              relationshipPath: {
                relationship: {
                  schemaName: "BisCore",
                  className: "ModelModelsElement",
                },
                direction: "Forward",
                targetClass: {
                  schemaName: "BisCore",
                  className: "InformationPartitionElement",
                },
              },
              alias: "partition",
              isRequired: true,
            },
          ],
          instanceFilter: "partition.Parent.Id = parent.ECInstanceId AND NOT this.IsPrivate",
          groupByClass: false,
          groupByLabel: false,
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("Model", "BisCore")`,
      onlyIfNotHandled: true,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "ModelContainsElements",
              },
              direction: "Forward",
            },
          ],
          instanceFilter: "this.Parent = NULL",
          groupByClass: false,
          groupByLabel: false,
        },
      ],
    },
    {
      ruleType: "ChildNodes",
      condition: `ParentNode.IsOfClass("Element", "BisCore")`,
      onlyIfNotHandled: true,
      specifications: [
        {
          specType: "RelatedInstanceNodes",
          relationshipPaths: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "ElementOwnsChildElements",
              },
              direction: "Forward",
            },
          ],
          groupByClass: false,
          groupByLabel: false,
        },
      ],
    },
  ],
};

const MY_CONTENT_RULESET: Ruleset = {
  id: "my-test-content",
  rules: [
    {
      ruleType: "Content",
      specifications: [
        {
          specType: "SelectedNodeInstances",
        },
      ],
    },
    {
      ruleType: "ContentModifier",
      class: { schemaName: "Generic", className: "PhysicalObject" },
      propertyOverrides: [
        {
          name: "Model",
          isDisplayed: false,
        },
        {
          name: "Category",
          isDisplayed: false,
        },
      ],
      relatedProperties: [
        {
          propertiesSource: [
            {
              relationship: {
                schemaName: "BisCore",
                className: "ModelContainsElements",
              },
              direction: "Backward",
            },
            {
              relationship: {
                schemaName: "BisCore",
                className: "ModelModelsElement",
              },
              direction: "Forward",
            },
            {
              relationship: {
                schemaName: "BisCore",
                className: "ElementHasLinks",
              },
              targetClass: {
                schemaName: "BisCore",
                className: "RepositoryLink",
              },
              direction: "Forward",
            },
          ],
          properties: "_none_",
        },
      ],
    },
  ],
};

describe.skip("RulesetTesting", () => {
  before(async () => {
    // __PUBLISH_EXTRACT_START__ Presentation.Testing.Rulesets.Setup
    // initialize presentation-testing
    await initialize();

    // set up for testing iModel presentation data
    iModel = TestIModelConnection.openFile(iModelPath);

    // set up schema-based formatter
    IModelApp.formatsProvider = new SchemaFormatsProvider(iModel.schemaContext, "metric");
    // __PUBLISH_EXTRACT_END__
  });

  after(async () => {
    // __PUBLISH_EXTRACT_START__ Presentation.Testing.Rulesets.Terminate
    // close the tested iModel
    await iModel.close();

    // terminate presentation-testing
    await terminate();
    // __PUBLISH_EXTRACT_END__
  });

  // set up a function to create snapshot file path - we want the snapshots to be placed next
  // to source file
  function createSnapshotPath(currentTest: Mocha.Runnable, fileName: string) {
    return path.join(path.dirname(currentTest.file!).replace(/(?!\\|\/)(lib)(?=\\|\/)/g, "src"), `ruleset-testing-snapshots`, `${fileName}.snap`);
  }

  // __PUBLISH_EXTRACT_START__ Presentation.Testing.Rulesets.Hierarchies
  it("generates correct hierarchy", async function () {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const builder = new HierarchyBuilder({ imodel: iModel });

    // generate the hierarchy using our custom ruleset
    const hierarchy = await builder.createHierarchy(MY_HIERARCHY_RULESET);

    // verify it through snapshot
    expect(hierarchy).to.matchSnapshot(createSnapshotPath(this.test!, MY_HIERARCHY_RULESET.id), MY_HIERARCHY_RULESET.id);
  });
  // __PUBLISH_EXTRACT_END__

  // __PUBLISH_EXTRACT_START__ Presentation.Testing.Rulesets.Content
  it("generates correct content", async function () {
    const builder = new ContentBuilder({ imodel: iModel, decimalPrecision: 8 });

    // generate content using our custom ruleset
    const myElementKey = { className: "Generic:PhysicalObject", id: Id64.fromLocalAndBriefcaseIds(116, 0) };
    const records = await builder.createContent(MY_CONTENT_RULESET, [myElementKey]);

    // verify the records through snapshot
    expect(records).to.matchSnapshot(createSnapshotPath(this.test!, MY_CONTENT_RULESET.id), `${myElementKey.className}-${myElementKey.id}`);
  });
  // __PUBLISH_EXTRACT_END__
});
