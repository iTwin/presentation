/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import sinon from "sinon";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../hierarchy-builder/HierarchyNode";
import * as common from "../hierarchy-builder/internal/Common";
import { GroupingHandlerType } from "../hierarchy-builder/internal/operators/Grouping";
import { createBaseClassGroupsForSingleBaseClass, getBaseClassGroupingECClasses } from "../hierarchy-builder/internal/operators/grouping/BaseClassGrouping";
import { createClassGroups } from "../hierarchy-builder/internal/operators/grouping/ClassGrouping";
import { createLabelGroups } from "../hierarchy-builder/internal/operators/grouping/LabelGrouping";
import { ECClass, IMetadataProvider, parseFullClassName } from "../hierarchy-builder/Metadata";
import { InstanceKey } from "../hierarchy-builder/values/Values";

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
    className: "TestSchema.TestClass",
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
  name: string;
  label?: string;
}
export type TStubClassFunc = (props: TStubClassFuncProps) => TStubClassFuncReturnType;
export function createGetClassStub(schemas: IMetadataProvider) {
  const stub = sinon.stub(common, "getClass");
  const stubClass: TStubClassFunc = (props) => {
    const fullName = `${props.schemaName}.${props.className}`;
    const fullNameMatcher = sinon.match((fullClassName: string) => {
      const { schemaName, className } = parseFullClassName(fullClassName);
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
          return props.is(`${schemaName!}.${targetClassOrClassName}`);
        }
        // need this just to make sure `.` is used for separating schema and class names
        const { schemaName: parsedSchemaName, className: parsedClassName } = parseFullClassName(targetClassOrClassName.fullName);
        return props.is(`${parsedSchemaName}.${parsedClassName}`);
      }),
    } as unknown as ECClass);
    return {
      name: fullName,
      label: props.classLabel,
    };
  };
  return { getClass: stub, stubClass };
}

export async function createGroupingHandlers(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandlerType[]> {
  const groupingHandlers: GroupingHandlerType[] = new Array<GroupingHandlerType>();
  const baseClassGroupingECClasses = await getBaseClassGroupingECClasses(metadata, nodes);
  for (const baseECClass of baseClassGroupingECClasses) {
    groupingHandlers.push(async (allNodes: HierarchyNode[]) => {
      return createBaseClassGroupsForSingleBaseClass(metadata, allNodes, baseECClass);
    });
  }
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createClassGroups(metadata, allNodes));
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createLabelGroups(allNodes));
  return groupingHandlers;
}
