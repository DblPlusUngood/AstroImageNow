"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const N=require('../night-plan.js'),A=require('../advisor.js'),O=require('../opportunities.js'),P=require('../planner.js'),E=require('../equipment.js'),F=require('../filters.js'),C=require('../data/targets.js'),S=require('../data/solar-system.js'),app=require('../app.js');
const homeSite={id:'home',bortle:9,lat:40,lon:-83},awaySite={id:'jgap',bortle:3,lat:39.5,lon:-82.5};
function pick(id='nebula',{mode='deep-sky',minutes=180,kind='supported',faint=false,moon=false,filter='none',rig='z73-533',frame='comfortable'}={}){
  return{result:{target:{id,lightPollution:faint?'high':'moderate'},framing:{kind:frame},moonRisk:moon},mode,rig:{id:rig},filter:{id:filter,kind:filter==='l-ultimate'?'dual-band':'broadband'},match:{kind,estimated:kind==='estimated',window:minutes?{minutes}:null,reasons:[]}};
}
const site=(which,picks,state='usable',reasons=[])=>({site:which,usable:picks,candidates:picks,state,reasons});
const choose=(home,away)=>N.choose({home:site(homeSite,home,home.length?'usable':'limited'),jgap:site(awaySite,away,away.length?'usable':'limited')});
test('comparable windows favor Home, including bright planets under a bright Moon',()=>{
  assert.equal(choose([pick()],[pick()]).state,'home');
  assert.equal(choose([pick('Jupiter',{mode:'planetary',moon:true})],[pick('Jupiter',{mode:'planetary',moon:true})]).state,'home');
});
test('travel requires the same setup and a meaningful longer window or faint dark-sky benefit',()=>{
  assert.equal(choose([pick('m33',{faint:true})],[pick('m33',{faint:true})]).state,'jgap');
  assert.equal(choose([pick('m33',{faint:true,moon:true})],[pick('m33',{faint:true,moon:true})]).state,'home');
  assert.equal(choose([pick('line',{faint:true,filter:'l-ultimate'})],[pick('line',{faint:true,filter:'l-ultimate'})]).state,'home');
  assert.equal(choose([pick('a')],[pick('a',{minutes:270})]).state,'jgap');
  assert.equal(choose([pick('a')],[pick('a',{minutes:260})]).state,'home');
  assert.equal(choose([pick('a')],[pick('a',{minutes:360,rig:'another'})]).state,'home');
  assert.equal(choose([pick('a')],[pick('a',{minutes:360,kind:'estimated'})]).state,'home');
});
test('weather estimates keep the uncertainty cue; one available site can win only against a known limitation',()=>{
  const plan=choose([],[pick('a',{kind:'estimated'})]);assert.equal(plan.state,'jgap');assert.match(plan.heading,/≈/);assert.equal(plan.estimated,true);
  const unknown=N.choose({home:site(homeSite,[],'unknown'),jgap:site(awaySite,[pick()])});assert.equal(unknown.state,'unknown');assert.equal(unknown.primary,undefined);
});
test('both known poor sites say neither; pending, missing and stale comparisons do not',()=>{
  const plan=N.choose({home:site(homeSite,[],'limited',['Rain likely']),jgap:site(awaySite,[],'limited',['Rain likely'])});assert.equal(plan.state,'neither');assert.equal(plan.reason,'Rain likely');
  assert.equal(N.choose({busy:true}).state,'updating');assert.equal(N.choose({missing:['JGAP']}).state,'unknown');
});
test('a useful alternative is another subject, preferably on the same rig and filter',()=>{
  const one=pick(),duplicate=pick('nebula',{rig:'other'}),different=pick('cluster'),altMode=pick('Jupiter',{mode:'planetary',rig:'c8'});
  const plan=choose([one,duplicate,altMode,different],[one]);assert.equal(plan.alternative,different);
  assert.equal(choose([one,duplicate],[one]).alternative,null);
});
test('short sessions and unusable framing cannot become automatic setup plans',()=>{
  for(const p of[pick('a',{minutes:50}),pick('a',{minutes:10,mode:'planetary'}),pick('a',{frame:'mosaic'}),pick('a',{frame:'unknown'})])assert.equal(N.practical(p),false);
  assert.equal(N.practical(pick('a',{minutes:20,mode:'planetary'})),true);
});
const now=Date.parse('2026-09-21T16:00:00Z'),H=3600000;
function snapshot(){const times=Array.from({length:168},(_,i)=>new Date(now+i*H).toISOString());return{weather:{meta:{provider:'foreca',fetchedAt:new Date(now).toISOString()},hourly_units:{visibility:'m'},hourly:{time:times,cloud_cover:times.map(()=>10),wind_speed_10m:times.map(()=>4),temperature_2m:times.map(()=>60),dew_point_2m:times.map(()=>40),precipitation_probability:times.map(()=>0),precipitation:times.map(()=>0),thunder_probability:times.map(()=>0),visibility:times.map(()=>16000),wind_gusts_10m:times.map(()=>5)}}}}
function assess(snapshot,date='2026-09-21',policy='auto'){
  const data=O.prepare(snapshot,app.weatherSummaryForRows,now),advice=A.propose({catalog:C.targets,solar:S,date,site:homeSite,timeZone:'America/New_York',rig:E.rigs[0],mode:'deep-sky',filter:F.choices[0],policy,data});return N.assess({site:homeSite,data,advice});
}
test('real geometry and weather-only forecasts yield explicitly estimated, constrained plans',()=>{
  const evaluated=assess(snapshot());assert.equal(evaluated.state,'usable');assert.ok(evaluated.usable.every(p=>p.match.estimated));
  for(const p of evaluated.usable){assert.ok(p.match.window.minutes>=(p.mode==='planetary'?20:60));assert.ok(p.match.window.samples.every(s=>s.ms>=now&&s.altitude>=30));assert.ok(['owned','available'].includes(p.filter.status))}
  assert.ok(assess(snapshot(),'2026-09-21','planetary').usable.every(p=>p.mode==='planetary'));
  assert.ok(assess(snapshot(),'2026-09-21','deep-sky').usable.every(p=>p.mode==='deep-sky'));
});
test('real rain, partial coverage, stale data and beyond-week dates stay distinguishable',()=>{
  const rain=snapshot();rain.weather.hourly.precipitation_probability.fill(95);assert.equal(assess(rain).state,'limited');
  const partial=snapshot();partial.weather.hourly.time=partial.weather.hourly.time.slice(0,3);assert.equal(assess(partial).state,'unknown');
  assert.equal(assess({...snapshot(),weatherStale:true}).state,'unknown');assert.equal(assess(snapshot(),'2026-10-02').state,'unknown');
});
test('a brief fully supported interval does not hide a practical caution window',()=>{
  const samples=Array.from({length:13},(_,i)=>({ms:now+i*600000,altitude:60,sunAltitude:-20,moonAltitude:-10}));
  const result={target:{},samples,threshold:-18,minAltitude:30,geometryWindow:{minutes:120}},rows=Array.from({length:3},(_,i)=>({ms:now+i*H,row:{Cloud:{ActualValue:10},Wind:{ActualValue:1},Transparency:{ActualValue:7},Temperature:{ActualValue:290},DewPoint:{ActualValue:i===0?275:289}}}));
  const data={now,stale:false,astronomy:rows,weather:rows.map(r=>({ms:r.ms,summary:{complete:true,severity:'clear'}}))};
  const match=O.match(result,data,E.rigs[0],'deep-sky',F.choices[0],60);assert.equal(match.kind,'caution');assert.equal(match.window.minutes,120);
});
test('site-specific broadband recommendations do not prevent a legitimate dark-site comparison',()=>{
  assert.equal(choose([pick('m33',{faint:true,filter:'l-pro'})],[pick('m33',{faint:true})]).state,'jgap');
});
test('inappropriate selected filters stay explorable but are not endorsed by the night plan',()=>{
  assert.equal(N.practical(pick('Saturn',{mode:'planetary',filter:'l-ultimate'})),false);
  assert.equal(N.practical(pick('Saturn',{mode:'planetary',filter:'l-pro'})),false);
  assert.equal(N.practical(pick('m33',{faint:true,filter:'l-ultimate'})),false);
  const emission=pick('line',{filter:'l-ultimate'});emission.result.target.objectType='emission';assert.equal(N.practical(emission),true);
  const data=O.prepare(snapshot(),app.weatherSummaryForRows,now),advice=A.propose({catalog:C.targets,solar:S,date:'2026-09-21',site:homeSite,timeZone:'America/New_York',rig:E.resolve('c8','native','r6ii'),mode:'planetary',filter:F.choices[2],policy:'selected',data});
  const evaluated=N.assess({site:homeSite,data,advice});assert.equal(evaluated.state,'filter');assert.equal(N.choose({home:evaluated,jgap:{...evaluated,site:awaySite}}).state,'filter');
});
