export interface ReadMap<T> {
	has(key: string): boolean;
	get(key: string): T | undefined;
	keys(): IterableIterator<string>;
	values(): IterableIterator<T>;
	entries(): IterableIterator<[string, T | undefined]>;
}
