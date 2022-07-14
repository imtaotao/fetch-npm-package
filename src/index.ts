import { inflate } from "pako";
import { untar } from "./untar";

export { untar } from "./untar";

export interface FetchOptions {
  version?: string;
  registry?: string;
  parent?: boolean;
}

export class File {
  public code: string;
  public size: number;
  public name: string;
  public path: string;
  public type: "file" = "file";
  public parent?: Folder;

  constructor(code: string, size: number, name: string, path: string) {
    this.code = code;
    this.size = size;
    this.name = name;
    this.path = path;
  }
}

export class Folder {
  public name: string;
  public path: string;
  public type: "folder" = "folder";
  public children: Record<string, Folder | File> = Object.create(null);
  public parent?: Folder;

  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
  }

  get size() {
    let totalSize = 0;
    for (const key in this.children) {
      totalSize += this.children[key].size;
    }
    return totalSize;
  }

  get fileCount() {
    let count = 0;
    for (const key in this.children) {
      const item = this.children[key];
      count += item.type === "file" ? 1 : item.fileCount;
    }
    return count;
  }
}

export function createPackageFolder(
  files: Record<string, File>,
  setParent?: boolean
) {
  const keys = Object.keys(files);
  const packageFolder = new Folder("package", "package");
  if (setParent) packageFolder.parent = undefined;

  for (const filepath of keys) {
    let parent = packageFolder;
    const file = files[filepath];
    const parts = filepath.split("/");

    for (let i = 0; i < parts.length - 1; i++) {
      let current = parent.children[parts[i]];
      if (!current) {
        parent.children[parts[i]] = current = new Folder(
          parts[i],
          parts.slice(0, i + 1).join("/")
        );
        if (setParent) current.parent = parent;
      } else if (current.type === "file") {
        continue;
      }
      parent = current as Folder;
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
    .then((buffer) => inflate(new Uint8Array(buffer)))
    .then((arr) => arr.buffer)
    .then(untar)
    .then((files) => {
      const res: Record<string, File> = Object.create(null);
      for (const { name, size, type, buffer } of files) {
        // file
        if (type === "" || type === "0") {
          const code = new TextDecoder("utf-8").decode(buffer);
          const parts = name.split("/");
          const file = new File(
            code,
            size,
            parts.slice(-1)[0],
            parts.slice(1).join("/")
          );
          res[file.path] = file;
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
    target = (target as Folder).children[parts[i]];
    if (i !== l - 1 && target.type !== "folder") {
      return null;
    }
  }
  // Maybe `object.toString` function
  return target && (target.type === "file" || target.type === "folder")
    ? target
    : null;
}
