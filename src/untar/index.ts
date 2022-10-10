// js-untar (https://github.com/InvokIT/js-untar)
import { TarFile, workerBodyCode } from "./worker";
import { ProgressivePromise } from "./progressivePromise";

let workerUrl: string;

function inlineWorkUrl(code: string) {
  return globalThis.URL.createObjectURL(
    new globalThis.Blob([code], { type: "text/javascript" })
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
      workerUrl = inlineWorkUrl(workerBodyCode);
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
