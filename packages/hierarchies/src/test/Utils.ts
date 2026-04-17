/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { vi } from "vitest";
import { Dictionary, Logger } from "@itwin/core-bentley";
import { compareFullClassNames, getClass, normalizeFullClassName } from "@itwin/presentation-shared";

import type { Mock } from "vitest";
import type { LogLevel } from "@itwin/core-bentley";
import type { EC, ECClassHierarchyInspector } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, NonGroupingHierarchyNode } from "../hierarchies/HierarchyNode.js";
import type {
  ClassGroupingNodeKey,
  GenericNodeKey,
  HierarchyNodeKey,
  IModelInstanceKey,
  InstancesNodeKey,
  PropertyOtherValuesGroupingNodeKey,
  PropertyValueGroupingNodeKey,
  PropertyValueRangeGroupingNodeKey,
} from "../hierarchies/HierarchyNodeKey.js";
import type {
  ProcessedGenericHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceGenericHierarchyNode,
  SourceInstanceHierarchyNode,
} from "../hierarchies/imodel/IModelHierarchyNode.js";
import type { LimitingECSqlQueryExecutor } from "../hierarchies/imodel/LimitingECSqlQueryExecutor.js";

export function setupLogging(levels: Array<{ namespace: string; level: LogLevel }>) {
  Logger.initializeToConsole();
  Logger.turnOffCategories();
  levels.forEach(({ namespace, level }) => Logger.setLevel(namespace, level));
}

export function createTestGenericNodeKey(src?: Partial<GenericNodeKey>): GenericNodeKey {
  return { type: "generic", id: "test", ...src };
}

export function createTestGenericNode(src?: Partial<NonGroupingHierarchyNode>): NonGroupingHierarchyNode {
  return { label: "test", key: createTestGenericNodeKey(), children: false, parentKeys: [], ...src };
}

export function createTestSourceGenericNode(src?: Partial<SourceGenericHierarchyNode>): SourceGenericHierarchyNode {
  return { label: "test", key: "test", ...src };
}

export function createTestProcessedGenericNode(
  src?: Partial<ProcessedGenericHierarchyNode>,
): ProcessedGenericHierarchyNode {
  return { label: "test", key: createTestGenericNodeKey(), parentKeys: [], ...src };
}

export function createTestInstanceNodeKey(src?: Partial<InstancesNodeKey>): InstancesNodeKey {
  return { type: "instances", instanceKeys: [], ...src };
}

export function createTestInstanceNode(src?: Partial<NonGroupingHierarchyNode>): NonGroupingHierarchyNode {
  return { label: "test", key: createTestInstanceNodeKey(), children: false, parentKeys: [], ...src };
}

export function createTestSourceInstanceNode(src?: Partial<SourceInstanceHierarchyNode>): SourceInstanceHierarchyNode {
  return { label: "test", key: createTestInstanceNodeKey(), ...src };
}

export function createTestProcessedInstanceNode(
  src?: Partial<ProcessedInstanceHierarchyNode>,
): ProcessedInstanceHierarchyNode {
  return { label: "test", key: createTestInstanceNodeKey(), parentKeys: [], ...src };
}

export function createTestGroupingNode(src?: Partial<GroupingHierarchyNode>): GroupingHierarchyNode {
  return {
    label: "test",
    key: createTestClassGroupingNodeKey(),
    children: true,
    groupedInstanceKeys: [createTestInstanceKey({ className: "TestSchema.TestClass", id: "0x1" })],
    parentKeys: [],
    ...src,
  };
}

export function createTestProcessedGroupingNode<
  TChild = ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode,
>(
  src?: Partial<Omit<ProcessedGroupingHierarchyNode, "children">> & { children?: TChild[] },
): Omit<ProcessedGroupingHierarchyNode, "children"> & { children: TChild[] } {
  return {
    label: "test",
    key: { type: "class-grouping", className: normalizeFullClassName("TestSchema.TestClass") },
    parentKeys: [],
    groupedInstanceKeys: [],
    children: new Array<TChild>(),
    ...src,
  };
}

export function createTestClassGroupingNodeKey(src?: Partial<ClassGroupingNodeKey>): ClassGroupingNodeKey {
  return { type: "class-grouping", className: "TestSchema.TestClass", ...src };
}

