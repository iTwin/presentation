---
"@itwin/presentation-components": minor
---

Instance filter builder / dialog: UX enhancements.

- Changed the "Apply" button to always be enabled, even when no filtering rules are selected. In such situations, `PresentationTreeRenderer` clears the hierarchy level filter.
- Added a "Reset" button which clears all the filtering rules in the dialog.
- Added a `toolbarButtonsRenderer` prop to allow rendering custom toolbar buttons at the bottom of the dialog.
