# TypeScript Simple Loader

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

> Feature complete TypeScript loader for webpack.

![Webpack Hot Module Replacement with TypeScript](https://github.com/blakeembrey/typescript-simple-loader/raw/master/screenshot.png)

## Installation

```
npm install typescript-simple-loader --save
```

## Features

* Supports [`tsconfig.json`](https://github.com/Microsoft/TypeScript/wiki/tsconfig.json)
* Supports Source Maps
* Emits *all* TypeScript issues (including external dependencies like `.d.ts` files)
* Emits semantic diagnostics as webpack warnings (doesn't block compilation)
* Watches and reloads every compilation dependency (yes, even `d.ts` files)

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

### Load `tsconfig.json`

The loader automatically resolves and parses `tsconfig.json`, based on the Webpack context, using [tsconfig](https://github.com/TypeStrong/tsconfig).

### Configuration Options

You can set options by using the query string.

```js
loaders: [
  {
    test: /\.ts$/,
    loader: 'typescript-simple-loader?compiler=ntypescript&configFile=tsconfig.json&ignoreWarnings[]=2304'
  }
]
```

* **compiler** Set a custom TypeScript compiler compatible with `typescript@>=1.5-alpha`
* **configFile** Manually set the location of the `tsconfig.json` file
* **ignoreWarnings** Set an array of TypeScript diagnostic codes to ignore

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
