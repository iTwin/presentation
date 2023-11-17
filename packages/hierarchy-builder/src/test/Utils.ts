/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import sinon from "sinon";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { ECClass, ECEntityClass, ECProperty, ECRelationshipClass, ECRelationshipConstraint, IMetadataProvider } from "../hierarchy-builder/ECMetadata";
import {
  ParsedCustomHierarchyNode,
  ParsedInstanceHierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../hierarchy-builder/HierarchyNode";
import * as common from "../hierarchy-builder/internal/Common";
import { parseFullClassName } from "../hierarchy-builder/Metadata";
import { ECSqlQueryReader, ECSqlQueryRow } from "../hierarchy-builder/queries/ECSqlCore";
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
      class: { name: "test class" },
    },
    parentKeys: [],
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

export interface StubClassFuncProps {
  schemaName: string;
  className: string;
  classLabel?: string;
  properties?: ECProperty[];
  is?: (fullClassName: string) => Promise<boolean>;
}
export interface StubRelationshipClassFuncProps extends StubClassFuncProps {
  source?: ECRelationshipConstraint;
  target?: ECRelationshipConstraint;
  direction?: "Forward" | "Backward";
}
export type TStubClassFunc = (props: StubClassFuncProps) => ECClass;
export type TStubEntityClassFunc = (props: StubClassFuncProps) => ECEntityClass;
export type TStubRelationshipClassFunc = (props: StubRelationshipClassFuncProps) => ECRelationshipClass;
export interface ClassStubs {
  stubEntityClass: TStubEntityClassFunc;
  stubRelationshipClass: TStubRelationshipClassFunc;
  stubOtherClass: TStubClassFunc;
  resetHistory: () => void;
  restore: () => void;
}
export function createClassStubs(schemas: IMetadataProvider): ClassStubs {
  const stub = sinon.stub(common, "getClass");
  const createFullClassNameMatcher = (props: { schemaName: string; className: string }) =>
    sinon.match((candidate: string) => {
      const { schemaName, className } = parseFullClassName(candidate);
      return schemaName === props.schemaName && className === props.className;
    });
  const createBaseClassProps = (props: StubClassFuncProps) => ({
    schema: {
      name: props.schemaName,
    },
    fullName: `${props.schemaName}.${props.className}`,
    name: props.className,
    label: props.classLabel,
    getProperty: async (propertyName: string): Promise<ECProperty | undefined> => {
      if (!props.properties) {
        return undefined;
      }
      return props.properties.find((p) => p.name === propertyName);
    },
    getProperties: async (): Promise<Array<ECProperty>> => props.properties ?? [],
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
    isEntityClass: () => false,
    isRelationshipClass: () => false,
  });
  const stubEntityClass: TStubEntityClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
      isEntityClass: () => true,
    } as unknown as ECEntityClass;
    stub.withArgs(schemas, createFullClassNameMatcher(props)).resolves(res);
    return res;
  };
  const stubRelationshipClass: TStubRelationshipClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
      direction: props.direction ?? "Forward",
      source: props.source ?? { polymorphic: true, abstractConstraint: async () => undefined },
      target: props.target ?? { polymorphic: true, abstractConstraint: async () => undefined },
      isRelationshipClass: () => true,
    } as unknown as ECRelationshipClass;
    stub.withArgs(schemas, createFullClassNameMatcher(props)).resolves(res);
    return res;
  };
  const stubOtherClass: TStubClassFunc = (props) => {
    const res = {
      ...createBaseClassProps(props),
    } as unknown as ECClass;
    stub.withArgs(schemas, createFullClassNameMatcher(props)).resolves(res);
    return res;
  };
  return { stubEntityClass, stubRelationshipClass, stubOtherClass, resetHistory: () => stub.resetHistory(), restore: () => stub.restore() };
}

/** Creates Promise */
export class ResolvablePromise<T> implements Promise<T> {
  private _wrapped: Promise<T>;
  private _resolve!: (value: T) => void;
  public constructor() {
    this._wrapped = new Promise<T>((resolve: (value: T) => void) => {
      this._resolve = resolve;
    });
  }
  public [Symbol.toStringTag] = "ResolvablePromise";
  public async then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | Promise<TResult1>) | undefined | null,
    onRejected?: ((reason: any) => TResult2 | Promise<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return this._wrapped.then(onFulfilled, onRejected);
  }
  public async resolve(result: T) {
    this._resolve(result);
    await new Promise<void>((resolve: () => void) => {
      setImmediate(resolve);
    });
  }
  public async catch<TResult = never>(onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined): Promise<T | TResult> {
    return this._wrapped.catch(onRejected);
  }
  public async finally(onFinally?: (() => void) | null | undefined): Promise<T> {
    return this._wrapped.finally(onFinally);
  }
}

export function createFakeQueryReader(rows: object[]): ECSqlQueryReader {
  return {
    async *[Symbol.asyncIterator](): AsyncIterableIterator<ECSqlQueryRow> {
      for (const row of rows) {
        yield {
          ...row,
          toRow: () => row,
        } as ECSqlQueryRow;
      }
    },
  };
}
