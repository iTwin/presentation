/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyValueFormat } from "@itwin/appui-abstract";
import { CAPTURE_FORMAT_VERSION } from "../Persistence.js";

import type { PropertyRecord } from "@itwin/appui-abstract";
import type { PropertyCategory, PropertyData } from "@itwin/components-react";
import type { InstanceKey } from "@itwin/presentation-shared";
import type { CaptureEnvelope, ImplementationName, SampledElementsPropertyGridScenario } from "../Persistence.js";

/** The parts of a `PropertyDescription` a property grid uses to render a record. */
export interface CapturedPropertyDescription {
  name: string;
  displayLabel: string;
  typename: string;
  kindOfQuantityName?: string;
  enum?: { isStrict?: boolean; choices: Array<{ label: string; value: string | number }> };
}

export type CapturedPropertyValue =
  | { valueFormat: "primitive"; value?: unknown; displayValue?: string }
  | { valueFormat: "struct"; members: Record<string, CapturedPropertyRecord> }
  | { valueFormat: "array"; itemsTypeName: string; items: CapturedPropertyRecord[] };

/** A JSON-serializable `PropertyRecord`. */
export interface CapturedPropertyRecord {
  property: CapturedPropertyDescription;
  value: CapturedPropertyValue;
  isMerged?: boolean;
}

export interface CapturedPropertyCategory {
  name: string;
  label: string;
  childCategories: CapturedPropertyCategory[];
}

/** A JSON-serializable `PropertyData`. */
export interface CapturedPropertyData {
  label: CapturedPropertyRecord;
  description?: string;
  categories: CapturedPropertyCategory[];
  records: Record<string, CapturedPropertyRecord[]>;
}

export interface CapturedPropertyGridItem {
  primaryKey: InstanceKey;
  data: CapturedPropertyData;
}

export type PropertyGridCapture<TImplementation extends ImplementationName = ImplementationName> = Omit<
  CaptureEnvelope<TImplementation>,
  "scenario"
> & { scenario: SampledElementsPropertyGridScenario; items: CapturedPropertyGridItem[] };

async function captureDescription(record: PropertyRecord): Promise<CapturedPropertyDescription> {
  const { name, displayLabel, typename, kindOfQuantityName } = record.property;
  const enumInfo = record.property.enum;
  return {
    name,
    displayLabel,
    typename,
    ...(kindOfQuantityName !== undefined ? { kindOfQuantityName } : undefined),
    ...(enumInfo
      ? {
          enum: {
            ...(enumInfo.isStrict !== undefined ? { isStrict: enumInfo.isStrict } : undefined),
            choices: (await enumInfo.choices).map(({ label, value }) => ({ label, value })),
          },
        }
      : undefined),
  };
}

async function captureValue(record: PropertyRecord): Promise<CapturedPropertyValue> {
  const { value } = record;
  switch (value.valueFormat) {
    case PropertyValueFormat.Primitive:
      return {
        valueFormat: "primitive",
        value: value.value,
        ...(value.displayValue !== undefined ? { displayValue: value.displayValue } : undefined),
      };
    case PropertyValueFormat.Struct:
      return {
        valueFormat: "struct",
        members: Object.fromEntries(
          await Promise.all(
            Object.entries(value.members).map(async ([name, member]) => [name, await captureRecord(member)] as const),
          ),
        ),
      };
    case PropertyValueFormat.Array:
      return {
        valueFormat: "array",
        itemsTypeName: value.itemsTypeName,
        items: await Promise.all(value.items.map(captureRecord)),
      };
  }
}

async function captureRecord(record: PropertyRecord): Promise<CapturedPropertyRecord> {
  return {
    property: await captureDescription(record),
    value: await captureValue(record),
    ...(record.isMerged ? { isMerged: true } : undefined),
  };
}

function captureCategory(category: PropertyCategory): CapturedPropertyCategory {
  return {
    name: category.name,
    label: category.label,
    childCategories: (category.childCategories ?? []).map(captureCategory),
  };
}

/** Converts `PropertyData` to a lossless, JSON-serializable form, so it can be cached and compared. */
export async function capturePropertyData(data: PropertyData): Promise<CapturedPropertyData> {
  return {
    label: await captureRecord(data.label),
    ...(data.description !== undefined ? { description: data.description } : undefined),
    categories: data.categories.map(captureCategory),
    records: Object.fromEntries(
      await Promise.all(
        Object.entries(data.records).map(
          async ([categoryName, records]) => [categoryName, await Promise.all(records.map(captureRecord))] as const,
        ),
      ),
    ),
  };
}

export function createPropertyGridCapture<TImplementation extends ImplementationName>(props: {
  implementation: TImplementation;
  implementationFingerprint: string;
  imodelFingerprint: string;
  scenario: SampledElementsPropertyGridScenario;
  items: CapturedPropertyGridItem[];
}): PropertyGridCapture<TImplementation> {
  return {
    captureFormatVersion: CAPTURE_FORMAT_VERSION,
    implementation: props.implementation,
    implementationFingerprint: props.implementationFingerprint,
    imodelFingerprint: props.imodelFingerprint,
    scenario: props.scenario,
    createdAt: new Date().toISOString(),
    items: props.items,
  };
}
