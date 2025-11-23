const END_OF_CENTRAL_DIRECTORY_RECORD = 0x06054b50;
const CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MADE_BY_UNIX = 3; // See http://www.pkware.com/documents/casestudies/APPNOTE.TXT

export class Entry {
	#central;
	#local;
	#content;
	constructor(central: CentralFileHeader, local: LocalFileHeader, compressed: ArrayBuffer) {
		this.#central = central;
		this.#local = local;
		this.#content = compressed;
	}
	get compressed() {
		return this.#central.compressionMethod === 8;
	}
	get rawcontent() {
		return this.#content;
	}
	async content() {
		return this.compressed ? await inflate(this.#content) : this.#content;
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
		yield this.#content;
	}
	end(localOffset: number) {
		this.#central.localFileHeaderOffset = localOffset;
		return this.#central.buffer.slice(this.#central.byteOffset, this.#central.byteOffset + this.#central.byteLength);
	}
	static *read(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
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
export class CentralEndHeader {
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
export class CentralFileHeader {
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
export class LocalFileHeader {
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
	static uncompessedSize(buffer: ArrayBuffer, offset: number = 0, length = buffer.byteLength - offset) {
		const view = new DataView(buffer, offset, length);
		if (view.byteLength < 30) return undefined;
		if (view.getUint16(6, true) & 0x0008) return undefined;
		return view.getUint32(18, true);
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

export const CRC_TABLE = new Uint32Array([
	0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f, 0xe963a535, 0x9e6495a3, 0x0edb8832,
	0x79dcb8a4, 0xe0d5e91e, 0x97d2d988, 0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
	0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7, 0x136c9856, 0x646ba8c0, 0xfd62f97a,
	0x8a65c9ec, 0x14015c4f, 0x63066cd9, 0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
	0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c, 0xdbbbc9d6, 0xacbcf940, 0x32d86ce3,
	0x45df5c75, 0xdcd60dcf, 0xabd13d59, 0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
	0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924, 0x2f6f7c87, 0x58684c11, 0xc1611dab,
	0xb6662d3d, 0x76dc4190, 0x01db7106, 0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
	0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d, 0x91646c97, 0xe6635c01, 0x6b6b51f4,
	0x1c6c6162, 0x856530d8, 0xf262004e, 0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
	0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65, 0x4db26158, 0x3ab551ce, 0xa3bc0074,
	0xd4bb30e2, 0x4adfa541, 0x3dd895d7, 0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
	0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa, 0xbe0b1010, 0xc90c2086, 0x5768b525,
	0x206f85b3, 0xb966d409, 0xce61e49f, 0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
	0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a, 0xead54739, 0x9dd277af, 0x04db2615,
	0x73dc1683, 0xe3630b12, 0x94643b84, 0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
	0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb, 0x196c3671, 0x6e6b06e7, 0xfed41b76,
	0x89d32be0, 0x10da7a5a, 0x67dd4acc, 0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
	0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b, 0xd80d2bda, 0xaf0a1b4c, 0x36034af6,
	0x41047a60, 0xdf60efc3, 0xa867df55, 0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
	0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28, 0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7,
	0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d, 0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
	0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38, 0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7,
	0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242, 0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
	0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69, 0x616bffd3, 0x166ccf45, 0xa00ae278,
	0xd70dd2ee, 0x4e048354, 0x3903b3c2, 0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
	0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9, 0xbdbdf21c, 0xcabac28a, 0x53b39330,
	0x24b4a3a6, 0xbad03605, 0xcdd70693, 0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
	0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d,
]);

function crc32(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset): number {
	const data = new Uint8Array(buffer, offset, length);
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		const byte = data[i];
		crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
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
