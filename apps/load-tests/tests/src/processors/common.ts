/* eslint-disable @typescript-eslint/naming-convention */
/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { EventEmitter, ScenarioContext } from "artillery";
import { decompress as brotliDecompress } from "brotli";
import * as http from "node:http";
import * as path from "path";
import { expand, filter, from, mergeAll, mergeMap, of, tap } from "rxjs";
import { Guid, StopWatch } from "@itwin/core-bentley";
import { CheckpointConnection, IModelApp, TileAdmin } from "@itwin/core-frontend";
import {
  BentleyCloudRpcManager,
  ChangesetIndexAndId,
  DbQueryResponse,
  DbResponseKind,
  DbResponseStatus,
  ECSqlReader,
  IModelReadRpcInterface,
  IModelVersion,
} from "@itwin/core-common";
import * as sinon from "sinon";

const config = {
  FASTIFY_BACKEND_PORT: "3001",
  USE_GPB: 1,
  HOST_NAME: "127.0.0.1",
  IMJS_AUTH_TOKEN: `[INSERT AUTH TOKEN WITHOUT "Bearer" keyword]`,
  IMJS_ITWIN_ID: "[INSERT ITWIN ID]",
  IMJS_IMODEL_ID: "[INSERT IMODEL ID]",
  IMJS_CHANGESET_ID: "[INSERT CHANGESET ID]",
  IMJS_CHANGESET_INDEX: 0, // [INSERT CHANGESET INDEX]
  GPB_BACKEND_PORT: "5001",
};
// import { appendFileSync } from "node:fs";

const ENABLE_NODES_LOGGING = false;
const BACKEND_PORT = config.FASTIFY_BACKEND_PORT ? Number.parseInt(config.FASTIFY_BACKEND_PORT, 10) : 3001;
const EMPTY_GUID = Guid.empty;

sinon.stub(IModelApp, "createRenderSys").returns({
  onInitialized() {},
} as any);
sinon.stub(TileAdmin, "create").callsFake(async () => {
  return {} as TileAdmin;
});
sinon.stub(IModelApp, "hubAccess").value({
  async getChangesetFromVersion(): Promise<ChangesetIndexAndId> {
    return {
      index: config.IMJS_CHANGESET_INDEX,
      id: config.IMJS_CHANGESET_ID,
    };
  },
});
sinon.stub(IModelApp, "getAccessToken").callsFake(async () => {
  return `Bearer ${config.IMJS_AUTH_TOKEN}`;
});
sinon.stub(IModelApp, "viewManager").value({
  onSelectionSetChanged() {},
});

const BACKEND_PROPS = config.USE_GPB
  ? {
      httpApi: http,
      agent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
      hostname: config.HOST_NAME,
      port: BACKEND_PORT,
      authToken: config.IMJS_AUTH_TOKEN ?? "<missing auth token>",
      createPath: (operation: string) =>
        `/imodel/rpc/v4/mode/1/context/${config.IMJS_ITWIN_ID ?? EMPTY_GUID}/imodel/${config.IMJS_IMODEL_ID ?? EMPTY_GUID}/changeset/${config.IMJS_CHANGESET_ID ?? ""}/${operation}`,
      imodelRpcProps: () => ({
        iTwinId: config.IMJS_ITWIN_ID,
        iModelId: config.IMJS_IMODEL_ID,
        key: `${config.IMJS_IMODEL_ID ?? EMPTY_GUID}:${config.IMJS_CHANGESET_ID ?? ""}`,
        changeset: { index: config.IMJS_CHANGESET_INDEX, id: config.IMJS_CHANGESET_ID },
      }),
    }
  : {
      httpApi: http,
      agent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
      hostname: "127.0.0.1",
      port: BACKEND_PORT,
      authToken: "",
      createPath: (operation: string) => `/presentation-test-app/v1.0/mode/1/context/${EMPTY_GUID}/imodel/${EMPTY_GUID}/changeset/0/${operation}`,
      imodelRpcProps: (context: ScenarioContext) => ({
        iTwinId: EMPTY_GUID,
        iModelId: EMPTY_GUID,
        key: getCurrentIModelPath(context),
        changeset: { index: 0, id: "" },
      }),
    };

