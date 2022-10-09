export interface TarFile {
  name: string;
  mode: string;
  uid: number;
  gid: number;
  size: number;
  mtime: number;
  checksum: number;
  type: string;
  linkname: string;
  ustarFormat: string;
  version: string;
  uname: string;
  gname: string;
  devmajor: number;
  devminor: number;
  namePrefix: string;
  buffer: ArrayBuffer;
  prefix?: string;
}

// Avoid being translated by babel, use strings
export const workerBodyCode = `
  class UntarWorker {
    onmessage(msg) {
      try {
        if (msg.data.type === "extract") {
          this.untarBuffer(msg.data.buffer);
        } else {
          throw new Error("Unknown message type: " + msg.data.type);
        }
      } catch (err) {
        this.postError(err);
      }
    }

    postError(err) {
      // console.info("postError(" + err.message + ")" + " " + JSON.stringify(err));
      this.postMessage({ type: "error", data: { message: err.message } });
    }

    postLog(level, msg) {
      // console.info("postLog");
      this.postMessage({ type: "log", data: { level: level, msg: msg } });
    }

    untarBuffer(arrayBuffer) {
      try {
        const tarFileStream = new UntarFileStream(arrayBuffer);

        while (tarFileStream.hasNext()) {
          const file = tarFileStream.next();
          this.postMessage({ type: "extract", data: file }, [file.buffer]);
        }

        this.postMessage({ type: "complete" });
      } catch (err) {
        this.postError(err);
      }
    }

    postMessage(msg, transfers) {
      // console.info("postMessage(" + msg + ", " + JSON.stringify(transfers) + ")");
      self.postMessage(msg, transfers);
    }
  }

  if (typeof self !== "undefined") {
    // We're running in a worker thread
    const worker = new UntarWorker();
    self.onmessage = function (msg) {
      worker.onmessage(msg);
    };
  }

  // Source: https://gist.github.com/pascaldekloe/62546103a1576803dade9269ccf76330
  // Unmarshals an Uint8Array to string.
  function decodeUTF8(bytes) {
    let s = "";
    let i = 0;
    while (i < bytes.length) {
      let c = bytes[i++];
      if (c > 127) {
        if (c > 191 && c < 224) {
          if (i >= bytes.length) {
            throw "UTF-8 decode: incomplete 2-byte sequence";
          }
          c = ((c & 31) << 6) | (bytes[i] & 63);
        } else if (c > 223 && c < 240) {
          if (i + 1 >= bytes.length) {
            throw "UTF-8 decode: incomplete 3-byte sequence";
          }
          c = ((c & 15) << 12) | ((bytes[i] & 63) << 6) | (bytes[++i] & 63);
        } else if (c > 239 && c < 248) {
          if (i + 2 >= bytes.length) {
            throw "UTF-8 decode: incomplete 4-byte sequence";
          }
          c =
            ((c & 7) << 18) |
            ((bytes[i] & 63) << 12) |
            ((bytes[++i] & 63) << 6) |
            (bytes[++i] & 63);
        } else {
          throw (
            "UTF-8 decode: unknown multiByte start 0x" +
            c.toString(16) +
            " at index " +
            (i - 1)
          );
        }
        ++i;
      }

      if (c <= 0xffff) {
        s += String.fromCharCode(c);
      } else if (c <= 0x10ffff) {
        c -= 0x10000;
        s += String.fromCharCode((c >> 10) | 0xd800);
        s += String.fromCharCode((c & 0x3ff) | 0xdc00);
      } else {
        throw (
          "UTF-8 decode: code point 0x" +
          c.toString(16) +
          " exceeds UTF-16 reach"
        );
      }
    }
    return s;
  }

  class PaxHeader {
    constructor(fields) {
      this._fields = fields;
    }

    static parse(buffer) {
      // https://www.ibm.com/support/knowledgecenter/en/SSLTBW_2.3.0/com.ibm.zos.v2r3.bpxa500/paxex.htm
      // An extended header shall consist of one or more records, each constructed as follows:
      // "%d %s=%s\\n", <length>, <keyword>, <value>

      // The extended header records shall be encoded according to the ISO/IEC10646-1:2000 standard (UTF-8).
      // The <length> field, <blank>, equals sign, and <newline> shown shall be limited to the portable character set, as
      // encoded in UTF-8. The <keyword> and <value> fields can be any UTF-8 characters. The <length> field shall be the
      // decimal length of the extended header record in octets, including the trailing <newline>.

      let bytes = new Uint8Array(buffer);
      const fields = [];

      while (bytes.length > 0) {
        // Decode bytes up to the first space character; that is the total field length
        const fieldLength = parseInt(
          decodeUTF8(bytes.subarray(0, bytes.indexOf(0x20)))
        );
        const fieldText = decodeUTF8(bytes.subarray(0, fieldLength));
        const fieldMatch = fieldText.match(/^\\d+ ([^=]+)=(.*)\\n$/);

        if (fieldMatch === null) {
          throw new Error("Invalid PAX header data format.");
        }

        const fieldName = fieldMatch[1];
        let fieldValue = fieldMatch[2];

        if (fieldValue.length === 0) {
          fieldValue = null;
        } else if (fieldValue.match(/^\\d+$/) !== null) {
          // If it's a integer field, parse it as int
          fieldValue = parseInt(fieldValue);
        }
        // Don't parse float values since precision is lost

        const field = {
          name: fieldName,
          value: fieldValue,
        };
        fields.push(field);
        bytes = bytes.subarray(fieldLength); // Cut off the parsed field data
      }

      return new PaxHeader(fields);
    }

    applyHeader(file) {
      // Apply fields to the file
      // If a field is of value null, it should be deleted from the file
      // https://www.mkssoftware.com/docs/man4/pax.4.asp

      this._fields.forEach((field) => {
        let fieldName = field.name;
        let fieldValue = field.value;

        if (fieldName === "path") {
          // This overrides the name and prefix fields in the following header block.
          fieldName = "name";

          if (file.prefix !== undefined) {
            delete file.prefix;
          }
        } else if (fieldName === "linkpath") {
          // This overrides the linkname field in the following header block.
          fieldName = "linkname";
        }

        if (fieldValue === null) {
          delete file[fieldName];
        } else {
          file[fieldName] = fieldValue;
        }
      });
    }
  }

  class UntarStream {
    _position;
    _bufferView;

    constructor(arrayBuffer) {
      this._bufferView = new DataView(arrayBuffer);
      this._position = 0;
    }

    readString(charCount) {
      // console.log("readString: position " + this.position() + ", " + charCount + " chars");
      const charSize = 1;
      const byteCount = charCount * charSize;
      const charCodes = [];

      for (let i = 0; i < charCount; ++i) {
        const charCode = this._bufferView.getUint8(
          this.position() + i * charSize
        );
        if (charCode !== 0) {
          charCodes.push(charCode);
        } else {
          break;
        }
      }

      this.seek(byteCount);
      return String.fromCharCode.apply(null, charCodes);
    }

    readBuffer(byteCount) {
      let buf;

      if (typeof ArrayBuffer.prototype.slice === "function") {
        buf = this._bufferView.buffer.slice(
          this.position(),
          this.position() + byteCount
        );
      } else {
        buf = new ArrayBuffer(byteCount);
        const target = new Uint8Array(buf);
        const src = new Uint8Array(
          this._bufferView.buffer,
          this.position(),
          byteCount
        );
        target.set(src);
      }

      this.seek(byteCount);
      return buf;
    }

    seek(byteCount) {
      this._position += byteCount;
    }

    peekUint32() {
      return this._bufferView.getUint32(this.position(), true);
    }

    position(newpos) {
      if (newpos !== undefined) {
        this._position = newpos;
      }
      return this._position;
    }

    size() {
      return this._bufferView.byteLength;
    }
  }

  class UntarFileStream {
    constructor(arrayBuffer) {
      this._stream = new UntarStream(arrayBuffer);
      this._globalPaxHeader = null;
    }

    hasNext() {
      // A tar file ends with 4 zero bytes
      return (
        this._stream.position() + 4 < this._stream.size() &&
        this._stream.peekUint32() !== 0
      );
    }

    next() {
      return this._readNextFile();
    }

    _readNextFile() {
      let paxHeader = null;
      let isHeaderFile = false;
      let file = {};

      const stream = this._stream;
      const headerBeginPos = stream.position();
      const dataBeginPos = headerBeginPos + 512;

      // Read header
      file.name = stream.readString(100);
      file.mode = stream.readString(8);
      file.uid = parseInt(stream.readString(8));
      file.gid = parseInt(stream.readString(8));
      file.size = parseInt(stream.readString(12), 8);
      file.mtime = parseInt(stream.readString(12), 8);
      file.checksum = parseInt(stream.readString(8));
      file.type = stream.readString(1);
      file.linkname = stream.readString(100);
      file.ustarFormat = stream.readString(6);

      if (file.ustarFormat.indexOf("ustar") > -1) {
        file.version = stream.readString(2);
        file.uname = stream.readString(32);
        file.gname = stream.readString(32);
        file.devmajor = parseInt(stream.readString(8));
        file.devminor = parseInt(stream.readString(8));
        file.namePrefix = stream.readString(155);

        if (file.namePrefix.length > 0) {
          file.name = file.namePrefix + "/" + file.name;
        }
      }

      stream.position(dataBeginPos);

      // Derived from https://www.mkssoftware.com/docs/man4/pax.4.asp
      // and https://www.ibm.com/support/knowledgecenter/en/SSLTBW_2.3.0/com.ibm.zos.v2r3.bpxa500/pxarchfm.htm
      switch (file.type) {
        case "0": // Normal file is either "0" or "\0".
        case "": // In case of "\0", readString returns an empty string, that is "".
          file.buffer = stream.readBuffer(file.size);
          break;
        case "1": // Link to another file already archived
          // TODO Should we do anything with these?
          break;
        case "2": // Symbolic link
          // TODO Should we do anything with these?
          break;
        case "3": // Character special device (what does this mean??)
          break;
        case "4": // Block special device
          break;
        case "5": // Directory
          break;
        case "6": // FIFO special file
          break;
        case "7": // Reserved
          break;
        case "g": // Global PAX header
          isHeaderFile = true;
          this._globalPaxHeader = PaxHeader.parse(stream.readBuffer(file.size));
          break;
        case "x": // PAX header
          isHeaderFile = true;
          paxHeader = PaxHeader.parse(stream.readBuffer(file.size));
          break;
        default: // Unknown file type
          break;
      }

      if (file.buffer === undefined) {
        file.buffer = new ArrayBuffer(0);
      }

      let dataEndPos = dataBeginPos + file.size;

      // File data is padded to reach a 512 byte boundary; skip the padded bytes too.
      if (file.size % 512 !== 0) {
        dataEndPos += 512 - (file.size % 512);
      }

      stream.position(dataEndPos);

      if (isHeaderFile) {
        file = this._readNextFile();
      }

      if (this._globalPaxHeader !== null) {
        this._globalPaxHeader.applyHeader(file);
      }

      if (paxHeader !== null) {
        paxHeader.applyHeader(file);
      }

      return file;
    }
  }
`;
