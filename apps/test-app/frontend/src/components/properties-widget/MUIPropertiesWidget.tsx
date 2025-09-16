/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyCategory } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { PresentationPropertyDataProvider, usePropertyDataProviderWithUnifiedSelection } from "@itwin/presentation-components";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Grid, Input, InputLabel, Typography } from "@mui/material";
import { MyAppFrontend } from "../../api/MyAppFrontend";

export interface Props {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function MUIPropertiesWidget(props: Props) {
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
  return <MUIProperties dataProvider={dataProvider} />;
}

function MUIProperties({ dataProvider }: { dataProvider: PresentationPropertyDataProvider }) {
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
    <Accordion key={c.category.name} title={c.category.label}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>{c.category.label}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Properties data={c.properties} />
        <CategoryProperties data={c.childCategories} />
      </AccordionDetails>
    </Accordion>
  ));
}

function Properties({ data }: { data: PropertyRecord[] }) {
  return (
    <Grid container spacing={2} columns={12}>
      {data.map((p) => {
        if (p.value.valueFormat !== PropertyValueFormat.Primitive) {
          return null;
        }

        const inputId = `input-${p.property.name}`;
        return (
          <Grid container key={p.property.name} size={12} direction={"row"}>
            <Grid size={4}>
              <InputLabel htmlFor={inputId}>{p.property.displayLabel}</InputLabel>
            </Grid>
            <Grid size={8}>
              <Input id={inputId} defaultValue={p.value.displayValue} />
            </Grid>
          </Grid>
        );
      })}
    </Grid>
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
