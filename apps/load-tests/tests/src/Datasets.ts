/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";

async function downloadDataset(name: string, downloadUrl: string, localPath: string): Promise<void> {
  console.log(`Downloading "${name}" iModel from "${downloadUrl}"...`);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${name} iModel: ${response.statusText}`);
  }

  await response.body!.pipeTo(fs.WriteStream.toWeb(fs.createWriteStream(localPath)));
}

export async function loadDataSets(datasetsDirPath: string) {
  await fs.promises.mkdir(datasetsDirPath, { recursive: true });

  const datasets = [["Baytown", "https://github.com/imodeljs/desktop-starter/raw/master/assets/Baytown.bim"]].map((entry) => [
    ...entry,
    path.join(datasetsDirPath, `${entry[0]}.bim`),
  ]);

  const datasetPaths = await Promise.all(
    datasets.map(async ([name, url, localPath]) => {
      try {
        await fs.promises.access(localPath, fs.constants.F_OK);
      } catch {
        await downloadDataset(name, url, localPath);
      }
      return path.resolve(localPath);
    }),
  );

  return datasetPaths;
}