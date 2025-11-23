# Zip Utilities Library

A lightweight, zero-dependency TypeScript library for reading, writing,
and manipulating ZIP archives using Web Streams, ArrayBuffers, and Node
file handles.

## Features

 * Read ZIP archives from ArrayBuffer, Buffer, or filesystem.
 * Write custom ZIP entries with automatic deflate, CRC32, timestamps, and optional metadata.
 * Stream-compatible internals---supports readable & writable streams.
 * Strong TypeScript typings.
 * No external dependencies.
 * Main Entry is Browser compatible
 * Secondary Entry-Points are `Map` compatible and useful for accessing files/buffer directly

## Installation

``` bash
npm install @pipobscure/zip
```

## Entry

Represents a single file or directory inside a ZIP archive.

### Usage

``` ts
import { Entry } from "@pipobscure/zip";

const buffer = await fetch("archive.zip").then(r => r.arrayBuffer());
for (const entry of Entry.read(buffer)) {
    console.log(entry.name, entry.size);
    const content = await entry.content();
}
```

## Secondary Entry Points

### file --- ZipFile

``` ts
import { ZipFile } from "@pipobscure/zip/file";
import { open } from "fs/promises";
const fd = await open("archive.zip", "r");
const zip = await ZipFile.open(fd);
```

### buffer --- ZipBuffer

``` ts
import { ZipBuffer } from "@pipobscure/zip/buffer";
const zip = new ZipBuffer(fs.readFileSync("archive.zip"));
```

## License

[EUPL-1.2](https://interoperable-europe.ec.europa.eu/licence/european-union-public-licence-version-12-eupl)
