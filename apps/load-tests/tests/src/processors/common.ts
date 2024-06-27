/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { EventEmitter, ScenarioContext } from "artillery";
import { decompress as brotliDecompress } from "brotli";
import * as http from "node:http";
import * as https from "node:https";
import * as path from "path";
import { expand, filter, from, mergeAll, mergeMap, of, tap } from "rxjs";
import { Guid, StopWatch } from "@itwin/core-bentley";

const ENABLE_NODES_LOGGING = false;
const BACKEND_PORT = process.env.BACKEND_DEFAULT_PORT ? Number.parseInt(process.env.BACKEND_DEFAULT_PORT, 10) : 5001;
const EMPTY_GUID = Guid.empty;

const BACKEND_PROPS = process.env.USE_GPB
  ? {
      httpApi: https,
      agent: new https.Agent({ keepAlive: true, maxSockets: 10 }),
      hostname: "qa-api.bentley.com",
      port: 443,
      authToken: process.env.IMJS_AUTH_TOKEN ?? "<missing auth token>",
      createPath: (operation: string) =>
        `/imodel/rpc/v4/mode/1/context/${process.env.IMJS_ITWIN_ID ?? EMPTY_GUID}/imodel/${process.env.IMJS_IMODEL_ID ?? EMPTY_GUID}/changeset/${process.env.IMJS_CHANGESET_ID ?? ""}/${operation}`,
      imodelRpcProps: () => ({
        iTwinId: process.env.IMJS_ITWIN_ID,
        iModelId: process.env.IMJS_IMODEL_ID,
        key: `${process.env.IMJS_IMODEL_ID ?? EMPTY_GUID}:${process.env.IMJS_CHANGESET_ID ?? ""}`,
        changeset: { index: process.env.IMJS_CHANGESET_INDEX, id: process.env.IMJS_CHANGESET_ID },
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
export async function openIModelConnectionIfNeeded() {
  if (!process.env.USE_GPB || connection) {
    return;
  }

  while (!connection) {
    try {
      await new Promise((resolve, reject) => {
        const req = BACKEND_PROPS.httpApi.request(
          {
            agent: BACKEND_PROPS.agent,
            hostname: BACKEND_PROPS.hostname,
            port: BACKEND_PROPS.port,
            path: `${BACKEND_PROPS.createPath("IModelReadRpcInterface-3.6.0-getConnectionProps")}?parameters=W3siaVR3aW5JZCI6Ijg5MmFhMmM5LTViZTgtNDg2NS05ZjM3LTdkNGM3ZTc1ZWJiZiIsImlNb2RlbElkIjoiZWQwYzQwOGItYWRkMi00OTZlLWFjNTgtNWE3ZTg1M2NiYzBiIiwiY2hhbmdlc2V0Ijp7ImluZGV4Ijo2OSwiaWQiOiIyN2JlMTZkOTU5NjQ1OTg1ZmNhODBjZmY1MDJiZDIzN2I4MmYwZjg0In19XQ==`,
            method: "get",
            headers: createRequestHeaders(),
          },
          (response) => handleResponse(response, resolve, reject),
        );
        req.once("error", reject);
        req.end();
      });
      connection = true;
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
        port: BACKEND_PROPS.port,
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
          reject(e);
        },
      });
  });
  console.log(`Total nodes created: ${nodesCreated}`);
}
