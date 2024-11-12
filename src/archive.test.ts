import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { ZipArchive } from './ziparchive.js';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';

describe('ZipArchive', () => {
	before(()=>{
		execSync('zip -r test.zip src/');
	});
	let archive: ZipArchive;
	it('ZipArchive is a function', () => assert.equal(typeof ZipArchive, 'function'));
	it('ZipArchive.fromBuffer is a function', () => assert.equal(typeof ZipArchive.fromBuffer, 'function'));
	it('ZipArchive.fromArrayBuffer is a function', () => assert.equal(typeof ZipArchive.fromArrayBuffer, 'function'));
	it('ZipArchive.open is a function', () => assert.equal(typeof ZipArchive.open, 'function'));
	it('ZipArchive.open creates an instance', () => {
		archive = ZipArchive.open('test.zip');
		assert.ok(archive instanceof ZipArchive);
	});
	it('archive.has is a function', () => assert.equal(typeof archive?.has, 'function'));
	it('archive.get is a function', () => assert.equal(typeof archive?.get, 'function'));
	it('archive.keys is a function', () => assert.equal(typeof archive?.keys, 'function'));
	it('archive.values is a function', () => assert.equal(typeof archive?.values, 'function'));
	it('archive.entries is a function', () => assert.equal(typeof archive?.entries, 'function'));
	it('archive.keys()', () => {
		const files = new Set(readdirSync('src').map(f=>`src/${f}`));
		files.add('src/');
		const ziped = new Set(archive?.keys() ?? []);
		const diff = files.symmetricDifference(ziped);
		assert.ok(diff.size === 0);
	});
	it('archive.entries() matches files', ()=>{
		for (const [ name, content ] of archive.entries()) {
			if (!content) continue;
			const file = readFileSync(name);
			assert.equal(content.toString('hex'), file.toString('hex'));
		}
	});
	after(()=>{
		unlinkSync('test.zip');
	})
});
