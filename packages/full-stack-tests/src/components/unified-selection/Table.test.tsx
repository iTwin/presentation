/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { PropertyRecord } from "@itwin/appui-abstract";
import { PropertyValueRendererManager, UiComponents } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { InstanceKey, KeySet, Ruleset } from "@itwin/presentation-common";
import {
  TableColumnDefinition,
  TableRowDefinition,
  UnifiedSelectionContextProvider,
  usePresentationTableWithUnifiedSelection,
} from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { act, getByText, render, waitFor } from "@testing-library/react";
import { initialize, terminate } from "../../IntegrationTests";
import { ensureTableHasRowsWithCellValues } from "../TableUtils";

/* eslint-disable @typescript-eslint/naming-convention */

describe("Learning snippets", async () => {
  describe("Table", () => {
    before(async () => {
      await initialize();
      await UiComponents.initialize(IModelApp.localization);
    });

    after(async () => {
      await terminate();
    });

    it("renders unified selection table", async function () {
      // __PUBLISH_EXTRACT_START__ Presentation.Components.UnifiedSelection.Table
      function MyTable(props: { imodel: IModelConnection }) {
        // the library provides a variation of `usePresentationTable` that updates table content based
        // on unified selection
        const { columns, rows, isLoading } = usePresentationTableWithUnifiedSelection({
          imodel: props.imodel,
          ruleset,
          pageSize: 10,
          columnMapper: mapTableColumns,
          rowMapper: mapTableRow,
        });

        // don't render anything if the table is loading
        if (isLoading) {
          return null;
        }

        // if we're not loading and still don't have any columns or the columns list is empty - there's nothing
        // to build the table from, which means we probably have nothing selected
        if (!columns || columns.length === 0) {
          return <>Select something to see properties</>;
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

      // cell renderer that uses `PropertyValueRendererManager` to render property values
      function Cell(props: { record: PropertyRecord | undefined }) {
        return <>{props.record ? PropertyValueRendererManager.defaultManager.render(props.record) : null}</>;
      }

      // a function that maps presentation type of column definition to something that table renderer knows how to render
      const mapTableColumns = (columnDefinitions: TableColumnDefinition) => ({
        id: columnDefinitions.name,
        label: columnDefinitions.label,
      });

      // a function that maps presentation type of row definition to something that table renderer knows how to render
      function mapTableRow(rowDefinition: TableRowDefinition) {
        const rowValues: { [cellKey: string]: PropertyRecord } = {};
        rowDefinition.cells.forEach((cell) => {
          rowValues[cell.key] = cell.record;
        });
        return rowValues;
      }
      // __PUBLISH_EXTRACT_END__

      // set up imodel for the test
      let modelKey: InstanceKey;
      const elementKeys: InstanceKey[] = [];
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, (builder) => {
        const categoryKey = insertSpatialCategory({ builder, codeValue: "My Category" });
        modelKey = insertPhysicalModelWithPartition({ builder, codeValue: "My Model" });
        elementKeys.push(
          insertPhysicalElement({ builder, userLabel: "My Element 1", modelId: modelKey.id, categoryId: categoryKey.id }),
          insertPhysicalElement({ builder, userLabel: "My Element 2", modelId: modelKey.id, categoryId: categoryKey.id }),
        );
      });

      function TableWithUnifiedSelection() {
        return (
          // __PUBLISH_EXTRACT_START__ Presentation.Components.UnifiedSelection.TableWithinUnifiedSelectionContext
          <UnifiedSelectionContextProvider imodel={imodel}>
            <MyTable imodel={imodel} />
          </UnifiedSelectionContextProvider>
          // __PUBLISH_EXTRACT_END__
        );
      }

      // render the component
      const { container } = render(<TableWithUnifiedSelection />);

      await waitFor(() => getByText(container, "Select something to see properties"));

      // test Unified Selection -> Table content synchronization
      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([elementKeys[0]])));
      await ensureTableHasRowsWithCellValues(container, "User Label", ["My Element 1"]);

      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([elementKeys[1]])));
      await ensureTableHasRowsWithCellValues(container, "User Label", ["My Element 2"]);

      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([elementKeys[0], elementKeys[1]])));
      await ensureTableHasRowsWithCellValues(container, "User Label", ["My Element 1", "My Element 2"]);

      act(() => Presentation.selection.clearSelection("", imodel));
      await waitFor(() => getByText(container, "Select something to see properties"));

      act(() => Presentation.selection.replaceSelection("", imodel, new KeySet([modelKey])));
      await ensureTableHasRowsWithCellValues(container, "User Label", ["My Element 1", "My Element 2"]);
    });
  });
});

const ruleset: Ruleset = {
  id: "my-table-rules",
  rules: [
    {
      ruleType: "Content",
      condition: `SelectedNode.IsOfClass("Element", "BisCore")`,
      specifications: [
        {
          specType: "SelectedNodeInstances",
        },
      ],
    },
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
