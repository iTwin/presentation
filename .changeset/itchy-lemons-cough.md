---
"@itwin/presentation-components": major
---

Removed values formatting in `ContentDataProvider`. This leaves values formatting up to UI components presenting them. AppUI property renderers and editors already perform this formatting, so consumers using those components are not affected by this change.
