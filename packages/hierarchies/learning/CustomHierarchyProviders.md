# Custom hierarchy providers

In this package, a hierarchy provider is defined through the `HierarchyProvider` interface and available implementations delivered by this package are listed in the [Hierarchy providers](../README.md) README section. This learning page shows how to implement a custom hierarchy provider.

## Basic example

In the most basic form, a hierarchy provider only needs to implement the `getNodes` method, as it's responsible for returning nodes. The following example provider simply returns dynamically created nodes:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.BasicProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";

// Create a hierarchy provider that returns an infinite hierarchy, where each node has one child node.
const provider: HierarchyProvider = {
  async *getNodes({ parentNode }) {
    yield !parentNode
      ? {
          key: { type: "generic", id: `root` },
          label: `Root node`,
          children: true,
          parentKeys: [],
        }
      : {
          key: { type: "generic", id: `child-${parentNode.parentKeys.length + 1}` },
          label: `Child ${parentNode.parentKeys.length + 1}`,
          children: true,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
        };
  },
  async *getNodeInstanceKeys() {},
  setFormatter() {},
  setHierarchyFilter() {},
  hierarchyChanged: new BeEvent(),
};
```

<!-- END EXTRACTION -->

## iModel-based hierarchy provider example

`@itwin/presentation-hierarchies` package provides the `createIModelHierarchyProvider` function to create a hierarchy provider that fetches nodes from an iModel. The provider has many advanced features like running multiple queries in parallel, grouping, caching an more.

However, it's possible to write one from scratch. The following example demonstrates how to create a simple iModel-based hierarchy provider:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.IModelProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.CustomIModelProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";

import { using } from "@itwin/core-bentley";
import { BriefcaseConnection, IModelConnection } from "@itwin/core-frontend";
import { registerTxnListeners } from "@itwin/presentation-core-interop";

// Create a hierarchy provider that returns the root bis.Subject and a hierarchy of its children.
class IModelHierarchyProvider implements HierarchyProvider {
  public hierarchyChanged = new BeEvent();
  private _disposeTxnListeners: (() => void) | undefined;

  public constructor(private _imodel: IModelConnection) {
    if (this._imodel instanceof BriefcaseConnection) {
      // Briefcase connections support data modifications - the provider should listen to txn changes
      // and raise `hierarchyChanged` event when the hierarchy should be refreshed. `BriefcaseTxns` has a number
      // of events that we should listen to - here we're using `registerTxnListeners` helper to simplify subscription.
      this._disposeTxnListeners = registerTxnListeners(this._imodel.txns, () => this.hierarchyChanged.raiseEvent());
    }
  }

  // Make this provider disposable. Owners of the provider should make sure `dispose` is called when the
  // provider is no longer needed.
  // The tree state hooks from `@itwin/presentation-hierarchies-react` package take care of this for you.
  public dispose() {
    this._disposeTxnListeners?.();
  }

  public async *getNodes({ parentNode }: Parameters<HierarchyProvider["getNodes"]>[0]): AsyncIterableIterator<HierarchyNode> {
    if (!parentNode) {
      // Query and return root bis.Subject node
      for await (const row of this._imodel.createQueryReader(
        `
          SELECT
            COALESCE(s.UserLabel, s.CodeValue, ec_classname(s.ECClassId, 'c')) label,
            (SELECT 1 FROM bis.Element c WHERE c.Parent.Id = s.ECInstanceId LIMIT 1) hasChildren
          FROM bis.Subject s
          WHERE s.Parent.Id IS NULL
        `,
      )) {
        yield {
          key: { type: "instances", instanceKeys: [{ className: "BisCore.Subject", id: "0x1", imodelKey: this._imodel.key }] },
          label: row.label,
          children: !!row.hasChildren,
          parentKeys: [],
        };
      }
      return;
    }
    // Query and return children for the given parent node, assuming it's based on data from the same iModel
    if (
      HierarchyNode.isInstancesNode(parentNode) &&
      parentNode.key.instanceKeys.length > 0 &&
      parentNode.key.instanceKeys.every((k) => k.imodelKey === this._imodel.key)
    ) {
      for await (const row of this._imodel.createQueryReader(
        `
          SELECT
            ec_classname(e.ECClassId, 's.c') className,
            e.ECInstanceId id,
            COALESCE(e.UserLabel, e.CodeValue, ec_classname(e.ECClassId, 'c')) label,
            (SELECT 1 FROM bis.Element c WHERE c.Parent.Id = e.ECInstanceId LIMIT 1) hasChildren
          FROM bis.Element e
          WHERE e.Parent.Id IN (${parentNode.key.instanceKeys.map((key) => key.id).join(",")})
        `,
      )) {
        yield {
          key: { type: "instances", instanceKeys: [{ className: row.className, id: row.id, imodelKey: this._imodel.key }] },
          label: row.label,
          children: !!row.hasChildren,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
        };
      }
    }
  }

  // Since we're returning nodes based on instances in an iModel, we should also implement the `getNodeInstanceKeys` method
  // allow efficient retrieval of instance keys
  public async *getNodeInstanceKeys({ parentNode }: Parameters<HierarchyProvider["getNodeInstanceKeys"]>[0]) {
    if (!parentNode) {
      // Don't need to run a query here - we know all iModels have one root Subject with `0x1` id
      yield { className: "BisCore.Subject", id: "0x1", imodelKey: this._imodel.key };
      return;
    }
    // Query and return children instance keys for the given parent node
    if (
      HierarchyNode.isInstancesNode(parentNode) &&
      parentNode.key.instanceKeys.length > 0 &&
      parentNode.key.instanceKeys.every((k) => k.imodelKey === this._imodel.key)
    ) {
      for await (const row of this._imodel.createQueryReader(
        `
          SELECT ec_classname(e.ECClassId, 's.c') className, e.ECInstanceId id
          FROM bis.Element e
          WHERE e.Parent.Id IN (${parentNode.key.instanceKeys.map((key) => key.id).join(",")})
        `,
      )) {
        yield { className: row.className, id: row.id, imodelKey: this._imodel.key };
      }
    }
  }

  public setFormatter() {}
  public setHierarchyFilter() {}
}

// The `using` function makes sure the provider is disposed when it's no longer needed
await using(new IModelHierarchyProvider(imodel), async (provider) => {
  // Traverse the hierarchy to ensure expected nodes are returned. The result depends on
  // the iModel given to the provider.
  await traverseHierarchy(provider);
});
```

