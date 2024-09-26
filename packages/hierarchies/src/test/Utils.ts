/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { EC, InstanceKey, parseFullClassName } from "@itwin/presentation-shared";
import {
  ParsedCustomHierarchyNode,
  ParsedInstanceHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../hierarchies/HierarchyNode";
import { HierarchyNodeKey } from "../hierarchies/HierarchyNodeKey";

export function setupLogging(levels: Array<{ namespace: string; level: LogLevel }>) {
  Logger.initializeToConsole();
  Logger.turnOffCategories();
  levels.forEach(({ namespace, level }) => Logger.setLevel(namespace, level));
}

export function createTestParsedCustomNode(src?: Partial<ParsedCustomHierarchyNode>): ParsedCustomHierarchyNode {
  return {
    label: "test",
    key: "test",
    ...src,
  };
}

export function createTestParsedInstanceNode(src?: Partial<ParsedInstanceHierarchyNode>): ParsedInstanceHierarchyNode {
  return {
    label: "test",
    key: {
      type: "instances",
      instanceKeys: [],
    },
    ...src,
  };
}

export function createTestProcessedCustomNode(src?: Partial<ProcessedCustomHierarchyNode>): ProcessedCustomHierarchyNode {
  return {
    label: "test",
    key: "test",
    parentKeys: [],
    ...src,
  };
}

export function createTestProcessedInstanceNode(src?: Partial<ProcessedInstanceHierarchyNode>): ProcessedInstanceHierarchyNode {
  return {
    label: "test",
    key: {
      type: "instances",
      instanceKeys: [],
    },
    parentKeys: [],
    ...src,
  };
}

export function createTestProcessedGroupingNode<TChild = ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>(
  src?: Partial<Omit<ProcessedGroupingHierarchyNode, "children">> & { children?: TChild[] },
): Omit<ProcessedGroupingHierarchyNode, "children"> & { children: TChild[] } {
  return {
    label: "test",
    key: {
      type: "class-grouping",
      className: "test class",
    },
    parentKeys: [],
    groupedInstanceKeys: [],
    children: new Array<TChild>(),
    ...src,
  };
}

export function createTestInstanceKey(src?: Partial<InstanceKey>): InstanceKey {
  return {
    className: "TestSchema.TestClass",
    id: "0x1",
    ...src,
  };
}

export function createTestNodeKey(): HierarchyNodeKey {
  return {
    type: "instances",
    instanceKeys: [],
  };
}

export interface StubClassFuncProps {
  schemaName: string;
  className: string;
  classLabel?: string;
  properties?: EC.Property[];
  is?: (fullClassName: string) => Promise<boolean>;
}
export interface StubRelationshipClassFuncProps extends StubClassFuncProps {
  source?: EC.RelationshipConstraint;
  target?: EC.RelationshipConstraint;
  direction?: "Forward" | "Backward";
}
export type TStubClassFunc = (props: StubClassFuncProps) => EC.Class;
export type TStubEntityClassFunc = (props: StubClassFuncProps) => EC.EntityClass;
export type TStubRelationshipClassFunc = (props: StubRelationshipClassFuncProps) => EC.RelationshipClass;

export function createECSchemaProviderStub() {
  const schemaStubs: { [schemaName: string]: sinon.SinonStubbedInstance<EC.Schema> } = {};
  const getSchemaStub = (schemaName: string) => {
    let schemaStub = schemaStubs[schemaName];
    if (!schemaStub) {
      schemaStub = {
        name: schemaName,
        getClass: sinon.stub(),
      };
      schemaStubs[schemaName] = schemaStub;
    }
    return schemaStub;
  };
  const createBaseClassProps = (props: StubClassFuncProps) => ({
    schema: {
      name: props.schemaName,
    },
    fullName: `${props.schemaName}.${props.className}`,
    name: props.className,
    label: props.classLabel,
    getProperty: async (propertyName: string): Promise<EC.Property | undefined> => {
      if (!props.properties) {
        return undefined;
      }
      return props.properties.find((p) => p.name === propertyName);
    },
    getProperties: async (): Promise<Array<EC.Property>> => props.properties ?? [],
    is: sinon.fake(async (targetClassOrClassName: EC.Class | string, schemaName?: string) => {
      if (!props.is) {
        return false;
      }
      if (typeof targetClassOrClassName === "string") {
        return props.is(`${schemaName!}.${targetClassOrClassName}`);
      }
      // need this just to make sure `.` is used for separating schema and class names
      const { schemaName: parsedSchemaName, className: parsedClassName } = parseFullClassName(targetClassOrClassName.fullName);
      return props.is(`${parsedSchemaName}.${parsedClassName}`);
    }),
    isEntityClass: () => false,
    isRelationshipClass: () => false,
  });
  const stubEntityClass: TStubEntityClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
      isEntityClass: () => true,
    } as unknown as EC.EntityClass;
    getSchemaStub(props.schemaName).getClass.withArgs(props.className).resolves(res);
    return res;
  };
  const stubRelationshipClass: TStubRelationshipClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
      direction: props.direction ?? "Forward",
      source: props.source ?? { polymorphic: true, abstractConstraint: async () => undefined },
      target: props.target ?? { polymorphic: true, abstractConstraint: async () => undefined },
      isRelationshipClass: () => true,
    } as unknown as EC.RelationshipClass;
    getSchemaStub(props.schemaName).getClass.withArgs(props.className).resolves(res);
    return res;
  };
  const stubOtherClass: TStubClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
    } as unknown as EC.Class;
    getSchemaStub(props.schemaName).getClass.withArgs(props.className).resolves(res);
    return res;
  };
  return {
    stubEntityClass,
    stubRelationshipClass,
    stubOtherClass,
    getSchema: sinon.fake(async (schemaName: string): Promise<EC.Schema | undefined> => {
      return schemaStubs[schemaName];
    }),
  };
}

export function createClassHierarchyInspectorStub(schemaProvider = createECSchemaProviderStub()) {
  return {
    stubEntityClass: schemaProvider.stubEntityClass,
    stubRelationshipClass: schemaProvider.stubRelationshipClass,
    stubOtherClass: schemaProvider.stubOtherClass,
    classDerivesFrom: sinon.fake(async (derived: string, base: string) => {
      const { schemaName: derivedSchemaName, className: derivedClassName } = parseFullClassName(derived);
      const { schemaName: baseSchemaName, className: baseClassName } = parseFullClassName(base);
      const schemaStub = await schemaProvider.getSchema(derivedSchemaName);
      if (!schemaStub) {
        return false;
      }
      const derivedClass = await schemaStub.getClass(derivedClassName);
      if (!derivedClass) {
        return false;
      }
      return derivedClass.is(baseClassName, baseSchemaName);
    }),
  };
}

export function createIModelAccessStub() {
  const schemaProvider = createECSchemaProviderStub();
  return {
    ...schemaProvider,
    ...createClassHierarchyInspectorStub(schemaProvider),
  };
}

export function createInstanceLabelSelectClauseFactoryStub() {
  return {
    async createSelectClause(props: { classAlias: string; className?: string; selectorsConcatenator?: any }): Promise<string> {
      return `[${props.classAlias}].[LabelProperty]`;
    },
  };
}

export const testLocalizedStrings = {
  other: "_Other_",
  unspecified: "_Unspecified_",
};
