"use strict";

var _interopRequireWildcard = require("/Users/alessiofimognari/sandbox/Next.Ecommerce.UI/node_modules/@babel/runtime/helpers/interopRequireWildcard.js").default;
var _interopRequireDefault = require("/Users/alessiofimognari/sandbox/Next.Ecommerce.UI/node_modules/@babel/runtime/helpers/interopRequireDefault.js").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _fs = _interopRequireDefault(require("fs"));
var _path = _interopRequireDefault(require("path"));
var parser = _interopRequireWildcard(require("@babel/parser"));
var babel = _interopRequireWildcard(require("@babel/core"));
var _pluginSyntaxDynamicImport = _interopRequireDefault(require("@babel/plugin-syntax-dynamic-import"));
var loadable = _interopRequireWildcard(require("./loadable"));
// Loadable babel plugin, stripped of entrypoint

const WEBPACK_CHUNK_NAME_TO_REPLACE = "{@next/templating-name}";
const WEBPACK_MANIFEST_ALIAS = "@manifest";
const MANIFEST_RELATIVE_TO_ROOT = "./src/templating/manifest.ts";
const POSSIBLE_TEMPLATE_FILE_EXTENSIONS = ["ts", "tsx", "js", "jsx"];
const findRoot = currentDir => {
  const dirContents = _fs.default.readdirSync(currentDir);
  if (!dirContents.includes("package.json") || !dirContents.includes("src")) {
    return findRoot(_path.default.join(currentDir, "../"));
  }
  return currentDir;
};
const filePathToDirPath = filePath => {
  return filePath.substring(0, filePath.lastIndexOf(process.platform === "win32" ? "\\" : "/"));
};
const getConstants = constantsFileLocation => {
  const constantFileContent = _fs.default.readFileSync(constantsFileLocation, "utf-8");
  const constants = parser.parse(constantFileContent, {
    sourceType: "module"
  });
  return constants.program.body.filter(node => node.type === "ExportNamedDeclaration");
};
const createConstantsMap = constantsFileLocation => {
  const constants = getConstants(constantsFileLocation);
  const map = {};
  constants.forEach(node => {
    const declaration = node.declaration.declarations[0];
    map[declaration.id.name] = declaration.init.value;
  });
  return map;
};
const getManifestFile = fileLocation => {
  const mainContent = _fs.default.readFileSync(fileLocation, "utf-8");
  return mainContent;
};
const transformManifestFile = (manifestFileLocation, componentName, reference, api) => {
  const constantsPath = _path.default.resolve(manifestFileLocation, "../constants.ts");
  const constantsMap = createConstantsMap(constantsPath);
  const manifestContent = getManifestFile(manifestFileLocation);
  let lineEndingFormat = "\n";
  if ((manifestContent.match(/\r\n/g) || []).length > (manifestContent.match(/(?<!\r)\n/g) || []).length) {
    lineEndingFormat = "\r\n";
  }
  let manifestFileContentArr = manifestContent.replace(new RegExp(WEBPACK_CHUNK_NAME_TO_REPLACE, "g"), componentName).replace("export ", "") // Strip export to simplify AST
  .replace(": Components", "") // Strip type to simplify AST
  .split(lineEndingFormat).filter(line => line !== ""); // Strip empty lines

  manifestFileContentArr = manifestFileContentArr.slice(manifestFileContentArr.indexOf("const MANIFEST = {"));

  // Trim templates from variable if they don't exist relative to file being transformed
  manifestFileContentArr = manifestFileContentArr.filter(line => {
    // Doens't start with any white space - NOT object property line (if has been formatted properly)
    if (line.charAt(0) === line.trim().charAt(0)) {
      return true;
    }
    const relativePath = `./${line.split("./")[1].split('"')[0]}`;
    const possiblePaths = [...POSSIBLE_TEMPLATE_FILE_EXTENSIONS.map(ext => _path.default.resolve(reference, "../", `${relativePath}.${ext}`)), ...POSSIBLE_TEMPLATE_FILE_EXTENSIONS.map(ext => _path.default.resolve(reference, "../", `${relativePath}/index.${ext}`))];
    return possiblePaths.filter(path => _fs.default.existsSync(path)).length === 1;
  });
  let manifestFileContent = manifestFileContentArr.join(lineEndingFormat);
  Object.entries(constantsMap).forEach(([key, value]) => {
    const keyToReplace = `[${key}]`;
    manifestFileContent = manifestFileContent.replace(keyToReplace, `["${value}"]`);
  });
  const finalOutput = babel.transformSync(manifestFileContent, {
    filename: reference,
    sourceType: "module",
    plugins: [function customLoadable() {
      return {
        visitor: {
          "ArrowFunctionExpression|FunctionExpression|ObjectMethod": p => {
            if (!loadable.hasLoadableComment(p)) return;
            loadable.transformImport(p, api);
          }
        }
      };
    }]
  });
  const manifestFileAST = babel.template.statement.ast`${finalOutput.code}`;
  return manifestFileAST;
};
var _default = api => {
  return {
    inherits: _pluginSyntaxDynamicImport.default,
    visitor: {
      Program: {
        enter(programPath, state) {
          const reference = state && state.file && state.file.opts.filename;
          programPath.traverse({
            ImportDeclaration: {
              enter(path) {
                const importedFile = path.node.source.value;
                if (!importedFile.startsWith(WEBPACK_MANIFEST_ALIAS)) return;
                try {
                  let componentName = "";
                  try {
                    componentName = importedFile.replace(WEBPACK_MANIFEST_ALIAS, "");
                    const [, ...importedName] = componentName.split("/");
                    componentName = importedName.join("/");

                    // Don't transform @manifest/constants
                    if (componentName === "constants") return;

                    // Only alphanumeric component names
                    if (!/^[a-zA-Z0-9-]*$/.test(componentName)) {
                      throw new Error();
                    }
                  } catch (e) {
                    throw new Error(`Bad import of manifest: ${importedFile}`);
                  }
                  const projectRoot = findRoot(filePathToDirPath(this.reference));
                  const manifestFileLoc = _path.default.resolve(projectRoot, MANIFEST_RELATIVE_TO_ROOT);
                  path.replaceWith(transformManifestFile(manifestFileLoc, componentName, this.reference, api));
                } catch (e) {
                  console.error(`Error modifying the @manifest import in ${this.reference}`);
                  console.error(e.message);
                  throw e;
                }
              }
            }
          }, {
            reference
          });
        }
      }
    }
  };
};
exports.default = _default;