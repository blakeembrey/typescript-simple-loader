import { resolve, relative, dirname } from 'path'
import { readFileSync, statSync } from 'fs'
import * as ts from 'typescript'
import extend = require('xtend')
import { parseQuery, urlToRequest } from 'loader-utils'
import * as tsconfig from 'tsconfig'
import arrify = require('arrify')

interface WebPackLoader {
  cacheable(flag?: boolean): void
  query: string
  resourcePath: string
  context: string
  sourceMap: boolean
  loaderIndex: number
  _compiler: any
  addDependency(fileName: string): void
  clearDependencies(): void
  emitWarning(warning: string): void
  emitError(error: string): void
  callback(err: Error): void
  callback(err: void, contents: string, sourceMap?: SourceMap): void
  options: {
    context: string
  }
}

interface SourceMap {
  sources: string[]
  file: string
  sourcesContent: string[]
}

interface Options {
  compiler?: string
  configFile?: string
  ignoreWarnings?: (string | number)[]
}

type FilesMap = ts.Map<{ version: number, text: string }>

interface LoaderInstance {
  files: FilesMap
  service: ts.LanguageService
}

/**
 * Hold a cache of loader instances.
 */
const loaderInstances: { [id: string]: LoaderInstance } = {}

/**
 * Keep temporary references to the current webpack loader for dependencies.
 */
let currentLoader: WebPackLoader

/**
 * Support TypeScript in Webpack.
 */
function loader (content: string): void {
  const loader: WebPackLoader = this
  const fileName = this.resourcePath
  const { files, service } = getLoaderInstance(this)
  let file = files[fileName]

  this.cacheable()

  // Set content on the first load. The watch task maintains reloads and
  // the version doesn't need to change when every dependency is re-run.
  if (!file) {
    file = files[fileName] = { version: 0, text: '' }
  }

  file.text = content
  file.version++

  currentLoader = loader
  const output = service.getEmitOutput(fileName)
  currentLoader = undefined

  if (output.emitSkipped) {
    loader.callback(new Error(`Emitting ${fileName} failed`))
    return
  }

  const result = output.outputFiles[loader.sourceMap ? 1 : 0].text
  let sourceMap: SourceMap

  if (loader.sourceMap) {
    sourceMap = JSON.parse(output.outputFiles[0].text)
    sourceMap.sources = [fileName]
    sourceMap.file = fileName
    sourceMap.sourcesContent = [content]
  }

  loader.callback(null, result, sourceMap)
}

/**
 * Read the configuration into an object.
 */
function readConfig (filename: string, loader: WebPackLoader, TS: typeof ts) {
  const config = filename ? tsconfig.readFileSync(filename) : {
    files: [],
    compilerOptions: {}
  }

  // Merge all possible compiler options together.
  config.compilerOptions = extend({
    target: 'es5',
    module: 'commonjs'
  }, config.compilerOptions, {
    sourceMap: loader.sourceMap,
    inlineSourceMap: false,
    inlineSources: false,
    declaration: false
  })

  return TS.parseConfigFile(config, TS.sys, filename)
}

/**
 * Create a TypeScript language service from the first instance.
 */
