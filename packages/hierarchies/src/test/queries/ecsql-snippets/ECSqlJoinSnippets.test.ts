/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ECClass, ECNavigationProperty, ECRelationshipClass, IMetadataProvider } from "../../../hierarchies/ECMetadata";
import { createRelationshipPathJoinClause } from "../../../hierarchies/queries/ecsql-snippets/ECSqlJoinSnippets";
import { trimWhitespace } from "../../../hierarchies/Utils";
import { ClassStubs, createClassStubs, ResolvablePromise } from "../../Utils";

describe("createRelationshipPathJoinClause", () => {
  const metadata = {} as unknown as IMetadataProvider;
  const schemaName = "x";
  let classStubs: ClassStubs;

  beforeEach(() => {
    classStubs = createClassStubs(metadata);
  });
  afterEach(() => {
    classStubs.restore();
  });

  it("returns empty string if given empty relationship path", async () => {
    expect(await createRelationshipPathJoinClause({ metadata, path: [] })).to.eq("");
  });

  describe("using navigation properties", () => {
    it("creates a forward join on navigation property with direction matching its relationship", async () => {
      const { sourceClass, targetClass, relationship, navigationProperty } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: sourceClass.fullName,
                sourceAlias: "s",
                relationshipName: relationship.fullName,
                relationshipAlias: "r",
                targetClassName: targetClass.fullName,
                targetAlias: "t",
              },
            ],
          }),
        ),
      ).to.eq(trimWhitespace(`INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [s].[${navigationProperty.name}].[Id]`));
    });

    it("creates a forward join on navigation property with direction opposite to its relationship", async () => {
      const { sourceClass, targetClass, relationship, navigationProperty } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: sourceClass.fullName,
                sourceAlias: "s",
                relationshipName: relationship.fullName,
                relationshipAlias: "r",
                targetClassName: targetClass.fullName,
                targetAlias: "t",
              },
            ],
          }),
        ),
      ).to.eq(trimWhitespace(`INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[${navigationProperty.name}].[Id] = [s].[ECInstanceId]`));
    });

    it("creates a reversed join on navigation property with direction matching its relationship", async () => {
      const { sourceClass, targetClass, relationship, navigationProperty } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: targetClass.fullName,
                sourceAlias: "s",
                relationshipName: relationship.fullName,
                relationshipAlias: "r",
                relationshipReverse: true,
                targetClassName: sourceClass.fullName,
                targetAlias: "t",
              },
            ],
          }),
        ),
      ).to.eq(trimWhitespace(`INNER JOIN [${schemaName}].[${sourceClass.name}] [t] ON [t].[ECInstanceId] = [s].[${navigationProperty.name}].[Id]`));
    });

    it("creates a reversed join on navigation property with direction opposite to its relationship", async () => {
      const { sourceClass, targetClass, relationship, navigationProperty } = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: targetClass.fullName,
                sourceAlias: "s",
                relationshipName: relationship.fullName,
                relationshipAlias: "r",
                relationshipReverse: true,
                targetClassName: sourceClass.fullName,
                targetAlias: "t",
              },
            ],
          }),
        ),
      ).to.eq(trimWhitespace(`INNER JOIN [${schemaName}].[${sourceClass.name}] [t] ON [t].[${navigationProperty.name}].[Id] = [s].[ECInstanceId]`));
    });
  });

  describe("using link table relationships", () => {
    it("creates a forward inner join", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: sourceClass.fullName,
                sourceAlias: "s",
                relationshipName: relationship.fullName,
                relationshipAlias: "r",
                targetClassName: targetClass.fullName,
                targetAlias: "t",
              },
            ],
          }),
        ),
      ).to.eq(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${relationship.name}] [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId]
        `),
      );
    });

    it("creates a forward outer join", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: sourceClass.fullName,
                sourceAlias: "s",
                relationshipName: relationship.fullName,
                relationshipAlias: "r",
                targetClassName: targetClass.fullName,
                targetAlias: "t",
                joinType: "outer",
              },
            ],
          }),
        ),
      ).to.eq(
        trimWhitespace(`
          OUTER JOIN (
            SELECT [r].*
            FROM [${schemaName}].[${relationship.name}] [r]
            INNER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId]
          ) [r] ON [r].[SourceECInstanceId] = [s].[ECInstanceId]
          OUTER JOIN [${schemaName}].[${targetClass.name}] [t] ON [t].[ECInstanceId] = [r].[TargetECInstanceId]
        `),
      );
    });

    it("creates a reversed inner join", async () => {
      const { sourceClass, targetClass, relationship } = setupLinkTableRelationshipClasses();
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: targetClass.fullName,
                sourceAlias: "s",
                relationshipName: relationship.fullName,
                relationshipAlias: "r",
                relationshipReverse: true,
                targetClassName: sourceClass.fullName,
                targetAlias: "t",
              },
            ],
          }),
        ),
      ).to.eq(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${relationship.name}] [r] ON [r].[TargetECInstanceId] = [s].[ECInstanceId]
          INNER JOIN [${schemaName}].[${sourceClass.name}] [t] ON [t].[ECInstanceId] = [r].[SourceECInstanceId]
        `),
      );
    });
  });

  describe("multi-step joins", () => {
    it("creates 2 navigation property joins", async () => {
      const step1 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "nav-prop-1",
        source: "a",
        relationship: "r1",
        target: "b",
      });
      const step2 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "nav-prop-2",
        source: step1.targetClass,
        relationship: "r2",
        target: "c",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: step1.sourceClass.fullName,
                sourceAlias: "a",
                relationshipName: step1.relationship.fullName,
                relationshipAlias: "r1",
                targetClassName: step1.targetClass.fullName,
                targetAlias: "b",
              },
              {
                sourceClassName: step2.sourceClass.fullName,
                sourceAlias: "b",
                relationshipName: step2.relationship.fullName,
                relationshipAlias: "r2",
                targetClassName: step2.targetClass.fullName,
                targetAlias: "c",
              },
            ],
          }),
        ),
      ).to.eq(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [a].[${step1.navigationProperty.name}].[Id]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[${step2.navigationProperty.name}].[Id] = [b].[ECInstanceId]
        `),
      );
    });

    it("creates 2 link table relationship joins", async () => {
      const step1 = setupLinkTableRelationshipClasses({
        source: "a",
        relationship: "r1",
        target: "b",
      });
      const step2 = setupLinkTableRelationshipClasses({
        source: step1.targetClass,
        relationship: "r2",
        target: "c",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: step1.sourceClass.fullName,
                sourceAlias: "a",
                relationshipName: step1.relationship.fullName,
                relationshipAlias: "r1",
                targetClassName: step1.targetClass.fullName,
                targetAlias: "b",
              },
              {
                sourceClassName: step2.sourceClass.fullName,
                sourceAlias: "b",
                relationshipName: step2.relationship.fullName,
                relationshipAlias: "r2",
                targetClassName: step2.targetClass.fullName,
                targetAlias: "c",
              },
            ],
          }),
        ),
      ).to.eq(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.relationship.name}] [r1] ON [r1].[SourceECInstanceId] = [a].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [r1].[TargetECInstanceId]
          INNER JOIN [${schemaName}].[${step2.relationship.name}] [r2] ON [r2].[SourceECInstanceId] = [b].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[ECInstanceId] = [r2].[TargetECInstanceId]
        `),
      );
    });

    it("creates link table join after navigation property join", async () => {
      const step1 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Forward",
        navigationPropertyName: "nav-prop-1",
        source: "a",
        relationship: "r1",
        target: "b",
      });
      const step2 = setupLinkTableRelationshipClasses({
        source: step1.targetClass,
        relationship: "r2",
        target: "c",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: step1.sourceClass.fullName,
                sourceAlias: "a",
                relationshipName: step1.relationship.fullName,
                relationshipAlias: "r1",
                targetClassName: step1.targetClass.fullName,
                targetAlias: "b",
              },
              {
                sourceClassName: step2.sourceClass.fullName,
                sourceAlias: "b",
                relationshipName: step2.relationship.fullName,
                relationshipAlias: "r2",
                targetClassName: step2.targetClass.fullName,
                targetAlias: "c",
              },
            ],
          }),
        ),
      ).to.eq(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [a].[${step1.navigationProperty.name}].[Id]
          INNER JOIN [${schemaName}].[${step2.relationship.name}] [r2] ON [r2].[SourceECInstanceId] = [b].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[ECInstanceId] = [r2].[TargetECInstanceId]
        `),
      );
    });

    it("creates navigation property join after link table join", async () => {
      const step1 = setupLinkTableRelationshipClasses({
        source: "a",
        relationship: "r1",
        target: "b",
      });
      const step2 = await setupNavigationPropertyRelationshipClasses({
        navigationPropertyDirection: "Backward",
        navigationPropertyName: "nav-prop-2",
        source: step1.targetClass,
        relationship: "r2",
        target: "c",
      });
      expect(
        trimWhitespace(
          await createRelationshipPathJoinClause({
            metadata,
            path: [
              {
                sourceClassName: step1.sourceClass.fullName,
                sourceAlias: "a",
                relationshipName: step1.relationship.fullName,
                relationshipAlias: "r1",
                targetClassName: step1.targetClass.fullName,
                targetAlias: "b",
              },
              {
                sourceClassName: step2.sourceClass.fullName,
                sourceAlias: "b",
                relationshipName: step2.relationship.fullName,
                relationshipAlias: "r2",
                targetClassName: step2.targetClass.fullName,
                targetAlias: "c",
              },
            ],
          }),
        ),
      ).to.eq(
        trimWhitespace(`
          INNER JOIN [${schemaName}].[${step1.relationship.name}] [r1] ON [r1].[SourceECInstanceId] = [a].[ECInstanceId]
          INNER JOIN [${schemaName}].[${step1.targetClass.name}] [b] ON [b].[ECInstanceId] = [r1].[TargetECInstanceId]
          INNER JOIN [${schemaName}].[${step2.targetClass.name}] [c] ON [c].[${step2.navigationProperty.name}].[Id] = [b].[ECInstanceId]
        `),
      );
    });
  });

  async function setupNavigationPropertyRelationshipClasses(props: {
    navigationPropertyDirection: "Forward" | "Backward";
    navigationPropertyName?: string;
    source?: ECClass | string;
    relationship?: ECRelationshipClass | string;
    target?: ECClass | string;
  }) {
    const navigationRelationshipRes = new ResolvablePromise<ECRelationshipClass>();
    const navigationProperty = {
      name: props?.navigationPropertyName ?? "navigation-property",
      isNavigation: () => true,
      direction: props.navigationPropertyDirection,
      relationshipClass: navigationRelationshipRes,
    } as unknown as ECNavigationProperty;
    const sourceClass =
      typeof props.source === "object"
        ? props.source
        : classStubs.stubEntityClass({
            schemaName,
            className: props.source ?? "source",
            properties: props.navigationPropertyDirection === "Forward" ? [navigationProperty] : [],
          });
    const targetClass =
      typeof props.target === "object"
        ? props.target
        : classStubs.stubEntityClass({
            schemaName,
            className: props.target ?? "target",
            properties: props.navigationPropertyDirection === "Backward" ? [navigationProperty] : [],
          });
    const relationship =
      typeof props.relationship === "object"
        ? props.relationship
        : classStubs.stubRelationshipClass({
            schemaName,
            className: props.relationship ?? "relationship",
            direction: "Forward",
            source: {
              polymorphic: false,
              abstractConstraint: Promise.resolve(sourceClass),
            },
            target: {
              polymorphic: false,
              abstractConstraint: Promise.resolve(targetClass),
            },
          });
    await navigationRelationshipRes.resolve(relationship);
    return { sourceClass, targetClass, relationship, navigationProperty };
  }

  function setupLinkTableRelationshipClasses(props?: { source?: ECClass | string; target?: ECClass | string; relationship?: ECRelationshipClass | string }) {
    const sourceClass =
      typeof props?.source === "object"
        ? props.source
        : classStubs.stubEntityClass({
            schemaName,
            className: props?.source ?? "source",
          });
    const targetClass =
      typeof props?.target === "object"
        ? props.target
        : classStubs.stubEntityClass({
            schemaName,
            className: props?.target ?? "target",
          });
    const relationship =
      typeof props?.relationship === "object"
        ? props.relationship
        : classStubs.stubRelationshipClass({
            schemaName,
            className: props?.relationship ?? "relationship",
            direction: "Forward",
            source: {
              polymorphic: false,
              abstractConstraint: Promise.resolve(sourceClass),
            },
            target: {
              polymorphic: false,
              abstractConstraint: Promise.resolve(targetClass),
            },
          });
    return { sourceClass, targetClass, relationship };
  }
});
