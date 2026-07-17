---
"@itwin/unified-selection-react": major
"@itwin/unified-selection": major
"@itwin/presentation-opentelemetry": major
---

Dropped CommonJS support. These packages are now published as ES modules (ESM) only.

Consumers already using the ESM build should not be affected. When one of these packages is listed as a peer dependency, it is safe to widen the version range to include the new major version.
