import { inflate } from "pako";
import { untar } from "./untar";

export { untar } from "./untar";

export interface File {
  name: string;
  size: number;
  path: string;
  type: "file";
  code: string;
  parent?: Folder;
}

export interface Folder {
  name: string;
  size: number;
  path: string;
  type: "folder";
  children: Record<string, Folder | File>;
  parent?: Folder;
}

export interface FetchOptions {
  version?: string;
  registry?: string;
  parent?: boolean;
}

function createFolder(name: string, path: string): Folder {
  return {
    name,
    path,
    children: {},
    type: "folder",
    get size() {
      let totalSize = 0;
      for (const key in this.children) {
        totalSize += this.children[key].size;
      }
      return totalSize;
    },
  };
}

function createPackageFolder(files: Array<File>, setParent?: boolean) {
  const packageFolder = createFolder("package", "package");
  if (setParent) packageFolder.parent = undefined;

  for (const file of files) {
    let parent = packageFolder;
    const parts = file.path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      let current = parent.children[parts[i]];
      if (!current) {
        parent.children[parts[i]] = current = createFolder(
          parts[i],
          parts.slice(0, i + 1).join("/")
        );
        if (setParent) current.parent = parent;
      } else if (current.type === "file") {
        continue;
      }
      parent = current;
    }
    if (setParent) file.parent = parent;
    parent.children[file.name] = file;
  }
  return packageFolder;
}

export function fetchFiles(pkgName: string, options?: FetchOptions) {
  let { version, registry } = options || {};
  if (!version) version = "latest";
  if (!registry) registry = "https://registry.npmjs.org";
  if (!registry.endsWith("/")) registry += "/";

  return fetch(`${registry}${pkgName}/${version}`)
    .then((res) => res.json())
    .then((pkgDetail) => fetchFiles.tarball(pkgDetail.dist.tarball));
}

fetchFiles.tarball = function (tarball: string) {
  return fetch(tarball)
    .then((res) => res.arrayBuffer())
    .then(inflate)
    .then((arr) => arr.buffer)
    .then(untar)
    .then((files) => {
      const res: Array<File> = [];
      for (const { name, size, type, buffer } of files) {
        // file
        if (type === "" || type === "0") {
          const code = new TextDecoder("utf-8").decode(buffer);
          const parts = name.split("/");
          res.push({
            size,
            code,
            type: "file",
            name: parts.slice(-1)[0],
            path: parts.slice(1).join("/"),
          });
        }
      }
      return res;
    });
};

export function fetchPackage(pkgName: string, options?: FetchOptions) {
  return fetchFiles(pkgName, options).then((files) =>
    createPackageFolder(files, options ? options.parent : false)
  );
}

fetchPackage.tarball = function (tarball: string, setParent?: boolean) {
  return fetchFiles
    .tarball(tarball)
    .then((files) => createPackageFolder(files, setParent));
};

export function findTarget(folder: Folder, path: string) {
  const parts = path.split("/");
  let target: File | Folder = folder;
  for (let i = 0, l = parts.length; i < l; i++) {
    if (i === l - 1) {
      target = (target as Folder).children[parts[i]];
    } else {
      target = (target as Folder).children[parts[i]];
      if (target.type !== "folder") {
        return null;
      }
    }
  }
  return target;
}
