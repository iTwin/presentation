/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module Properties
 */

import { Primitives, PrimitiveValue, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { IPropertyValueRenderer, PropertyValueRendererContext, TypeConverterManager, useAsyncValue } from "@itwin/components-react";
import { Anchor } from "@itwin/itwinui-react";
import { useOptionalUnifiedSelectionContext } from "../common/UnifiedSelection.js";
import { translate, WithIModelKey } from "../common/Utils.js";
import { useUnifiedSelectionContext as useDeprecatedUnifiedSelectionContext } from "../unified-selection/UnifiedSelectionContext.js";

/**
 * Property value renderer for instance keys. If application provides a [[UnifiedSelectionContext]] and this value is
 * clicked, the current selection is replaced with the instance pointed by the key. The selection changes at the default
 * selection level as provided by the context.
 * @public
 */
export class InstanceKeyValueRenderer implements IPropertyValueRenderer {
  public canRender(record: PropertyRecord) {
    return record.value.valueFormat === PropertyValueFormat.Primitive && (record.value.value === undefined || isInstanceKey(record.value.value));
  }

  public render(record: PropertyRecord, context?: PropertyValueRendererContext) {
    return <InstanceKeyValueRendererImpl record={record} context={context} />;
  }
}

interface InstanceKeyValueRendererImplProps {
  record: WithIModelKey<PropertyRecord>;
  context?: PropertyValueRendererContext;
}

const InstanceKeyValueRendererImpl: React.FC<InstanceKeyValueRendererImplProps> = (props) => {
  const stringValue = useAsyncValue(convertRecordToString(props.record));
  const valueElement = stringValue ?? props.context?.defaultValue;

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const deprecatedSelectionContext = useDeprecatedUnifiedSelectionContext();
  const selectionContext = useOptionalUnifiedSelectionContext();

  const instanceKey = (props.record.value as PrimitiveValue).value as Primitives.InstanceKey | undefined;
  if (instanceKey) {
    let handleClick: (() => void) | undefined;
    if (deprecatedSelectionContext) {
      handleClick = () => deprecatedSelectionContext.replaceSelection([instanceKey]);
    } else if (selectionContext && props.record.imodelKey?.length) {
      const imodelKey = props.record.imodelKey;
      handleClick = () => selectionContext.storage.replaceSelection({ imodelKey, source: "InstanceKeyValueRenderer", selectables: [instanceKey] });
    }
    if (handleClick) {
      return (
        <Anchor title={translate("instance-key-value-renderer.select-instance")} onClick={handleClick}>
          {valueElement}
        </Anchor>
      );
    }
  }

  return (
    <span style={props.context?.style} title={stringValue}>
      {valueElement}
    </span>
  );
};

function isInstanceKey(value: Primitives.Value): value is Primitives.InstanceKey {
  const { className, id } = value as Primitives.InstanceKey;
  return typeof className === "string" && typeof id === "string";
}

function convertRecordToString(record: PropertyRecord): string | Promise<string> {
  const primitive = record.value as PrimitiveValue;
  return (
    primitive.displayValue ??
    TypeConverterManager.getConverter(record.property.typename, record.property.converter?.name).convertPropertyToString(record.property, primitive.value)
  );
}
