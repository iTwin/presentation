/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";
import { FieldDescriptor, SortDirection } from "@itwin/presentation-common";
import { TableColumnDefinition } from "./Types";

/** @internal */
export interface UseTableOptionsProps {
  columns: TableColumnDefinition[] | undefined;
}

/** @internal */
export interface TableOptions {
  sorting?: {
    field: FieldDescriptor;
    direction: SortDirection;
  };
  fieldsFilterExpression?: string;
}

/** @internal */
export interface UseTableOptionsResult {
  options: TableOptions;
  sort: (columnName?: string, descending?: boolean) => void;
  filter: (filterExpression?: string) => void;
}

/** @internal */
export function useTableOptions(props: UseTableOptionsProps): UseTableOptionsResult {
  const { columns } = props;
  const [options, setOptions] = useState<TableOptions>({});

  useEffect(() => {
    setOptions({});
  }, [columns]);

  const sort = useCallback(
    (columnName?: string, descending?: boolean) => {
      const field = columns?.find((column) => column.name === columnName)?.field;
      if (!field) {
        setOptions((prev) => ({ ...prev, sorting: undefined }));
        return;
      }

      setOptions((prev) => ({
        ...prev,
        sorting: {
          field: field.getFieldDescriptor(),
          direction: descending ? SortDirection.Descending : SortDirection.Ascending,
        },
      }));
    },
    [columns],
  );

  const filter = useCallback((filterExpression?: string) => {
    setOptions((prev) => ({ ...prev, fieldsFilterExpression: filterExpression }));
  }, []);

  return { options, sort, filter };
}
