/** Jest unit-test configuration (devDependencies only; the packaged visual
 *  is built by pbiviz/webpack and is unaffected by this file). */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "jsdom",
    roots: ["<rootDir>/test"],
    moduleFileExtensions: ["ts", "js", "json"],
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                tsconfig: {
                    target: "es2022",
                    module: "commonjs",
                    moduleResolution: "node",
                    esModuleInterop: true,
                    resolveJsonModule: true,
                    strict: false,
                    lib: ["es2022", "dom"]
                }
            }
        ]
    }
};
