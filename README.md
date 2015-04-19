# TypeScript Simple Loader

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

> Feature complete TypeScript loader for webpack.

## Installation

```
npm install typescript-simple-loader --save
```

## Features

* Supports [`tsconfig.json`](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json)
* Supports Source Maps
* Emits *all* TypeScript issues (including external dependencies like `.d.ts` files)
* Emits semantic diagnostics as webpack warnings (doesn't block compilation)
* Watches and reloads every compilation dependency (yes, `d.ts` files too)

## Usage

```js
module.exports = {
  entry: './main.ts',
  resolve: {
    extensions: ['', '.ts', '.js']
  },
  module: {
    loaders: [
      {
        test: /\.ts$/,
        loader: 'typescript-simple-loader'
      }
    ]
  }
}
```

### Override Compiler Options

You can override specific compilation options by passing them in with the query string.

```js
loaders: [
  {
    test: /\.ts$/,
    loader: 'typescript-simple-loader?target=es6'
  }
]
```

### Load `tsconfig.json`

The loader automatically loads `tsconfig.json` options and files, no extra effort required.

## License

MIT

[npm-image]: https://img.shields.io/npm/v/typescript-simple-loader.svg?style=flat
[npm-url]: https://npmjs.org/package/typescript-simple-loader
[downloads-image]: https://img.shields.io/npm/dm/typescript-simple-loader.svg?style=flat
[downloads-url]: https://npmjs.org/package/typescript-simple-loader
[travis-image]: https://img.shields.io/travis/blakeembrey/typescript-simple-loader.svg?style=flat
[travis-url]: https://travis-ci.org/blakeembrey/typescript-simple-loader
[coveralls-image]: https://img.shields.io/coveralls/blakeembrey/typescript-simple-loader.svg?style=flat
[coveralls-url]: https://coveralls.io/r/blakeembrey/typescript-simple-loader?branch=master
