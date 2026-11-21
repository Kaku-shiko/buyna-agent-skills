import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planSubscriptionIntegration} from '../../../skills/buyna-service-subscription/scripts/plan-integration.mjs';
const config={projectId:'p',sellerId:'s',shopId:'default',origin:'https://merchant.example',frontend:'react',resourceRecordPath:'resources.yaml',authAdapterPath:'server/auth.mjs'};
test('integration plan uses the fixed package version rather than a copied version',()=>{
 const metadata=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(planSubscriptionIntegration(config).moduleVersion,metadata.version);
 assert.equal(planSubscriptionIntegration(config).module,metadata.name);
});
test('a valid plan is configuration only, never deployment authority or billing activation',()=>{const result=planSubscriptionIntegration(config);assert.equal(result.status,'CONFIG_VALIDATED_NOT_DEPLOYED');assert.ok(Object.values(result.actionsPerformed).every(value=>value===false));assert.equal(result.legacyDefaults.unknownDates,'MIGRATION_REVIEW');});
test('missing identity and unsafe origin cannot generate a plan',()=>{assert.throws(()=>planSubscriptionIntegration({...config,sellerId:''}),/IDENTITY/);assert.throws(()=>planSubscriptionIntegration({...config,origin:'http://merchant.example'}),/ORIGIN/);assert.throws(()=>planSubscriptionIntegration({...config,authAdapterPath:null}),/EVIDENCE/);});
