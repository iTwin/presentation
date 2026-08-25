/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { vi } from "vitest";
import { Logger } from "@itwin/core-bentley";
import { getClass } from "@itwin/presentation-shared";

import type { Mock } from "vitest";
import type { LogLevel } from "@itwin/core-bentley";
import type { EC } from "@itwin/presentation-shared";
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
    key: { type: "class-grouping", className: "TestSchema.TestClass" },
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
  isHidden?: boolean;
}
export interface StubRelationshipClassFuncProps extends StubClassFuncProps {
  source?: EC.RelationshipConstraint;
  target?: EC.RelationshipConstraint;
  direction?: "Forward" | "Backward";
}
export interface StubbedSchema {
  name: string;
  version: EC.SchemaVersion;
  isHidden: boolean;
  getClass: EC.Schema["getClass"];
  getEnumeration: EC.Schema["getEnumeration"];
  getKindOfQuantity: EC.Schema["getKindOfQuantity"];
  getPropertyCategory: EC.Schema["getPropertyCategory"];
}
export type TStubClassFunc = (props: StubClassFuncProps) => EC.Class & ECClassExtraMembers;
export type TStubEntityClassFunc = (props: StubClassFuncProps) => EC.EntityClass & ECClassExtraMembers;
export type TStubRelationshipClassFunc = (
  props: StubRelationshipClassFuncProps,
) => EC.RelationshipClass & ECClassExtraMembers;

export function createECSchemaProviderStub() {
  const schemaStubs = new Map<string, StubbedSchema>();
  const classes = new Map<EC.FullClassNameDotNotation, EC.Class>(); // className -> class
  const classHierarchy = new Map<EC.FullClassNameDotNotation, EC.FullClassNameDotNotation>(); // className -> baseClassName
  const getSchemaImpl = (schemaName: string) => {
    let schemaStub = schemaStubs.get(schemaName);
    if (!schemaStub) {
      schemaStub = {
        name: schemaName,
        version: { read: 1, write: 0, minor: 0 },
        isHidden: false,
        getClass: (className) => classes.get(`${schemaName}.${className}`),
        getEnumeration: () => undefined,
        getKindOfQuantity: () => undefined,
        getPropertyCategory: () => undefined,
      };
      schemaStubs.set(schemaName, schemaStub);
    }
    return schemaStub;
  };
  const getDerivedClassNames = (
    classFullName: EC.FullClassNameDotNotation,
    options?: { onlyDirect?: boolean },
  ): EC.FullClassNameDotNotation[] => {
    const derivedClasses = new Array<EC.FullClassNameDotNotation>();
    for (const [derivedClassName, baseClassName] of classHierarchy) {
      if (baseClassName === classFullName) {
        derivedClasses.push(derivedClassName);
        if (!options?.onlyDirect) {
          derivedClasses.push(...getDerivedClassNames(derivedClassName, options));
        }
      }
    }
    return derivedClasses;
  };
  const getBaseClasses = (classFullName: EC.FullClassNameDotNotation): EC.Class[] => {
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
      return props.baseClass;
    },
    addDerivedClass: (derived: EC.Class) => {
      classHierarchy.set(derived.fullName, `${props.schemaName}.${props.className}`);
    },
    getDerivedClassNames: (options?: { onlyDirect?: boolean }) =>
      getDerivedClassNames(`${props.schemaName}.${props.className}`, options),
    is: (targetClassOrClassName: EC.Class | string, schemaName?: string) => {
      const myName: EC.FullClassNameDotNotation = `${props.schemaName}.${props.className}`;
      const targetName: EC.FullClassNameDotNotation =
        typeof targetClassOrClassName === "string"
          ? `${schemaName!}.${targetClassOrClassName}`
          : targetClassOrClassName.fullName;
      return targetName === myName || getBaseClasses(myName).some((baseClass) => baseClass.fullName === targetName);
    },
    isHidden: props.isHidden,
    getProperty(this, propertyName: string): EC.Property | undefined {
      const prop = props.properties?.find((p) => p.name === propertyName);
      return prop ? { ...prop, class: this as unknown as EC.Class } : undefined;
    },
    getProperties(this): Array<EC.Property> {
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
      source: props.source ?? { polymorphic: true, abstractConstraint: undefined },
      target: props.target ?? { polymorphic: true, abstractConstraint: undefined },
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
  const stubProvider = {
    stubEntityClass,
    stubRelationshipClass,
    stubOtherClass,
    getSchema: async (name: string) => getSchemaImpl(name),
    classDerivesFrom: async (
      derived: EC.FullClassNameDotNotation,
      base: EC.FullClassNameDotNotation,
    ): Promise<boolean> => {
      const derivedClass = await getClass(stubProvider, derived);
      const baseClass = await getClass(stubProvider, base);
      return derivedClass.is(baseClass);
    },
  };
  return stubProvider;
}

export function createIModelAccessStub() {
  const createQueryReader: Mock<LimitingECSqlQueryExecutor["createQueryReader"]> = vi.fn();
  return { ...createECSchemaProviderStub(), createQueryReader };
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
