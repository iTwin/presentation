---
"@itwin/presentation-core-interop": patch
---

Fixed schema item labels (classes, properties, enumerations, enumerators, kind of quantities and property categories) not decoding EC name-escaping (e.g. `Foo__x0020__Bar`) when no explicit display label was set. Names containing escaped characters are now decoded into their unescaped form (e.g. `Foo Bar`), matching the behavior of the native `ECObjects` library.
