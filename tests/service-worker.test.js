"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
function worker(){
  const handlers={},deleted=[],cached=[],matched=[],policies=[];
  let skipped=false;
  const context={URL,Request,Set,Promise,self:{location:"https://example.test/AstroImageNow/sw.js",addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:()=>{skipped=true}},caches:{open:async()=>({addAll:async requests=>{cached.push(...requests.map(r=>"./"+new URL(r.url).pathname.slice("/AstroImageNow/".length)));policies.push(...requests.map(r=>r.cache))},match:async key=>{matched.push(key);return"cached shell"}}),keys:async()=>["astro-image-now-v1.9-release-1","astro-image-now-v1.10.0","astro-image-now-v1.11.0","astro-image-now-v1.11.1","astro-image-now-v1.11.2","astro-image-now-v1.12.0","astro-image-now-v1.13.0","unrelated-project"],delete:async key=>deleted.push(key)},fetch:async()=>"network"};
  vm.runInNewContext(fs.readFileSync(require.resolve("../sw.js"),"utf8"),context);
  return{handlers,deleted,cached,matched,policies,get skipped(){return skipped}};
}
test("service worker installs the provider script and deletes only obsolete app caches",async()=>{
  const w=worker();let pending;
  w.handlers.install({waitUntil:p=>pending=p});await pending;
  assert.ok(w.cached.includes("./providers.js"));assert.equal(w.skipped,false);
  w.handlers.activate({waitUntil:p=>pending=p});await pending;
  assert.deepEqual(w.deleted,["astro-image-now-v1.9-release-1","astro-image-now-v1.10.0","astro-image-now-v1.11.0","astro-image-now-v1.11.1","astro-image-now-v1.11.2","astro-image-now-v1.12.0","astro-image-now-v1.13.0"]);
  w.handlers.message({data:{type:"APPLY_UPDATE"}});assert.equal(w.skipped,true);
});
test("offline section-anchor navigation uses the same cached document",async()=>{
  const w=worker();let response;
  w.handlers.fetch({request:{method:'GET',url:'https://example.test/AstroImageNow/#targetPlanner'},respondWith:p=>response=p});
  assert.equal(await response,'cached shell');
  assert.deepEqual(w.matched,['https://example.test/AstroImageNow/']);
  w.handlers.fetch({request:{method:'GET',url:'https://example.test/another-project/#targetPlanner'},respondWith:()=>assert.fail('Unrelated document must bypass')});
});
test("offline shell includes all planning dependencies and each cached asset exists",async()=>{
  const w=worker();let pending;
  w.handlers.install({waitUntil:p=>pending=p});await pending;
  for(const asset of ['filters.js','forecast-model.js','journal.js','advisor.js','night-plan.js','planner.js','planner-ui.js','equipment.js','opportunities.js','site-forecasts.js','theme.css','data/solar-system.js','data/targets.js','vendor/astronomy.browser.min.js'])assert.ok(w.cached.includes('./'+asset));
  for(const asset of w.cached)assert.ok(fs.existsSync(require('node:path').resolve(__dirname,'..',asset)),asset);
});
test("service worker intercepts only its own shell, never authenticated or other-site requests",async()=>{
  const w=worker();let response;
  for(const [method,url] of[["GET","https://weatherapi.foreca.net/api/v1/current/0,0"],["POST","https://v2-api-public.astrospheric.com/api/Moon"],["GET","https://example.test/another-project/app.js"],["GET","https://example.test/AstroImageNow/tests/mock-fetch.js"]]){
    w.handlers.fetch({request:{method,url},respondWith:()=>assert.fail("Must bypass service worker")});
  }
  w.handlers.fetch({request:{method:"GET",url:"https://example.test/AstroImageNow/providers.js"},respondWith:p=>response=p});
  assert.equal(await response,"cached shell");
});

test("new app installations bypass stale HTTP-cache assets",async()=>{
  const w=worker();let pending;
  w.handlers.install({waitUntil:p=>pending=p});await pending;
  assert.ok(w.policies.length>0);assert.ok(w.policies.every(policy=>policy==='reload'));
});
