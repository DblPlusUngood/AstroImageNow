"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const p=require("../providers.js");
const app=require("../app.js");
const initial={...app.state};
const hour=3600000;
const start=Math.floor(Date.now()/hour)*hour;
const times=Array.from({length:168},(_,i)=>new Date(start+i*hour).toISOString());
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
function setup(t,mode={}){
  const nodes=new Map(),storage=new Map();
  const element=()=>({textContent:"",innerHTML:"",value:"",disabled:false,style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){}});
  Object.defineProperty(global,"document",{configurable:true,writable:true,value:{getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},createElement:element}});
  Object.defineProperty(global,"localStorage",{configurable:true,writable:true,value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  Object.assign(app.state,initial,{providerStatus:{},moons:[],settings:app.normalizeSettings({apiKey:"private-fixture-key",forecaToken:"private-fixture-token",weatherSource:"foreca",activeLocationId:"home",locations:[{id:"home",name:"Home",lat:40,lon:-83},{id:"jgap",name:"JGAP",lat:39.5,lon:-82.5}]})});
  t.mock.method(global,"fetch",async(url,options)=>{
    const body=options.body?JSON.parse(options.body):{};
    if(mode.offline)throw Error("network unavailable private-fixture-token");
    if(url.includes("GetForecastData")){
      if(mode.astronomyFail||mode.extraFail&&body.Variables.includes("Wind"))return json({},503);
      const value={Cloud:5,Seeing:5,Transparency:0,Wind:0,Temperature:290,DewPoint:275};
      return json({TimeZone:"America/New_York",ModelTime:times[0],HourlyForecast:times.slice(0,82).map(time=>({UTCForecastHour:time,...Object.fromEntries(body.Variables.map(key=>[key,{ActualValue:value[key]}]))}))});
    }
    if(url.includes("/Moon"))return mode.moonFail?json({},503):json({IsAboveHorizon:false,IlluminationPercent:20,Altitude:-20});
    if(mode.weatherFail)return json({},401);
    if(url.includes("air-quality"))return json({forecast:times.slice(0,84).map(time=>({time,AQI:20}))});
    if(url.includes("/current/"))return json({current:{time:times[0],temperature:60}});
    return json({forecast:times.map(time=>({time,temperature:55,dewPoint:40,cloudiness:5,windSpeed:4,precipProb:0,precipAccum:0,windGust:5,visibility:16000,thunderProb:0}))});
  });
  return {nodes,storage,mode};
}

test("independent refresh renders Foreca's week and scores all seven nights with a subtle estimate marker",async t=>{
  const {nodes,storage}=setup(t);
  await app.refresh();
  assert.equal(nodes.get("errorBox").textContent,"");
  assert.equal(app.state.weather.meta.provider,"foreca");
  assert.equal(app.availableNights().length,7);
  assert.match(nodes.get("nightOutlook").innerHTML,/≈\d+/);
  assert.equal((nodes.get("nightOutlook").innerHTML.match(/class="night-score"/g)||[]).length,7);
  assert.ok(!nodes.get("nightOutlook").innerHTML.includes(">—<"));
  assert.equal(nodes.get("statusBadge").textContent,"GO");
  assert.equal(nodes.get("refreshBtn").disabled,false);
  assert.ok(storage.has("astroImageNowLastGoodV1"));
  const diagnostics=JSON.stringify(app.diagnosticSummary());
  for(const value of["private-fixture-key","private-fixture-token","Home","JGAP",'"lat"','"lon"'])assert.ok(!diagnostics.includes(value));
});

test("failed astronomy still displays successful Foreca weather",async t=>{
  const {nodes}=setup(t,{astronomyFail:true});await app.refresh();
  assert.equal(app.state.forecast,null);
  assert.equal(app.state.weather.meta.provider,"foreca");
  assert.equal(nodes.get("weatherNow").textContent,"60°F");
  assert.equal(nodes.get("statusBadge").textContent,"GO");
  assert.match(nodes.get("scoreRing").textContent,/≈\d+/);
});

test("failed weather still displays astronomy but prevents a weather go-ahead",async t=>{
  const {nodes}=setup(t,{weatherFail:true});await app.refresh();
  assert.ok(app.state.forecast);
  assert.equal(app.state.weather,null);
  assert.equal(nodes.get("statusBadge").textContent,"CHECK WEATHER");
  assert.match(nodes.get("weatherNote").textContent,/HTTP 401/);
});

test("local Moon needs no API call and missing extra variables use marked weather estimates",async t=>{
  for(const mode of[{moonFail:true},{extraFail:true}]){
    const {nodes}=setup(t,mode);await app.refresh();
    assert.ok(app.state.forecast);assert.ok(app.state.weather);
    assert.equal(nodes.get("statusBadge").textContent,"GO");
    assert.match(nodes.get("scoreRing").textContent,mode.extraFail?/^≈\d+$/:/^\d+$/);
  }
});

test("offline refresh retains same-site data as stale and preserves selected date",async t=>{
  const {nodes,mode}=setup(t);await app.refresh();
  const selected=app.nightKey(app.availableNights()[1],"America/New_York");
  app.state.settings.selectedNightKey=selected;
  mode.offline=true;await app.refresh();
  assert.ok(app.state.forecast&&app.state.weather);
  assert.equal(app.state.forecastStale,true);
  assert.equal(app.state.weatherStale,true);
  assert.equal(nodes.get("statusBadge").textContent,"STALE");
  assert.equal(app.state.selectedNightIndex,1);
  assert.ok(!app.state.diagnostic.includes("private-fixture-token"));
});

test("switching sites offline retains only the new site's paired cache, marked stale",async t=>{
  const {nodes,mode}=setup(t);await app.refresh();
  const cached=app.siteStore().get(app.state.settings.locations[1],app.state.settings);
  app.state.settings.activeLocationId="jgap";mode.offline=true;await app.refresh();
  assert.equal(app.state.weather,cached.weather);assert.equal(app.state.forecast,cached.forecast);
  assert.equal(nodes.get("statusBadge").textContent,"STALE");
});

test("late results from an aborted refresh cannot overwrite the next location",async t=>{
  setup(t);
  let release;
  const held=new Promise(resolve=>{release=resolve});
  const fixtureWeather=p.normalizeForecaWeather(null,{forecast:times.map(time=>({time,temperature:55,dewPoint:40,cloudiness:5,windSpeed:4,precipProb:0,precipAccum:0,windGust:5,visibility:16000,thunderProb:0}))});
  let heldHome=false;
  t.mock.method(p,"supplemental",async location=>{
    if(location.lat===40&&!heldHome){heldHome=true;await held}
    return {...fixtureWeather,meta:{...fixtureWeather.meta,site:location.lat}};
  });
  const first=app.refresh();
  app.state.settings.activeLocationId="jgap";
  await app.refresh();release();await first;
  assert.equal(app.state.weather.meta.site,39.5);
  assert.equal(app.state.refreshId,2);
});

test("a dashboard left open beyond three hours becomes stale on render",async t=>{
  const {nodes}=setup(t);await app.refresh();
  const old=new Date(Date.now()-4*hour).toISOString();
  app.state.forecast.meta.fetchedAt=old;app.state.weather.meta.fetchedAt=old;
  app.render();
  assert.equal(nodes.get("statusBadge").textContent,"STALE");
});

test("fresh refresh keeps the selected calendar night",async t=>{
  setup(t);await app.refresh();
  const selected=app.nightKey(app.availableNights()[2],"America/New_York");
  app.state.settings.selectedNightKey=selected;await app.refresh();
  assert.equal(app.state.selectedNightIndex,2);
  assert.equal(app.nightKey(app.darkRows(),"America/New_York"),selected);
});

test("target planning keeps absent, stale, hazardous and incomplete weather explicit",async t=>{
  setup(t);await app.refresh();
  const nights=app.availableNights(),zone='America/New_York',date=app.nightKey(nights[0],zone);
  assert.match(app.targetPlanningWeather(nights,'2099-01-01',zone).message,/Geometry only/);
  assert.match(app.targetPlanningWeather(nights,date,zone).message,/Night forecast/);
  app.state.weather.hourly.precipitation_probability.fill(90);
  assert.equal(app.targetPlanningWeather(nights,date,zone).severity,'danger');
  assert.match(app.targetPlanningWeather(nights,date,zone).message,/Weather blocks setup/);
  app.state.weatherStale=true;
  assert.match(app.targetPlanningWeather(nights,date,zone).message,/stale/);
  app.state.weatherStale=false;app.state.weather=null;
  assert.match(app.targetPlanningWeather(nights,date,zone).message,/not fully assessed/);
});

test('one refresh fetches each fixed site once and extra saved sites are left alone',async t=>{
  setup(t);app.state.settings.locations.push({id:'other',name:'Other',lat:42,lon:-80});
  const original=JSON.stringify(app.state.settings);await app.refresh();
  const calls=global.fetch.mock.calls,astro=calls.filter(c=>String(c.arguments[0]).includes('/GetForecastData'));
  assert.equal(astro.length,4);assert.equal(astro.filter(c=>JSON.parse(c.arguments[1].body).Latitude===40).length,2);
  for(const endpoint of['/api/v1/current/','/api/v1/forecast/hourly/','/api/v1/air-quality/'])assert.equal(calls.filter(c=>String(c.arguments[0]).includes(endpoint)).length,2);
  assert.equal(JSON.stringify(app.state.settings),original);assert.equal(app.siteStore().get(app.state.settings.locations[2],app.state.settings),null);
});

test('changing to the freshly paired site reuses its cache without more requests',async t=>{
  setup(t);await app.refresh();const calls=global.fetch.mock.callCount();
  const jgap=app.siteStore().get(app.state.settings.locations[1],app.state.settings);
  assert.equal(app.selectLocation('jgap',true),true);assert.equal(global.fetch.mock.callCount(),calls);
  assert.equal(app.state.weather,jgap.weather);assert.equal(app.state.dataContext,app.contextFor());assert.equal(app.state.weatherStale,false);
  assert.equal(app.selectLocation('missing'),false);
});

test('an independent comparison-site weather failure preserves the active successful forecast',async t=>{
  setup(t);const original=p.supplemental;
  t.mock.method(p,'supplemental',async(site,...args)=>{if(site.id==='jgap')throw Error('comparison unavailable');return original(site,...args)});
  await app.refresh();assert.equal(app.state.weatherStale,false);assert.ok(app.state.weather);
  const away=app.siteStore().get(app.state.settings.locations[1],app.state.settings);assert.equal(away.weather,null);assert.equal(away.weatherStale,false);assert.ok(away.forecast);
});

test('repeated failed refreshes at changed coordinates never reuse a different context last-good snapshot',async t=>{
  const {mode}=setup(t);await app.refresh();const oldContext=app.state.lastGood.context;
  app.state.settings.locations[0].lat=41;mode.offline=true;
  for(let i=0;i<2;i++){await app.refresh();assert.equal(app.state.forecast,null);assert.equal(app.state.weather,null);assert.notEqual(app.state.dataContext,oldContext)}
});
