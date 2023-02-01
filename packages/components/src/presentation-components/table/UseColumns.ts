/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { DefaultContentDisplayTypes, Descriptor, Field, KeySet, Ruleset } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { ColumnDefinition } from "./Types";

export interface UseColumnsProps {
  imodel: IModelConnection;
  ruleset: Ruleset | string;
  keys: KeySet;
}

export function useColumns(props: UseColumnsProps): ColumnDefinition[] | undefined {
  const { imodel, ruleset, keys } = props;
  const [columns, setColumns] = useState<ColumnDefinition[]>();

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

async function loadColumns(imodel: IModelConnection, ruleset: Ruleset | string, keys: KeySet): Promise<ColumnDefinition[] | undefined> {
  const descriptor = await Presentation.presentation.getContentDescriptor({
    imodel,
    rulesetOrId: ruleset,
    displayType: DefaultContentDisplayTypes.Grid,
    keys,
  });

  return descriptor ? createColumns(descriptor) : undefined;
}

function createColumns(descriptor: Descriptor): ColumnDefinition[] {
  return descriptor.fields.flatMap(convertFieldToColumns);
}

function convertFieldToColumns(field: Field): ColumnDefinition[] {
  return field.isPropertiesField() ? [createColumnDefinition(field)] : [];
}

function createColumnDefinition(field: Field): ColumnDefinition {
  return {
    name: field.name,
    label: field.label,
    field,
  };
}
