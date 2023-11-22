/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module Properties
 */

import { PropertyRecord } from "@itwin/appui-abstract";
import {
  IContentVisitor,
  ProcessFieldHierarchiesProps,
  ProcessMergedValueProps,
  ProcessPrimitiveValueProps,
  StartArrayProps,
  StartCategoryProps,
  StartContentProps,
  StartFieldProps,
  StartItemProps,
  StartStructProps,
} from "@itwin/presentation-common";
import { FieldHierarchyRecord, InternalPropertyRecordsBuilder } from "./ContentBuilder";

/**
 * A `Content` visitor that traverses all content, creates a `PropertyRecord` for each property
 * and streams them into the given callback function.
 *
 * @public
 */
export class PropertyRecordsBuilder implements IContentVisitor {
  private _internal: InternalPropertyRecordsBuilder;

  public constructor(visitPropertyRecord: (record: PropertyRecord) => void) {
    this._internal = new InternalPropertyRecordsBuilder((item) => ({
      item,
      append(entry: FieldHierarchyRecord) {
        visitPropertyRecord(entry.record);
      },
    }));
  }

  public startContent(props: StartContentProps): boolean {
    return this._internal.startContent(props);
  }
  public finishContent(): void {
    return this._internal.finishContent();
  }

  public startItem(props: StartItemProps): boolean {
    return this._internal.startItem(props);
  }
  public finishItem(): void {
    return this._internal.finishItem();
  }

  public processFieldHierarchies(props: ProcessFieldHierarchiesProps): void {
    return this._internal.processFieldHierarchies(props);
  }

  public startCategory(props: StartCategoryProps): boolean {
    return this._internal.startCategory(props);
  }
  public finishCategory(): void {
    return this._internal.finishCategory();
  }

  public startField(props: StartFieldProps): boolean {
    return this._internal.startField(props);
  }
  public finishField(): void {
    return this._internal.finishField();
  }

  public startStruct(props: StartStructProps): boolean {
    return this._internal.startStruct(props);
  }
  public finishStruct(): void {
    return this._internal.finishStruct();
  }

  public startArray(props: StartArrayProps): boolean {
    return this._internal.startArray(props);
  }
  public finishArray(): void {
    return this._internal.finishArray();
  }

  public processMergedValue(props: ProcessMergedValueProps): void {
    return this._internal.processMergedValue(props);
  }

  public processPrimitiveValue(props: ProcessPrimitiveValueProps): void {
    return this._internal.processPrimitiveValue(props);
  }
}
