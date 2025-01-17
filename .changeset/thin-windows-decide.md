---
"@itwin/unified-selection": minor
---

Add `Selectables.load` function to simplify getting all `SelectableInstanceKey` objects from the given selection.

Example usage:

```ts
const instanceKey1: SelectableInstanceKey = { className: "BisCore.Element", id: "0x123" };
const instanceKey2: SelectableInstanceKey = { className: "BisCore.Element", id: "0x456" };
const customSelectable: CustomSelectable = {
  identifier: "my-custom-selectable",
  async * loadInstanceKeys() {
    yield instanceKey2;
  }
};
const selectables = Selectables.create([instanceKey1, customSelectable]);

// this logs instanceKey1 and instanceKey2:
for await (const instanceKey of Selectables.load(selectables)) {
  console.log(instanceKey);
}
```
