/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import sinon from "sinon";
import { Id64, Id64String } from "@itwin/core-bentley";
import { ECClass, SchemaContext } from "@itwin/ecschema-metadata";
import { InstanceKey } from "../hierarchy-builder/EC";
import { HierarchyNode } from "../hierarchy-builder/HierarchyNode";
import * as common from "../hierarchy-builder/internal/Common";

export async function getObservableResult<T>(obs: Observable<T>): Promise<Array<T>> {
  const arr = new Array<T>();
  return new Promise((resolve, reject) => {
    obs.subscribe({
      next(item: T) {
        arr.push(item);
      },
      complete() {
        resolve(arr);
      },
      error(reason) {
        reject(reason);
      },
    });
  });
}

export function createTestNode(src?: Partial<HierarchyNode>): HierarchyNode {
  return {
    label: "test",
    key: {
      type: "instances",
      instanceKeys: [],
    },
    children: undefined,
    ...src,
  };
}

export function createTestInstanceKey(src?: Partial<InstanceKey>): InstanceKey {
  return {
    className: "TestSchema:TestClass",
    id: "0x1",
    ...src,
  };
}

export interface TStubClassFuncProps {
  schemaName: string;
  className: string;
  classLabel?: string;
  is?: (fullClassName: string) => Promise<boolean>;
}
export interface TStubClassFuncReturnType {
  id: Id64String;
  name: string;
  label: string;
}
export type TStubClassFunc = (props: TStubClassFuncProps) => TStubClassFuncReturnType;
export function createGetClassStub(schemas: SchemaContext) {
  const stub = sinon.stub(common, "getClass");
  const stubClass: TStubClassFunc = (props) => {
    const fullName = `${props.schemaName}:${props.className}`;
    const fullNameMatcher = sinon.match((fullClassName: string) => {
      const { schemaName, className } = parseFullClassName(fullClassName);
      return schemaName === props.schemaName && className === props.className;
    });
    stub.withArgs(schemas, fullNameMatcher).resolves({
      fullName,
      name: props.className,
      label: props.classLabel,
      is: sinon.fake(async (targetClass: ECClass) => {
        if (!props.is) {
          return false;
        }
        const { schemaName, className } = parseFullClassName(targetClass.fullName);
        return props.is(`${schemaName}.${className}`);
      }),
    } as unknown as ECClass);
    return {
      id: Id64.invalid,
      name: fullName,
      label: props.classLabel ?? props.className,
    };
  };
  return { getClass: stub, stubClass };
}

function parseFullClassName(fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  return { schemaName, className };
}
