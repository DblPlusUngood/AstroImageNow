"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../site-forecasts.js'),Providers=require('../providers.js');
const sites=[{id:'home',lat:40,lon:-83},{id:'jgap',lat:39.5,lon:-82.5}],settings={weatherSource:'foreca',apiKey:'secret-astro',forecaToken:'secret-weather'},time=new Date().toISOString();
const weather=lat=>({hourly:{time:[time]},meta:{provider:'foreca',fetchedAt:time,testSite:lat}});
function storage(){const data=new Map();return{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),data}}
function mock(t){
  t.mock.method(Providers,'supplemental',async site=>weather(site.lat));
  t.mock.method(Providers,'astronomy',async(_,body)=>({TimeZone:'America/New_York',ModelTime:time,HourlyForecast:[{UTCForecastHour:time,...Object.fromEntries(body.Variables.map(key=>[key,{ActualValue:key==='Cloud'?body.Latitude:1}]))}]}));
}
test('site comparison fetches independent forecasts, preserves input settings and stores no credentials',async t=>{
  mock(t);const disk=storage(),store=S.create(disk),original=JSON.stringify(settings),updates=[];
  await store.refresh(sites,settings,()=>updates.push(true));
  for(const site of sites){const value=store.get(site,settings);assert.equal(value.weather.meta.testSite,site.lat);assert.equal(value.forecast.HourlyForecast[0].Cloud.ActualValue,site.lat);assert.equal(value.forecastStale,false)}
  assert.equal(JSON.stringify(settings),original);assert.equal(updates.length,4);
  const raw=[...disk.data.values()].join('');assert.ok(!raw.includes('secret'));assert.ok(!raw.includes('apiKey'));assert.ok(!raw.includes('forecaToken'));
  assert.equal(store.get({...sites[0],lat:41},settings),null);assert.equal(store.get(sites[0],{...settings,weatherSource:'open-meteo'}),null);
});
test('restored site forecasts remain stale until refreshed, and failed refresh preserves stale geometry context',async t=>{
  mock(t);const disk=storage(),store=S.create(disk);await store.refresh([sites[0]],settings);
  const restored=S.create(disk);assert.equal(restored.get(sites[0],settings).weatherStale,true);
  t.mock.method(Providers,'supplemental',async()=>{throw Error('private upstream detail')});
  t.mock.method(Providers,'astronomy',async()=>{throw Error('private upstream detail')});
  await restored.refresh([sites[0]],settings);const value=restored.get(sites[0],settings);
  assert.equal(value.weather.meta.testSite,40);assert.equal(value.weatherStale,true);assert.equal(value.forecastStale,true);
  assert.ok(![...disk.data.values()].join('').includes('private upstream detail'));
});
test('aborted comparison responses cannot replace a newer result',async t=>{
  mock(t);const store=S.create(storage());let release,started;const held=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>started=resolve);let call=0;
  t.mock.method(Providers,'supplemental',async()=>{if(++call===1){started();await held;return weather(999)}return weather(40)});
  const old=store.refresh([sites[0]],settings);await entered;await store.refresh([sites[0]],settings);release();await old;
  assert.equal(store.get(sites[0],settings).weather.meta.testSite,40);
});
test('comparison cancellation stops before another site request and leaves cached data stale',async t=>{
  mock(t);const store=S.create(storage());await store.refresh([sites[0]],settings);
  let release,started;const held=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>started=resolve);const called=[];
  t.mock.method(Providers,'supplemental',async site=>{called.push(site.id);started();await held;return weather(site.lat)});
  const pending=store.refresh(sites,settings);await entered;store.cancel();release();await pending;
  assert.deepEqual(called,['home']);assert.equal(store.get(sites[0],settings).weatherStale,true);assert.equal(store.get(sites[1],settings),null);
});
test('fixed comparison resolves saved generated IDs without altering profiles or guessing among duplicates',()=>{
  const home={id:'uuid-1',name:'Home (Clintonville, OH)',bortle:9,lat:40,lon:-83},jgap={id:'uuid-2',name:'John Glenn Astro Park',bortle:3,lat:39,lon:-82};
  const profiles=[{id:'other',name:'Other site'},jgap,home],before=JSON.stringify(profiles),pair=S.pair(profiles);
  assert.equal(pair.home,home);assert.equal(pair.jgap,jgap);assert.deepEqual(pair.sites,[home,jgap]);assert.equal(JSON.stringify(profiles),before);
  assert.deepEqual(S.pair([home]).missing,['JGAP']);assert.equal(S.pair([...profiles,{id:'uuid-3',name:'Home copy'}]).home,null);
});