<!-- END EXTRACTION -->

## 3rd party service-based hierarchy provider example

Similar to querying nodes from an iModel, it's possible to query data for creating nodes from a 3rd party service. The following example demonstrates how to create a simple service-based hierarchy provider.

First, let's define a sample books service:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.BooksService], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
// Creates a books service that provides authors and books data. The service has two methods:
// - `getAuthors` - returns authors based on the provided query.
// - `getBooks` - returns books based on the provided query.
function createBooksService() {
  const authors = [
    { key: "OL26320A", name: "J.R.R. Tolkien", hasBooks: true },
    { key: "OL18319A", name: "Mark Twain", hasBooks: true },
    { key: "OL25277A", name: "Tom Clancy", hasBooks: true },
  ];
  const books = [
    { key: "OL27482W", title: "The Hobbit", authorKey: "OL26320A" },
    { key: "OL27513W", title: "The Fellowship of Ring", authorKey: "OL26320A" },
    { key: "OL27479W", title: "The two towers", authorKey: "OL26320A" },

    { key: "OL53908W", title: "Adventures of Huckleberry Finn", authorKey: "OL18319A" },
    { key: "OL53919W", title: "The Adventures of Tom Sawyer", authorKey: "OL18319A" },

    { key: "OL159452W", title: "The hunt for Red October", authorKey: "OL25277A" },
    { key: "OL159642W", title: "Red storm rising", authorKey: "OL25277A" },
    { key: "OL449001W", title: "Executive orders", authorKey: "OL25277A" },
  ];
  type Query<TEntry> = { rules: (Partial<TEntry> | Query<TEntry>)[]; operator: "and" | "or" } | Partial<TEntry>;
  function filterEntries<TEntry>(entries: TEntry[], query: Query<TEntry> | undefined, entryMatcher: (entry: TEntry, query: Partial<TEntry>) => boolean) {
    function matchEntry(entry: TEntry, partialQuery?: Query<TEntry>): boolean {
      return (
        !partialQuery ||
        ("rules" in partialQuery
          ? partialQuery.rules[partialQuery.operator === "and" ? "every" : "some"]((rule) => matchEntry(entry, rule))
          : entryMatcher(entry, partialQuery))
      );
    }
    return entries.filter((entry) => matchEntry(entry, query));
  }
  async function getAuthors(query?: Query<(typeof authors)[0]>) {
    return filterEntries(authors, query, (entry, { key, name, hasBooks }) => {
      if (key && entry.key !== key) {
        return false;
      }
      if (name && !entry.name.toLocaleLowerCase().includes(name.toLocaleLowerCase())) {
        return false;
      }
      if (hasBooks !== undefined && entry.hasBooks !== hasBooks) {
        return false;
      }
      return true;
    });
  }
  async function getBooks(query?: Query<(typeof books)[0]>) {
    return filterEntries(books, query, (entry, { key, authorKey, title }) => {
      if (key && entry.key !== key) {
        return false;
      }
      if (title && !entry.title.toLocaleLowerCase().includes(title.toLocaleLowerCase())) {
        return false;
      }
      if (authorKey && entry.authorKey !== authorKey) {
        return false;
      }
      return true;
    });
  }
  return { getAuthors, getBooks };
}
```

<!-- END EXTRACTION -->

Now that we have a service, let's create a hierarchy provider that creates a hierarchy based on the data returned from the service:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.3rdPartyServiceProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";

// Create a fake books service that simulates fetching authors and books data.
const booksService = createBooksService();

// Create a hierarchy provider that returns a two-level hierarchy, where root nodes are authors and their
// children are books.
const provider: HierarchyProvider = {
  async *getNodes({ parentNode }) {
    if (!parentNode) {
      // For root nodes, query authors and return nodes based on them
      for (const author of await booksService.getAuthors()) {
        yield {
          key: { type: "generic", id: `author:${author.key}` },
          label: author.name,
          children: author.hasBooks,
          parentKeys: [],
        };
      }
    } else if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id.startsWith("author:")) {
      // For author parent node, query books and return nodes based on them
      for (const book of await booksService.getBooks({ authorKey: parentNode.key.id.slice(7) })) {
        yield {
          key: { type: "generic", id: `book:${book.key}` },
          label: book.title,
          children: false,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
        };
      }
    }
  },
  async *getNodeInstanceKeys() {},
  setHierarchyFilter() {},
  setFormatter() {},
  hierarchyChanged: new BeEvent(),
};

// Traverse the hierarchy:
await traverseHierarchy(provider);
// Output:
// J.R.R. Tolkien
//   The Hobbit
//   The Fellowship of Ring
//   The two towers
// Mark Twain
//   Adventures of Huckleberry Finn
//   The Adventures of Tom Sawyer
// Tom Clancy
//   The hunt for Red October
//   Red storm rising
//   Executive orders
```

