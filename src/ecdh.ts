/*
Offset 	Bytes 	Description[33]
0 	4 	End of central directory signature = 0x06054b50
4 	2 	Number of this disk (or 0xffff for ZIP64)
6 	2 	Disk where central directory starts (or 0xffff for ZIP64)
8 	2 	Number of central directory records on this disk (or 0xffff for ZIP64)
10 	2 	Total number of central directory records (or 0xffff for ZIP64)
12 	4 	Size of central directory (bytes) (or 0xffffffff for ZIP64)
16 	4 	Offset of start of central directory, relative to start of archive (or 0xffffffff for ZIP64)
20 	2 	Comment length (n)
22 	n 	Comment 
*/

export interface EndCentralDirectoryFields {
	directoryRecords: number;
	directoryByteLength: number;
	directoryOffset: number;
	comment?: string;
}
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
	get diskNumber() {
		return this.#view.getInt16(this.#offset + 4, true);
	}
	get diskDirectory() {
		return this.#view.getInt16(this.offset + 6, true);
	}
	get entryCount() {
		return this.#view.getInt16(this.offset + 8, true);
	}
	get entryTotal() {
		return this.#view.getInt16(this.offset + 10, true);
	}
	get directoryBytes() {
		return this.#view.getInt16(this.#offset + 12, true);
	}
	get directoryOffset() {
		return this.#view.getInt32(this.#offset + 16, true);
	}
	get commentLength() {
		return this.#view.getInt16(this.#offset + 20, true);
	}
	get comment() {
		return Buffer.from(this.#view.buffer, this.#offset + 22, this.commentLength).toString('utf-8');
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
	static create(fields: EndCentralDirectoryFields) {
		const comment = fields.comment ? Buffer.from(fields.comment) : Buffer.alloc(0);
		const buffer = Buffer.alloc(22 + comment.byteLength);
		buffer.writeUInt32LE(0x06054b50);
		buffer.writeInt16LE(0, 4);
		buffer.writeInt16LE(0, 6);
		buffer.writeInt16LE(fields.directoryRecords, 8);
		buffer.writeInt16LE(fields.directoryRecords, 10);
		buffer.writeInt32LE(fields.directoryByteLength, 12);
		buffer.writeInt32LE(fields.directoryOffset, 16);
		buffer.writeInt16LE(comment.byteLength, 20);
		comment.copy(buffer, 22);
		return buffer;
	}
}
