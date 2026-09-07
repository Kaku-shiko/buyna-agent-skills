import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('product backend routes product images through the fixed catalog and file composition',()=>{
  const skill=read('skills/buyai-product-merchant-backend/SKILL.md');
  const contract=read('skills/buyai-product-merchant-backend/references/product-media-fixed-core.md');
  const phase=read('skills/buyna-website-builder/references/phase-05-dashboard-integration.md');
  for(const text of [skill,contract,phase])assert.match(text,/createProductMediaService/);
  assert.match(skill,/createDraft[^]*prepare upload[^]*transfer bytes[^]*attachUploadedImage[^]*setMainImage[^]*reorderImages[^]*replaceUploadedImage[^]*removeImage/);
  for(const method of ['getProductForUpdate','listProductImagesForUpdate','getProductImageByFileIdForUpdate','attachProductImage','replaceProductImage','setMainProductImage','reorderProductImages','removeProductImage','getProductWithImages'])assert.match(contract,new RegExp(method));
  assert.match(contract,/project_id \+ seller_id/);
  assert.match(contract,/first[- ]image[^]*main/i);
  assert.match(contract,/draft[^]*(?:preserv|retry)/i);
  assert.match(contract,/created: false/);
  assert.match(contract,/soft-delete only `created: true`/);
});

test('fixed product-media contract owns behavior but not project UI storage or SQL',()=>{
  const source=read('packages/buyna-merchant-catalog-core/src/product-media-core.mjs');
  assert.doesNotMatch(source,/MEDINANCE|seller_medinance|medinance\./i);
  assert.doesNotMatch(source,/\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b|@aws-sdk|<form|className=|\.css\b/i);
});
