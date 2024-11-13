import { deflateRawSync } from 'node:zlib';
import { LocalFileHeader } from './lfh.js';
import { crc32 } from 'node:zlib';
import { CentralDirectoryFileHeader } from './cdfh.js';
import { EndCentralDirectory } from './ecdh.js';
import type { Writable } from 'node:stream';

export class Compressor {
	#lfhpos = 0;
	#cdfh: Buffer[] = [];
	#buffers: Buffer[] = [];
	#stream?: Writable;
	constructor(stream?: Writable) {
		this.#stream = stream;
	}
	add(fileName: string, content: Buffer = Buffer.alloc(0)) {
		fileName = (!content.byteLength ? `${fileName}/` : fileName).split(/\/|\\/).join('/');
		const compressed = content.byteLength ? deflateRawSync(content) : content;
		const header = LocalFileHeader.create({
			fileName,
			compressedSize: compressed.byteLength,
			uncompressedSize: content.byteLength,
			crc32: content.byteLength ? crc32(content) : 0,
		});
		const lfh = new LocalFileHeader(new DataView(header.buffer, header.byteOffset), 0);
		this.#cdfh.push(CentralDirectoryFileHeader.convert(lfh, this.#lfhpos));
		if (this.#stream) {
			this.#stream.write(header);
			this.#stream.write(compressed);
		} else {
			this.#buffers.push(header, compressed);
		}
		this.#lfhpos += header.byteLength + compressed.byteLength;
	}
	done(comment?: string) {
		if (this.#stream) throw new Error('use end with streams');
		const cdfhl = this.#cdfh.reduce((sum, item) => sum + item.byteLength, 0);
		const ecdh = EndCentralDirectory.create({
			directoryRecords: this.#cdfh.length,
			directoryOffset: this.#lfhpos,
			directoryByteLength: cdfhl,
			comment,
		});
		this.#lfhpos = 0;
		return Buffer.concat([
			...this.#buffers.splice(0, this.#buffers.length),
			...this.#cdfh.splice(0, this.#cdfh.length),
			ecdh,
		]);
	}
	end(comment?: string) {
		if (!this.#stream) throw new Error('use done for buffers');
		const fileCount = this.#cdfh.length;
		let cdfhl = 0;
		for (const cdfh of this.#cdfh.splice(0, this.#cdfh.length)) {
			cdfhl += cdfh.byteLength;
			this.#stream.write(cdfh);
		}
		const ecdh = EndCentralDirectory.create({
			directoryRecords: fileCount,
			directoryOffset: this.#lfhpos,
			directoryByteLength: cdfhl,
			comment,
		});
		this.#stream.end(ecdh);
		this.#lfhpos = 0;
		this.#stream = undefined;
		return undefined;
	}
}
