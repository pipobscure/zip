import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import * as PKG from './index.js';

describe('Package', () => {
	it('MemArchive', ()=>assert.equal(typeof PKG.MemArchive, 'function'));
	it('FileArchive', ()=>assert.equal(typeof PKG.FileArchive, 'function'));
	it('Compressor', ()=>assert.equal(typeof PKG.Compressor, 'function'));
	it('package.json', ()=>{
		const pkg = JSON.parse(readFileSync('package.json').toString('utf-8'));
		assert.equal(basename(pkg.main), 'index.js');
		assert.equal(dirname(pkg.main), 'dist');
	})
});