<!-- END EXTRACTION -->

## Implementing node label formatting support

While node labels' formatting is completely hierarchy provider's responsibility, the APIs are built to make it easy to implement:

- We provide 2 built-in formatters:

  - `createDefaultValueFormatter` from `@itwin/presentation-shared` package creates a basic formatter, that's suitable for values that don't have units.
  - `createValueFormatter` from `@itwin/presentation-core-interop` package creates a formatter that knows how to handle values with units.

- The `ConcatenatedValue` concept makes it easy to create formatted strings that combine multiple separately formatted values.

- The `HierarchyProvider` interface has a notion of `setFormatter` function. This makes formatting the first-class concept in the hierarchy provider, and makes it easy for consumers to assign a formatter based on user preferences, e.g. selected unit system.

With the above APIs at hand, implementing node label formatting is straightforward:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.FormattingProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.FormattingProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";

import { ConcatenatedValue, ConcatenatedValuePart, createDefaultValueFormatter, IPrimitiveValueFormatter, julianToDateTime } from "@itwin/presentation-shared";

// Create a hierarchy provider that returns a single root node with formatted label. The formatter used by the
// provider can be changed by calling the `setFormatter` method.
class FormattingHierarchyProvider implements HierarchyProvider {
  private _formatter: IPrimitiveValueFormatter = createDefaultValueFormatter();
  public hierarchyChanged = new BeEvent();
  public async *getNodes(): ReturnType<HierarchyProvider["getNodes"]> {
    yield {
      key: { type: "generic", id: `formatted-node` },
      // We're using `ConcatenatedValue` to simplify formatting complex values consisting of different parts
      // that may need to be formatted differently
      label: await ConcatenatedValue.serialize({
        parts: [
          "Boolean: ",
          { type: "Boolean", value: true },
          " | Integer: ",
          { type: "Integer", value: 123 },
          " | Double: ",
          { type: "Double", value: 4.56 },
          " | Date/Time: ",
          { type: "DateTime", extendedType: "ShortDate", value: new Date(Date.UTC(2024, 11, 31)) },
          " | Point2d: ",
          { type: "Point2d", value: { x: 1.234, y: 5.678 } },
        ],
        partFormatter: async (x) => (ConcatenatedValuePart.isString(x) ? x : this._formatter(x)),
      }),
      children: false,
      parentKeys: [],
    };
  }
  public async *getNodeInstanceKeys() {}
  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    this._formatter = formatter ?? createDefaultValueFormatter();
  }
  public setHierarchyFilter() {}
}

