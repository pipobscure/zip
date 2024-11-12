export class CentralDirectoryFileHeader {
	#view;
	#offset;
	constructor(view: DataView, offset: number) {
		this.#view = view;
		this.#offset = offset;
		if (this.signature !== 0x02014b50) throw new Error(`invalid cdfh: ${this.signature.toString(16)}`);
	}
	get signature() {
		return this.#view.getUint32(this.#offset + 0, true);
	}
	get flags() {
		return this.#view.getUint16(this.#offset + 8, true);
	}
	get compressed() {
		return 8 === this.#view.getUint16(this.#offset + 10, true);
	}
	get compressedSize() {
		return this.#view.getInt32(this.#offset + 20, true);
	}
	get uncompressedSize() {
		return this.#view.getInt32(this.#offset + 24, true);
	}
	get fileNameLength() {
		return this.#view.getInt16(this.#offset + 28, true);
	}
	get entryStart() {
		return this.#view.getInt32(this.#offset + 42, true);
	}
	get fileName() {
		return Buffer.from(this.#view.buffer, this.byteOffset + 46, this.fileNameLength).toString('utf-8');
	}
	get byteOffset() {
		return this.#view.byteOffset + this.#offset;
	}
	get byteLength() {
		return (
			46 +
			this.fileNameLength +
			this.#view.getInt16(this.#offset + 30, true) +
			this.#view.getInt16(this.#offset + 32, true)
		);
	}
}
