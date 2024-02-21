import { useEffect, useMemo, useState } from "react";
import { PropertyDescription } from "@itwin/appui-abstract";
import {
  PropertyFilterBuilderRenderer,
  PropertyFilterBuilderRuleValueRendererProps,
  PropertyFilterRuleGroupOperator,
  PropertyFilterRuleOperator,
  usePropertyFilterBuilder,
} from "@itwin/components-react";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRelatedInstanceDescription,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  GenericInstanceFilterRuleValue,
} from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { Dialog, Label } from "@itwin/itwinui-react";
import { ClassInfo, Descriptor } from "@itwin/presentation-common";
import { PresentationFilterBuilderValueRenderer, PresentationInstanceFilter, useInstanceFilterPropertyInfos } from "@itwin/presentation-components";

export interface QueryBuilderInput {
  descriptor: Descriptor;
  property: PropertyDescription;
}

interface QueryBuildersProps {
  imodel: IModelConnection;
  inputs: QueryBuilderInput[];
}

interface QueryBuildersDialogProps extends QueryBuildersProps {
  onClose: () => void;
}

export function QueryBuilderDialog({ onClose, ...props }: QueryBuildersDialogProps) {
  return (
    <Dialog isOpen={true} onClose={onClose} closeOnEsc={true} preventDocumentScroll={true} trapFocus={true} isDraggable isResizable>
      <Dialog.Backdrop />
      <Dialog.Main style={{ minWidth: "90%", minHeight: "70%" }}>
        <Dialog.TitleBar>Query Builder</Dialog.TitleBar>
        <Dialog.Content>
          <QueryBuilders {...props} />
        </Dialog.Content>
      </Dialog.Main>
    </Dialog>
  );
}

function QueryBuilders({ imodel, inputs }: QueryBuildersProps) {
  const [queries, setQueries] = useState<Record<string, GenericInstanceFilter | undefined>>({});

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(queries);
  }, [queries]);

  return (
    <div className="query-builders">
      {inputs.map((input, i) => (
        <SingleQueryBuilder
          key={i}
          imodel={imodel}
          {...input}
          onQueryChanged={(query) => {
            setQueries((prev) => ({ ...prev, [input.descriptor.selectClasses[0].selectClassInfo.name]: query }));
          }}
        />
      ))}
    </div>
  );
}

function noopValidator() {
  return undefined;
}

interface SingleQueryBuilderProps extends QueryBuilderInput {
  imodel: IModelConnection;
  onQueryChanged: (query: GenericInstanceFilter | undefined) => void;
}

/** Render query builder for single class. */
function SingleQueryBuilder({ descriptor, imodel, onQueryChanged }: SingleQueryBuilderProps) {
  // collect direct and related properties from content descriptor.
  const { propertyInfos, propertyRenderer } = useInstanceFilterPropertyInfos({ descriptor });
  // map presentation property info data structures to `PropertyDescription`.
  const properties = useMemo(() => propertyInfos.map((info) => info.propertyDescription), [propertyInfos]);
  // initialize query builder. Returns current state and actions for building filter.
  const { rootGroup, actions, buildFilter } = usePropertyFilterBuilder({ ruleValidator: noopValidator });

  // create metadata for building ECSQL query.
  const queryMetadata = useMemo<GenericInstanceFilter | undefined>(() => {
    // get current filter
    const filter = buildFilter();
    if (!filter) {
      return undefined;
    }
    // add presentation metadata to filter
    // replaces filter rule `PropertyDescription` into `PropertiesField`. It has additional metadata about property:
    // - property schema name
    // - property class
    // - relationship path from property class to the select class if this property is related.
    const presentationFilter = PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter);

    // create metadata for building ECSQL query. It simplifies `PresentationInstanceFilter`:
    // - collects relationship paths from all related properties used in filter to the select class (return only unique paths)
    // - creates aliases for related properties and associated relationship paths
    // all this information is available on `PresentationInstanceFilter` but this is data structure that is easier to use when building ECSQL query.
    return PresentationInstanceFilter.toGenericInstanceFilter(presentationFilter);
  }, [buildFilter, descriptor]);

  useEffect(() => {
    onQueryChanged(queryMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryMetadata]);

  return (
    <div className="query-builder-container">
      <div className="query-builder">
        <Label>{descriptor.selectClasses[0].selectClassInfo.label}</Label>
        <PropertyFilterBuilderRenderer
          properties={properties}
          rootGroup={rootGroup}
          actions={actions}
          propertyRenderer={propertyRenderer}
          ruleGroupDepthLimit={0}
          ruleValueRenderer={(rendererProps: PropertyFilterBuilderRuleValueRendererProps) => (
            // custom renderer for value input that utilizes presentation metadata:
            // - for `=` and `!=` operators renders drop down with unique values
            // - for kind of quantity properties renders input with units support
            // otherwise renders default values renderer provided by `component-react` package.
            <PresentationFilterBuilderValueRenderer {...rendererProps} imodel={imodel} descriptor={descriptor} />
          )}
        />
      </div>
      <div className="query-builder-result">
        <Label>Query</Label>
        {queryMetadata ? <QueryBuilderResult selectClassInfo={descriptor.selectClasses[0].selectClassInfo} queryMetadata={queryMetadata} /> : null}
      </div>
    </div>
  );
}

