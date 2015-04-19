import { resolve, relative } from 'path'
import { readFileSync, statSync } from 'fs'
import { EOL } from 'os'
import * as ts from 'typescript'
import extend = require('xtend')
import { parseQuery, urlToRequest } from 'loader-utils'
import { getProjectSync } from 'tsconfig'

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

type FilesMap = ts.Map<{ version: number, text: string }>

interface LoaderInstance {
  files: FilesMap
  service: ts.LanguageService
}

var currentLoader: WebPackLoader

const loaderInstances: { [key: number]: LoaderInstance } = {}

/**
 * Support TypeScript in Webpack.
 *
 * @param {string} content
 */
function loader (content: string): void {
  let loader: WebPackLoader = this
  let fileName = this.resourcePath
  let { files, service } = getLoaderInstance(this)
  let file = files[fileName]

  this.cacheable()

  // Only set content on the first load. The watch task maintains reloads and
  // the version doesn't need to change when every dependency is re-run.
  if (!file) {
    file = files[fileName] = { version: 0, text: '' }
  }

  file.text = content
  file.version++

  currentLoader = loader
  let output = service.getEmitOutput(fileName)
  currentLoader = undefined

  service.getSyntacticDiagnostics(fileName)
    .forEach((diagnostic) => {
      loader.emitError(formatDiagnostic(diagnostic))
    })

  if (output.emitSkipped) {
    loader.callback(new Error(`${fileName}: File not found`))
    return
  }

  let result = output.outputFiles[loader.sourceMap ? 1 : 0].text
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
 * Create a TypeScript language service from the first instance.
 *
 * @param {FilesMap}      files
 * @param {WebPackLoader} loader
 */
function createService (files: FilesMap, loader: WebPackLoader) {
  let context = loader.options.context
  let tsconfig = getProjectSync(context)
  let defaultFiles: string[] = [loader.resourcePath]

  let compilerOptions: any = {
    target: 'es5',
    module: 'commonjs'
  }

  if (tsconfig) {
    let files = tsconfig.project.files
      .map((file) => {
        return resolve(tsconfig.projectFileDirectory, file)
      })
      .filter((file) => {
        return file !== loader.resourcePath
      })

    // Include `tsconfig.json` files in default files to load.
    defaultFiles = defaultFiles.concat(files)

    // Extend default compiler options with `tsconfig.json`.
    compilerOptions = extend(compilerOptions, tsconfig.project.compilerOptions)
  }

  // Extend compiler options with the webpack options.
  compilerOptions = extend(compilerOptions, parseQuery(loader.query))
  compilerOptions.sourceMap = loader.sourceMap

  let config = ts.parseConfigFile({
    files: defaultFiles,
    compilerOptions
  })

  if (config.errors.length) {
    config.errors.forEach((error) => loader.emitError(formatDiagnostic(error)))
    return
  }

  let defaultLibFileName = ts.getDefaultLibFilePath(config.options)

  // Add the default library to default files.
  config.fileNames.push(defaultLibFileName)

  let serviceHost: ts.LanguageServiceHost = {
    getScriptFileNames (): string[] {
      return config.fileNames
    },
    getScriptVersion (fileName) {
      return files[fileName] && files[fileName].version.toString()
    },
    getScriptSnapshot (fileName: string): ts.IScriptSnapshot {
      let file = files[fileName]
      let exists = fileExists(fileName)

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

        // Reload the loader to refresh when any files change.
        if (currentLoader && isDefinition(fileName)) {
          currentLoader.addDependency(fileName)
        }

        return ts.ScriptSnapshot.fromString(file.text)
      }

      delete files[fileName]
    },
    getCurrentDirectory: () => context,
    getScriptIsOpen: () => true,
    getNewLine: () => EOL,
    getCompilationSettings: () => config.options,
    getDefaultLibFileName: (options: ts.CompilerOptions) => defaultLibFileName
  }

  return ts.createLanguageService(serviceHost, ts.createDocumentRegistry())
}

/**
 * Check a file exists in the file system.
 *
 * @param  {string}  fileName
 * @return {boolean}
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
 *
 * @param  {ts.Diagnostic} diagnostic
 * @return {string}
 */
function formatDiagnostic (diagnostic: ts.Diagnostic): string {
  let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

  if (diagnostic.file) {
    let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)

    return `(${line + 1},${character + 1}): ${message}`
  }

  return message
}

/**
 * Create a Webpack-compatible diagnostic error.
 */
class DiagosticError implements Error {
  name = 'DiagnosticError'
  message: string
  file: string

  constructor (public diagnostic: ts.Diagnostic, public context: string) {
    this.message = formatDiagnostic(this.diagnostic)

    if (this.diagnostic.file) {
      this.file = urlToRequest(relative(context, this.diagnostic.file.fileName))
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
  let index = loader.loaderIndex

  if (loaderInstances[index]) {
    return loaderInstances[index]
  }

  let files: FilesMap = {}
  let service = createService(files, loader)
  let instance: LoaderInstance = { files, service }

  loaderInstances[index] = instance

  // Hook into the watch plugin to update file dependencies in TypeScript
  // before the files are reloaded. This is required because we need type
  // information to propagate upward and Webpack reloads from the top down.
  loader._compiler.plugin('watch-run', function (watching: any, cb: () => void) {
    let mtimes = watching.compiler.watchFileSystem.watcher.mtimes

    Object.keys(mtimes)
      .forEach((fileName) => {
        let file = files[fileName]

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
    let program = service.getProgram()

    program.getSemanticDiagnostics().forEach((diagnostic) => {
      compilation.warnings.push(new DiagosticError(diagnostic, loader.options.context))
    })

    program.getSyntacticDiagnostics().forEach((diagnostic) => {
      compilation.errors.push(new DiagosticError(diagnostic, loader.options.context))
    })

    cb()
  })

  return instance
}

/**
 * Check if a file is a defintion.
 *
 * @param  {string}  fileName
 * @return {boolean}
 */
function isDefinition (fileName: string): boolean {
  return /\.d\.ts$/.test(fileName)
}

export = loader
