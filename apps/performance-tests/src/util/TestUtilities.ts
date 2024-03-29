/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { NodeSelectClauseProps, NodeSelectQueryFactory } from "@itwin/presentation-hierarchies";
import { Datasets, IModelName } from "./Datasets";
import { ProviderOptions, StatelessHierarchyProvider } from "./StatelessHierarchyProvider";

export interface RunOptions<TContext> {
  /** Name of the test. */
  testName: string;

  /** Callback to run before the test that should produce the context required for the test. */
  setup(): TContext | Promise<TContext>;

  /** Test function to run and measure. */
  test(x: TContext): void | Promise<void>;

  /** Callback that cleans up the context produced by the "before" callback. */
  cleanup?: (x: TContext) => void | Promise<void>;

  /** Whether or not to run exclusively this test. */
  only?: boolean;

  /** Whether or not to skip this test. */
  skip?: boolean;
}

/** Runs a test and passes information about it to the TestReporter. */
export function run<T>(props: RunOptions<T>): void {
  if (props.skip) {
    return;
  }

  const testFunc = async function (this: Mocha.Context) {
    let value: T;
    try {
      value = await props.setup();
    } finally {
      this.test!.ctx!.reporter.onTestStart();
    }

    try {
      await props.test(value);
    } finally {
      await this.test!.ctx!.reporter.onTestEnd();
      await props.cleanup?.(value);
    }
  };

  if (props.only) {
    it.only(props.testName, testFunc);
  } else {
    it(props.testName, testFunc);
  }
}

/**
 * Runs a full hierarchy test against a given iModel. The hierarchy is created using the given
 * `fullClassName` and additional `NodeSelectClauseProps`, which allow specifying additional
 * grouping, hiding, etc. parameters.
 */
export function runHierarchyTest(
  testProps: {
    iModelName: IModelName;
    fullClassName?: string;
    nodeSelectProps?: Partial<NodeSelectClauseProps>;
    expectedNodeCount?: number;
  } & Omit<RunOptions<never>, "setup" | "test" | "cleanup">,
) {
  const { iModelName, nodeSelectProps } = testProps;
  run({
    ...testProps,
    setup: (): ProviderOptions => {
      const iModel = SnapshotDb.openFile(Datasets.getIModelPath(iModelName));
      const fullClassName = testProps.fullClassName ?? PhysicalElement.classFullName.replace(":", ".");
      return {
        iModel,
        rowLimit: "unbounded",
        nodeRequestLimit: "unbounded",
        getHierarchyFactory: (metadataProvider) => ({
          async defineHierarchyLevel(props) {
            if (props.parentNode) {
              return [];
            }

            const query = new NodeSelectQueryFactory(metadataProvider);
            return [
              {
                fullClassName,
                query: {
                  ecsql: `
                    SELECT ${await query.createSelectClause({
                      ...nodeSelectProps,
                      ecClassId: nodeSelectProps?.ecClassId ?? { selector: `this.ECClassId` },
                      ecInstanceId: nodeSelectProps?.ecInstanceId ?? { selector: `this.ECInstanceId` },
                      nodeLabel: nodeSelectProps?.nodeLabel ?? { selector: `this.UserLabel` },
                    })}
                    FROM ${fullClassName} AS this
                  `,
                },
              },
            ];
          },
        }),
      };
    },
    test: async (props) => {
      const provider = new StatelessHierarchyProvider(props);
      const nodeCount = await provider.loadHierarchy();
      if (testProps.expectedNodeCount !== undefined) {
        expect(nodeCount).to.eq(testProps.expectedNodeCount);
      }
    },
    cleanup: ({ iModel }) => iModel.close(),
  });
}
