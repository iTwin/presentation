function readPackage(pkg, context) {
  if (pkg.name === "@artilleryio/sketches-js") {
    // `@artilleryio/sketches-js` specifies `protobufjs` as a devDependency, although it should be a dependency...
    pkg.dependencies = {
      ...pkg.dependencies,
      protobufjs: "^7.2.4",
    };
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
