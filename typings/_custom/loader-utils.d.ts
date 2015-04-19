declare module 'loader-utils' {
  export function parseQuery (queryString: string): { [key: string]: any }
  export function urlToRequest (fileName: string): string
}
