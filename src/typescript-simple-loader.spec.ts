import { join } from 'path'
import { readFile } from 'fs'
import { expect } from 'chai'
import extend = require('xtend')
import webpack = require('webpack')

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')
const TMP_DIR = join(__dirname, '..', '.tmp')
const OUTPUT_FILENAME = 'output.js'

function test (entryFile: string, expectedFile: string, options: any, done: Function) {
  const config = extend({
    entry: entryFile,
    output: {
      path: TMP_DIR,
      filename: OUTPUT_FILENAME
    },
    module: {
      loaders: [
        {
          test: /\.tsx?$/,
          loader: join(__dirname, '..'),
          exclude: /node_modules/
        }
      ]
    }
  }, options)

  webpack(config, function (err, result) {
    expect(result.compilation.errors).to.be.empty
    expect(result.compilation.warnings).to.be.empty

    readFile(join(TMP_DIR, OUTPUT_FILENAME), 'utf8', function (_, result) {
      readFile(expectedFile, 'utf8', function (_, expected) {
        expect(result).to.equal(expected)

        return done(err)
      })
    })
  })
}

describe('fixtures', function () {
  it('simple', function (done) {
    test(
      join(FIXTURES_DIR, 'simple', 'source.ts'),
      join(FIXTURES_DIR, 'simple', 'output.js'),
      null,
      done
    )
  })

  it('ntypescript', function (done) {
    test(
      join(FIXTURES_DIR, 'simple', 'source.ts'),
      join(FIXTURES_DIR, 'simple', 'output.js'),
      {
        module: {
          loaders: [
            {
              test: /\.tsx?$/,
              loader: join(__dirname, '..') + '?compiler=ntypescript',
              exclude: /node_modules/
            }
          ]
        }
      },
      done
    )
  })

  it('ignore warnings', function (done) {
    test(
      join(FIXTURES_DIR, 'ignore-warnings', 'source.ts'),
      join(FIXTURES_DIR, 'ignore-warnings', 'output.js'),
      {
        module: {
          loaders: [
            {
              test: /\.tsx?$/,
              loader: join(__dirname, '..') + '?ignoreWarnings[]=2304',
              exclude: /node_modules/
            }
          ]
        }
      },
      done
    )
  })

  it('tsx', function (done) {
    test(
      join(FIXTURES_DIR, 'tsx', 'source.tsx'),
      join(FIXTURES_DIR, 'tsx', 'output.js'),
      {
        context: join(FIXTURES_DIR, 'tsx'),
        module: {
          loaders: [
            {
              test: /\.tsx?$/,
              loader: join(__dirname, '..') + '?compiler=ntypescript',
              exclude: /node_modules/
            }
          ]
        }
      },
      done
    )
  })
})
