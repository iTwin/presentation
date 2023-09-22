/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import sinon from "sinon";
import { Id64, Logger, LogLevel } from "@itwin/core-bentley";
import { Id64String, InstanceKey } from "../hierarchy-builder/EC";
import { HierarchyNode } from "../hierarchy-builder/HierarchyNode";
import * as common from "../hierarchy-builder/internal/Common";
import { ECClass, IMetadataProvider } from "../hierarchy-builder/Metadata";

export function setupLogging(levels: Array<{ namespace: string; level: LogLevel }>) {
  Logger.initializeToConsole();
  Logger.turnOffCategories();
  levels.forEach(({ namespace, level }) => Logger.setLevel(namespace, level));
}

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
export function createGetClassStub(schemas: IMetadataProvider) {
  const stub = sinon.stub(common, "getClass");
  const stubClass: TStubClassFunc = (props) => {
    const fullName = `${props.schemaName}:${props.className}`;
    const fullNameMatcher = sinon.match((fullClassName: string) => {
      const { schemaName, className } = common.splitFullClassName(fullClassName);
      return schemaName === props.schemaName && className === props.className;
    });
    stub.withArgs(schemas, fullNameMatcher).resolves({
      fullName,
      name: props.className,
      label: props.classLabel,
      is: sinon.fake(async (targetClassOrClassName: ECClass | string, schemaName?: string) => {
        if (!props.is) {
          return false;
        }
        if (typeof targetClassOrClassName === "string") {
          return props.is(`${schemaName}.${targetClassOrClassName}`);
        }
        // need this just to make sure `.` is used for separating schema and class names
        const { schemaName: parsedSchemaName, className: parsedClassName } = common.splitFullClassName(targetClassOrClassName.fullName);
        return props.is(`${parsedSchemaName}.${parsedClassName}`);
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
