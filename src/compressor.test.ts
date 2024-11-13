import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as FS from 'node:fs';
import { execSync } from 'node:child_process';
import { Compressor } from './compressor.js';

const fname = 'compressed.zip';
describe('Compressor', async () => {
	const stream = FS.createWriteStream(fname);
	let compressor: Compressor;
	it('Compressor is a function', () => assert.equal(typeof Compressor, 'function'));
	it('new Compressor(stream) creates instances', () => {
		compressor = new Compressor(stream);
		assert.ok(compressor instanceof Compressor);
	});
	it('compressor.add is a function', () => assert.equal(typeof compressor.add, 'function'));
	it('compressor.done is a function', () => assert.equal(typeof compressor.done, 'function'));
	it('compressor.end is a function', () => assert.equal(typeof compressor.end, 'function'));
	it('compresses', () => {
		compressor.add('src/');
		for (const item of FS.readdirSync('src')) {
			compressor.add(`src/${item}`, FS.readFileSync(`src/${item}`));
		}
	});
	it('throws on done with stream', () => assert.throws(() => compressor.done()));
	await it('finishes on end', async () => {
		await new Promise((resolve, reject) => {
			stream.on('error', reject);
			stream.on('close', resolve);
			compressor.end();
		});
	});
	it('can be decompressed', () => {
		const cwd = `${process.cwd()}/tmp/`;
		try {
			FS.rmSync(`${process.cwd()}/tmp/`, { recursive: true });
		} catch {}
		try {
			FS.mkdirSync(`${process.cwd()}/tmp/`, { recursive: true });
		} catch {}
		execSync(`unzip ../${fname}`, { cwd });
		for (const item of FS.readdirSync(`${cwd}/src`)) {
			assert.ok(item);
			const content = FS.readFileSync(`${cwd}/src/${item}`);
			const original = FS.readFileSync(`src/${item}`);
			assert.equal(content.toString('hex'), original.toString('hex'), `file: src/${item}`);
		}
		FS.rmSync('tmp', { recursive: true });
	});
	it('new Compressor() creates instances', () => {
		compressor = new Compressor();
	});
	it('compressor.add is a function', () => assert.equal(typeof compressor.add, 'function'));
	it('compressor.done is a function', () => assert.equal(typeof compressor.done, 'function'));
	it('compressor.end is a function', () => assert.equal(typeof compressor.end, 'function'));
	it('compresses', () => {
		compressor.add('src/');
		for (const item of FS.readdirSync('src')) {
			compressor.add(`src/${item}`, FS.readFileSync(`src/${item}`));
		}
	});
	it('throws on end', () => assert.throws(() => compressor.end()));
	it('is done with a buffer', () => {
		const zipped = compressor.done();
		const filed = FS.readFileSync(fname);
		assert.equal(zipped.toString('hex'), filed.toString('hex'));
		FS.rmSync(fname);
	});
});
