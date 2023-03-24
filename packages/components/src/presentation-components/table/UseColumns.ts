/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import { useEffect, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { DefaultContentDisplayTypes, Descriptor, Field, KeySet, Ruleset } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { TableColumnDefinition } from "./Types";

/** @internal */
export interface UseColumnsProps {
  imodel: IModelConnection;
  ruleset: Ruleset | string;
  keys: Readonly<KeySet>;
}

/** @internal */
export function useColumns(props: UseColumnsProps): TableColumnDefinition[] | undefined {
  const { imodel, ruleset, keys } = props;
  const [columns, setColumns] = useState<TableColumnDefinition[]>();

  useEffect(() => {
    let disposed = false;
    if (keys.isEmpty) {
      setColumns([]);
      return;
    }

    void (async () => {
      const columnDefinitions = await loadColumns(imodel, ruleset, keys);
      // istanbul ignore else
      if (!disposed)
        setColumns(columnDefinitions ?? []);
    })();

    return () => {disposed=true;};
  }, [imodel, ruleset, keys]);

  return columns;
}

async function loadColumns(imodel: IModelConnection, ruleset: Ruleset | string, keys: Readonly<KeySet>): Promise<TableColumnDefinition[] | undefined> {
  const descriptor = await Presentation.presentation.getContentDescriptor({
    imodel,
    rulesetOrId: ruleset,
    displayType: DefaultContentDisplayTypes.Grid,
    keys: new KeySet(keys),
  });

  return descriptor ? createColumns(descriptor) : undefined;
}

function createColumns(descriptor: Descriptor): TableColumnDefinition[] {
  return descriptor.fields.flatMap(convertFieldToColumns);
}

function convertFieldToColumns(field: Field): TableColumnDefinition[] {
  return field.isPropertiesField() ? [createTableColumnDefinition(field)] : [];
}

function createTableColumnDefinition(field: Field): TableColumnDefinition {
  return {
    name: field.name,
    label: field.label,
    field,
  };
}