const sessionId = Guid.createValue();
console.log(`session id: ${sessionId}`);

let connection: boolean = false;
let checkpointConnection: CheckpointConnection | undefined;
export async function openIModelConnectionIfNeeded(iTwinId: string, iModelId: string): Promise<CheckpointConnection | undefined> {
  if (!config.USE_GPB || connection) {
    return checkpointConnection;
  }

  await IModelApp.startup({
    rpcInterfaces: [IModelReadRpcInterface],
  });
  BentleyCloudRpcManager.initializeClient(
    { info: { title: "visualization", version: "v4" }, uriPrefix: `http://${config.HOST_NAME}:${config.GPB_BACKEND_PORT}` },
    [IModelReadRpcInterface],
  );
  while (true) {
    try {
      if (checkpointConnection === undefined) {
        checkpointConnection = await CheckpointConnection.openRemote(
          iTwinId,
          iModelId,
          IModelVersion.latest(),
          `http://${config.HOST_NAME}:${config.FASTIFY_BACKEND_PORT}`,
        );
      }

      await new Promise((resolve, reject) => {
        const req = BACKEND_PROPS.httpApi.request(
          {
            agent: BACKEND_PROPS.agent,
            hostname: BACKEND_PROPS.hostname,
            port: config.GPB_BACKEND_PORT,
            path: `${BACKEND_PROPS.createPath("IModelReadRpcInterface-3.6.0-getConnectionProps")}?parameters=W3siaVR3aW5JZCI6IjlmNTQyY2MyLWVlN2EtNGI3Yi04YWU4LWQwNzhiNzFjMDMwNSIsImlNb2RlbElkIjoiNmQ0YTAwMzYtNzAwYS00ODdlLTg2YWUtOTE4NGVlZjkxOGIyIiwiY2hhbmdlc2V0Ijp7ImluZGV4Ijo0LCJpZCI6IjVmM2QwM2YzYzYwMzgzY2NkYzRjNTNmMWJkMThhOWY0Mzk0YTQ5MjMifX1d`,
            method: "get",
            headers: createRequestHeaders(),
          },
          (response) => handleResponse(response, resolve, reject),
        );
        req.once("error", reject);
        req.end();
      });
      connection = true;
      return checkpointConnection;
    } catch (e: any) {
      console.error(`Failed to open iModel connection: ${e.toString()}`);
    }
  }
}
export async function doRequest(operation: string, body: string, events: EventEmitter, reqName: string) {
  return new Promise((resolve, reject) => {
    events.emit("rate", "http.request_rate");
    events.emit("counter", "http.requests", 1);
    events.emit("counter", `itwin.${reqName}.requests`, 1);
    const timer = new StopWatch(undefined, true);
    const req = BACKEND_PROPS.httpApi.request(
      {
        agent: BACKEND_PROPS.agent,
        hostname: BACKEND_PROPS.hostname,
        port: config.GPB_BACKEND_PORT,
        path: BACKEND_PROPS.createPath(operation),
        method: "post",
        headers: createRequestHeaders(),
      },
      (response) =>
        handleResponse(
          response,
          (value) => {
            events.emit("histogram", "http.response_time", timer.current.milliseconds);
            events.emit("histogram", `itwin.${reqName}.response_time`, timer.current.milliseconds);
            resolve(value);
          },
          reject,
        ),
    );
    req.on("socket", (socket) => {
      if (socket.listenerCount("connect") > 0) {
        // only add listeners once
        return;
      }
      socket.on("connect", () => {
        events.emit("histogram", `http.tcp`, timer.current.milliseconds);
      });
    });
    req.once("error", reject);
    req.write(body);
    req.end();
  });
}

