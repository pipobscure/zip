const END_OF_CENTRAL_DIRECTORY_RECORD = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MADE_BY_UNIX = 3; // See http://www.pkware.com/documents/casestudies/APPNOTE.TXT

export class Entry {
	#central;
	#local;
	#compressed;
	#uncompressed?: ArrayBuffer;
	constructor(central: CentralFileHeader, local: LocalFileHeader, compressed: ArrayBuffer) {
		this.#central = central;
		this.#local = local;
		this.#compressed = compressed;
	}
	async content() {
		if (this.#uncompressed) return this.#uncompressed;
		switch (this.#central.compressionMethod) {
			case 0: {
				this.#uncompressed = this.#compressed;
				return this.#uncompressed;
			}
			case 8: {
				this.#uncompressed = await inflate(this.#compressed);
				return this.#uncompressed;
			}
			default:
				throw new Error(`unsupported compression method ${this.#central.compressionMethod}`);
		}
	}
	get name() {
		return this.#local.fileName;
	}
	get comment() {
		return this.#central.fileComment;
	}
	get size() {
		return this.#local.flags & 0x0008 ? this.#central.uncompressedSize : this.#local.uncompressedSize;
	}
	get modified() {
		return this.#local.lastModified;
	}
	get mode() {
		return this.#central.mode;
	}
	get isFile() {
		return !this.isDirectory;
	}
	get isDirectory() {
		return this.name.slice(-1) === '/';
	}
	*[Symbol.iterator]() {
		yield this.#local.buffer.slice(this.#local.byteOffset, this.#local.byteOffset + this.#local.byteLength);
		yield this.#compressed;
	}
	end(localOffset: number) {
		this.#central.localFileHeaderOffset = localOffset;
		return this.#central.buffer.slice(this.#central.byteOffset, this.#central.byteOffset + this.#central.byteLength);
	}
	static *read(buffer: ArrayBuffer) {
		const end = CentralEndHeader.find(buffer);
		let remaining = end.centralDirectoryDiskRecords;
		let pos = end.centralDirectoryOffset;
		while (remaining) {
			const central = new CentralFileHeader(buffer, pos);
			const local = new LocalFileHeader(buffer, central.localFileHeaderOffset);
			const offset = local.byteOffset + local.byteLength;
			const length = local.flags & 0x0008 ? central.compressedSize : local.compressedSize;
			const compressed = length ? buffer.slice(offset, offset + length) : new ArrayBuffer(0);
			yield new Entry(central, local, compressed);
			pos = central.byteOffset + central.byteLength;
			remaining--;
		}
	}
	static async create(filename: string, uncompressed: ArrayBuffer, options?: Partial<{ comment: string; mode: number; modified: Date }>) {
		const central = CentralFileHeader.create(filename, options?.comment);
		const local = LocalFileHeader.create(filename);
		central.uncompressedSize = local.uncompressedSize = uncompressed.byteLength;
		const compressed = await deflate(uncompressed);
		central.compressedSize = local.compressedSize = compressed.byteLength;
		central.mode = options?.mode ?? 0;
		local.lastModified = central.lastModified = options?.modified ?? new Date();
		local.crc32 = central.crc32 = crc32(uncompressed);
		const entry = new Entry(central, local, compressed);
		entry.#uncompressed = uncompressed;
		return entry;
	}
}

export async function* collect(entries: AsyncIterable<Entry>, comment?: string) {
	const end = [];
	let pos = 0;
	for await (const entry of entries) {
		end.push(entry.end(pos));
		for (const buf of entry) {
			yield buf;
			pos += buf.byteLength;
		}
	}
	const startofend = pos;
	for (const buf of end) {
		yield buf;
		pos += buf.byteLength;
	}
	const endhdr = CentralEndHeader.create(comment);
	endhdr.diskNumber = 0;
	endhdr.centralDirectoryDiskNumber = 0;
	endhdr.centralDirectoryDiskRecords = end.length;
	endhdr.centralDirectoryTotalRecords = end.length;
	endhdr.centralDirectoryOffset = startofend;
	endhdr.centralDirectorySize = pos - startofend;
	yield endhdr.buffer.slice(endhdr.byteOffset, endhdr.byteOffset + endhdr.byteLength);
}

// ZIP end of central directory record
// Offset   Bytes   Description
// 0        4       End of central directory signature = 0x06054b50
// 4        2       Number of this disk
// 6        2       Disk where central directory starts
// 8        2       Number of central directory records on this disk
// 10       2       Total number of central directory records
// 12       4       Size of central directory (bytes)
// 16       4       Offset of start of central directory, relative to start of archive
// 20       2       ZIP file comment length (n)
// 22       n       ZIP file comment
class CentralEndHeader {
	#view;
	constructor(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
		this.#view = new DataView(buffer, offset, length);
		if (this.#view.byteLength < 22) throw new Error('header very much too short');
		if (this.signature !== END_OF_CENTRAL_DIRECTORY_RECORD) throw new Error('invalid header signature');
		if (this.#view.byteLength < this.byteLength) throw new Error(`header too short ${this.#view.byteLength}<${this.byteLength}`);
	}
	get buffer() {
		return this.#view.buffer;
	}
	get byteOffset() {
		return this.#view.byteOffset;
	}
	get byteLength() {
		return 22 + this.fileCommentLength;
	}
	get signature() {
		return this.#view.getUint32(0, true);
	}
	get diskNumber() {
		return this.#view.getUint16(4, true);
	}
	set diskNumber(value: number) {
		this.#view.setUint16(4, value, true);
	}
	get centralDirectoryDiskNumber() {
		return this.#view.getUint16(6, true);
	}
	set centralDirectoryDiskNumber(value: number) {
		this.#view.setUint16(6, value, true);
	}
	get centralDirectoryDiskRecords() {
		return this.#view.getUint16(8, true);
	}
	set centralDirectoryDiskRecords(value: number) {
		this.#view.setUint16(8, value, true);
	}
	get centralDirectoryTotalRecords() {
		return this.#view.getUint16(10, true);
	}
	set centralDirectoryTotalRecords(value: number) {
		this.#view.setUint16(10, value, true);
	}
	get centralDirectorySize() {
		return this.#view.getUint32(12, true);
	}
	set centralDirectorySize(value: number) {
		this.#view.setUint32(12, value, true);
	}
	get centralDirectoryOffset() {
		return this.#view.getUint32(16, true);
	}
	set centralDirectoryOffset(value: number) {
		this.#view.setUint32(16, value, true);
	}
	get fileCommentLength() {
		return this.#view.getUint16(20, true);
	}
	#decoder = new TextDecoder();
	get fileComment() {
		const offset = this.#view.byteOffset + 22;
		return this.#decoder.decode(this.#view.buffer.slice(offset, offset + this.fileCommentLength));
	}
	static length(buffer: ArrayBuffer, offset: number = 0, length = buffer.byteLength - offset) {
		const view = new DataView(buffer, offset, length);
		return 22 + view.getUint16(20, true);
	}
	static find(buffer: ArrayBuffer) {
		const view = new DataView(buffer);
		const min = buffer.byteLength - (22 + 0xFFFF);
		let pos = buffer.byteLength - 22;
		while (pos >= min) {
			if (view.getUint32(pos, true) === END_OF_CENTRAL_DIRECTORY_RECORD) {
				const length = 22 + view.getUint16(pos + 20, true);
				return new CentralEndHeader(buffer, pos, length);
			}
			pos--;
		}
		throw new Error('no central directory found');
	}
	static create(comment?: string) {
		const cmtbuf = comment ? new TextEncoder().encode(comment) : new Uint8Array(0);
		const allbuf = new ArrayBuffer(22 + cmtbuf.byteLength);
		const view = new DataView(allbuf);
		view.setUint32(0, END_OF_CENTRAL_DIRECTORY_RECORD, true);
		view.setUint16(20, cmtbuf.byteLength, true);
		new Uint8Array(allbuf).set(cmtbuf, 22);
		return new CentralEndHeader(allbuf);
	}
}

// ZIP central directory file header
// Offset   Bytes   Description
// 0        4       Central directory file header signature = 0x02014b50
// 4        2       Version made by
// 6        2       Version needed to extract (minimum)
// 8        2       General purpose bit flag
// 10       2       Compression method
// 12       2       File last modification time
// 14       2       File last modification date
// 16       4       CRC-32
// 20       4       Compressed size
// 24       4       Uncompressed size
// 28       2       File name length (n)
// 30       2       Extra field length (m)
// 32       2       File comment length (k)
// 34       2       Disk number where file starts
// 36       2       Internal file attributes
// 38       4       External file attributes
// 42       4       Relative offset of local file header
// 46       n       File name
// 46+n     m       Extra field
// 46+n+m   k       File comment
class CentralFileHeader {
	#view;
	constructor(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
		this.#view = new DataView(buffer, offset, length);
		if (this.#view.byteLength < 46) throw new Error('header very much too short');
		if (this.signature !== CENTRAL_DIRECTORY_FILE_HEADER) throw new Error('invalid header signature');
		if (this.#view.byteLength < this.byteLength) throw new Error('header too short');
	}
	get buffer() {
		return this.#view.buffer;
	}
	get byteOffset() {
		return this.#view.byteOffset;
	}
	get byteLength() {
		return 46 + this.fileNameLength + this.extraFieldLength + this.fileCommentLength;
	}
	get signature() {
		return this.#view.getUint32(0, true);
	}
	get version() {
		return this.#view.getUint16(4, true);
	}
	get versionNeeded() {
		return this.#view.getUint16(6, true);
	}
	get flags() {
		return this.#view.getUint16(8, true);
	}
	get compressionMethod() {
		return this.#view.getUint16(10, true);
	}
	get lastModified() {
		const time = this.#view.getUint16(12, true);
		const date = this.#view.getUint16(14, true);
		return new Date((date >>> 9) + 1980, ((date >>> 5) & 15) - 1, date & 31, (time >>> 11) & 31, (time >>> 5) & 63, (time & 63) * 2);
	}
	set lastModified(value: Date) {
		const year = (value.getUTCFullYear() - 1980) << 9;
		const month = ((value.getUTCMonth() + 1) & 15) << 5;
		const day = value.getUTCDate() & 31;
		const date = year | month | day;

		const hour = (value.getUTCHours() & 31) << 11;
		const mins = (value.getUTCMinutes() & 63) << 5;
		const secs = (value.getUTCSeconds() * 2) & 63;
		const time = hour | mins | secs;

		this.#view.setUint16(12, time, true);
		this.#view.setUint16(14, date, true);
	}
	get crc32() {
		return this.#view.getUint32(16, true);
	}
	set crc32(value: number) {
		this.#view.setUint32(16, value, true);
	}
	get compressedSize() {
		return this.#view.getUint16(20, true);
	}
	set compressedSize(value: number) {
		this.#view.setUint16(20, value, true);
	}
	get uncompressedSize() {
		return this.#view.getUint16(24, true);
	}
	set uncompressedSize(value: number) {
		this.#view.setUint16(24, value, true);
	}
	get fileNameLength() {
		return this.#view.getUint16(28, true);
	}
	get extraFieldLength() {
		return this.#view.getUint16(30, true);
	}
	get fileCommentLength() {
		return this.#view.getUint16(32, true);
	}
	get diskNumber() {
		return this.#view.getUint16(34, true);
	}
	set diskNumber(value: number) {
		this.#view.setUint16(34, value, true);
	}
	get internalFileAttributes() {
		return this.#view.getUint16(36, true);
	}
	set internalFileAttributes(value: number) {
		this.#view.setUint16(36, value, true);
	}
	get externalFileAttributes() {
		return this.#view.getUint32(38, true);
	}
	set externalFileAttributes(value: number) {
		this.#view.setUint32(38, value, true);
	}
	get localFileHeaderOffset() {
		return this.#view.getUint32(42, true);
	}
	set localFileHeaderOffset(value: number) {
		this.#view.setUint32(42, value, true);
	}
	#decoder = new TextDecoder();
	get fileName() {
		const offset = this.#view.byteOffset + 46;
		return this.#decoder.decode(this.#view.buffer.slice(offset, offset + this.fileNameLength));
	}
	get extraField() {
		const offset = this.#view.byteOffset + 46 + this.fileNameLength;
		return this.#view.buffer.slice(offset, offset + this.extraFieldLength);
	}
	get fileComment() {
		const offset = this.#view.byteOffset + 46 + this.fileNameLength + this.extraFieldLength;
		return this.#decoder.decode(this.#view.buffer.slice(offset, offset + this.fileCommentLength));
	}
	get mode() {
		const madeBy = this.version >> 8;
		if (madeBy !== MADE_BY_UNIX) return 0;
		const mode = (this.externalFileAttributes >>> 16) & 0x1ff;
		return mode;
	}
	set mode(value: number) {
		const val = (value & 0x1ff) << 16;
		const ext = this.externalFileAttributes & 0xfe00ffff;
		this.externalFileAttributes = ext | val;
	}
	static length(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
		const view = new DataView(buffer, offset, length);
		if (view.byteLength < 46) return 0;
		return 46 + view.getUint16(28, true) + view.getUint16(30, true) + view.getUint16(32, true);
	}
	static create(filename: string, comment?: string) {
		const encoder = new TextEncoder();
		const filebuf = encoder.encode(filename);
		const commbuf = comment ? encoder.encode(comment) : new Uint8Array(0);
		const allbuf = new ArrayBuffer(46 + filebuf.byteLength + commbuf.byteLength);
		const allarr = new Uint8Array(allbuf);
		const view = new DataView(allbuf);
		view.setUint32(0, CENTRAL_DIRECTORY_FILE_HEADER, true);
		view.setUint16(4, 788, true); // version
		view.setUint16(6, 20, true); // version needed
		view.setUint16(8, 20, true); // flags
		view.setUint16(10, 8, true); // compression
		view.setUint16(28, filebuf.byteLength, true);
		view.setUint16(30, 0, true);
		view.setUint16(32, commbuf.byteLength, true);
		allarr.set(filebuf, 46);
		allarr.set(commbuf, allarr.byteLength - commbuf.byteLength);
		return new CentralFileHeader(allbuf);
	}
}

// ZIP local file header
// Offset   Bytes   Description
// 0        4       Local file header signature = 0x04034b50
// 4        2       Version needed to extract (minimum)
// 6        2       General purpose bit flag
// 8        2       Compression method
// 10       2       File last modification time
// 12       2       File last modification date
// 14       4       CRC-32
// 18       4       Compressed size
// 22       4       Uncompressed size
// 26       2       File name length (n)
// 28       2       Extra field length (m)
// 30       n       File name
// 30+n     m       Extra field
class LocalFileHeader {
	#view;
	constructor(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
		this.#view = new DataView(buffer, offset, length);
		if (this.#view.byteLength < 30) throw new Error('header very much too short');
		if (this.signature !== LOCAL_FILE_HEADER) throw new Error('invalid header signature');
		if (this.#view.byteLength < this.byteLength) throw new Error('header too short');
	}
	get buffer() {
		return this.#view.buffer;
	}
	get byteOffset() {
		return this.#view.byteOffset;
	}
	get byteLength() {
		return 30 + this.fileNameLength + this.extraFieldLength;
	}
	get signature() {
		return this.#view.getUint32(0, true);
	}
	get versionNeeded() {
		return this.#view.getUint16(4, true);
	}
	get flags() {
		return this.#view.getUint16(6, true);
	}
	get compressionMethod() {
		return this.#view.getUint16(8, true);
	}
	get lastModified() {
		const time = this.#view.getUint16(10, true);
		const date = this.#view.getUint16(12, true);
		return new Date((date >>> 9) + 1980, ((date >>> 5) & 15) - 1, date & 31, (time >>> 11) & 31, (time >>> 5) & 63, (time & 63) * 2);
	}
	set lastModified(value: Date) {
		const year = (value.getUTCFullYear() - 1980) << 9;
		const month = ((value.getUTCMonth() + 1) & 15) << 5;
		const day = value.getUTCDate() & 31;
		const date = year | month | day;

		const hour = (value.getUTCHours() & 31) << 11;
		const mins = (value.getUTCMinutes() & 63) << 5;
		const secs = (value.getUTCSeconds() * 2) & 63;
		const time = hour | mins | secs;

		this.#view.setUint16(10, time, true);
		this.#view.setUint16(12, date, true);
	}
	get crc32() {
		return this.#view.getUint32(14, true);
	}
	set crc32(value: number) {
		this.#view.setUint32(14, value, true);
	}
	get compressedSize() {
		return this.#view.getUint32(18, true);
	}
	set compressedSize(value: number) {
		this.#view.setUint32(18, value, true);
	}
	get uncompressedSize() {
		return this.#view.getUint32(22, true);
	}
	set uncompressedSize(value: number) {
		this.#view.setUint32(22, value, true);
	}
	get fileNameLength() {
		return this.#view.getUint16(26, true);
	}
	get extraFieldLength() {
		return this.#view.getUint16(28, true);
	}
	#decoder = new TextDecoder();
	get fileName() {
		const offset = this.#view.byteOffset + 30;
		return this.#decoder.decode(this.#view.buffer.slice(offset, offset + this.fileNameLength));
	}
	get extraField() {
		const offset = this.#view.byteOffset + 30 + this.fileNameLength;
		return this.#view.buffer.slice(offset, offset + this.extraFieldLength);
	}
	static length(buffer: ArrayBuffer, offset: number = 0, length = buffer.byteLength - offset) {
		const view = new DataView(buffer, offset, length);
		if (view.byteLength < 30) return 0;
		return 30 + view.getUint16(26, true) + view.getUint16(28, true);
	}
	static create(filename: string) {
		const filebuf = new TextEncoder().encode(filename);
		const allbuf = new ArrayBuffer(30 + filebuf.byteLength);
		const view = new DataView(allbuf);
		view.setUint32(0, LOCAL_FILE_HEADER, true);
		view.setUint16(8, 8, true); // version needed
		view.setUint16(6, 20, true); // flags
		view.setUint16(8, 8, true); // compression
		view.setUint16(26, filebuf.byteLength, true);
		view.setUint16(28, 0, true);
		const allarr = new Uint8Array(allbuf);
		allarr.set(filebuf, 30);
		return new LocalFileHeader(allbuf);
	}
}

const crcTable: Uint32Array = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset): number {
	const data = new Uint8Array(buffer, offset, length);
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		const byte = data[i] as number;
		crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] as number);
	}

	return (crc ^ 0xffffffff) >>> 0; // unsigned
}

async function inflate(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
  const stream = new DecompressionStream('deflate-raw');
	const [response] = await Promise.all([readStream(stream.readable), writeStream(stream.writable, new Uint8Array(buffer, offset, length))]);
	return response;
}

async function deflate(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
	const stream = new CompressionStream('deflate-raw');
	const [response] = await Promise.all([readStream(stream.readable), writeStream(stream.writable, new Uint8Array(buffer, offset, length))]);
	return response;
}

async function writeStream(stream: WritableStream, buffer: Uint8Array) {
	const writer = stream.getWriter();
	await writer.ready;
	await writer.write(buffer);
	await writer.ready;
	await writer.close();
}
async function readStream(stream: ReadableStream) {
	const response = new Response(stream);
	return await response.arrayBuffer();
}
