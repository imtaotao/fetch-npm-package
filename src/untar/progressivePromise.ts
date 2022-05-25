type Callback = (
  resolve: (value: unknown) => void,
  reject: (reason?: any) => void,
  progress: (value: ArrayBuffer) => void
) => void;

export function ProgressivePromise(fn: Callback) {
  const progressHistory: Array<any> = [];
  const progressCallbacks: Array<any> = [];

  function doProgress(value: ArrayBuffer) {
    for (let i = 0, l = progressCallbacks.length; i < l; ++i) {
      progressCallbacks[i](value);
    }
    progressHistory.push(value);
  }

  const promise = new Promise(function (resolve, reject) {
    fn(resolve, reject, doProgress);
  });

  (promise as any).progress = function (cb: any) {
    if (typeof cb !== "function") {
      throw new Error("cb is not a function.");
    }
    // Report the previous progress history
    for (let i = 0, l = progressHistory.length; i < l; ++i) {
      cb(progressHistory[i]);
    }
    progressCallbacks.push(cb);
    return promise;
  };

  const origThen = promise.then;

  (promise as any).then = function (
    onSuccess: (value: unknown) => void,
    onFail: (reason?: any) => void,
    onProgress: typeof doProgress
  ) {
    origThen.call(promise, onSuccess, onFail);
    if (onProgress !== undefined) {
      (promise as any).progress(onProgress);
    }
    return promise;
  };

  return promise;
}