export function createTestPropertyValueGroupingNodeKey(
  src?: Partial<PropertyValueGroupingNodeKey>,
): PropertyValueGroupingNodeKey {
  return {
    type: "property-grouping:value",
    propertyClassName: "TestSchema.TestClass",
    propertyName: "TestProperty",
    formattedPropertyValue: "test",
    ...src,
  };
}

export function createTestPropertyValueRangeGroupingNodeKey(
  src?: Partial<PropertyValueRangeGroupingNodeKey>,
): PropertyValueRangeGroupingNodeKey {
  return {
    type: "property-grouping:range",
    propertyClassName: "TestSchema.TestClass",
    propertyName: "TestProperty",
    fromValue: 1.23,
    toValue: 4.56,
    ...src,
  };
}

export function createTestPropertyOtherValueGroupingNodeKey(
  src?: Partial<PropertyOtherValuesGroupingNodeKey>,
): PropertyOtherValuesGroupingNodeKey {
  return {
    type: "property-grouping:other",
    properties: [{ className: "TestSchema.TestClass", propertyName: "TestProperty" }],
    ...src,
  };
}

export function createTestInstanceKey(src?: Partial<IModelInstanceKey>): IModelInstanceKey {
  return { className: "TestSchema.TestClass", id: "0x1", ...src };
}

export function createTestNodeKey(): HierarchyNodeKey {
  return createTestInstanceNodeKey();
}

interface ECClassExtraMembers {
  readonly ecsqlSelector: string;
  addDerivedClass: (derived: EC.Class) => void;
}
export interface StubClassFuncProps {
  schemaName: string;
  className: string;
  classLabel?: string;
  baseClass?: EC.Class & Pick<ECClassExtraMembers, "addDerivedClass">;
  properties?: EC.Property[];
  customAttributes?: ReadonlyMap<string, { [key: string]: any }>;
}
export interface StubRelationshipClassFuncProps extends StubClassFuncProps {
  source?: EC.RelationshipConstraint;
  target?: EC.RelationshipConstraint;
  direction?: "Forward" | "Backward";
}
export interface StubbedSchema {
  name: string;
  getClass: EC.Schema["getClass"];
  getCustomAttributes: EC.Schema["getCustomAttributes"];
}
export type TStubClassFunc = (props: StubClassFuncProps) => EC.Class & ECClassExtraMembers;
export type TStubEntityClassFunc = (props: StubClassFuncProps) => EC.EntityClass & ECClassExtraMembers;
export type TStubRelationshipClassFunc = (
  props: StubRelationshipClassFuncProps,
) => EC.RelationshipClass & ECClassExtraMembers;
export type TStubCustomAttributesFunc = (props: {
  schemaName: string;
  attributes: Map<EC.FullClassName, EC.CustomAttribute>;
}) => void;

