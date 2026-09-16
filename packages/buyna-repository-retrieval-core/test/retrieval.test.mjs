import {test} from 'node:test';import assert from 'node:assert/strict';import {searchRepository} from '../src/index.mjs';
const index={chunks:[{skill:'storage',source:'skills/storage/references/image.md',content:'图片保存 配额写入 Basic Pro',startLine:1},{skill:'pay',source:'skills/pay/SKILL.md',content:'付款渠道开通核对',startLine:1}]};
test('Chinese requests retrieve the relevant rule',()=>assert.equal(searchRepository(index,'图片保存不了')[0].skill,'storage'));
test('scope applied before ranking',()=>assert.equal(searchRepository(index,'图片保存',{skills:['pay']}).length,0));
test('budget and empty query',()=>{assert.equal(searchRepository(index,'Basic',{maxChars:1}).length,0);assert.deepEqual(searchRepository(index,''),[]);});
