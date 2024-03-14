/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelDb, PhysicalElement, SnapshotDb } from "@itwin/core-backend";
import { IMetadataProvider, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { Datasets } from "./Datasets";
import { ProviderOptions, StatelessHierarchyProvider } from "./StatelessHierarchyProvider";
import { run } from "./util/TestUtilities";

describe("models tree", () => {
  const getHierarchyFactory = (metadataProvider: IMetadataProvider) => new ModelsTreeDefinition({ metadataProvider });
  let iModel: IModelDb;

  beforeEach(() => {
    iModel = SnapshotDb.openFile(Datasets.getIModelPath("baytown"));
  });

  afterEach(() => iModel.close());

  run("initial (Baytown)", async () => {
    const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
    await provider.loadInitialHierarchy();
  });

  run("full (Baytown)", async () => {
    const provider = new StatelessHierarchyProvider({ iModel, getHierarchyFactory });
    await provider.loadFullHierarchy();
  });
});

run("flat 50k elements list", {
  setup: (): ProviderOptions => {
    const iModel = SnapshotDb.openFile(Datasets.getIModelPath("50k elements"));
    const className = PhysicalElement.classFullName.replace(":", ".");
    return {
      iModel,
      rowLimit: "unbounded",
      getHierarchyFactory: (metadataProvider) => ({
        async defineHierarchyLevel(props) {
          if (props.parentNode) {
            return [];
          }

          const query = new NodeSelectQueryFactory(metadataProvider);
          return [
            {
              fullClassName: className,
              query: {
                ecsql: `
                  SELECT ${await query.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.UserLabel` },
                  })}
                  FROM ${className} AS this
                `,
              },
            },
          ];
        },
      }),
    };
  },
  test: async (providerProps) => {
    const provider = new StatelessHierarchyProvider(providerProps);
    await provider.loadFullHierarchy();
  },
  cleanup: ({ iModel }) => iModel.close(),
});
