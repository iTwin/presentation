function readPackage(pkg, context) {
  if (pkg.name === "@artilleryio/sketches-js") {
    // `@artilleryio/sketches-js` specifies `protobufjs` as a devDependency, although it should be a dependency...
    pkg.dependencies = {
      ...pkg.dependencies,
      protobufjs: "^7.2.4",
    };
  }

  // @itwin/components-react, @itwin/core-react, @itwin/imodel-components-react and @itwin/appui-react has peerDependencies of itwinjs-core set to v4.
  // Need to change those peer dependencies to v5

  const itwinjsCorePeerDependencyOverride = "^4.0.0 || ^5.0.0";
  if (pkg.name === "@itwin/components-react") {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      "@itwin/appui-abstract": itwinjsCorePeerDependencyOverride,
      "@itwin/core-bentley": itwinjsCorePeerDependencyOverride,
    };
  }
  if (pkg.name === "@itwin/core-react") {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      "@itwin/appui-abstract": itwinjsCorePeerDependencyOverride,
      "@itwin/core-bentley": itwinjsCorePeerDependencyOverride,
    };
  }
  if (pkg.name === "@itwin/imodel-components-react") {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      "@itwin/appui-abstract": itwinjsCorePeerDependencyOverride,
      "@itwin/core-bentley": itwinjsCorePeerDependencyOverride,
      "@itwin/core-common": itwinjsCorePeerDependencyOverride,
      "@itwin/core-frontend": itwinjsCorePeerDependencyOverride,
      "@itwin/core-geometry": itwinjsCorePeerDependencyOverride,
      "@itwin/core-quantity": itwinjsCorePeerDependencyOverride,
    };
  }

  if (pkg.name === "@itwin/appui-react") {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      "@itwin/appui-abstract": itwinjsCorePeerDependencyOverride,
      "@itwin/core-bentley": itwinjsCorePeerDependencyOverride,
      "@itwin/core-common": itwinjsCorePeerDependencyOverride,
      "@itwin/core-frontend": itwinjsCorePeerDependencyOverride,
      "@itwin/core-geometry": itwinjsCorePeerDependencyOverride,
      "@itwin/core-quantity": itwinjsCorePeerDependencyOverride,
    };
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
