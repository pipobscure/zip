import * as FS from 'node:fs/promises';
import * as ZIP from './zip.ts';

export class ZipFile implements Map<string, Promise<ZIP.Entry>> {
	#fd;
	#entries = new Map<string, { central: ZIP.CentralFileHeader; entry?: ZIP.Entry }>();
	constructor(fd: FS.FileHandle, central: ZIP.CentralFileHeader[]) {
		this.#fd = fd;
		for (const entry of central) {
			this.#entries.set(entry.fileName, { central: entry });
		}
	}
	has(name: string) {
		return this.#entries.has(name);
	}
	async get(name: string) {
		const info = this.#entries.get(name);
		if (!info) throw new Error(`no such entry "${name}"`);
		if (!info.entry) {
			const basebuf = Buffer.alloc(30);
			await this.#fd.read(basebuf, 0, 30, info.central.localFileHeaderOffset);
			const bufbuf = basebuf.buffer.slice(basebuf.byteOffset, basebuf.byteOffset + basebuf.byteLength);
			const headerLen = ZIP.LocalFileHeader.length(bufbuf);
			const contentLen = ZIP.LocalFileHeader.uncompessedSize(bufbuf) ?? info.central.uncompressedSize;
			const data = Buffer.alloc(headerLen + contentLen);
			await this.#fd.read(data, 0, data.byteLength, info.central.localFileHeaderOffset);
			const dataBuf = data.buffer.slice(data.byteOffset, data.byteOffset + headerLen);
			const hdrBuf = data.buffer.slice(data.byteOffset + headerLen, data.byteOffset + headerLen + contentLen);
			const local = new ZIP.LocalFileHeader(dataBuf, 0, headerLen);
			const entry = new ZIP.Entry(info.central, local, hdrBuf);
			info.entry = entry;
		}
		return info.entry as ZIP.Entry;
	}
	keys() {
		return this.#entries.keys();
	}
	*values(): MapIterator<Promise<ZIP.Entry>> {
		for (const name of this.keys()) {
			yield this.get(name);
		}
	}
	*entries(): MapIterator<[string, Promise<ZIP.Entry>]> {
		for (const name of this.keys()) {
			yield [name, this.get(name)];
		}
	}
	async *[Symbol.asyncIterator]() {
		for (const entryPromise of this.values()) {
			const entry = await entryPromise;
			yield entry;
		}
	}
	set(_name: string, _value: Promise<ZIP.Entry>): this {
		throw new Error('cannot modify archive');
	}
	delete(_name: string): boolean {
		throw new Error('cannot modify archive');
	}
	clear() {
		throw new Error('cannot modify archive');
	}
	get size() {
		return this.#entries.size;
	}
	[Symbol.iterator]() {
		return this.entries();
	}
	[Symbol.toStringTag] = 'ZipFile';
	forEach(callbackfn: (value: Promise<ZIP.Entry>, key: string, map: Map<string, Promise<ZIP.Entry>>) => void, thisArg?: any): void {
		for (const [key, value] of this.entries()) {
			callbackfn.call(thisArg ?? this, value, key, this);
		}
	}
	close() {
		this.#entries.clear();
		return this.#fd.close();
	}
	async [Symbol.asyncDispose]() {
		await this.close();
	}
	static async open(filename: string) {
		const fd = await FS.open(filename, 'r');
		const st = await fd.stat();
		const endbuf = Buffer.alloc(Math.min(st.size, 22 + 0xffff));
		const endpos = st.size - endbuf.byteLength;
		await fd.read(endbuf, 0, endbuf.byteLength, endpos);
		const end = ZIP.CentralEndHeader.find(endbuf.buffer.slice(endbuf.byteOffset, endbuf.byteOffset + endbuf.byteLength));
		const endendstart = endpos + end.byteOffset;
		const endstart = end.centralDirectoryOffset;
		const dirbuf = Buffer.alloc(endendstart - endstart);
		await fd.read(dirbuf, 0, dirbuf.byteLength, endstart);
		const entries = Array.from(mapToCentralEntries(dirbuf.buffer.slice(dirbuf.byteOffset, dirbuf.byteOffset + dirbuf.byteLength), end.centralDirectoryTotalRecords));
		return new ZipFile(fd, entries);
	}
}

function* mapToCentralEntries(buffer: ArrayBuffer, count: number) {
	let pos = 0;
	while (count) {
		const entry = new ZIP.CentralFileHeader(buffer, pos);
		yield entry;
		pos += entry.byteLength;
		count--;
	}
}