function createInstance (loader: WebPackLoader, options: Options): LoaderInstance {
  const context = loader.context
  const rootFile = loader.resourcePath
  const files: FilesMap = {}
  const ignoreWarnings = arrify(options.ignoreWarnings).map(Number)

  // Allow custom TypeScript compilers to be used.
  const TS: typeof ts = require(options.compiler || 'typescript')

  // Allow `configFile` option to override `tsconfig.json` lookup.
  const configFile = options.configFile ?
    resolve(context, options.configFile) :
    tsconfig.resolveSync(context)

  const config = readConfig(configFile, loader, TS)

  // Emit configuration errors.
  config.errors.forEach((error: ts.Diagnostic) => {
    loader.emitError(formatDiagnostic(error, TS))
  })

  const serviceHost: ts.LanguageServiceHost = {
    getScriptFileNames (): string[] {
      // Return an array of all file names. We can't return just the default
      // files because webpack may have traversed through a regular JS file
      // back to a TypeScript file and if we don't have that file in the array,
      // TypeScript will give us a file not found compilation error.
      return config.fileNames.concat(Object.keys(files))
    },
    getScriptVersion (fileName) {
      return files[fileName] && files[fileName].version.toString()
    },
    getScriptSnapshot (fileName: string): ts.IScriptSnapshot {
      const exists = fileExists(fileName)
      let file = files[fileName]

      // Load all files from the filesystem when they don't exist yet. This
      // is required for definition files and nested type information.
      if (exists) {
        if (!file) {
          try {
            file = files[fileName] = {
              version: 0,
              text: readFileSync(fileName, 'utf-8')
            }
          } catch (e) {
            return
          }
        }

        // Always add dependencies. This dependency could be a `.d.ts` file or
        // an external module that failed to compile the first time.
        if (currentLoader) {
          currentLoader.addDependency(fileName)
        }

        return TS.ScriptSnapshot.fromString(file.text)
      }

      delete files[fileName]
    },
    getCurrentDirectory: () => context,
    getCompilationSettings: () => config.options,
    getDefaultLibFileName: (options: ts.CompilerOptions) => {
      return TS.getDefaultLibFilePath(config.options)
    }
  }

  const service = TS.createLanguageService(serviceHost, TS.createDocumentRegistry())

  // Hook into the watch plugin to update file dependencies in TypeScript
  // before the files are reloaded. This is required because we need type
  // information to propagate upward and Webpack reloads from the top down.
  loader._compiler.plugin('watch-run', function (watching: any, cb: () => void) {
    const mtimes = watching.compiler.watchFileSystem.watcher.mtimes

    Object.keys(mtimes)
      .forEach((fileName) => {
        const file = files[fileName]

        // Reload when a definition changes.
        if (file && isDefinition(fileName)) {
          file.text = readFileSync(fileName, 'utf8')
          file.version++
        }
      })

    cb()
  })

  // Push all semantic and outstanding compilation errors on emit. This allows
  // us to notify of all errors, including files outside webpacks knowledge.
  loader._compiler.plugin('emit', function (compilation: any, cb: () => void) {
    const program = service.getProgram()

    program.getGlobalDiagnostics()
      .concat(program.getSemanticDiagnostics())
      .forEach((diagnostic) => {
        if (ignoreWarnings.indexOf(diagnostic.code) === -1) {
          compilation.warnings.push(new DiagnosticError(diagnostic, context, TS))
        }
      })


    program.getSyntacticDiagnostics()
      .forEach((diagnostic) => {
        compilation.errors.push(new DiagnosticError(diagnostic, context, TS))
      })

    cb()
  })

  return { service, files }
}

/**
 * Check a file exists in the file system.
 */
function fileExists (fileName: string): boolean {
  try {
    return statSync(fileName).isFile()
  } catch (e) {
    return false
  }
}

/**
 * Format a diagnostic object into a string.
 */
function formatDiagnostic (diagnostic: ts.Diagnostic, TS: typeof ts): string {
  const message = TS.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

  if (diagnostic.file) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)

    return `(${line + 1},${character + 1}): ${message} (${diagnostic.code})`
  }

  return `${message} (${diagnostic.code})`
}

/**
 * Create a Webpack-compatible diagnostic error.
 */
class DiagnosticError implements Error {
  name = 'DiagnosticError'
  message: string
  file: string

  constructor (diagnostic: ts.Diagnostic, context: string, TS: typeof ts) {
    this.message = formatDiagnostic(diagnostic, TS)

    if (diagnostic.file) {
      this.file = urlToRequest(relative(context, diagnostic.file.fileName))
    }
  }
}

/**
 * Get the current TypeScript instance for the loader.
 *
 * @param  {WebPackLoader}  loader
 * @return {LoaderInstance}
 */
function getLoaderInstance (loader: WebPackLoader): LoaderInstance {
  const id = loader.options.context + loader.sourceMap + loader.query
  const query = parseQuery(loader.query)

  if (loaderInstances[id]) {
    return loaderInstances[id]
  }

  const instance = createInstance(loader, query)
  loaderInstances[id] = instance
  return instance
}

/**
 * Check if a file is a defintion.
 */
function isDefinition (fileName: string): boolean {
  return /\.d\.ts$/.test(fileName)
}

export = loader
