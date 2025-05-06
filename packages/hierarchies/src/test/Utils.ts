/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { EC, normalizeFullClassName, parseFullClassName } from "@itwin/presentation-shared";
import { NonGroupingHierarchyNode } from "../hierarchies/HierarchyNode.js";
import { GenericNodeKey, HierarchyNodeKey, IModelInstanceKey } from "../hierarchies/HierarchyNodeKey.js";
import {
  ProcessedGenericHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceGenericHierarchyNode,
  SourceInstanceHierarchyNode,
} from "../hierarchies/imodel/IModelHierarchyNode.js";

export function setupLogging(levels: Array<{ namespace: string; level: LogLevel }>) {
  Logger.initializeToConsole();
  Logger.turnOffCategories();
  levels.forEach(({ namespace, level }) => Logger.setLevel(namespace, level));
}

export function createTestGenericNodeKey(src?: Partial<GenericNodeKey>): GenericNodeKey {
  return {
    type: "generic",
    id: "test",
    ...src,
  };
}

export function createTestGenericNode(src?: Partial<NonGroupingHierarchyNode>): NonGroupingHierarchyNode {
  return {
    label: "test",
    key: createTestGenericNodeKey(),
    children: false,
    parentKeys: [],
    ...src,
  };
}

export function createTestSourceGenericNode(src?: Partial<SourceGenericHierarchyNode>): SourceGenericHierarchyNode {
  return {
    label: "test",
    key: "test",
    ...src,
  };
}

export function createTestSourceInstanceNode(src?: Partial<SourceInstanceHierarchyNode>): SourceInstanceHierarchyNode {
  return {
    label: "test",
    key: {
      type: "instances",
      instanceKeys: [],
    },
    ...src,
  };
}

export function createTestProcessedGenericNode(src?: Partial<ProcessedGenericHierarchyNode>): ProcessedGenericHierarchyNode {
  return {
    label: "test",
    key: createTestGenericNodeKey(),
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

export function createTestInstanceKey(src?: Partial<IModelInstanceKey>): IModelInstanceKey {
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
  baseClass?: EC.Class & { addDerivedClass: (derived: EC.Class) => void };
  properties?: EC.Property[];
  customAttributes?: ReadonlyMap<string, string>;
}
export interface StubRelationshipClassFuncProps extends StubClassFuncProps {
  source?: EC.RelationshipConstraint;
  target?: EC.RelationshipConstraint;
  direction?: "Forward" | "Backward";
}
export type TStubClassFunc = (props: StubClassFuncProps) => EC.Class & { addDerivedClass: (derived: EC.Class) => void };
export type TStubEntityClassFunc = (props: StubClassFuncProps) => EC.EntityClass & { addDerivedClass: (derived: EC.Class) => void };
export type TStubRelationshipClassFunc = (props: StubRelationshipClassFuncProps) => EC.RelationshipClass & { addDerivedClass: (derived: EC.Class) => void };

export function createECSchemaProviderStub() {
  const schemaStubs: { [schemaName: string]: EC.Schema } = {};
  const classes = new Map<string, EC.Class>(); // className -> class
  const classHierarchy = new Map<string, string>(); // className -> baseClassName
  const getSchemaStub = (schemaName: string) => {
    let schemaStub = schemaStubs[schemaName];
    if (!schemaStub) {
      schemaStub = {
        name: schemaName,
        getClass: sinon.fake(async (className) => classes.get(`${schemaName}.${className}`)),
        getCustomAttributes: sinon.stub(),
      };
      schemaStubs[schemaName] = schemaStub;
    }
    return schemaStub;
  };
  const getDerivedClasses = (classFullName: string): EC.Class[] => {
    const derivedClasses = new Array<EC.Class>();
    for (const [derivedClassName, baseClassName] of classHierarchy.entries()) {
      if (baseClassName === classFullName) {
        derivedClasses.push(classes.get(derivedClassName)!);
        derivedClasses.push(...getDerivedClasses(derivedClassName));
      }
    }
    return derivedClasses;
  };
  const getBaseClasses = (classFullName: string): EC.Class[] => {
    const baseClasses = new Array<EC.Class>();
    const baseClassName = classHierarchy.get(classFullName);
    if (baseClassName) {
      baseClasses.push(classes.get(baseClassName)!);
      baseClasses.push(...getBaseClasses(baseClassName));
    }
    return baseClasses;
  };
  const createBaseClassProps = (props: StubClassFuncProps) => ({
    schema: {
      name: props.schemaName,
    },
    fullName: `${props.schemaName}.${props.className}`,
    name: props.className,
    label: props.classLabel,
    baseClass: async () => props.baseClass,
    addDerivedClass: (derived: EC.Class) => {
      classHierarchy.set(derived.fullName, `${props.schemaName}.${props.className}`);
    },
    getDerivedClasses: async () => getDerivedClasses(`${props.schemaName}.${props.className}`),
    is: async (targetClassOrClassName: EC.Class | string, schemaName?: string) => {
      const myName = `${props.schemaName}.${props.className}`;
      const targetName =
        typeof targetClassOrClassName === "string" ? `${schemaName!}.${targetClassOrClassName}` : normalizeFullClassName(targetClassOrClassName.fullName);
      return targetName === myName || getBaseClasses(myName).some((baseClass) => baseClass.fullName === targetName);
    },
    getCustomAttributes: async () => props.customAttributes ?? new Map(),
    getProperty: async (propertyName: string): Promise<EC.Property | undefined> => {
      if (!props.properties) {
        return undefined;
      }
      return props.properties.find((p) => p.name === propertyName);
    },
    getProperties: async (): Promise<Array<EC.Property>> => props.properties ?? [],
    isEntityClass: () => false,
    isRelationshipClass: () => false,
  });
  const stubEntityClass: TStubEntityClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
      isEntityClass: () => true,
    } as unknown as ReturnType<TStubEntityClassFunc>;
    classes.set(res.fullName, res);
    props.baseClass && props.baseClass.addDerivedClass(res);
    return res;
  };
  const stubRelationshipClass: TStubRelationshipClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
      direction: props.direction ?? "Forward",
      source: props.source ?? { polymorphic: true, abstractConstraint: async () => undefined },
      target: props.target ?? { polymorphic: true, abstractConstraint: async () => undefined },
      isRelationshipClass: () => true,
    } as unknown as ReturnType<TStubRelationshipClassFunc>;
    classes.set(res.fullName, res);
    props.baseClass && props.baseClass.addDerivedClass(res);
    return res;
  };
  const stubOtherClass: TStubClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
    } as unknown as ReturnType<TStubClassFunc>;
    classes.set(res.fullName, res);
    props.baseClass && props.baseClass.addDerivedClass(res);
    return res;
  };
  return {
    stubEntityClass,
    stubRelationshipClass,
    stubOtherClass,
    getSchema: sinon.fake(async (schemaName: string): Promise<EC.Schema | undefined> => {
      return getSchemaStub(schemaName);
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
