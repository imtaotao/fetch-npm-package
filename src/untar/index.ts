// fork js-untar (https://github.com/InvokIT/js-untar)

import { TarFile, workerBody } from "./worker";
import { ProgressivePromise } from "./progressivePromise";

let workerUrl: string;

function inlineWorkUrl(fn: (...args: Array<any>) => void) {
  const fnBodyStr = fn
    .toString()
    .trim()
    .match(/^function\s*\w*\s*\([\w\s,]*\)\s*{([\w\W]*?)}$/)![1];
  return globalThis.URL.createObjectURL(
    new globalThis.Blob([fnBodyStr], {
      type: "text/javascript",
    })
  );
}

export function untar(arrayBuffer: ArrayBuffer) {
  if (!globalThis.Worker) {
    throw new Error(
      "Worker implementation is not available in this environment."
    );
  }

  return ProgressivePromise((resolve, reject, progress) => {
    if (!workerUrl) {
      workerUrl = inlineWorkUrl(workerBody);
    }
    const worker = new globalThis.Worker(workerUrl);
    const files: Array<TarFile> = [];

    worker.onerror = function (err) {
      reject(err);
    };

    worker.onmessage = function (message) {
      message = message.data;

      switch (message.type) {
        case "log":
          (console as any)[message.data.level]("Worker: " + message.data.msg);
          break;
        case "extract":
          const file = message.data;
          files.push(file);
          progress(file);
          break;
        case "complete":
          worker.terminate();
          resolve(files);
          break;
        case "error":
          // console.log("error message");
          worker.terminate();
          reject(new Error(message.data.message));
          break;
        default:
          worker.terminate();
          reject(new Error("Unknown message from worker: " + message.type));
          break;
      }
    };

    // console.info("Sending arraybuffer to worker for extraction.");
    worker.postMessage({ type: "extract", buffer: arrayBuffer }, [arrayBuffer]);
  }) as Promise<Array<TarFile>>;
}
