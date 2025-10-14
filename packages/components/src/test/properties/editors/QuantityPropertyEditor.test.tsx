/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { StandardTypeNames } from "@itwin/appui-abstract";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Format, FormatterSpec, ParserSpec } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { SchemaMetadataContextProvider } from "../../../presentation-components/common/SchemaMetadataContext.js";
import { QuantityEditorName, QuantityPropertyEditor } from "../../../presentation-components/properties/editors/QuantityPropertyEditor.js";
import { createTestPropertyRecord } from "../../_helpers/UiComponents.js";
import { render, waitFor } from "../../TestUtils.js";

const createRecord = ({ initialValue, kindOfQuantityName, quantityType }: { initialValue?: number; kindOfQuantityName?: string; quantityType?: string }) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: undefined },
    { typename: StandardTypeNames.Double, kindOfQuantityName, quantityType, editor: { name: QuantityEditorName } },
  );
};

describe("<QuantityPropertyEditor />", () => {
  before(() => {
    const format = new Format("test format");
    const formatterSpec = {
      applyFormatting: (raw: number) => `${raw} unit`,
      format,
    };
    const parserSpec = {
      parseToQuantityValue: (value: string) => ({ ok: true, value: Number(value.substring(0, value.length - 4)) }),
      format,
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

  it("renders quantity input if schema context is available and kindOfQuantityName is provided", async () => {
    const record = createRecord({ initialValue: 10, kindOfQuantityName: "TestKOQ" });
    const { getByDisplayValue } = render(
      <SchemaMetadataContextProvider imodel={{} as IModelConnection} schemaContextProvider={() => ({}) as SchemaContext}>
        <QuantityPropertyEditor propertyRecord={record} />
      </SchemaMetadataContextProvider>,
    );

    await waitFor(() => {
      expect(getByDisplayValue("10 unit")).to.not.be.null;
    });
  });

  it("renders quantity input if schema context is available and quantityType is provided", async () => {
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
