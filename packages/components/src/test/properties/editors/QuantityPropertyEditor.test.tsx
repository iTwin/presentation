/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { StandardTypeNames } from "@itwin/appui-abstract";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { FormatterSpec, ParserSpec } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext";
import { QuantityEditorName, QuantityPropertyEditor } from "../../../presentation-components/properties/editors/QuantityPropertyEditor";
import { createTestPropertyRecord } from "../../_helpers/UiComponents";
import { render, waitFor } from "../../TestUtils";

const createRecord = ({ initialValue, quantityType }: { initialValue?: number; quantityType?: string }) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: undefined },
    { typename: StandardTypeNames.Double, quantityType, editor: { name: QuantityEditorName } },
  );
};

describe("<QuantityPropertyEditor />", () => {
  before(() => {
    const formatterSpec = {
      applyFormatting: (raw: number) => `${raw} unit`,
    };
    const parserSpec = {
      parseToQuantityValue: (value: string) => ({ ok: true, value: Number(value.substring(0, value.length - 4)) }),
    };

    sinon.stub(KoqPropertyValueFormatter.prototype, "getFormatterSpec").resolves(formatterSpec as unknown as FormatterSpec);
    sinon.stub(KoqPropertyValueFormatter.prototype, "getParserSpec").resolves(parserSpec as unknown as ParserSpec);

    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged: new BeUiEvent<FormattingUnitSystemChangedArgs>(),
    }));
  });

  after(() => {
    sinon.restore();
  });

  it("renders nothing if property record is not provided", async () => {
    const { container } = render(<QuantityPropertyEditor />);
    expect(container.childElementCount).to.be.eq(0);
  });

  it("renders numeric input if schema context is not available", async () => {
    const record = createRecord({ initialValue: 10 });
    const { getByDisplayValue } = render(<QuantityPropertyEditor propertyRecord={record} />);

    expect(getByDisplayValue("10")).to.not.be.null;
  });

  it("renders quantity input if schema context is available", async () => {
    const record = createRecord({ initialValue: 10, quantityType: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => ({}) as SchemaContext}>
        <QuantityPropertyEditor propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => {
      expect(getByDisplayValue("10 unit")).to.not.be.null;
    });
  });
});
