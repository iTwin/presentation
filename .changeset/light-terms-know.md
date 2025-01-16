---
"@itwin/unified-selection": minor
---

Add `Selectables.load` function to load instance keys from the `Selectables` object.

Example usage:

```ts
const selectables = Selectables.create([
    // add instance key
    { className: "BisCore:Element", id: "0x1" },

    // add custom selectable
    {
        identifier: "custom",
        async * loadInstanceKeys() {
            yield { className: "BisCore:Element", id: "0x2" };
        }
    },
]);

// logs: { className: "BisCore:Element", id: "0x1" }, { className: "BisCore:Element", id: "0x2" }
for await (const key of Selectables.load(selectables)) {
    console.log(key);
}
```
