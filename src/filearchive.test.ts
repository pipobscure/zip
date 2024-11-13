import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { FileArchive } from './filearchive.js';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';

const fname = 'farchive.zip';
describe('FileArchive', () => {
	before(() => {
		try {
			unlinkSync(fname);
		} catch {}
		execSync(`zip -r ${fname} src/`);
	});
	let archive: FileArchive;
	it('FileArchive is a function', () => assert.equal(typeof FileArchive, 'function'));
	it('new FileArchive(path) creates an instance', () => {
		archive = new FileArchive(fname);
		assert.ok(archive instanceof FileArchive);
	});
	it('archive.has is a function', () => assert.equal(typeof archive?.has, 'function'));
	it('archive.get is a function', () => assert.equal(typeof archive?.get, 'function'));
	it('archive.keys is a function', () => assert.equal(typeof archive?.keys, 'function'));
	it('archive.values is a function', () => assert.equal(typeof archive?.values, 'function'));
	it('archive.entries is a function', () => assert.equal(typeof archive?.entries, 'function'));
	it('archive.keys()', () => {
		const files = new Set(readdirSync('src').map((f) => `src/${f}`));
		files.add('src/');
		const ziped = new Set(archive?.keys() ?? []);
		const diff = files.symmetricDifference(ziped);
		assert.ok(diff.size === 0);
	});
	it('archive.entries() matches files', () => {
		for (const [name, content] of archive.entries()) {
			if (!content) continue;
			const file = readFileSync(name);
			assert.equal(content.toString('hex'), file.toString('hex'));
		}
	});
	after(() => {
		archive.close();
		unlinkSync(fname);
	});
});
