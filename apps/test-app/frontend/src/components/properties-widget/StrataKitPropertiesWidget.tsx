/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyCategory } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { PresentationPropertyDataProvider, usePropertyDataProviderWithUnifiedSelection } from "@itwin/presentation-components";
import { Text } from "@stratakit/bricks";
import { unstable_AccordionItem as AccordionItem } from "@stratakit/structures";
import { MyAppFrontend } from "../../api/MyAppFrontend";

export interface Props {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function StrataPropertiesWidget(props: Props) {
  const { imodel, rulesetId } = props;
  const [dataProvider, setDataProvider] = useState<PresentationPropertyDataProvider>();

  useEffect(() => {
    if (!rulesetId) {
      setDataProvider(undefined);
      return;
    }

    const provider = new PresentationPropertyDataProvider({ imodel, ruleset: rulesetId });
    setDataProvider(provider);
    return () => {
      provider[Symbol.dispose]();
    };
  }, [imodel, rulesetId]);

  if (!dataProvider) {
    return null;
  }
  return <StrataProperties dataProvider={dataProvider} />;
}

function StrataProperties({ dataProvider }: { dataProvider: PresentationPropertyDataProvider }) {
  const [propertyData, setPropertyData] = useState<CategorizedProperties[]>();
  usePropertyDataProviderWithUnifiedSelection({
    dataProvider,
    selectionStorage: MyAppFrontend.selectionStorage,
  });

  useEffect(() => {
    let disposed = false;
    async function getData() {
      const data = await dataProvider.getData();
      if (!disposed) {
        setPropertyData(categorizeProperties(data.categories, data.records));
      }
    }
    void getData();
    const listener = dataProvider.onDataChanged.addListener(() => {
      void getData();
    });
    return () => {
      listener();
      disposed = true;
    };
  }, [dataProvider]);

  if (!propertyData) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: 4 }}>
      <CategoryProperties data={propertyData} />
    </div>
  );
}

function CategoryProperties({ data }: { data: CategorizedProperties[] }) {
  if (data.length === 0) {
    return null;
  }

  return data.map((c) => (
    <AccordionItem.Root key={c.category.name}>
      <AccordionItem.Header>
        <AccordionItem.Button>
          <AccordionItem.Label>{c.category.label}</AccordionItem.Label>
        </AccordionItem.Button>
        <AccordionItem.Marker />
      </AccordionItem.Header>
      <AccordionItem.Content>
        <Properties data={c.properties} />
        <CategoryProperties data={c.childCategories} />
      </AccordionItem.Content>
    </AccordionItem.Root>
  ));
}

function Properties({ data }: { data: PropertyRecord[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {data.map((p) => {
        if (p.value.valueFormat !== PropertyValueFormat.Primitive) {
          return null;
        }

        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 4 }} key={p.property.name}>
            <Text variant="body-md">{p.property.displayLabel}</Text>
            <Text variant="body-md">{p.value.displayValue}</Text>
          </div>
        );
      })}
    </div>
  );
}

interface CategorizedProperties {
  category: { name: string; label: string };
  properties: PropertyRecord[];
  childCategories: CategorizedProperties[];
}

function categorizeProperties(categories: PropertyCategory[], properties: { [category: string]: PropertyRecord[] }): CategorizedProperties[] {
  const categorizedProperties: CategorizedProperties[] = [];

  for (const category of categories) {
    categorizedProperties.push({
      category,
      properties: properties[category.name] ?? [],
      childCategories: categorizeProperties(category.childCategories ?? [], properties),
    });
  }

  return categorizedProperties;
}