export async function runQueryViaIModelConnectionOverEach(events: EventEmitter, createQueryReader: () => ECSqlReader) {
  events.emit("rate", "http.request_rate");
  events.emit("counter", "http.requests", 1);
  events.emit("counter", "itwin.runQuery.requests", 1);
  const timer = new StopWatch(undefined, true);

  const ecsqlReader = createQueryReader();

  const rows = [];
  const meta = await ecsqlReader.getMetaData();
  for await (const row of ecsqlReader) {
    rows.push(row.toArray());
  }

  const time = timer.current.milliseconds;
  events.emit("histogram", "http.response_time", time);
  events.emit("histogram", "itwin.runQuery.response_time", time);
  // appendFileSync("C:\\dev\\notes\\perf-rpc-FBMTS.csv", `,${time}`);
  const dbQueryResp: DbQueryResponse = {
    meta,
    data: rows,
    rowCount: rows.length,
    stats: {
      cpuTime: 0,
      totalTime: 0,
      timeLimit: 0,
      memLimit: 0,
      memUsed: 0,
      prepareTime: 0,
    },
    status: DbResponseStatus.Done,
    kind: DbResponseKind.ECSql,
  };
  return dbQueryResp;
}

function createRequestHeaders() {
  return {
    ["X-Session-Id"]: sessionId,
    ["X-Correlation-Id"]: Guid.createValue(),
    ["Accept-Encoding"]: "br",
    ["Content-Type"]: "text/plain",
    ["Authorization"]: `Bearer ${BACKEND_PROPS.authToken}`,
  };
}
function handleResponse(response: http.IncomingMessage, resolve: (value: any) => void, reject: (reason: any) => void) {
  const chunks: Uint8Array[] = [];
  response.on("data", (chunk) => {
    chunks.push(chunk);
  });
  response.on("end", () => {
    const buffer = Buffer.concat(chunks);
    chunks.length = 0;
    const responseBody = (function () {
      if (response.headers["content-encoding"] === "br") {
        return Buffer.from(brotliDecompress(buffer)).toString("utf8");
      }
      return buffer.toString();
    })();
    if (!response.statusCode || !response.statusCode.toString().startsWith("2")) {
      reject(responseBody);
      return;
    }
    resolve(JSON.parse(responseBody));
  });
  response.once("error", reject);
}

export function getCurrentIModelPath(context: ScenarioContext) {
  return (context.vars.$loopElement as any)[0] as string;
}

export function getCurrentIModelName(context: ScenarioContext) {
  return path.basename(getCurrentIModelPath(context));
}

export async function loadNodes<TNode>(
  context: ScenarioContext,
  events: EventEmitter,
  provider: (parent: TNode | undefined) => Promise<TNode[]>,
  shouldExpand: (node: TNode, index: number) => boolean,
) {
  context.vars.imodelRpcProps = BACKEND_PROPS.imodelRpcProps;

  let nodesCreated = 0;
  await new Promise<void>((resolve, reject) => {
    const hierarchyTimer = new StopWatch(undefined, true);
    const parentNodes = of<TNode | undefined>(undefined);
    parentNodes
      .pipe(
        expand((parentNode) =>
          of(new StopWatch(undefined, true)).pipe(
            mergeMap((timer) => {
              return from(provider(parentNode)).pipe(
                tap((childNodes) => {
                  ENABLE_NODES_LOGGING &&
                    console.log(
                      `Got ${childNodes.length} nodes for parent ${parentNode ? JSON.stringify(parentNode) : "<root>"} in ${timer.current.milliseconds} ms`,
                    );
                  events.emit("histogram", "itwin.nodes_request", timer.current.milliseconds);
                }),
              );
            }),
            mergeAll(),
            filter((node, index) => shouldExpand(node, index)),
          ),
        ),
      )
      .subscribe({
        next() {
          ++nodesCreated;
        },
        complete() {
          ENABLE_NODES_LOGGING && console.log(`Done loading hierarchy in ${hierarchyTimer.current.milliseconds} ms`);
          resolve();
        },
        error(e) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(e);
        },
      });
  });
  console.log(`Total nodes created: ${nodesCreated}`);
}
