#!/bin/bash
set -e

CORE_VERSION=${1:-4.4.0}
UI_VERSION=${2:-4.9.0}

echo "Updating dependencies for local tarballs"
node ./scripts/regression/fixDependencies.js

echo "Installing dependencies"
pnpm install

echo "Building packages"
pnpm build:all

echo "Packing presentation-components"
cd packages/components
pnpm pack

echo "Packing presentation-testing"
cd ../testing
pnpm pack

echo "Packing presentation-core-interop"
cd ../core-interop
pnpm pack

echo "Collecting local tarballs"
cd ../..
node ./scripts/regression/gatherTarballs.js

echo "Setting up regression tests to run with core - $CORE_VERSION and appui - $UI_VERSION"
node ./scripts/regression/setupRegressionTests.js --coreVersion $CORE_VERSION --uiVersion $UI_VERSION --localPackagesPath ./built-packages

echo "Cleaning node_modules"
rm -rf **/node_modules

echo "Installing dependencies"
pnpm install

echo "Building full stack tests"
pnpm lage build --to presentation-full-stack-tests

echo "Running full stack tests"
pnpm --filter presentation-full-stack-tests test:dev
