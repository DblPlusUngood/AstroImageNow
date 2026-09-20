"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const FM=require('../forecast-model.js'),F=require('../filters.js'),J=require('../journal.js'),D=require('../advisor.js'),P=require('../planner.js'),O=require('../opportunities.js'),E=require('../equipment.js'),C=require('../data/targets.js'),S=require('../data/solar-system.js'),app=require('../app.js');
const H=3600000,now=Date.parse('2026-09-19T20:00:00Z'),site={id:'home',name:'Home',lat:40,lon:-83,bortle:8},rig=E.rigs[0];
function snapshot(seeing=4){const time=Array.from({length:192},(_,i)=>new Date(now+i*H).toISOString());return{forecast:{meta:{fetchedAt:new Date(now).toISOString()},HourlyForecast:time.slice(0,84).map(UTCForecastHour=>({UTCForecastHour,Cloud:{ActualValue:10},Seeing:{ActualValue:seeing},Transparency:{ActualValue:7},Wind:{ActualValue:2},Temperature:{ActualValue:290},DewPoint:{ActualValue:280}}))},weather:{meta:{provider:'foreca',fetchedAt:new Date(now).toISOString()},hourly_units:{visibility:'m'},hourly:{time,cloud_cover:time.map(()=>10),wind_speed_10m:time.map(()=>4),temperature_2m:time.map(()=>60),dew_point_2m:time.map(()=>45),precipitation_probability:time.map(()=>0),precipitation:time.map(()=>0),thunder_probability:time.map(()=>0),wind_gusts_10m:time.map(()=>5),visibility:time.map(()=>16000)}}}}
const options=(s=snapshot())=>({catalog:C.targets,solar:S,date:'2026-09-19',site,timeZone:'America/New_York',rig,mode:'deep-sky',filter:F.choices[1],data:O.prepare(s,app.weatherSummaryForRows,now)});

