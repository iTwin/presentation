---
"@itwin/presentation-hierarchies": minor
---

- Add hierarchy node key types to the barrel exports.
- Add ability to prevent auto-expanding of a grouping node when filtering hierarchies:

    ```ts
    const hierarchyProvider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition,
        filtering: {
        paths: [
            {
            // Path to the element "C"
            path: [elementKeys.a, elementKeys.b, elementKeys.c],
            // Supply grouping node attributes with the path to the "C" element.
            options: { autoExpand: { key: groupingNode.key, parentKeysCount: groupingNode.parentKeys.length } },
            },
        ],
        },
    });
    ```
