/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { EventEmitter, ScenarioContext } from "artillery";
import * as http from "node:http";
import * as path from "path";
import { expand, filter, from, mergeAll, mergeMap, of, tap } from "rxjs";
import { Guid, StopWatch } from "@itwin/core-bentley";

const ENABLE_NODES_LOGGING = false;
const BACKEND_PORT = process.env.BACKEND_DEFAULT_PORT ? Number.parseInt(process.env.BACKEND_DEFAULT_PORT, 10) : 5001;

const agent = new http.Agent({ keepAlive: true, maxSockets: 10 });

export async function doRequest(operation: string, body: string, events: EventEmitter, reqName: string) {
  return new Promise((resolve, reject) => {
    events.emit("rate", "http.request_rate");
    events.emit("counter", "http.requests", 1);
    events.emit("counter", `itwin.${reqName}.requests`, 1);
    const activityId = Guid.createValue();
    const timer = new StopWatch(undefined, true);
    let responseBody = "";
    const req = http.request(
      {
        agent,
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
          events.emit("histogram", "http.response_time", timer.current.milliseconds);
          events.emit("histogram", `itwin.${reqName}.response_time`, timer.current.milliseconds);
          resolve(JSON.parse(responseBody));
        });
        response.once("error", reject);
      },
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

function createPath(operation: string) {
  return `/presentation-test-app/v1.0/mode/1/context/00000000-0000-0000-0000-000000000000/imodel/00000000-0000-0000-0000-000000000000/changeset/0/${operation}`;
}

export function getCurrentIModelPath(context: ScenarioContext) {
  return (context.vars.$loopElement as any)[0] as string;
}

export function getCurrentIModelName(context: ScenarioContext) {
  return path.basename(getCurrentIModelPath(context));
}

export async function loadNodes<TNode>(
  _context: ScenarioContext,
  events: EventEmitter,
  provider: (parent: TNode | undefined) => Promise<TNode[]>,
  nodeHasChildren: (node: TNode) => boolean,
) {
  let nodesCreated = 0;
  await new Promise<void>((resolve, reject) => {
    const parentNodes = of<TNode | undefined>(undefined);
    parentNodes
      .pipe(
        expand(
          (parentNode) =>
            of(new StopWatch(undefined, true)).pipe(
              mergeMap((timer) =>
                from(provider(parentNode)).pipe(
                  tap((childNodes) => {
                    ENABLE_NODES_LOGGING && console.log(`Got ${childNodes.length} nodes for parent ${parentNode ? JSON.stringify(parentNode) : "<root>"}`);
                    events.emit("histogram", "itwin.nodes_request", timer.current.milliseconds);
                  }),
                ),
              ),
              mergeAll(),
              filter((node) => nodeHasChildren(node)),
            ),
          10,
        ),
      )
      .subscribe({
        next() {
          ++nodesCreated;
        },
        complete() {
          ENABLE_NODES_LOGGING && console.log(`Done loading hierarchy`);
          resolve();
        },
        error(e) {
          reject(e);
        },
      });
  });
  console.log(`Total nodes created: ${nodesCreated}`);
}