export function createECSchemaProviderStub() {
  const schemaStubs = new Map<string, StubbedSchema>();
  const classes = new Dictionary<EC.FullClassName, EC.Class>(compareFullClassNames); // className -> class
  const classHierarchy = new Dictionary<EC.FullClassName, EC.FullClassName>(compareFullClassNames); // className -> baseClassName
  const customAttributes = new Map<string, Map<EC.FullClassName, EC.CustomAttribute>>(); // schemaName -> (className -> customAttribute)
  const getSchemaImpl = (schemaName: string) => {
    let schemaStub = schemaStubs.get(schemaName);
    if (!schemaStub) {
      schemaStub = {
        name: schemaName,
        getClass: async (className) => classes.get(`${schemaName}.${className}`),
        getCustomAttributes: async () => customAttributes.get(schemaName) ?? new Map(),
      };
      schemaStubs.set(schemaName, schemaStub);
    }
    return schemaStub;
  };
  const getDerivedClasses = (classFullName: EC.FullClassName): EC.Class[] => {
    const derivedClasses = new Array<EC.Class>();
    for (const { key: derivedClassName, value: baseClassName } of classHierarchy) {
      if (compareFullClassNames(baseClassName, classFullName) === 0) {
        derivedClasses.push(classes.get(derivedClassName)!);
        derivedClasses.push(...getDerivedClasses(derivedClassName));
      }
    }
    return derivedClasses;
  };
  const getBaseClasses = (classFullName: EC.FullClassName): EC.Class[] => {
    const baseClasses = new Array<EC.Class>();
    const baseClassName = classHierarchy.get(classFullName);
    if (baseClassName) {
      baseClasses.push(classes.get(baseClassName)!);
      baseClasses.push(...getBaseClasses(baseClassName));
    }
    return baseClasses;
  };
  const createBaseClassProps = (props: StubClassFuncProps) => ({
    get schema() {
      return getSchemaImpl(props.schemaName);
    },
    fullName: `${props.schemaName}.${props.className}`,
    name: props.className,
    label: props.classLabel,
    get ecsqlSelector() {
      return `[${props.schemaName}].[${props.className}]`;
    },
    get baseClass() {
      return Promise.resolve(props.baseClass);
    },
    addDerivedClass: (derived: EC.Class) => {
      classHierarchy.set(derived.fullName, `${props.schemaName}.${props.className}`);
    },
    getDerivedClasses: async () => getDerivedClasses(`${props.schemaName}.${props.className}`),
    is: async (targetClassOrClassName: EC.Class | string, schemaName?: string) => {
      const myName: EC.FullClassName = `${props.schemaName}.${props.className}`;
      const targetName: EC.FullClassName =
        typeof targetClassOrClassName === "string"
          ? `${schemaName!}.${targetClassOrClassName}`
          : targetClassOrClassName.fullName;
      return (
        compareFullClassNames(targetName, myName) === 0 ||
        getBaseClasses(myName).some((baseClass) => compareFullClassNames(baseClass.fullName, targetName) === 0)
      );
    },
    getCustomAttributes: async () => props.customAttributes ?? new Map(),
    async getProperty(this, propertyName: string): Promise<EC.Property | undefined> {
      const prop = props.properties?.find((p) => p.name.toLocaleLowerCase() === propertyName.toLocaleLowerCase());
      return prop ? { ...prop, class: this as unknown as EC.Class } : undefined;
    },
    async getProperties(this): Promise<Array<EC.Property>> {
      return (props.properties ?? []).map((p) => ({ ...p, class: this as unknown as EC.Class }));
    },
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
    const res = { ...createBaseClassProps(props) } as unknown as ReturnType<TStubClassFunc>;
    classes.set(res.fullName, res);
    props.baseClass && props.baseClass.addDerivedClass(res);
    return res;
  };
  const stubCustomAttribute: TStubCustomAttributesFunc = (props) => {
    const schemaCustomAttributes =
      customAttributes.get(props.schemaName) ?? new Map<EC.FullClassName, EC.CustomAttribute>();
    customAttributes.set(props.schemaName, schemaCustomAttributes);
    for (const [className, attribute] of props.attributes) {
      schemaCustomAttributes.set(className, { ...attribute, className });
    }
  };

  return {
    stubEntityClass,
    stubRelationshipClass,
    stubOtherClass,
    stubCustomAttribute,
    getSchema: async (name: string) => getSchemaImpl(name),
  };
}

export function createClassHierarchyInspectorStub(
  schemaProvider = createECSchemaProviderStub(),
): {
  stubEntityClass: TStubEntityClassFunc;
  stubRelationshipClass: TStubRelationshipClassFunc;
  stubOtherClass: TStubClassFunc;
} & ECClassHierarchyInspector {
  return {
    stubEntityClass: schemaProvider.stubEntityClass,
    stubRelationshipClass: schemaProvider.stubRelationshipClass,
    stubOtherClass: schemaProvider.stubOtherClass,
    classDerivesFrom: async (derived: EC.FullClassName, base: EC.FullClassName) => {
      const derivedClass = await getClass(schemaProvider, derived);
      const baseClass = await getClass(schemaProvider, base);
      return derivedClass.is(baseClass);
    },
  };
}

export function createIModelAccessStub() {
  const createQueryReader: Mock<LimitingECSqlQueryExecutor["createQueryReader"]> = vi.fn();
  const schemaProvider = createECSchemaProviderStub();
  return { ...schemaProvider, ...createClassHierarchyInspectorStub(schemaProvider), createQueryReader };
}

export function createInstanceLabelSelectClauseFactoryStub() {
  return {
    async createSelectClause(props: {
      classAlias: string;
      className?: string;
      selectorsConcatenator?: any;
    }): Promise<string> {
      return `[${props.classAlias}].[LabelProperty]`;
    },
  };
}

export const testLocalizedStrings = { other: "_Other_", unspecified: "_Unspecified_" };
