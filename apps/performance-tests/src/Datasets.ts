/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities/lib/IModelUtils";
import { createIModel } from "./util/IModelUtilities";

const LARGE_FLAT_IMODEL_SIZE = 50_000;
const BAYTOWN_DOWNLOAD_URL = "https://github.com/imodeljs/desktop-starter/raw/master/assets/Baytown.bim";

export class Datasets {
  private static readonly _iModels: { baytown?: string; largeFlat?: string } = {};

  public static get bayTown(): string {
    return this.verifyInitialized(this._iModels.baytown);
  }

  public static get largeFlat(): string {
    return this.verifyInitialized(this._iModels.largeFlat);
  }

  public static async initialize(datasetsDirPath: string) {
    await fs.promises.mkdir(datasetsDirPath, { recursive: true });

    const [baytown, largeFlat] = await Promise.all([
      createIfMissing("Baytown", datasetsDirPath, async (name: string, localPath: string) => downloadDataset(name, BAYTOWN_DOWNLOAD_URL, localPath)),
      createIfMissing("LargeFlat", datasetsDirPath, createLargeFlatIModel),
    ]);

    this._iModels.baytown = baytown;
    this._iModels.largeFlat = largeFlat;
  }

  private static verifyInitialized<T>(arg: T | undefined): T {
    if (arg === undefined) {
      throw new Error("Datasets haven't been initialized. Call initialize() function before accessing the datasets.");
    }
    return arg;
  }
}

async function createIfMissing(name: string, folderPath: string, provider: (name: string, localPath: string) => void | Promise<void>) {
  const localPath = path.join(folderPath, `${name}.bim`);
  try {
    await fs.promises.access(localPath, fs.constants.F_OK);
  } catch {
    await provider(name, localPath);
  }
  return path.resolve(localPath);
}

async function downloadDataset(name: string, downloadUrl: string, localPath: string) {
  console.log(`Downloading "${name}" iModel from "${downloadUrl}"...`);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${name} iModel: ${response.statusText}`);
  }

  await response.body!.pipeTo(fs.WriteStream.toWeb(fs.createWriteStream(localPath)));
}

async function createLargeFlatIModel(name: string, localPath: string) {
  console.log("Creating large flat iModel...");

  await createIModel(name, localPath, (builder) => {
    const { id: categoryId } = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
    const { id: modelId } = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
    for (let i = 0; i < LARGE_FLAT_IMODEL_SIZE; ++i) {
      insertPhysicalElement({
        builder,
        fullClassNameSeparator: ":",
        userLabel: "My Element",
        modelId,
        categoryId,
      });
    }
  });

  console.log("Done!");
}
