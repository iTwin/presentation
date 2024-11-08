# Contributing to this repository

A monorepo for [Presentation](https://www.itwinjs.org/presentation/) packages.

## Source code edit workflow

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

2. Clone repos you want to link together under the `repos` sub directory. List of recommended repos to clone:

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
     # or just enough to build the presentation-test-app
     # - "repos/presentation/apps/test-app/**"
     # - "repos/presentation/apps/build-tools"
     # - "repos/presentation/packages/**"

     # itwinjs-core
     - "repos/itwinjs-core/presentation/*"
     - "repos/itwinjs-core/core/**"
     - "repos/itwinjs-core/tools/**"
     - "repos/itwinjs-core/ui/*"

     # appui
     - "repos/appui/ui/**"
   ```

4. Copy all the pnpm catalogs configuration from `repos/presentation/pnpm-workspcace.yaml` to the root `pnpm-workspace.yaml` in the cospace.

5. Update the `cospace.code-workspace` file with all the repos you want to add to your [vscode multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces).

6. Add the following to the `pnpm.overrides` section of the `CoSpace`'s `package.json`:

   ```json
   "overrides": {
     // other overrides
      "@types/node": "^20.12.12",
   }
   ```

   _Note:_ You might have to add new packages or update versions of ones that are listed above in the `pnpm.overrides` section. To know which versions you need look at the `dependencies` sections of `itwinjs-core > common > config > rush > pnpm-lock.aml` file.

7. Run `pnpm exec cospace override` to automatically update the `pnpm.overrides` section of the `CoSpace`'s `package.json`, to link all the dependencies together with the copy found in the workspace.

8. Run `pnpm install` to install all dependencies in your workspace and link all the packages you've added to your `CoSpace`.

9. Run `pnpm build` to build all the packages you've added to your `CoSpace` using your monorepo task runner.

10. There might be build issues due to different versions of dependencies resolved.

#### Debugging code from linked repos

In order to debug packages from different repos using [`Visual Studio Code`](https://code.visualstudio.com/docs/editor/debugging) you will need launch configuration at your `CoSpace` root. Example configuration for debugging presentation test-app and locally built presentation packages from [itwinjs-core](https://github.com/iTwin/itwinjs-core) (you may need to adjust paths according your `CoSpace` setup):

```json
{
  "launch": {
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
        "type": "node",
        "request": "launch",
        "name": "[presentation-test-app] Start Web Server",
        "cwd": "${workspaceFolder}/repos/presentation/apps/test-app/frontend",
        "runtimeExecutable": "npm",
        "runtimeArgs": ["run", "start"]
      },
      {
        "type": "chrome",
        "request": "launch",
        "name": "[presentation-test-app] Launch Browser",
        "url": "http://localhost:3000/",
        "webRoot": "${workspaceFolder}/repos/presentation/apps/test-app/frontend",
        "pathMapping": {
          "/@fs": ""
        }
      }
    ],
    "compounds": [
      {
        "name": "[presentation-test-app] Debug Test App",
        "configurations": ["[presentation-test-app] Start Web Backend", "[presentation-test-app] Start Web Server", "[presentation-test-app] Launch Browser"]
      }
    ]
  }
}
```
