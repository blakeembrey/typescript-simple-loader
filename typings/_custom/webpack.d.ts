declare module 'webpack' {
  function webpack (config: any, cb: (err: Error, result: any) => any): void

  export = webpack
}
