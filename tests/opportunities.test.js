"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../opportunities.js'),P=require('../planner.js'),E=require('../equipment.js'),S=require('../data/solar-system.js'),C=require('../data/targets.js'),A=require('../vendor/astronomy.browser.min.js'),app=require('../app.js');
const H=3600000,now=Date.parse('2026-09-19T20:00:00Z'),times=Array.from({length:5},(_,i)=>new Date(now+i*H).toISOString()),rig=E.rigs[0];
function snapshot(){return{forecast:{meta:{fetchedAt:new Date(now).toISOString()},HourlyForecast:times.map(UTCForecastHour=>({UTCForecastHour,Cloud:{ActualValue:10},Transparency:{ActualValue:7},Seeing:{ActualValue:3},Wind:{ActualValue:2},Temperature:{ActualValue:290},DewPoint:{ActualValue:280}}))},weather:{meta:{provider:'foreca',fetchedAt:new Date(now).toISOString()},hourly_units:{visibility:'m'},hourly:{time:times,precipitation_probability:times.map(()=>0),precipitation:times.map(()=>0),thunder_probability:times.map(()=>0),wind_gusts_10m:times.map(()=>5),visibility:times.map(()=>16000)}}}}
const prepared=s=>O.prepare(s,app.weatherSummaryForRows,now);
function result(){return{target:{objectType:'galaxy',lightPollution:'high'},threshold:-18,minAltitude:30,geometryWindow:{start:now,end:now+4*H},samples:Array.from({length:25},(_,i)=>({ms:now+i*H/6,altitude:60,sunAltitude:-25,moonAltitude:-20,moonSeparation:90,illumination:.8}))}}

test('rigs have unique stable IDs and all three C8 configurations with two owned Barlows',()=>{
  assert.equal(new Set(E.rigs.map(r=>r.id)).size,E.rigs.length);assert.equal(E.rigs[0].id,'z73-533');
  assert.deepEqual(E.telescopes.find(s=>s.id==='c8').configurations.map(c=>c.id),['native','reduced','barlow']);
  assert.equal(E.resolve('c8','native','r6ii').focalLengthMm,2032);
  assert.equal(E.resolve('c8','reduced','r6ii').focalLengthMm,1280.16);
  assert.equal(E.resolve('c8','barlow','533',2).focalLengthMm,4064);
  assert.equal(E.resolve('c8','barlow','533',3).focalLengthMm,6096);
  assert.deepEqual(E.resolve('c8','barlow','533',3).filters.map(f=>f.id),['none']);
  const ultra=E.resolve('ultracat56','native','533');assert.equal(ultra.focalLengthMm,269);assert.ok(Math.abs(P.fieldOfView(ultra).widthDeg-2.4086)<.001);
  const c8=P.fieldOfView(E.resolve('c8','native','r6ii'));assert.ok(c8.widthDeg>1&&c8.heightDeg<.7);
  assert.equal(P.framing(C.targets.find(t=>t.designation==='M45'),ultra).kind,'mosaic');
  assert.equal(P.framing(C.targets.find(t=>t.designation==='NGC 7000'),ultra).kind,'comfortable');
});

test('moving positions use topocentric parallax and change throughout the night',()=>{
  const site={lat:40,lon:-83},observer=new A.Observer(40,-83,0),time=new Date('2026-09-20T02:00:00Z');
  for(const target of S){const eq=A.Equator(A.Body[target.body],time,observer,true,true),expected=A.Horizon(time,observer,eq.ra,eq.dec,null),actual=P.position(target,time,site);assert.ok(Math.abs(expected.altitude-actual.altitude)<1e-8)}
  const moon=S[0],plan=P.plan(S,'2026-09-19',site,'America/New_York',E.resolve('c8','native','r6ii'));
  assert.ok(plan.results.every(r=>r.threshold===-6&&r.moonRisk===false));
  for(const r of plan.results)if(r.window)assert.ok(r.window.samples.every(s=>s.sunAltitude<=-6&&s.altitude>=30));
  const lunar=plan.results.find(r=>r.target.id===moon.id);assert.ok(lunar.samples.some(s=>Math.abs(s.moonSeparation)<1e-6));
  assert.ok(!S.some(t=>t.body==='Sun'));assert.equal(lunar.darkSky,false);
});

test('saved assignments retain separate optical trains and moving target IDs',()=>{
  const entry={date:'2026-09-19',siteId:'home',targetId:S[0].id,rigId:E.resolve('c8','barlow','533',2).id};
  const plans=P.normalizePlans([entry,{...entry,rigId:E.resolve('c8','barlow','533',3).id}], [...C.targets,...S],[{id:'home'}],E.rigs);
  assert.equal(plans.length,2);assert.ok(plans.every(p=>p.filterId==='none'));
});

