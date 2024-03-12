/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
import { PhysicalElement, StandaloneDb } from "@itwin/core-backend";
import { BisCodeSpec, Code } from "@itwin/core-common";
import { insertPhysicalModelWithPartition } from "./util/IModelUtilities";

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
      createIfMissing("Baytown", datasetsDirPath, getDatasetDownloader("https://github.com/imodeljs/desktop-starter/raw/master/assets/Baytown.bim")),
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

function getDatasetDownloader(downloadUrl: string) {
  return async (name: string, localPath: string) => downloadDataset(name, downloadUrl, localPath);
}

async function downloadDataset(name: string, downloadUrl: string, localPath: string) {
  console.log(`Downloading "${name}" iModel from "${downloadUrl}"...`);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${name} iModel: ${response.statusText}`);
  }

  await response.body!.pipeTo(fs.WriteStream.toWeb(fs.createWriteStream(localPath)));
}

function createLargeFlatIModel(name: string, localPath: string, numElements: number = 10000) {
  const iModel = StandaloneDb.createEmpty(localPath, { rootSubject: { name } });
  const modelId = insertPhysicalModelWithPartition(iModel, "");
  const codeSpec = iModel.codeSpecs.getByName(BisCodeSpec.physicalMaterial);
  for (let i = 0; i < numElements; ++i) {
    const code = new Code({ spec: codeSpec.id, scope: modelId, value: `Element ${i}` });
    iModel.elements.insertElement({ classFullName: PhysicalElement.classFullName, code, model: modelId });
  }
  iModel.close();
}
