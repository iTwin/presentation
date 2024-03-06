/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import * as http from "node:http";
import { Guid } from "@itwin/core-bentley";

const BACKEND_PORT = process.env.BACKEND_DEFAULT_PORT ? Number.parseInt(process.env.BACKEND_DEFAULT_PORT, 10) : 5001;

export class RequestHandler {
  private static readonly _agent = new http.Agent({ keepAlive: true, maxSockets: 10 });

  public static async doRequest(operation: string, body: string) {
    return new Promise((resolve, reject) => {
      const activityId = Guid.createValue();
      let responseBody = "";
      const req = http.request(
        {
          agent: this._agent,
          hostname: "127.0.0.1",
          port: BACKEND_PORT,
          path: createPath(operation),
          method: "post",
          headers: {
            ["x-correlation-id"]: activityId,
            ["content-type"]: "text/plain",
          },
        },
        (response) => {
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            responseBody += chunk;
          });
          response.on("end", () => {
            resolve(JSON.parse(responseBody));
          });
          response.once("error", reject);
        },
      );
      req.once("error", reject);
      req.write(body);
      req.end();
    });
  }
}

function createPath(operation: string) {
  return `/presentation-test-app/v1.0/mode/1/context/00000000-0000-0000-0000-000000000000/imodel/00000000-0000-0000-0000-000000000000/changeset/0/${operation}`;
}
