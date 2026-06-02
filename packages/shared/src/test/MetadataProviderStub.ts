/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { vi } from "vitest";
import { parseFullClassName } from "../shared/Utils.js";

import type { Mock } from "vitest";
import type { EC } from "../shared/Metadata.js";

export interface StubClassFuncProps {
  schemaName: string;
  className: string;
  classLabel?: string;
  properties?: EC.Property[];
  is?: (fullClassName: EC.FullClassName) => boolean;
}
export interface StubRelationshipClassFuncProps extends StubClassFuncProps {
  source?: EC.RelationshipConstraint;
  target?: EC.RelationshipConstraint;
  direction?: "Forward" | "Backward";
}
export type TStubClassFunc = (props: StubClassFuncProps) => EC.Class;
export type TStubEntityClassFunc = (props: StubClassFuncProps) => EC.EntityClass;
export type TStubRelationshipClassFunc = (props: StubRelationshipClassFuncProps) => EC.RelationshipClass;
interface SchemaStub {
  name: string;
  version: EC.SchemaVersion;
  isHidden: boolean;
  getClass: Mock<EC.Schema["getClass"]>;
  classes: Map<string, EC.Class>;
}
export function createECSchemaProviderStub() {
  const schemaStubs = new Map<string, SchemaStub>();
  const stub = {
    getSchema: vi.fn(async (schemaName: string): Promise<EC.Schema | undefined> => {
      return schemaStubs.get(schemaName);
    }),
  };
  const getSchemaStub = (schemaName: string) => {
    let schemaStub = schemaStubs.get(schemaName);
    if (!schemaStub) {
      const classMap = new Map<string, EC.Class>();
      schemaStub = {
        name: schemaName,
        version: { read: 1, write: 0, minor: 0 },
        isHidden: false,
        classes: classMap,
        getClass: vi.fn((className: string) => classMap.get(className)),
      };
      schemaStubs.set(schemaName, schemaStub);
    }
    return schemaStub;
  };
  const createBaseClassProps = (props: StubClassFuncProps) => ({
    schema: getSchemaStub(props.schemaName),
    fullName: `${props.schemaName}.${props.className}`,
    name: props.className,
    label: props.classLabel,
    isHidden: undefined,
    getProperty: (propertyName: string): EC.Property | undefined => {
      if (!props.properties) {
        return undefined;
      }
      return props.properties.find((p) => p.name === propertyName);
    },
    getProperties: (): Array<EC.Property> => props.properties ?? [],
    is: vi.fn((targetClassOrClassName: EC.Class | string, schemaName?: string) => {
      if (!props.is) {
        return false;
      }
      if (typeof targetClassOrClassName === "string") {
        return props.is(`${schemaName!}.${targetClassOrClassName}`);
      }
      // need this just to make sure `.` is used for separating schema and class names
      const { schemaName: parsedSchemaName, className: parsedClassName } = parseFullClassName(
        targetClassOrClassName.fullName,
      );
      return props.is(`${parsedSchemaName}.${parsedClassName}`);
    }),
    isEntityClass: () => false,
    isRelationshipClass: () => false,
  });
  const stubEntityClass: TStubEntityClassFunc = (props) => {
    const res = { ...createBaseClassProps(props), isEntityClass: () => true } as unknown as EC.EntityClass;
    getSchemaStub(props.schemaName).classes.set(props.className, res);
    return res;
  };
  const stubRelationshipClass: TStubRelationshipClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
      direction: props.direction ?? "Forward",
      source: props.source ?? { polymorphic: true, abstractConstraint: undefined },
      target: props.target ?? { polymorphic: true, abstractConstraint: undefined },
      isRelationshipClass: () => true,
    } as unknown as EC.RelationshipClass;
    getSchemaStub(props.schemaName).classes.set(props.className, res);
    return res;
  };
  const stubOtherClass: TStubClassFunc = (props) => {
    const res = { ...createBaseClassProps(props) } as unknown as EC.Class;
    getSchemaStub(props.schemaName).classes.set(props.className, res);
    return res;
  };
  return {
    ...stub,
    stubEntityClass,
    stubRelationshipClass,
    stubOtherClass,
    getClassRequestCount(props: { schemaName: string; className: string }): number {
      const schemaStub = schemaStubs.get(props.schemaName);
      if (!schemaStub) {
        return 0;
      }
      return schemaStub.getClass.mock.calls.filter((call) => call[0] === props.className).length;
    },
  };
}
