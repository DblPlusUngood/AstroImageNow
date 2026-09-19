"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const p=require("../providers.js");
const app=require("../app.js");
const time="2026-09-20T04:00:00Z";
const hourly={forecast:[{time,temperature:55,precipProb:20,precipAccum:2.54,windGust:4,visibility:16000,thunderProb:0,symbolPhrase:"clear"}]};
const current={current:{time,temperature:60}};
const air={forecast:[{time,AQI:30,AQI_PM2P5:25}]};
const weather={hourly:{time:[time],temperature_2m:[55],precipitation:[0],precipitation_probability:[0],weather_code:[0],visibility:[16000],wind_gusts_10m:[5]}};
function mock(t,callback){t.mock.method(global,"fetch",callback)}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const location={lat:44.98028,lon:-85.21117};

test("Foreca uses the current host, bearer auth, full fields and correct units",async t=>{
  const requests=[];
  mock(t,async(url,options)=>{
    requests.push({url,options});
    return response(url.includes("air-quality")?air:url.includes("/current/")?current:hourly);
  });
  const data=await p.fetchForeca(location,"fixture-token");
  assert.equal(requests.length,3);
  for(const request of requests){
    assert.match(request.url,/^https:\/\/weatherapi\.foreca\.net\/api\/v1\//);
    assert.match(request.url,/-85\.21,44\.98/);
    assert.equal(request.options.headers.Authorization,"Bearer fixture-token");
    assert.ok(!request.url.includes("fixture-token"));
  }
  assert.match(requests[0].url,/periods=168&dataset=full/);
  assert.equal(data.hourly.precipitation[0],0.1);
  assert.equal(data.hourly_units.precipitation,"inch");
  assert.equal(data.hourly.visibility[0],16000);
  assert.equal(data.hourly.us_aqi[0],30);
  assert.equal(data.current.temperature_2m,60);
});

test("Foreca current and air-quality failures preserve its successful hourly forecast",async t=>{
  mock(t,async url=>url.includes("/forecast/hourly/")&&!url.includes("air-quality")?response(hourly):response({},403));
  const records=[];
  const data=await p.fetchForeca(location,"fixture-token",{onStatus:r=>records.push(r)});
  assert.equal(data.meta.provider,"foreca");
  assert.equal(data.meta.partial,true);
  assert.equal(data.current.temperature_2m,null);
  assert.equal(data.hourly.temperature_2m[0],55);
  assert.equal(records.filter(r=>r.status==="failed").length,2);
});

test("Foreca rejection visibly falls back, without forwarding its token to Open-Meteo",async t=>{
  mock(t,async(url,options)=>{
    if(url.includes("foreca.net"))return response({message:"echoed secret should not escape"},401);
    assert.equal(options.headers,undefined);
    return response(url.includes("air-quality-api")?{hourly:{time:[time],us_aqi:[30]}}:weather);
  });
  const result=await p.supplemental(location,{weatherSource:"foreca-fallback",forecaToken:"fixture-token"});
  assert.equal(result.meta.provider,"open-meteo");
  assert.match(result.meta.notice,/Foreca hourly: authentication.*HTTP 401.*Using Open-Meteo/);
  assert.ok(!JSON.stringify(result).includes("echoed secret"));
});

test("Foreca-only mode never silently switches providers",async t=>{
  const urls=[];
  mock(t,async url=>{urls.push(url);return response({},401)});
  await assert.rejects(p.supplemental(location,{weatherSource:"foreca",forecaToken:"fixture-token"}),/HTTP 401/);
  assert.equal(urls.length,1);
});

test("invalid successful JSON and empty hourly data fail instead of becoming an all-clear",async t=>{
  mock(t,async()=>response({forecast:[]}));
  await assert.rejects(p.fetchForeca(location,"fixture-token"),/invalid data/);
  assert.throws(()=>p.normalizeForecaWeather(null,{forecast:[{time:"bad"}]}),/invalid data/);
  assert.throws(()=>p.normalizeOpenWeather({hourly:{time:[]}}),/invalid data/);
});

test("timeout and external cancellation settle requests with safe, distinct errors",async t=>{
  mock(t,(url,options)=>new Promise((resolve,reject)=>{
    if(options.signal.aborted)reject(new DOMException("aborted","AbortError"));
    options.signal.addEventListener("abort",()=>reject(new DOMException("aborted","AbortError")),{once:true});
  }));
  await assert.rejects(p.requestJson("https://example.test",{},"Fixture",{timeoutMs:5}),error=>error.code==="timeout");
  const controller=new AbortController();controller.abort();
  await assert.rejects(p.requestJson("https://example.test",{},"Fixture",{signal:controller.signal}),error=>error.code==="aborted");
});

test("astronomy normalization sorts timestamps and preserves missing values as unknown",()=>{
  const data=p.normalizeAstronomy({TimeZone:"America/New_York",HourlyForecast:[{UTCForecastHour:time,Cloud:{ActualValue:null}},{UTCForecastHour:"bad",Cloud:{ActualValue:0}}]},["Cloud"]);
  assert.equal(data.HourlyForecast.length,1);
  assert.equal(data.HourlyForecast[0].Cloud.ActualValue,null);
  assert.equal(data.meta.partial,true);
  assert.equal(app.cloudScore(null),null);
  assert.equal(app.moonScore(null),null);
  assert.equal(app.weightedScore({cloud:100}),null);
});

test("different astronomy model runs never merge into a falsely complete forecast",()=>{
  const core={ModelTime:"one",HourlyForecast:[{UTCForecastHour:time,Cloud:{ActualValue:0}}]};
  const extra={ModelTime:"two",HourlyForecast:[{UTCForecastHour:time,Wind:{ActualValue:1}}]};
  const merged=p.mergeAstronomy(core,extra);
  assert.equal(merged.meta.modelMismatch,true);
  assert.equal(merged.HourlyForecast[0].Wind,undefined);
});

test("headline and best-window score obey the same hard cap",()=>{
  const row={UTCForecastHour:time,Cloud:{ActualValue:50},Transparency:{ActualValue:0},Seeing:{ActualValue:5},Wind:{ActualValue:0},Temperature:{ActualValue:293.15},DewPoint:{ActualValue:273.15}};
  const summary=app.summaryForNight([row],{IsAboveHorizon:false});
  assert.equal(summary.score,47);
  assert.equal(summary.score,app.overallForRow(row,{IsAboveHorizon:false}));
  assert.equal(app.verdictForScore(summary.score)[0],"NO-GO");
});

test("missing hazard inputs and partial night coverage never yield all-clear",()=>{
  const rows=[{UTCForecastHour:time},{UTCForecastHour:"2026-09-20T05:00:00Z"}];
  const unknown=app.weatherSummaryForRows(rows,{hourly:{time:[time]}});
  assert.equal(unknown.severity,"unknown");
  assert.equal(unknown.watch,"Hazard data incomplete");
  assert.equal(app.weatherSummaryForRows(rows,weather).complete,false);
  assert.equal(app.operationalVerdict(90,unknown)[0],"CHECK WEATHER");
  assert.equal(app.operationalVerdict(90,{severity:"danger",watch:"Storm risk"})[0],"NO-GO");
  assert.equal(app.operationalVerdict(90,{severity:"clear"},true)[0],"STALE");
});

test("new settings preserve Home/JGAP and the selected night without injecting Bellaire",()=>{
  const data=app.normalizeSettings({version:4,apiKey:"fixture",forecaToken:"fixture",weatherSource:"foreca",activeLocationId:"home",selectedNightKey:"2026-09-20",locations:[{id:"home",name:"Home",lat:40,lon:-83},{id:"park",name:"JGAP",lat:39,lon:-82}]});
  assert.deepEqual(data.locations.map(x=>x.name),["Home","JGAP"]);
  assert.equal(data.activeLocationId,"home");
  assert.equal(data.forecaToken,"fixture");
  assert.equal(data.selectedNightKey,"2026-09-20");
  assert.equal(app.normalizeLocation({lat:"",lon:""}),null);
});

test("invalid saved time zones are ignored and windows stop at the last dark sample",()=>{
  assert.equal(app.normalizeLocation({lat:40,lon:-83,timeZone:"invalid/zone"}).timeZone,null);
  const rows=[{UTCForecastHour:time},{UTCForecastHour:"2026-09-20T05:00:00Z"}];
  assert.equal(app.windowEnd(rows,{end:1}),"2026-09-20T05:00:00Z");
});
