---
"@itwin/presentation-components": minor
---

- `PresentationInstanceFilterDialog` enhancements:
  - Changed the "Apply" button to always be enabled, even when no filtering rules are selected.
  - Added a "Reset" button which clears all the filtering rules in the dialog.
  - Added a `toolbarRenderer` prop to allow rendering a custom toolbar at the bottom of the dialog.

- Changed `PresentationTreeRenderer` to clear hierarchy level filter if filtering dialog was closed by clicking "Apply" with no filtering rules in the dialog.
