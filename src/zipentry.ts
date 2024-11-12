import { inflateRawSync } from 'node:zlib';
import type { CentralDirectoryFileHeader } from './cdfh.js';
import { LocalFileHeader } from './lfh.js';

export class ZipEntry {
	#view;
	#central;
	#local;
	constructor(view: DataView, central: CentralDirectoryFileHeader) {
		this.#view = view;
		this.#central = central;
		this.#local = new LocalFileHeader(this.#view, central.entryStart);
	}
	get name() {
		return this.#local.fileName;
	}
	get byteLength() {
		return this.#local.flags & 0x03 ? this.#central.uncompressedSize : this.#local.uncompressedSize;
	}
	get content() {
		if (!this.byteLength) return undefined;
		const offset = this.#local.byteOffset + this.#local.byteLength;
		const length = this.#local.flags & 0x03 ? this.#central.compressedSize : this.#local.compressedSize;
		const compressed = Buffer.from(this.#view.buffer, offset, length);
		return !this.#local.compressed ? compressed : inflateRawSync(compressed);
	}
}