test('forecast intersection stops at actual coverage and respects both hourly neighbors',()=>{
  const s=snapshot();s.forecast.HourlyForecast[2].Cloud.ActualValue=80;
  const data=prepared(s);assert.equal(O.assess(now+H*1.5,data,rig,'deep-sky').kind,'limited');
  const match=O.match(result(),data,rig,'deep-sky');assert.equal(match.window.start,now);assert.equal(match.window.end,now+H);
  assert.equal(O.assess(now+5*H,data,rig,'deep-sky').kind,'unknown');
  s.forecast.HourlyForecast.splice(1,1);assert.equal(O.assess(now+H,prepared(s),rig,'deep-sky').kind,'unknown');
});

test('missing, old, failed and future-dated retrievals never produce a supported window',()=>{
  for(const change of[s=>s.weather=null,s=>s.forecast=null,s=>s.weatherStale=true,s=>s.forecast.meta.fetchedAt=new Date(now-4*H).toISOString(),s=>s.weather.meta.fetchedAt=new Date(now+H).toISOString(),s=>delete s.weather.hourly.visibility]){
    const s=snapshot();change(s);assert.equal(O.match(result(),prepared(s),rig,'deep-sky').window,null);
  }
  assert.equal(O.assess(now-1,prepared(snapshot()),rig,'deep-sky').kind,'unknown');
});

test('weather hazards win even when astronomy is excellent or unavailable',()=>{
  for(const [field,value,reason] of[['precipitation_probability',90,'Rain likely'],['thunder_probability',50,'Storm risk'],['wind_gusts_10m',30,'Strong gusts'],['visibility',1000,'Fog / low visibility']]){
    const s=snapshot();s.weather.hourly[field].fill(value);s.forecast=null;
    const assessment=O.assess(now+H,prepared(s),rig,'planetary');assert.equal(assessment.kind,'blocked');assert.equal(assessment.reason,reason);
  }
});

test('planetary seeing criteria differ from transparency and increase for a Barlow',()=>{
  const s=snapshot();s.forecast.HourlyForecast.forEach(r=>r.Transparency.ActualValue=29);const data=prepared(s);
  assert.equal(O.assess(now+H,data,rig,'deep-sky').kind,'limited');
  assert.equal(O.assess(now+H,data,E.resolve('c8','native','r6ii'),'planetary').kind,'supported');
  assert.equal(O.assess(now+H,data,E.resolve('c8','barlow','r6ii',2),'planetary').kind,'limited');
  s.forecast.HourlyForecast.forEach(r=>delete r.Seeing);assert.equal(O.assess(now+H,prepared(s),rig,'planetary').kind,'unknown');
});

test('bright Moon intervals stay cautionary while lunar imaging has no self-penalty',()=>{
  const r=result();r.samples.forEach(s=>{s.moonAltitude=50;s.moonSeparation=10});
  const dso=O.match(r,prepared(snapshot()),rig,'deep-sky');assert.equal(dso.kind,'caution');assert.ok(dso.reasons.includes('Moonlight caution'));
  assert.equal(O.match(r,prepared(snapshot()),rig,'planetary').kind,'supported');
});

test('caution data remains caution rather than silently becoming favorable',()=>{
  const s=snapshot();s.weather.hourly.precipitation_probability.fill(30);
  const match=O.match(result(),prepared(s),rig,'deep-sky');assert.equal(match.kind,'caution');assert.ok(match.window);assert.ok(match.reasons.includes('Rain possible'));
});

 test('long focal-length deep-sky work checks seeing, and missing or narrow dew margin stays cautious',()=>{
  const s=snapshot();s.forecast.HourlyForecast.forEach(r=>r.Seeing.ActualValue=2);
  assert.equal(O.assess(now+H,prepared(s),E.resolve('c8','reduced','533'),'deep-sky').kind,'limited');
  assert.equal(O.assess(now+H,prepared(s),rig,'deep-sky').kind,'supported');
  s.forecast.HourlyForecast.forEach(r=>r.DewPoint.ActualValue=289);
  assert.equal(O.assess(now+H,prepared(s),rig,'deep-sky').kind,'caution');
  s.forecast.HourlyForecast.forEach(r=>delete r.DewPoint);
  assert.match(O.assess(now+H,prepared(s),rig,'deep-sky').reason,/unavailable/);
});
