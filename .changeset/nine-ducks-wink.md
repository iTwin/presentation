---
"@itwin/presentation-components": minor
---

Replaced `react-select` with [iTwinUI's ComboBox](https://itwinui.bentley.com/docs/combobox).

This affects [`PresentationInstanceFilterBuilder`, `NavigationPropertyEditor`] components.

Changes:

- The number of select options is limited to 100. When more items exist, a non-selectable option is displayed at the bottom of the list, prompting users to provide an items filter. Previously, additional pages of select options was loaded when user scrolled to the bottom of the list.

- Old style:
    ![alt text](image-1.png)
    New style:
    ![alt text](image.png)

- Deprecated `PortalTargetContext`. It is no longer needed.