test('weather fills absent fields in correct units without synthesizing seeing or transparency',()=>{
  const s=snapshot(),before=JSON.stringify(s),rows=FM.rows(s.forecast,s.weather),later=rows[100];
  assert.equal(rows.length,192);assert.equal(rows[0].Wind.ActualValue,2);assert.equal(rows[0].estimated,false);
  assert.ok(Math.abs(later.Wind.ActualValue*2.236936-4)<1e-8);assert.ok(Math.abs(later.Temperature.ActualValue-288.70555556)<1e-6);
  assert.equal(later.Seeing,undefined);assert.equal(later.Transparency,undefined);assert.equal(later.estimated,true);assert.equal(JSON.stringify(s),before);
});
test('partial scores normalize only available components and still require cloud and wind',()=>{
  const row=FM.rows(null,snapshot().weather)[0],score=app.overallForRow(row,null);
  assert.ok(score>75&&score<100);assert.equal(app.overallForRow({...row,Wind:undefined},null),null);
  assert.equal(app.overallForRow({...row,Cloud:undefined},null),null);
  assert.equal(app.overallForRow({...row,Cloud:{ActualValue:80}},null),25);
  assert.equal(app.overallForRow({...row,Wind:{ActualValue:12}},null),25);
  assert.equal(app.overallForRow({...row,Cloud:{ActualValue:null}},null),null);
});
test('conditions score is independent of Moon, selected rig, filter and target type',()=>{
  const row=snapshot().forecast.HourlyForecast[0],expected=app.overallForRow(row,null);
  for(const moon of[{IsAboveHorizon:true,IlluminationPercent:100},{IsAboveHorizon:false},null])assert.equal(app.overallForRow(row,moon),expected);
  for(const equipment of E.rigs)for(const filter of F.choices)assert.equal(app.overallForRow({...row,rig:equipment,filter,targetType:'planetary'},null),expected);
});
test('week-end weather estimates remain subject to rain hazards, missing inputs and staleness',()=>{
  const s=snapshot(),ms=now+120*H;
  assert.equal(O.assess(ms,O.prepare(s,app.weatherSummaryForRows,now),rig,'deep-sky').kind,'estimated');
  s.weather.hourly.precipitation_probability.fill(90);assert.equal(O.assess(ms,O.prepare(s,app.weatherSummaryForRows,now),rig,'planetary').kind,'blocked');
  s.weather.hourly.precipitation_probability.fill(0);delete s.weather.hourly.visibility;assert.equal(O.assess(ms,O.prepare(s,app.weatherSummaryForRows,now),rig,'deep-sky').kind,'unknown');
  s.weatherStale=true;assert.equal(O.assess(ms,O.prepare(s,app.weatherSummaryForRows,now),rig,'deep-sky').kind,'unknown');
});
test('local Moon is available beyond provider coverage without a fabricated seeing score',()=>{
  const moon=P.moonAt('2026-09-26T04:00:00Z',site);assert.equal(typeof moon.IsAboveHorizon,'boolean');assert.ok(moon.IlluminationPercent>=0&&moon.IlluminationPercent<=100);assert.ok(Number.isFinite(moon.Altitude));
});
test('filter advice separates broadband and line emission, with planned ownership explicit',()=>{
  const emission=C.targets.find(t=>t.objectType==='emission'),galaxy=C.targets.find(t=>t.objectType==='galaxy');
  assert.deepEqual(F.choices.map(f=>f.status),['available','owned','planned','proposed']);
  assert.equal(F.recommend(emission,{rig,site,moonBright:true}).filter.id,'l-pro');
  assert.equal(F.recommend(emission,{rig,site,moonBright:true,includePlanned:true}).filter.id,'l-ultimate');
  assert.equal(F.recommend(galaxy,{rig,site,includePlanned:true}).filter.id,'uv-ir');
  assert.match(F.advice(galaxy,F.choices[2],rig),/removes much/);assert.match(F.advice(emission,F.choices[2],rig),/Ha\/O III/);
  assert.doesNotThrow(()=>F.advice(galaxy,null,rig));
});
test('advisor ranks real windows, unique subjects and existing equipment by default',()=>{
  const advice=D.propose(options());assert.equal(advice.picks.length,3);assert.equal(new Set(advice.picks.map(p=>p.result.target.id)).size,3);
  for(const p of advice.picks){assert.ok(E.rigs.some(r=>r.id===p.rig.id));assert.ok(p.result.geometryWindow);assert.ok(['available','owned'].includes(p.filter.status));assert.equal(p.history.state,'unknown');assert.ok(p.match.window.samples.every(s=>s.altitude>=30&&s.sunAltitude<=p.result.threshold))}
});
test('mode and selected-rig constraints are honored; poor seeing never yields a supported planet',()=>{
  const args=options(snapshot(1)),planets=D.propose({...args,policy:'planetary'});assert.ok(planets.picks.length);assert.ok(planets.picks.every(p=>p.result.target.body&&p.match.kind!=='supported'&&p.rig.telescopeId==='c8'));
  const selected=E.resolve('c8','barlow','533',3),advice=D.propose({...args,rig:selected,mode:'planetary',policy:'selected',filter:F.choices[3]});
  assert.ok(advice.picks.every(p=>p.rig.id===selected.id&&p.filter.id==='uv-ir'));
  assert.ok(D.propose({...options(),policy:'deep-sky'}).picks.every(p=>!p.result.target.body));
});
test('rain and stale data never become an advisor setup recommendation',()=>{
  const s=snapshot();s.weather.hourly.precipitation_probability.fill(90);const advice=D.propose(options(s));assert.equal(advice.promising,false);assert.ok(advice.picks.every(p=>p.match.window===null));
  s.weatherStale=true;assert.equal(D.propose(options(s)).promising,false);
});
const entry={id:'session-1',date:'2026-09-18',targetId:C.targets[0].id,siteId:'home',siteName:'Home',rigId:rig.id,filterId:'l-pro',outcome:'revisit',integrationMinutes:45,notes:'Check focus next time.',createdAt:'2026-09-19T12:00:00Z'};
const journalContext={targets:[...C.targets,...S],sites:[site],rigs:E.rigs};
test('journal validation retains real sessions and strips credentials and arbitrary fields',()=>{
  const normalized=J.normalize([{...entry,apiKey:'private',lat:40},entry,{...entry,id:'bad',date:'2026-02-30'}],journalContext);
  assert.equal(normalized.length,1);assert.ok(!('apiKey' in normalized[0]));assert.ok(!('lat' in normalized[0]));assert.equal(normalized[0].integrationMinutes,45);
  assert.equal(J.normalize([{...entry,integrationMinutes:NaN}],journalContext)[0].integrationMinutes,null);
});
test('deleting a saved site does not erase previous observing sessions',()=>{
  const normalized=J.normalize([entry],{...journalContext,sites:[]});assert.equal(normalized.length,1);assert.equal(normalized[0].siteName,'Home');
});
test('unknown history is distinct from uncaptured, and latest outcome changes revisit priority',()=>{
  assert.deepEqual(J.history([],entry.targetId),{state:'unknown',label:'No sessions logged',count:0,rank:0});
  assert.equal(J.history([entry],entry.targetId).rank,8);
  const later={...entry,id:'session-2',date:'2026-09-19',outcome:'captured'};assert.equal(J.history([entry,later],entry.targetId).state,'captured');assert.equal(J.history([entry,later],entry.targetId).rank,-4);
});
test('journal round-trips and exports independently of forecast credentials; write failures surface',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},entries=J.normalize([entry],journalContext);
  J.save(storage,entries);assert.deepEqual(J.read(storage),entries);assert.deepEqual(JSON.parse(J.exportJSON(entries)).entries,entries);
  assert.throws(()=>J.save({setItem(){throw Error('full')}},entries),/full/);
});
test('a logged revisit affects relative advice only, without overriding visibility or hazards',()=>{
  const args=options(),first=D.propose(args).picks[0],journal=[{...entry,targetId:first.result.target.id}];
  const updated=D.propose({...args,journal}).picks.find(p=>p.result.target.id===first.result.target.id);
  assert.equal(updated.rank,first.rank+8);assert.equal(updated.history.state,'revisit');
});
test('known poor seeing or transparency still limits a partly missing interval',()=>{
  const s=snapshot(1);delete s.forecast.HourlyForecast[1].Seeing;
  assert.equal(O.assess(now+H/2,O.prepare(s,app.weatherSummaryForRows,now),E.resolve('c8','native','r6ii'),'planetary').kind,'limited');
  s.forecast.HourlyForecast[0].Transparency.ActualValue=25;delete s.forecast.HourlyForecast[1].Transparency;
  assert.equal(O.assess(now+H/2,O.prepare(s,app.weatherSummaryForRows,now),rig,'deep-sky').kind,'limited');
});
