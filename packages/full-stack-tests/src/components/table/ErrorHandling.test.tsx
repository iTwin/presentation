/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";
import { PropertyRecord } from "@itwin/appui-abstract";
import { PropertyValueRendererManager, UiComponents } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { InstanceKey, KeySet, Ruleset } from "@itwin/presentation-common";
import { TableColumnDefinition, TableRowDefinition, usePresentationTable } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { render } from "@testing-library/react";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { ensureHasError, ErrorBoundary } from "../ErrorBoundary";
import { ensureTableHasRowsWithCellValues } from "../TableUtils";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", () => {
  describe("Table", () => {
    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
    });

    after(async () => {
      await terminate();
    });

    it("handles errors", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.Table.ErrorHandling
      /** Props for `MyTable` and `MyProtectedTable` components */
      interface MyTableProps {
        imodel: IModelConnection;
        keys: KeySet;
      }

      /** The actual table component that may throw an error */
      function MyProtectedTable(props: MyTableProps) {
        // the `usePresentationTable` hook requests table data from the backend and maps it to something we
        // can render, it may also throw in certain situations
        const { columns, rows, isLoading } = usePresentationTable({
          imodel: props.imodel,
          ruleset,
          pageSize: 10,
          columnMapper: mapTableColumns,
          rowMapper: mapTableRow,
          keys: props.keys,
        });

        // either loading or nothing to render
        if (isLoading || !columns || !columns.length) {
          return null;
        }

        // render a simple HTML table
        return (
          <table>
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <td key={i}>{col.label}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {columns.map((col, ci) => (
                    <td key={ci}>
                      <Cell record={row[col.id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }

      /** A table component that renders the table within an error boundary */
      function MyTable(props: MyTableProps) {
        // any errors thrown by `MyProtectedTable` will be captured and handled by the error boundary
        return (
          <ErrorBoundary>
            <MyProtectedTable {...props} />
          </ErrorBoundary>
        );
      }

      /** Cell renderer that uses `PropertyValueRendererManager` to render property values */
      function Cell(props: { record: PropertyRecord | undefined }) {
        return <>{props.record ? PropertyValueRendererManager.defaultManager.render(props.record) : null}</>;
      }

      /** A function that maps presentation type of column definition to something that table renderer knows how to render */
      const mapTableColumns = (columnDefinitions: TableColumnDefinition) => ({
        id: columnDefinitions.name,
        label: columnDefinitions.label,
      });

      /** A function that maps presentation type of row definition to something that table renderer knows how to render */
      function mapTableRow(rowDefinition: TableRowDefinition) {
        const rowValues: { [cellKey: string]: PropertyRecord } = {};
        rowDefinition.cells.forEach((cell) => {
          rowValues[cell.key] = cell.record;
        });
        return rowValues;
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      let modelKey: InstanceKey | undefined;
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, async (builder) => {
        const categoryKey = insertSpatialCategory({ builder, label: "My Category" });
        modelKey = insertPhysicalModelWithPartition({ builder, label: "My Model" });
        insertPhysicalElement({ builder, userLabel: "My Element 1", modelId: modelKey.id, categoryId: categoryKey.id });
        insertPhysicalElement({ builder, userLabel: "My Element 2", modelId: modelKey.id, categoryId: categoryKey.id });
      });
      assert(modelKey !== undefined);

      // render the component
      const { container, rerender } = render(<MyTable imodel={imodel} keys={new KeySet([modelKey])} />);
      await ensureTableHasRowsWithCellValues(container, "User Label", ["My Element 1", "My Element 2"]);

      // simulate a network error in RPC request
      sinon.stub(Presentation.presentation, "getContentAndSize").throws(new Error("Network error"));

      // re-render the component, ensure we now get an error
      rerender(<MyTable imodel={imodel} keys={new KeySet([modelKey])} />);
      await ensureHasError(container, "Network error");
    });
  });
});

const ruleset: Ruleset = {
  id: "my-table-rules",
  rules: [
    {
      ruleType: "Content",
      condition: `SelectedNode.IsOfClass("Model", "BisCore")`,
      specifications: [
        {
          specType: "ContentRelatedInstances",
          relationshipPaths: [
            {
              relationship: { schemaName: "BisCore", className: "ModelContainsElements" },
              direction: "Forward",
            },
          ],
        },
      ],
    },
  ],
};
