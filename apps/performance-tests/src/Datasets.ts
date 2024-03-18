/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { createIModel } from "./util/IModelUtilities";

export const IMODEL_NAMES = ["baytown", "50k elements"] as const;
export type IModelName = (typeof IMODEL_NAMES)[number];
export type IModelPathsMap = { [_ in IModelName]?: string };

const BAYTOWN_DOWNLOAD_URL = "https://github.com/imodeljs/desktop-starter/raw/master/assets/Baytown.bim";

export class Datasets {
  private static readonly _iModels: IModelPathsMap = {};

  public static readonly CUSTOM_SCHEMA = {
    schemaName: "PerformanceTests",
    defaultClassName: "PerformanceTests",
    baseClassName: "Base_PerformanceTests",
    defaultUserLabel: "Element",
    customPropName: "PropX",
    defaultPropertyValue: "PropertyValue",
    itemsPerGroup: 100,
  };

  public static getIModelPath(name: IModelName): string {
    return this.verifyInitialized(this._iModels[name]);
  }

  public static async initialize(datasetsDirPath: string) {
    await fs.promises.mkdir(datasetsDirPath, { recursive: true });
    const promises = IMODEL_NAMES.map(async (key) => {
      if (key === "baytown") {
        this._iModels[key] = await this.createIModel(key, datasetsDirPath, async (name: string, localPath: string) =>
          this.downloadDataset(name, BAYTOWN_DOWNLOAD_URL, localPath),
        );
        return;
      }

      const count = 1000 * Number.parseInt(/(\d+)k elements/.exec(key)![1], 10);
      const iModelPath = await this.createIModel(
        key,
        datasetsDirPath,
        async (name: string, localPath: string) => this.createFlatIModel(name, localPath, count),
        !!process.env.RECREATE,
      );
      this._iModels[key] = iModelPath;
    });
    await Promise.all(promises);
  }

  private static verifyInitialized<T>(arg: T | undefined): T {
    if (arg === undefined) {
      throw new Error("Datasets haven't been initialized. Call initialize() function before accessing the datasets.");
    }
    return arg;
  }

  private static async createIModel(name: string, folderPath: string, provider: (name: string, localPath: string) => void | Promise<void>, force?: boolean) {
    const localPath = path.join(folderPath, `${name}.bim`);
    if (force) {
      await provider(name, localPath);
      return path.resolve(localPath);
    }

    try {
      await fs.promises.access(localPath, fs.constants.F_OK);
    } catch {
      await provider(name, localPath);
    }
    return path.resolve(localPath);
  }

  private static async downloadDataset(name: string, downloadUrl: string, localPath: string) {
    console.log(`Downloading "${name}" iModel from "${downloadUrl}"...`);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${name} iModel: ${response.statusText}`);
    }

    await response.body!.pipeTo(fs.WriteStream.toWeb(fs.createWriteStream(localPath)));
  }

  private static async createFlatIModel(name: string, localPath: string, numElements: number) {
    console.log(`${numElements} elements: Creating...`);

    const elementsPerGroup = 100;
    const numGroups = numElements / elementsPerGroup;
    const { defaultClassName, customPropName, schemaName, defaultUserLabel, defaultPropertyValue, baseClassName } = this.CUSTOM_SCHEMA;

    // prettier-ignore
    const schema = `
      <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
      <ECEntityClass typeName="${baseClassName}">
        <BaseClass>bis:PhysicalElement</BaseClass>
        <ECProperty propertyName="${customPropName}" typeName="string" />
      </ECEntityClass>
      ${[...Array(numGroups).keys()].map((i) => `
        <ECEntityClass typeName="${defaultClassName}_${i}">
          <BaseClass>${baseClassName}</BaseClass>
        </ECEntityClass>
      `).join("")}
    `;

    await createIModel(name, localPath, async (builder) => {
      await builder.importSchema(schemaName, schema);
      const { id: categoryId } = insertSpatialCategory({ builder, fullClassNameSeparator: ":", codeValue: "My Category" });
      const { id: modelId } = insertPhysicalModelWithPartition({ builder, fullClassNameSeparator: ":", codeValue: "My Model" });
      for (let groupIdx = 0; groupIdx < numGroups; ++groupIdx) {
        for (let j = 0; j < elementsPerGroup; ++j) {
          insertPhysicalElement({
            builder,
            classFullName: `${schemaName}:${defaultClassName}_${groupIdx}`,
            fullClassNameSeparator: ":",
            userLabel: `${defaultUserLabel}_${groupIdx}`,
            modelId,
            categoryId,
            [customPropName]: `${defaultPropertyValue}_${groupIdx}`,
          });
        }
      }
    });

    console.log(`${numElements} elements: Done.`);
  }
}