interface QueryBuilderResultProps {
  selectClassInfo: ClassInfo;
  queryMetadata: GenericInstanceFilter;
}

function QueryBuilderResult({ queryMetadata, selectClassInfo }: QueryBuilderResultProps) {
  const query = useMemo(() => createQuery(queryMetadata), [queryMetadata]);
  return (
    <div className="query-result">
      <div className="query-result-from">FROM {selectClassInfo.name} as this</div>
      <div className="query-result-join">
        {query.joinClauses.map((clause, i) => (
          <div key={i}>{clause}</div>
        ))}
      </div>
      <div className="query-result-where">{query.whereClause}</div>
    </div>
  );
}

// simple implementation of creating `ECSQL` JOIN and WHERE clause strings from filter built with `PropertyFilterBuilder`.
function createQuery(metadata: GenericInstanceFilter): {
  joinClauses: string[];
  whereClause: string;
} {
  const whereClause = createWhereClause(metadata.rules);
  const joinClauses = createJoinClause(metadata.relatedInstances);

  return {
    whereClause,
    joinClauses,
  };
}

function createJoinClause(relatedInstances: GenericInstanceFilterRelatedInstanceDescription[]): string[] {
  const joinClauses: string[] = [];
  for (let j = 0; j < relatedInstances.length; j++) {
    const related = relatedInstances[j];
    const alias = related.alias;
    const relatedPath = related.path;
    let prevAlias = "this";
    for (let i = 0; i < relatedPath.length; i++) {
      const step = relatedPath[i];
      const stepAlias = i + 1 === relatedPath.length ? alias : `class_${j}_${i}`;
      const relAlias = `rel_${j}_${i}`;

      const relSourcePropName = step.isForwardRelationship ? "SourceECInstanceId" : "TargetECInstanceId";
      const relTargetPropName = step.isForwardRelationship ? "TargetECInstanceId" : "SourceECInstanceId";

      joinClauses.push(`JOIN ${step.relationshipClassName} as ${relAlias} ON ${relAlias}.${relSourcePropName} = ${prevAlias}.ECInstanceId`);
      joinClauses.push(`JOIN ${step.targetClassName} as ${stepAlias} ON ${relAlias}.${relTargetPropName} = ${stepAlias}.ECInstanceId`);
      prevAlias = stepAlias;
    }
  }

  return joinClauses;
}

function createWhereClause(rules: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup): string {
  return `WHERE ${parseQuery(rules)}`;
}

function parseQuery(rules: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup): string {
  if (GenericInstanceFilter.isFilterRuleGroup(rules)) {
    return parseQueryRuleGroup(rules);
  }

  return parseQueryRule(rules);
}

function parseQueryRuleGroup(group: GenericInstanceFilterRuleGroup) {
  const rules = group.rules.map(parseQuery);
  return `(${rules.join(group.operator === PropertyFilterRuleGroupOperator.And ? " AND " : " OR ")})`;
}

function parseQueryRule(rule: GenericInstanceFilterRule) {
  const accessorBase = `[${rule.sourceAlias}].[${rule.propertyName}]`;
  const operator = getOperatorString(rule.operator);
  if (!rule.value) {
    return `${accessorBase} ${operator}`;
  }

  const accessor = rule.propertyTypeName === "navigation" ? `${accessorBase}.[Id]` : accessorBase;
  const valueString = getValueString(rule.value.rawValue);
  return `${accessor} ${operator} ${valueString}`;
}

function getValueString(value: GenericInstanceFilterRuleValue.Values) {
  if (GenericInstanceFilterRuleValue.isInstanceKey(value)) {
    return value.id;
  }

  if (typeof value === "number") {
    return value.toFixed(3);
  }

  return value.toString();
}

function getOperatorString(operator: `${PropertyFilterRuleOperator}`): string {
  switch (operator) {
    case "is-true":
      return "IS TRUE";
    case "is-false":
      return "IS FALSE";
    case "is-equal":
      return "=";
    case "is-not-equal":
      return "<>";
    case "greater":
      return ">";
    case "greater-or-equal":
      return ">=";
    case "less":
      return "<";
    case "less-or-equal":
      return "<=";
    case "like":
      return "LIKE";
    case "is-null":
      return "IS NULL";
    case "is-not-null":
      return "IS NOT NULL";
  }
}
