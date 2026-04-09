# Copilot Instructions

## PR Review Guidelines

When reviewing pull requests in this repository, check the following:

### Testing Requirements

- New functionality must be covered by tests (unit and/or integration depending on the feature).
- Tests use Vitest — verify new tests follow the existing patterns in the package.
- Integration tests live in `apps/full-stack-tests/`; unit tests live alongside source in each package.
- Verify that edge cases, error paths, and boundary conditions are tested.

### Architecture & Design Patterns

- Changes must be consistent with the package they live in (see the package table in [`SKILL.md`](.github/skills/repo-context/SKILL.md)).
- Avoid cross-package coupling beyond the established dependency graph.
- React code should follow the existing hook/component patterns in `packages/hierarchies-react/` and `packages/components/`.

### Public API

- Any change to an exported symbol (added, removed, or signature-changed) must update the corresponding `api/*.api.md` report file in the affected package.
- Breaking changes to public API must be clearly justified and coordinated with the team.
- Internal symbols intended to stay private must be annotated with `@internal`. They should not be exported through barrel files and should not appear in the `api/*.api.md` report files.
- Run `pnpm build` and `pnpm extract-api` in the affected package, then check the `api/*.api.md` report files and verify no unexpected API diff is introduced.

### Changelog / Changesets

- Every user-visible change (feature, fix, deprecation, breaking change) requires a changeset file generated with `pnpm change`.
- The changeset format:

  ```md
  ---
  "@itwin/changed-package-1": major
  "@itwin/changed-package-2": minor
  "@itwin/changed-package-3": patch
  ---

  {Short 1-2 sentence description of the change. When only one specific component is affected, prefix this description with the component name.}

  {Optional additional paragraphs with more details, rationale, examples, etc.}
  ```

- The changeset bump type must match the severity:
  - When in 0.x version range: `patch` for bug fixes and new features or deprecations, `minor` for breaking changes, never `major`.
  - When in 1.x and above version range: `patch` for fixes, `minor` for new features, `major` for breaking changes.
- Purely internal changes (refactors, test-only changes, tooling updates) do not require a changeset.
- Check that the changeset description is clear and written from a consumer-facing perspective.
- Ensure all referenced APIs are public and specified within backticks.
- Ensure internal APIs are not mentioned.
- Ensure code examples match the actual API signatures and are properly formatted.
- All breaking changes should have a `**Breaking:**` prefix and describe the reasoning, the impact of the change on consumers and have a migration example.
- All additions should describe what the added API does.

### Documentation

#### API Docs (TSDoc comments)

- All exported public symbols must have TSDoc comments (`/** ... */`).
  - In `@itwin/presentation-hierarchies-react` package, use multiline comments even for short descriptions as single-line ones don't work without package's build system.
- Comments must accurately describe the symbol's purpose and any notable behavior (e.g. side effects, throws). No need to list individual parameters or return values if they are self-explanatory, but if the API is complex, use `@param` and `@returns` to clarify.
- Use `@param`, `@returns`, `@throws`, `@deprecated`, `@public`, `@beta`, and `@internal` tags as appropriate.
- Avoid restating the symbol name verbatim — explain *what it does*, not what it *is called*.
- Link to other symbols within backticks.

#### README files

- Each package's `README.md` must have a short overview paragraph explaining the package's purpose and its place in the overall stack.
- List and briefly describe all major public entry points (classes, functions, hooks, providers, etc.).
- Keep installation and quick-start sections up-to-date whenever the public API changes.
- Cross-link to relevant learning pages (`packages/<pkg>/learning/`) for deeper explanations.

#### Learning markdowns

- Learning pages live in `packages/<pkg>/learning/` and are the primary place for narrative explanations, worked examples, and migration guides.
- Code examples in learning pages **must not be written by hand**. Instead, embed extraction directives:
  ```md
  <!-- [[include: ExtractionName, ts]] -->
  ```
  The actual code is extracted from compiled and executed source (tests or app code) by the `docs` npm script in appropriate packages. The `update-extractions` npm script at repo root regenerates all extractions across packages and updates the snippets in markdowns.
- When adding or updating an example, add or update the corresponding snippet in a test file or app source, build the package, run `pnpm update-extractions` (or the equivalent script) to regenerate the extraction, and then commit both the source snippet and the updated learning markdown.
- Never manually edit the content between `<!-- BEGIN EXTRACTION -->` and `<!-- END EXTRACTION -->` markers — it will be overwritten on the next extraction run.
- Ensure learning pages are linked from the package `README.md`.
