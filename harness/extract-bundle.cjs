// Extracts the resource JSON (containing the production js bundle) from the
// newest dist/*.pbiviz so packaged.cjs can drive the exact shipped artifact.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dist = fs.readdirSync("dist").filter((f) => f.endsWith(".pbiviz")).sort();
if (dist.length === 0) { console.error("no .pbiviz in dist/ — run pbiviz package first"); process.exit(1); }
const pbiviz = path.join("dist", dist[dist.length - 1]);
const pkg = JSON.parse(execSync(`unzip -p ${JSON.stringify(pbiviz)} package.json`).toString());
const resName = `resources/${pkg.visual.guid}.pbiviz.json`;
fs.mkdirSync(".tmp", { recursive: true });
fs.writeFileSync(".tmp/packaged-resource.json", execSync(`unzip -p ${JSON.stringify(pbiviz)} ${JSON.stringify(resName)}`));
console.log("extracted", resName, "from", pbiviz);