const provider = new FormattingHierarchyProvider();

// Default formatter will format the node label to the following value (Date/Time formatted according to the locale and time zone):
// `Boolean: true | Integer: 123 | Double: 4.56 | Date/Time: 2024-12-31 | Point2d: (1.23, 5.68)`
console.log((await provider.getNodes().next()).value.label);

provider.setFormatter(async (typedValue) => {
  switch (typedValue.type) {
    case "Boolean":
      return typedValue.value ? "Yes" : "No";
    case "Integer":
      return `i${typedValue.value.toLocaleString()}`;
    case "Double":
      return typedValue.value.toExponential(1);
    case "DateTime":
      return (
        typeof typedValue.value === "string"
          ? new Date(typedValue.value)
          : typeof typedValue.value === "number"
            ? julianToDateTime(typedValue.value)
            : typedValue.value
      ).toISOString();
    case "Point2d":
      return `{ x: ${typedValue.value.x.toExponential(1)}, y: ${typedValue.value.y.toExponential(1)} }`;
  }
  return typedValue.value.toString();
});

// With the above formatter, the node label is formatted to the following value:
// `Boolean: Yes | Integer: i123 | Double: 4.6e+0 | Date/Time: 2024-12-31T00:00:00.000Z | Point2d: { x: 1.2e+0, y: 5.7e+0 }`
console.log((await provider.getNodes().next()).value.label);
```

<!-- END EXTRACTION -->

## Implementing hierarchy filtering support

For this example, let's use the books service defined in the [3rd party service-based hierarchy provider example](#3rd-party-service-based-hierarchy-provider-example) section and enhance the provider to support hierarchy filtering.

As described in the [Hierarchy filtering](./HierarchyFiltering.md) learning page, the process of filtering a hierarchy has two major steps:

1. Determine node identifier paths for the target nodes.
2. Given the node identifier paths, filter the hierarchy.

Let's start with the first step:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.FilteringProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.FilteringProviderExample.PathsLookup], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";

import { createHierarchyFilteringHelper, GenericNodeKey, HierarchyFilteringPath, HierarchyNodeIdentifier } from "@itwin/presentation-hierarchies";

// A function that matches given string against authors and books, and returns hierarchy paths
// from root to the matched node. This function must be aware of the hierarchy structure to know what paths
// to create.
async function createFilterPaths(filter: string): Promise<HierarchyFilteringPath[]> {
  const results: HierarchyFilteringPath[] = [];
  const [matchingAuthors, matchingBooks] = await Promise.all([booksService.getAuthors({ name: filter }), booksService.getBooks({ title: filter })]);
  for (const author of matchingAuthors) {
    results.push([{ type: "generic", id: `author:${author.key}` }]);
  }
  for (const book of matchingBooks) {
    results.push([
      { type: "generic", id: `author:${book.authorKey}` },
      { type: "generic", id: `book:${book.key}` },
    ]);
  }
  return results;
}
```

<!-- END EXTRACTION -->

