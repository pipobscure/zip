import { resolve } from 'node:path';
import { CentralDirectoryFileHeader } from './cdfh.js';
import { EndCentralDirectory } from './ecdh.js';
import type { ReadMap } from './readmap.js';
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { LocalFileHeader } from './lfh.js';
import { inflateRawSync } from 'node:zlib';

export class FileArchive implements ReadMap<Buffer> {
	#fd;
	#path: string;
	#entries: Map<string, { central: CentralDirectoryFileHeader; local: LocalFileHeader }> = new Map();
	constructor(path: string) {
		this.#path = resolve(path);
		const fd = (this.#fd = openSync(this.#path, 'r'));
		const len = fstatSync(fd).size;
		const buffer = Buffer.alloc(Math.min(len, 1024));
		readSync(fd, buffer, 0, buffer.byteLength, len - buffer.byteLength);
		const ecdh = new EndCentralDirectory(new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength));

		const startpos = ecdh.directoryOffset;
		const dirbuf = Buffer.alloc(ecdh.directoryBytes);
		readSync(fd, dirbuf, 0, dirbuf.byteLength, startpos);
		const dirview = new DataView(dirbuf.buffer, dirbuf.byteOffset, dirbuf.byteLength);
		let pos = 0;
		while (pos < dirbuf.byteLength) {
			const central = new CentralDirectoryFileHeader(dirview, pos);
			let lfhbuf = Buffer.alloc(30 + central.fileNameLength + central.extraFieldLength);
			readSync(fd, lfhbuf, 0, lfhbuf.byteLength, central.entryStart);
			let local = new LocalFileHeader(new DataView(lfhbuf.buffer, lfhbuf.byteOffset, lfhbuf.byteLength), 0);
			if (local.byteLength > lfhbuf.byteLength) {
				lfhbuf = Buffer.alloc(local.byteLength);
				readSync(fd, lfhbuf, 0, lfhbuf.byteLength, central.entryStart);
				local = new LocalFileHeader(new DataView(lfhbuf.buffer, lfhbuf.byteOffset, lfhbuf.byteLength), 0);
			}
			this.#entries.set(local.fileName, { central, local });
			pos += central.byteLength;
		}
	}
	has(name: string) {
		if (!this.#fd) return false;
		return this.#entries.has(name);
	}
	get(name: string) {
		if (!this.#fd) return;
		const { central = undefined, local = undefined } = this.#entries.get(name) ?? {};
		if (!central || !local) return;
		const compressedSize = local.flags & 3 ? central.compressedSize : local.compressedSize;
		if (!compressedSize) return;

		const compressed = Buffer.alloc(compressedSize);
		if (!compressed.byteLength) return compressed;
		readSync(this.#fd, compressed, 0, compressed.byteLength, central.entryStart + local.byteLength);
		if (!local.compressed) return compressed;
		return inflateRawSync(compressed);
	}
	keys() {
		if (!this.#fd) return [][Symbol.iterator]();
		return this.#entries.keys();
	}
	*values() {
		for (const name of this.keys()) {
			const value = this.get(name);
			if (value) yield value;
		}
	}
	*entries(): Generator<[string, Buffer | undefined]> {
		for (const name of this.keys()) {
			const value = this.get(name);
			if (value) yield [name, value];
		}
	}
	close() {
		if (!this.#fd) return;
		closeSync(this.#fd);
		this.#fd = 0;
	}
	[Symbol.dispose]() {
		this.close();
	}
}
