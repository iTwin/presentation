/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { InstanceKey } from "@itwin/presentation-shared";
import type { RuntimeConfiguration } from "./Configuration.js";

export const CAPTURE_FORMAT_VERSION = 1;

export type ImplementationName = "legacy" | "new";

export type Scenario = { id: "all-elements-descriptor" } | { id: "sampled-elements"; keys: InstanceKey[] };

export interface CaptureEnvelope<
  TDescriptor = unknown,
  TItem = unknown,
  TImplementation extends ImplementationName = ImplementationName,
> {
  captureFormatVersion: number;
  implementation: TImplementation;
  implementationFingerprint: string;
  imodelFingerprint: string;
  scenario: Scenario;
  createdAt: string;
  descriptor: TDescriptor;
  items?: TItem[];
}

export type CaptureMetadata<TImplementation extends ImplementationName = ImplementationName> = Pick<
  CaptureEnvelope<unknown, unknown, TImplementation>,
  "captureFormatVersion" | "implementation" | "implementationFingerprint" | "imodelFingerprint" | "scenario"
>;

export function stableStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, current: unknown) => {
      if (current === undefined) {
        return { $type: "undefined" };
      }
      if (typeof current === "number" && !Number.isFinite(current)) {
        return { $type: "number", value: String(current) };
      }
      if (current && typeof current === "object" && !Array.isArray(current)) {
        return Object.fromEntries(
          Object.entries(current as Record<string, unknown>).sort(([lhs], [rhs]) => lhs.localeCompare(rhs)),
        );
      }
      return current;
    },
    2,
  );
}

export function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function shortFingerprint(fingerprint: string): string {
  return fingerprint.slice(0, 12);
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export function cachePath(props: {
  config: RuntimeConfiguration;
  imodelFingerprint: string;
  implementation: ImplementationName;
  implementationFingerprint: string;
  scenario: Scenario;
}): string {
  const scenarioFingerprint = hashString(stableStringify(props.scenario));
  return path.join(
    props.config.outputDirectory,
    "cache",
    `imodel-${shortFingerprint(props.imodelFingerprint)}`,
    props.implementation,
    `implementation-${shortFingerprint(props.implementationFingerprint)}`,
    `${props.scenario.id}-${shortFingerprint(scenarioFingerprint)}.json`,
  );
}

export function readCapture<TCapture extends CaptureEnvelope>(
  filePath: string,
  expected: CaptureMetadata<TCapture["implementation"]>,
): TCapture | undefined {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    return undefined;
  }
  let capture: TCapture;
  try {
    capture = JSON.parse(fs.readFileSync(filePath, "utf8")) as TCapture;
  } catch (error) {
    throw new Error(`Failed to read cached capture '${filePath}'.`, { cause: error });
  }
  for (const key of [
    "captureFormatVersion",
    "implementation",
    "implementationFingerprint",
    "imodelFingerprint",
  ] as const) {
    if (capture[key] !== expected[key]) {
      throw new Error(`Cached capture '${filePath}' has unexpected ${key}.`);
    }
  }
  if (stableStringify(capture.scenario) !== stableStringify(expected.scenario)) {
    throw new Error(`Cached capture '${filePath}' has an unexpected scenario.`);
  }
  return capture;
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${stableStringify(value)}\n`);
  fs.renameSync(temporaryPath, filePath);
}
