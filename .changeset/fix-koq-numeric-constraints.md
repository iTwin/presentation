---
"@itwin/presentation-components": patch
---

Enforce ECProperty `minimumValue`/`maximumValue` constraints in the quantity property editor. Previously, the quantity editor (`QuantityPropertyEditorInput`) did not clamp values to the range defined in the ECSchema. Now, when a user commits a value (on blur), it is clamped to the constraint range before being committed.
