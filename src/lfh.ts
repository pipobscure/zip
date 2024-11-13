/*
Offset 	Bytes 	Description[33]
0 	4 	Local file header signature = 0x04034b50 (PK♥♦ or "PK\3\4")
4 	2 	Version needed to extract (minimum)
6 	2 	General purpose bit flag
8 	2 	Compression method; e.g. none = 0, DEFLATE = 8 (or "\0x08\0x00")
10 	2 	File last modification time
12 	2 	File last modification date
14 	4 	CRC-32 of uncompressed data
18 	4 	Compressed size (or 0xffffffff for ZIP64)
22 	4 	Uncompressed size (or 0xffffffff for ZIP64)
26 	2 	File name length (n)
28 	2 	Extra field length (m)
30 	n 	File name
30+n 	m 	Extra field 
*/
export interface LocalFileHeaderFields {
	minimumVersion?: number;
	flags?: number;
	modified?: number;
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;
	fileName: string;
	extraField?: Buffer;
}
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
	get minimumExtractVersion() {
		return this.#view.getInt16(this.#offset + 4, true);
	}
	get flags() {
		return this.#view.getUint16(this.#offset + 6, true);
	}
	get compressed() {
		const comp = this.#view.getUint16(this.#offset + 8, true);
		return comp === 8;
	}
	get modifiedTime() {
		return this.#view.getUint16(this.#offset + 10, true);
	}
	get modifiedDate() {
		return this.#view.getUint16(this.#offset + 12, true);
	}
	get crc32() {
		return this.#view.getUint32(this.#offset + 14, true);
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
	get extraFieldLength() {
		return this.#view.getInt16(this.#offset + 28, true);
	}
	get fileName() {
		const offset = 30;
		return Buffer.from(this.#view.buffer, this.byteOffset + offset, this.fileNameLength).toString('utf-8');
	}
	get extraField() {
		const offset = 30 + this.fileNameLength;
		return Buffer.from(this.#view.buffer, this.byteOffset + offset, this.extraFieldLength);
	}
	get byteOffset() {
		return this.#view.byteOffset + this.#offset;
	}
	get byteLength() {
		return 30 + this.fileNameLength + this.extraFieldLength;
	}
	static create(fields: LocalFileHeaderFields) {
		const fileName = Buffer.from(fields.fileName);
		const extraField = fields.extraField ?? Buffer.alloc(0);
		const length = 30 + fileName.byteLength + extraField.byteLength;
		const buffer = Buffer.alloc(length);
		buffer.writeUInt32LE(0x04034b50);
		buffer.writeInt16LE(fields.minimumVersion ?? 20, 4);
		buffer.writeUInt16LE(fields.flags ?? 0, 6);
		buffer.writeInt16LE(fields.uncompressedSize ? 8 : 0, 8);
		buffer.writeInt16LE(0, 10);
		buffer.writeInt16LE(0, 12);
		buffer.writeUInt32LE(fields.crc32, 14);
		buffer.writeInt32LE(fields.compressedSize, 18);
		buffer.writeInt32LE(fields.uncompressedSize, 22);
		buffer.writeInt16LE(fileName.byteLength, 26);
		buffer.writeInt16LE(extraField.byteLength, 28);
		fileName.copy(buffer, 30);
		extraField.copy(buffer, 30 + fileName.byteLength);
		return buffer;
	}
}
