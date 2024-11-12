export class EndCentralDirectory {
	#view;
	#offset;
	constructor(view: DataView) {
		this.#view = view;
		this.#offset = view.byteLength - 20;
		while (this.#offset && this.signature !== 0x06054b50) {
			this.#offset -= 1;
		}
		if (this.signature !== 0x06054b50) throw new Error('invalid ecd signature');
	}
	get signature() {
		return this.#view.getUint32(this.#offset, true);
	}
	get directoryOffset() {
		return this.#view.getInt32(this.#offset + 16, true);
	}
	get offset() {
		return this.#offset;
	}
	get byteOffset() {
		return this.#view.byteOffset + this.#offset;
	}
	get byteLength() {
		return 22 + this.#view.getInt16(this.#offset + 20, true);
	}
}
