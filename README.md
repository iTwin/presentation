# Presentation

A monorepo for [Presentation](https://www.itwinjs.org/presentation/) packages.

## Development

### Building

1. Install dependencies.

   ```shell
   pnpm install
   ```

2. Build test-app.

   ```shell
   pnpm build:test-app
   ```

3. Start test-app.

   3.1 Web version of test-app.

   ```shell
   pnpm start:web
   ```

   3.2. Electron version of test-app.

   ```shell
   pnpm start:electron
   ```

### Debugging

Test-app is setup to be debugged using [Visual Studio Code](https://code.visualstudio.com/docs/editor/debugging). Debug session can be started using provided configurations:

- `Test App (web)` for debugging web version of test-app.
- `Test App (electron)` for debugging electron version of test-app.

### Local development using `CoSpace`

For local development it is recommended to setup [`CoSpace`](https://www.npmjs.com/package/cospace). It provides a convenient way to link local versions of packages from other repositories like: [`itwinjs-core`](https://github.com/iTwin/itwinjs-core), [`appui`](https://github.com/iTwin/appui).

#### Getting started

1. Initialize `CoSpace`.

   ```shell
   npx cospace@latest init my-cospace
   ```

2. Clone all repos you want to link together under the `repos` sub directory. List of recommended repos to clone:

   - [presentation](https://github.com/iTwin/presentation)
   - [itwinjs-core](https://github.com/iTwin/itwinjs-core)
   - [appui](https://github.com/iTwin/appui)
   - [imodel-native](https://github.com/iTwin/imodel-native)

     See [Get and build imodel02 code](https://dev.azure.com/bentleycs/iModelTechnologies/_wiki/wikis/iModelTechnologies.wiki/308/Get-and-Build-Native-imodel02-Code?anchor=bootstrap-the-source) page for instructions to build native addon.

3. Update the `pnpm-workspace.yaml` file with all the packages you want to add to your `CoSpace`. By default all packages under the `repos` sub directory will be added. Recommended configuration:

   ```yaml
   packages:
     # presentation
     - "repos/presentation/**"

     # itwinjs-core
     - "repos/itwinjs-core/presentation/*"
     - "repos/itwinjs-core/core/**"
     - "repos/itwinjs-core/tools/build"
     - "repos/itwinjs-core/tools/webpack-core"
     - "repos/itwinjs-core/tools/internal"
     - "repos/itwinjs-core/ui/*"
   ```

4. Update the `cospace.code-workspace` file with all the repos you want to add to your [vscode multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces).

5. Add the following to the `pnpm.overrides` section of the `CoSpace`'s `package.json`:

   ```json
   "overrides": {
     // other overrides
     "@itwin/certa": "nightly",
     "form-data": "2.5.1",
     "@types/express": "4.17.17",
     "express": "4.18.2"
   }
   ```

   _Note:_ You might have to add new packages or update versions of ones that are listed above in the `pnpm.overrides` section. To know which versions you need look at the `dependencies` sections of `itwinjs-core > common > config > rush > pnpm-lock.aml` file.

6. Run `pnpm exec cospace override` to automatically update the `pnpm.overrides` section of the `CoSpace`'s `package.json`, to link all the dependencies together with the copy found in the workspace.

7. Run `pnpm install` to install all dependencies in your workspace and link all the packages you've added to your `CoSpace`.

8. Run `pnpm build` to build all the packages you've added to your `CoSpace` using your monorepo task runner.

#### Debugging code from linked repos

In order to debug packages from different repos using [`Visual Studio Code`](https://code.visualstudio.com/docs/editor/debugging) you will need launch configuration at your `CoSpace` root. Example configuration for debugging presentation test-app and locally built presentation packages from [itwinjs-core](https://github.com/iTwin/itwinjs-core) (you may need to adjust paths according your `CoSpace` setup):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "[presentation-test-app] Start Web Backend",
      "skipFiles": ["<node_internals>/**"],
      "cwd": "${workspaceFolder}/repos/presentation/apps/test-app/backend",
      "program": "${workspaceFolder}/repos/presentation/apps/test-app/backend/lib/main.js",
      "outFiles": [
        "${workspaceFolder}/repos/presentation/apps/test-app/{backend, common}/**/*.js",
        "${workspaceFolder}/repos/itwinjs-core/presentation/{backend, common}/**/*.js",
        "${workspaceFolder}/repos/itwinjs-core/core/{backend, common}/**/*.js",
        "!**/node_modules/**"
      ]
    },
    {
      "type": "chrome",
      "request": "launch",
      "name": "[presentation-test-app] Launch Web Frontend",
      "url": "http://localhost:3000/",
      "webRoot": "${workspaceFolder}/repos/presentation/apps/test-app/frontend",
      "sourceMapPathOverrides": {
        "webpack://@test-app/frontend/*": "${workspaceFolder}/repos/presentation/apps/test-app/frontend/*",
        "webpack://@test-app/frontend/../../../../itwinjs-core/presentation/frontend/lib/cjs/*.js": "${workspaceFolder}/repos/itwinjs-core/presentation/frontend/src/*.ts",
        "webpack://@test-app/frontend/../../../../itwinjs-core/presentation/common/lib/cjs/*.js": "${workspaceFolder}/repos/itwinjs-core/presentation/common/src/*.ts",
        "webpack://@test-app/frontend/../../../../itwinjs-core/presentation/components/lib/cjs/*.js": "${workspaceFolder}/repos/itwinjs-core/presentation/components/src/*.ts",
        // defaults
        "webpack:///./~/*": "${webRoot}/node_modules/*",
        "webpack:///./*": "${webRoot}/*",
        "webpack:///*": "*"
      }
    }
  ]
}
```
