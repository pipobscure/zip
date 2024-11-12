export class LocalFileHeader {
	#view;
	#offset;
	constructor(view: DataView, offset: number) {
		this.#view = view;
		this.#offset = offset;
		if (this.signature !== 0x04034b50) throw new Error('invalid lfh');
	}
	get signature() {
		return this.#view.getUint32(this.#offset + 0, true);
	}
	get flags() {
		return this.#view.getUint16(this.#offset + 6, true);
	}
	get compressed() {
		const comp = this.#view.getUint16(this.#offset + 8, true);
		return comp === 8;
	}
	get compressedSize() {
		return this.#view.getInt32(this.#offset + 18, true);
	}
	get uncompressedSize() {
		return this.#view.getInt32(this.#offset + 22, true);
	}
	get fileNameLength() {
		return this.#view.getInt16(this.#offset + 26, true);
	}
	get fileName() {
		const offset = 30;
		return Buffer.from(this.#view.buffer, this.byteOffset + offset, this.fileNameLength).toString('utf-8');
	}
	get byteOffset() {
		return this.#view.byteOffset + this.#offset;
	}
	get byteLength() {
		return 30 + this.fileNameLength + this.#view.getInt16(this.#offset + 28, true);
	}
}
