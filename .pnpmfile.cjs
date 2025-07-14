function readPackage(pkg) {
  if (pkg.name === "@artilleryio/sketches-js") {
    // `@artilleryio/sketches-js` specifies `protobufjs` as a devDependency, although it should be a dependency...
    pkg.dependencies = {
      ...pkg.dependencies,
      protobufjs: "^7.2.4",
    };
  }

  // `typedoc` used by `@itwin/build-tools` does not have 5.7.0 typescript as a peerDependency
  if (pkg.name === "typedoc") {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      typescript: `${pkg.peerDependencies["typescript"]} || ^5.7.0`,
    };
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
