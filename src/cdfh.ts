import type { LocalFileHeader } from './lfh.js';

/*
Offset 	Bytes 	Description[33]
0 	4 	Central directory file header signature = 0x02014b50
4 	2 	Version made by
6 	2 	Version needed to extract (minimum)
8 	2 	General purpose bit flag
10 	2 	Compression method
12 	2 	File last modification time
14 	2 	File last modification date
16 	4 	CRC-32 of uncompressed data
20 	4 	Compressed size (or 0xffffffff for ZIP64)
24 	4 	Uncompressed size (or 0xffffffff for ZIP64)
28 	2 	File name length (n)
30 	2 	Extra field length (m)
32 	2 	File comment length (k)
34 	2 	Disk number where file starts (or 0xffff for ZIP64)
36 	2 	Internal file attributes
38 	4 	External file attributes
42 	4 	Relative offset of local file header (or 0xffffffff for ZIP64). This is the number of bytes between the start of the first disk on which the file occurs, and the start of the local file header. This allows software reading the central directory to locate the position of the file inside the ZIP file.
46 	n 	File name
46+n 	m 	Extra field
46+n+m 	k 	File comment
*/

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
	get createVersion() {
		return this.#view.getInt16(this.#offset + 4, true);
	}
	get extractVersion() {
		return this.#view.getInt16(this.#offset + 6, true);
	}
	get flags() {
		return this.#view.getUint16(this.#offset + 8, true);
	}
	get compressionMethod() {
		return this.#view.getUint16(this.#offset + 10, true);
	}
	get compressed() {
		return !!this.compressionMethod;
	}
	get modifiedTime() {
		return this.#view.getInt16(this.#offset + 12, true);
	}
	get modifiedDate() {
		return this.#view.getInt16(this.#offset + 14, true);
	}
	get crc32() {
		return this.#view.getUint32(this.#offset + 16, true);
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
	get extraFieldLength() {
		return this.#view.getInt16(this.#offset + 30, true);
	}
	get commentLength() {
		return this.#view.getInt16(this.#offset + 32, true);
	}
	get diskNumber() {
		return this.#view.getInt16(this.#offset + 34, true);
	}
	get internalAttributes() {
		return this.#view.getInt16(this.#offset + 36, true);
	}
	get externalAttributes() {
		return this.#view.getInt32(this.#offset + 38, true);
	}
	get entryStart() {
		return this.#view.getInt32(this.#offset + 42, true);
	}
	get fileName() {
		return Buffer.from(this.#view.buffer, this.byteOffset + 46, this.fileNameLength).toString('utf-8');
	}
	get extraField() {
		return Buffer.from(this.#view.buffer, this.byteOffset + 46 + this.fileNameLength, this.extraFieldLength);
	}
	get comment() {
		return Buffer.from(
			this.#view.buffer,
			this.byteOffset + 46 + this.fileNameLength + this.extraFieldLength,
			this.commentLength,
		).toString('utf8');
	}
	get byteOffset() {
		return this.#view.byteOffset + this.#offset;
	}
	get byteLength() {
		return 46 + this.fileNameLength + this.extraFieldLength + this.commentLength;
	}
	static convert(lfh: LocalFileHeader, localOffset: number) {
		const buffer = Buffer.alloc(46 + lfh.fileNameLength + lfh.extraFieldLength);
		const filename = Buffer.from(lfh.fileName);
		buffer.writeUInt32LE(0x02014b50);
		buffer.writeInt16LE(798, 4);
		buffer.writeInt16LE(lfh.minimumExtractVersion, 6);
		buffer.writeInt16LE(lfh.flags, 8);
		buffer.writeInt16LE(lfh.uncompressedSize ? 8 : 0, 10);
		buffer.writeInt16LE(lfh.modifiedTime, 12);
		buffer.writeInt16LE(lfh.modifiedDate, 14);
		buffer.writeUInt32LE(lfh.crc32, 16);
		buffer.writeInt32LE(lfh.compressedSize, 20);
		buffer.writeInt32LE(lfh.uncompressedSize, 24);
		buffer.writeInt16LE(filename.byteLength, 28);
		buffer.writeInt16LE(lfh.extraFieldLength, 30);
		buffer.writeInt16LE(0, 32);
		buffer.writeInt16LE(0, 34);
		buffer.writeInt16LE(lfh.uncompressedSize ? 1 : 0, 36);
		buffer.writeInt32LE(lfh.uncompressedSize ? -2118909952 : 1107099664, 38);
		buffer.writeInt16LE(localOffset, 42);
		filename.copy(buffer, 46);
		lfh.extraField.copy(buffer, 46 + filename.byteLength);
		return buffer;
	}
}
