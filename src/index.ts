import { inflate } from "pako";
import { untar } from './untar';

export function fetchPkg() {
  fetch('https://registry.npmjs.org/@arco-design/web-react/-/web-react-2.33.1.tgz')
    .then(res => res.arrayBuffer())
    .then(res => {
      console.time('xx')
      return inflate(res);
    })    
    .then(arr => arr.buffer)      
    .then(untar) 
    .then(files => {     
      files.forEach(file => {
        (file as any).code = new TextDecoder("utf-8").decode(file.buffer)
      });
      console.timeEnd('xx');
      console.log(files);
    });
}