There could be a number of ways to filter the hierarchy, such as by target instance identifier, by a complex query that uses multiple attributes, or simply by label. The above function filters the hierarchy by node label.

Now that we're able to find the paths, let's enhance our hierarchy provider to support filtering by them:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.FilteringProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.FilteringProviderExample.Provider], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";

import { createHierarchyFilteringHelper, GenericNodeKey, HierarchyFilteringPath, HierarchyNodeIdentifier } from "@itwin/presentation-hierarchies";

let rootFilter: Parameters<HierarchyProvider["setHierarchyFilter"]>[0];
const provider: HierarchyProvider = {
  async *getNodes({ parentNode }) {
    const filteringHelper = createHierarchyFilteringHelper(rootFilter?.paths, parentNode);
    const targetNodeKeys = filteringHelper.getChildNodeFilteringIdentifiers();
    if (!parentNode) {
      // For root nodes, query authors and return nodes based on them
      const authors = await booksService.getAuthors(
        targetNodeKeys
          ? {
              rules: targetNodeKeys
                .filter((key) => HierarchyNodeIdentifier.isGenericNodeIdentifier(key) && key.id.startsWith("author:"))
                .map(({ id }) => ({ key: id.slice(7) })),
              operator: "or",
            }
          : undefined,
      );
      for (const author of authors) {
        const nodeKey: GenericNodeKey = { type: "generic", id: `author:${author.key}` };
        yield {
          key: nodeKey,
          label: author.name,
          children: author.hasBooks,
          parentKeys: [],
          ...filteringHelper.createChildNodeProps({ nodeKey }),
        };
      }
    } else if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id.startsWith("author:")) {
      // For author parent node, query books and return nodes based on them
      const books = await booksService.getBooks({
        rules: [
          { authorKey: parentNode.key.id.slice(7) },
          ...(targetNodeKeys
            ? [
                {
                  rules: targetNodeKeys
                    .filter((key) => HierarchyNodeIdentifier.isGenericNodeIdentifier(key) && key.id.startsWith("book:"))
                    .map(({ id }) => ({ key: id.slice(5) })),
                  operator: "or" as const,
                },
              ]
            : []),
        ],
        operator: "and",
      });
      for (const book of books) {
        const nodeKey: GenericNodeKey = { type: "generic", id: `book:${book.key}` };
        yield {
          key: nodeKey,
          label: book.title,
          children: false,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
          ...filteringHelper.createChildNodeProps({ nodeKey }),
        };
      }
    }
  },
  setHierarchyFilter(props) {
    // Here we receive all paths that we want to filter the hierarchy by. The paths start from root, so
    // we just store them in a variable to use later when querying root nodes.
    rootFilter = props;
  },
  async *getNodeInstanceKeys() {},
  setFormatter() {},
  hierarchyChanged: new BeEvent(),
};
```

<!-- END EXTRACTION -->

The provider uses target instance keys that it gets through a filtering helper function to filter each hierarchy level. Because we already know exactly what we're looking for, we can effectively apply filtering at query time, rather than doing that on the client side.

With the above provider, we can now filter the books hierarchy by label:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.FilteringProviderExample.TraverseFiltered1, Presentation.Hierarchies.CustomHierarchyProviders.FilteringProviderExample.TraverseFiltered2], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
// Apply the filter "of" and traverse the filtered hierarchy. Notice that author node
// of "The Fellowship of Ring" is included, even though it doesn't match the filter.
provider.setHierarchyFilter({ paths: await createFilterPaths("of") });
await traverseHierarchy(provider);
// Output:
// J.R.R. Tolkien
//   The Fellowship of Ring
// Mark Twain
//   Adventures of Huckleberry Finn
//   The Adventures of Tom Sawyer

// Apply the filter "tom" and traverse the filtered hierarchy. Notice that all books
// of "Tom Clancy" are included, even though they don't match the filter.
provider.setHierarchyFilter({ paths: await createFilterPaths("tom") });
await traverseHierarchy(provider);
// Output:
// Mark Twain
//   The Adventures of Tom Sawyer
// Tom Clancy
//   The hunt for Red October
//   Red storm rising
//   Executive orders
```

<!-- END EXTRACTION -->