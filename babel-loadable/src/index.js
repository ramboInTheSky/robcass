import fs from "fs"
import nodePath from "path"
import * as parser from "@babel/parser"
import * as babel from "@babel/core"
import syntaxDynamicImport from "@babel/plugin-syntax-dynamic-import"

// Loadable babel plugin, stripped of entrypoint
import * as loadable from "./loadable"

const WEBPACK_CHUNK_NAME_TO_REPLACE = "{@next/templating-name}"
const WEBPACK_MANIFEST_ALIAS = "@manifest"

const MANIFEST_RELATIVE_TO_ROOT = "./src/templating/manifest.ts"

const POSSIBLE_TEMPLATE_FILE_EXTENSIONS = ["ts", "tsx", "js", "jsx"]

const findRoot = currentDir => {
    const dirContents = fs.readdirSync(currentDir)
    if (!dirContents.includes("package.json") || !dirContents.includes("src")) {
        return findRoot(nodePath.join(currentDir, "../"))
    }
    return currentDir
}

const filePathToDirPath = filePath => {
    return filePath.substring(0, filePath.lastIndexOf(process.platform === "win32" ? "\\" : "/"))
}

const getConstants = constantsFileLocation => {
    const constantFileContent = fs.readFileSync(constantsFileLocation, "utf-8")
    const constants = parser.parse(constantFileContent, {
        sourceType: "module",
    })
    return constants.program.body.filter(node => node.type === "ExportNamedDeclaration")
}

const createConstantsMap = constantsFileLocation => {
    const constants = getConstants(constantsFileLocation)
    const map = {}
    constants.forEach(node => {
        const declaration = node.declaration.declarations[0]
        map[declaration.id.name] = declaration.init.value
    })
    return map
}

const getManifestFile = fileLocation => {
    const mainContent = fs.readFileSync(fileLocation, "utf-8")
    return mainContent
}

const transformManifestFile = (manifestFileLocation, componentName, reference, api) => {
    const constantsPath = nodePath.resolve(manifestFileLocation, "../constants.ts")
    const constantsMap = createConstantsMap(constantsPath)

    const manifestContent = getManifestFile(manifestFileLocation)

    let lineEndingFormat = "\n"
    if ((manifestContent.match(/\r\n/g) || []).length > (manifestContent.match(/(?<!\r)\n/g) || []).length) {
        lineEndingFormat = "\r\n"
    }

    let manifestFileContentArr = manifestContent
        .replace(new RegExp(WEBPACK_CHUNK_NAME_TO_REPLACE, "g"), componentName)
        .replace("export ", "") // Strip export to simplify AST
        .replace(": Components", "") // Strip type to simplify AST
        .split(lineEndingFormat)
        .filter(line => line !== "") // Strip empty lines

    manifestFileContentArr = manifestFileContentArr.slice(manifestFileContentArr.indexOf("const MANIFEST = {"))

    // Trim templates from variable if they don't exist relative to file being transformed
    manifestFileContentArr = manifestFileContentArr.filter(line => {
        // Doens't start with any white space - NOT object property line (if has been formatted properly)
        if (line.charAt(0) === line.trim().charAt(0)) {
            return true
        }
        const relativePath = `./${line.split("./")[1].split('"')[0]}`
        const possiblePaths = [
            ...POSSIBLE_TEMPLATE_FILE_EXTENSIONS.map(ext =>
                nodePath.resolve(reference, "../", `${relativePath}.${ext}`),
            ),
            ...POSSIBLE_TEMPLATE_FILE_EXTENSIONS.map(ext =>
                nodePath.resolve(reference, "../", `${relativePath}/index.${ext}`),
            ),
        ]
        return possiblePaths.filter(path => fs.existsSync(path)).length === 1
    })

    let manifestFileContent = manifestFileContentArr.join(lineEndingFormat)

    Object.entries(constantsMap).forEach(([key, value]) => {
        const keyToReplace = `[${key}]`
        manifestFileContent = manifestFileContent.replace(keyToReplace, `["${value}"]`)
    })

    const finalOutput = babel.transformSync(manifestFileContent, {
        filename: reference,
        sourceType: "module",
        plugins: [
            function customLoadable() {
                return {
                    visitor: {
                        "ArrowFunctionExpression|FunctionExpression|ObjectMethod": p => {
                            if (!loadable.hasLoadableComment(p)) return
                            loadable.transformImport(p, api)
                        },
                    },
                }
            },
        ],
    })

    const manifestFileAST = babel.template.statement.ast`${finalOutput.code}`

    return manifestFileAST
}

export default api => {
    return {
        inherits: syntaxDynamicImport,
        visitor: {
            Program: {
                enter(programPath, state) {
                    const reference = state && state.file && state.file.opts.filename
                    programPath.traverse(
                        {
                            ImportDeclaration: {
                                enter(path) {
                                    const importedFile = path.node.source.value
                                    if (!importedFile.startsWith(WEBPACK_MANIFEST_ALIAS)) return
                                    try {
                                        let componentName = ""
                                        try {
                                            componentName = importedFile.replace(WEBPACK_MANIFEST_ALIAS, "")
                                            const [, ...importedName] = componentName.split("/")
                                            componentName = importedName.join("/")

                                            // Don't transform @manifest/constants
                                            if (componentName === "constants") return

                                            // Only alphanumeric component names
                                            if (!/^[a-zA-Z0-9-]*$/.test(componentName)) {
                                                throw new Error()
                                            }
                                        } catch (e) {
                                            throw new Error(`Bad import of manifest: ${importedFile}`)
                                        }

                                        const projectRoot = findRoot(filePathToDirPath(this.reference))
                                        const manifestFileLoc = nodePath.resolve(projectRoot, MANIFEST_RELATIVE_TO_ROOT)
                                        path.replaceWith(
                                            transformManifestFile(manifestFileLoc, componentName, this.reference, api),
                                        )
                                    } catch (e) {
                                        console.error(`Error modifying the @manifest import in ${this.reference}`)
                                        console.error(e.message)
                                        throw e
                                    }
                                },
                            },
                        },
                        {reference},
                    )
                },
            },
        },
    }
}
