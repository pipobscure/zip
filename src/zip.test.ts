import { equal, ok } from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createWriteStream, readFileSync, rmSync } from 'node:fs';
import * as FS from 'node:fs/promises';
import { readFile, stat } from 'node:fs/promises';
import * as Path from 'node:path';
import type { Writable } from 'node:stream';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const dataFile = fileURLToPath(new URL('../test.zip', import.meta.url));
const dataBase = fileURLToPath(new URL('../', import.meta.url));

import { Entry, collect } from './zip.ts';

describe('read', () => {
	execSync(`zip -r ${JSON.stringify(dataFile)} .`, { cwd: dataBase });
	const buffer = readFileSync(dataFile);
	rmSync(dataFile);
	const zipdata = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
	for (const entry of Entry.read(zipdata)) test(entry);
});
describe('write', async () => {
	const stream = createWriteStream(dataFile);
	await zip(stream, dataBase);
	const buffer = readFileSync(dataFile);
	const zipdata = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
	for (const entry of Entry.read(zipdata)) test(entry);
	it('works', () => {
		const res = execSync(`unzip -l ${JSON.stringify(dataFile)}`);
		ok(res.toString('utf-8').includes('src/'));
	});
	after(() => {
		rmSync(dataFile);
	});
});

function test(entry: Entry) {
	it(entry.name, async () => {
		if (entry.isDirectory) {
			ok(entry.mode);
			equal(entry.size, 0);
			ok(!entry.isFile);
			return;
		}
		const original = readFileSync([dataBase, entry.name].join('/'));
		const content = Buffer.from(await entry.content());
		ok(entry.isFile);
		ok(entry.mode);
		equal(content.length, original.length);
		equal(entry.size, content.length);
		equal(content.toString('hex'), original.toString('hex'));
	});
}

export default async function zip(output: Writable, base: string) {
	const chunks = collect(
		(async function* () {
			const dir = await FS.opendir(dataBase, {
				recursive: true,
			});
			for await (const ent of dir) {
				if (ent.name.endsWith('.zip')) continue;
				const path = Path.join(ent.parentPath, ent.name);
				const estat = await stat(path);
				const content = estat.isFile() ? await readFile(path) : Buffer.alloc(0);
				const name = `${Path.relative(base, path).split(Path.sep).join('/')}${ent.isDirectory() ? '/' : ''}`.replace(/\/+$/, '/');
				const entry = await Entry.create(name, content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer, { modified: estat.mtime, mode: estat.mode });
				yield entry;
			}
		})(),
		'testing',
	);

	for await (const buffer of chunks) {
		await write(output, buffer);
	}
	output.end();
}
function write(stream: Writable, data: ArrayBuffer) {
	return new Promise<number>((resolve, reject) => {
		const buffer = Buffer.from(data);
		stream.write(buffer, (err) => {
			if (err) return reject(err);
			resolve(buffer.byteLength);
		});
	});
}
