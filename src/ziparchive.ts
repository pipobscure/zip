import { readFileSync } from 'node:fs';
import type { ReadMap } from './readmap.js';
import { EndCentralDirectory } from './ecd.js';
import { CentralDirectoryFileHeader } from './cdfh.js';
import { ZipEntry } from './zipentry.js';

export class ZipArchive implements ReadMap<Buffer> {
	#view: DataView;
	#ecd;
	constructor(buffer: ArrayBuffer, byteOffset = 0, byteLength = buffer.byteLength) {
		this.#view = new DataView(buffer, byteOffset, byteLength);
		this.#ecd = new EndCentralDirectory(this.#view);
	}
	#cache: Map<string, ZipEntry> = new Map();
	*[Symbol.iterator]() {
		let pos = this.#ecd.directoryOffset;
		while (pos < this.#ecd.offset) {
			const header = new CentralDirectoryFileHeader(this.#view, pos);
			const entry = new ZipEntry(this.#view, header);
			this.#cache.set(entry.name, entry);
			yield entry;
			pos += header.byteLength;
		}
	}
	has(name: string) {
		if (this.#cache.size) return this.#cache.has(name);
		[...this];
		return this.#cache.has(name);
	}
	get(name: string) {
		if (this.#cache.size) return this.#cache.get(name)?.content;
		[...this];
		return this.#cache.get(name)?.content;
	}
	*keys() {
		const source = this.#cache.size ? this.#cache.keys() : [...this].map((x) => x.name);
		for (const key of source) {
			yield key;
		}
	}
	*values() {
		const source = this.#cache.size ? this.#cache.values() : [...this];
		for (const val of source) {
            if (!val.byteLength) continue;
			yield val.content as Buffer;
		}
	}
	*entries(): Generator<[string, Buffer | undefined]> {
		const source = this.#cache.size ? this.#cache.values() : [...this];
		for (const val of source) {
			yield [val.name, val.content];
		}
	}

	static fromArrayBuffer(buffer: ArrayBuffer, byteOffset = 0, byteLength = buffer.byteLength) {
		const archive = new ZipArchive(buffer, byteOffset, byteLength);
		return archive;
	}
	static fromBuffer(buffer: Buffer) {
		return ZipArchive.fromArrayBuffer(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}
	static open(path: string) {
		const buffer = readFileSync(path);
		return ZipArchive.fromBuffer(buffer);
	}
}
