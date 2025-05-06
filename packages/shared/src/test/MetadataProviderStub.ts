/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from "sinon";
import { EC, ECSchemaProvider } from "../shared/Metadata.js";
import { parseFullClassName } from "../shared/Utils.js";

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
export interface ClassStubs {
  stubEntityClass: TStubEntityClassFunc;
  stubRelationshipClass: TStubRelationshipClassFunc;
  stubOtherClass: TStubClassFunc;
  resetHistory: () => void;
  restore: () => void;
  stub: sinon.SinonStub<[schemaProvider: ECSchemaProvider, fullClassName: string], Promise<EC.Class>>;
}
export function createECSchemaProviderStub() {
  const schemaStubs: { [schemaName: string]: sinon.SinonStubbedInstance<EC.Schema> } = {};
  const stub = {
    getSchema: sinon.fake(async (schemaName: string): Promise<EC.Schema | undefined> => {
      return schemaStubs[schemaName];
    }),
  };
  const getSchemaStub = (schemaName: string) => {
    let schemaStub = schemaStubs[schemaName];
    if (!schemaStub) {
      schemaStub = {
        name: schemaName,
        getClass: sinon.stub(),
        getCustomAttributes: sinon.stub(),
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
    ...stub,
    stubEntityClass,
    stubRelationshipClass,
    stubOtherClass,
    getClassRequestCount(props: { schemaName: string; className: string }): number {
      const schemaStub = schemaStubs[props.schemaName];
      if (!schemaStub) {
        return 0;
      }
      return schemaStub.getClass.getCalls().filter((call) => call.args[0] === props.className).length;
    },
  };
}
