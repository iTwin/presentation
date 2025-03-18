---
"@itwin/presentation-hierarchies-react": patch
---

Replaced `getIcons` with `getDecorations`. `getDecorations` takes in an array of callbacks  each returning an element. Previously provided `getIcons` can be reused with kiwi `<Icon />` component to provide icons to the tree.
