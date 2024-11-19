/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as path from "path";
import { IModelHost, SnapshotDb } from "@itwin/core-backend";
import { IModelConnectionProps, RpcManager } from "@itwin/core-common";
import { SampleRpcInterface } from "@test-app/common";

/** The backend implementation of SampleRpcInterface. */
export default class SampleRpcImpl extends SampleRpcInterface {
  private getAssetsDir(): string {
    if (IModelHost.appAssetsDir) {
      return IModelHost.appAssetsDir;
    }
    return "assets";
  }

  public override async getSampleImodels(): Promise<string[]> {
    const dir = path.join(this.getAssetsDir(), "sample_documents");
    const files = fs.readdirSync(dir);
    return files.filter((name) => name.endsWith(".ibim") || name.endsWith(".bim")).map((name) => path.resolve(dir, name));
  }

  public override async getAvailableRulesets(): Promise<string[]> {
    const extensions = [".PresentationRuleSet.xml", ".PresentationRuleSet.json"];
    const dir = path.join(this.getAssetsDir(), "presentation_rules");
    const files = fs.readdirSync(dir);
    return files
      .filter((fullPath) => extensions.some((ext) => fullPath.endsWith(ext)))
      .map((fullPath) => extensions.reduce((name, ext) => path.basename(name, ext), fullPath));
  }

  public override async getConnectionProps(imodelPath: string): Promise<IModelConnectionProps> {
    const db = SnapshotDb.openFile(imodelPath);
    // eslint-disable-next-line @itwin/no-internal
    return db.getConnectionProps();
  }

  public override async closeConnection(imodelPath: string): Promise<void> {
    SnapshotDb.findByFilename(imodelPath)?.close();
  }

  public override async getRssFeed({ url }: { url: string }): Promise<string> {
    return fetch(url).then(async (response) => response.text());
  }
}

/** Auto-register the impl when this file is included. */
RpcManager.registerImpl(SampleRpcInterface, SampleRpcImpl);
