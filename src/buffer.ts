import * as ZIP from './zip.ts';

export class ZipBuffer implements Map<string, ZIP.Entry> {
	#entries = new Map<string, ZIP.Entry>();
	constructor(buffer: Buffer) {
		const arraybuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		for (const entry of ZIP.Entry.read(arraybuffer as ArrayBuffer)) {
			this.#entries.set(entry.name, entry);
		}
	}
	has(name: string) {
		return this.#entries.has(name);
	}
	get(name: string) {
		const entry = this.#entries.get(name);
		if (!entry) throw new Error(`no such entry "${name}"`);
		return entry;
	}
	keys() {
		return this.#entries.keys();
	}
	*values(): MapIterator<ZIP.Entry> {
		for (const name of this.keys()) {
			yield this.get(name);
		}
	}
	*entries(): MapIterator<[string, ZIP.Entry]> {
		for (const name of this.keys()) {
			yield [name, this.get(name)];
		}
	}
	set(_name: string, _value: ZIP.Entry): this {
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
	forEach(callbackfn: (value: ZIP.Entry, key: string, map: Map<string, ZIP.Entry>) => void, thisArg?: any): void {
		for (const [key, value] of this.entries()) {
			callbackfn.call(thisArg ?? this, value, key, this);
		}
	}
	[Symbol.dispose]() {
		this.#entries.clear();
	}
}
