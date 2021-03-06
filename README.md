<div align='center'>
<h2>fetch-npm-package</h2>

[![NPM version](https://img.shields.io/npm/v/fetch-npm-package.svg?color=a1b858&label=)](https://www.npmjs.com/package/fetch-npm-package)

</div>

Use js to download and unzip the npm package. only supports use in the browser.

[Online](https://imtaotao.github.io/fetch-npm-package/)


## Usage

Options are optional.

```js
import { fetchFiles, fetchPackage, findTarget } from 'fetch-npm-package';

// All file are flattened
const files = await fetchFiles('react', {
  version: 'latest', // default is `latest`
  registry: 'https://registry.npmjs.org' // default is `https://registry.npmjs.org`
});
console.log(files);

// Aggregate as a folder
const folder = await fetchPackage('react');
console.log(folder);
```

By tarball request.

```js
const files = await fetchFiles.tarball('https://registry.npmjs.org/react/-/react-18.1.0.tgz');
console.log(files);

const folder = await fetchPackage.tarball('https://registry.npmjs.org/react/-/react-18.1.0.tgz');
console.log(folder);

```

Find package file.

```js
const folder = await fetchPackage('react');
console.log(folder);

const target = findTargetFile(folder, 'cjs/react-jsx-dev-runtime.development.js');
console.log(target.code);
```


## CDN

```html
<!DOCTYPE html>
<html lang='en'>
<body>
  <script src='https://unpkg.com/fetch-npm-package/dist/fetch.umd.js'></script>
  <script>
    const { fetchFiles, fetchPackage, findTarget } = FetchNpmPackage;
    // ...
  </script>
</body>
</html>
```


## Extended use

If you want to find a file more precisely based on package.json, you can use [node-package-exports](https://github.com/imtaotao/node-package-exports).