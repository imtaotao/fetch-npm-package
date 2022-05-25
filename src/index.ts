import { inflate } from "pako";
import npa from 'npm-package-arg';
import { untar } from "./untar";
import { removeTrailingSlashes } from './utils';

// export function fetchPkg() {
//   fetch(
//     "https://registry.npmjs.org/@types/react/-/react-18.0.9.tgz"
//   )
//     .then((res) => res.arrayBuffer())
//     .then((res) => {
//       console.time("xx");
//       return inflate(res);
//     })
//     .then((arr) => arr.buffer)
//     .then(untar)
//     .then((files) => {
//       files.forEach((file) => {
//         (file as any).code = new TextDecoder("utf-8").decode(file.buffer);
//       });
//       console.timeEnd("xx");
//       console.log(files);
//     });
// }


export interface FetcherOptions {
  registry?: string;
}

export class Fetcher {
  public options: Required<FetcherOptions>;

  constructor(options: FetcherOptions) {
    this.options = { ...options } as any;
    if (!("registry" in this.options)) {
      this.options.registry = "https://registry.npmjs.org";
    }
  }

  fetch(spec: string) {
    const url = removeTrailingSlashes(this.options.registry) + '/' + spec;
    console.log(npa);
    fetch(url, {
      // headers: this[_headers](),
      // spec: this.spec,
      // // never check integrity for packuments themselves
      // integrity: null,
    })
    console.log(url);
  }
}
