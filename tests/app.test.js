"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const app=require("../app.js");

function forecastRow(time,overrides={}){
  return{
    UTCForecastHour:time,
    Cloud:{ActualValue:20},
    Transparency:{ActualValue:8},
    Seeing:{ActualValue:4},
    Wind:{ActualValue:3},
    Temperature:{ActualValue:280},
    DewPoint:{ActualValue:275},
    ...overrides
  };
}

test("v1.8 scoring baseline remains unchanged",()=>{
  const moon={IsAboveHorizon:true,IlluminationPercent:50};
  const components=app.hourlyScoresForRow(forecastRow("2026-08-17T01:00:00Z"),moon);
  assert.deepEqual(components,{
    cloud:80,
    transparency:73,
    seeing:82,
    wind:85,
    dew:86,
    moon:67
  });
  assert.equal(app.overallForRow(forecastRow("2026-08-17T01:00:00Z"),moon),78.79999999999998);
});

test("v1.8 hard cloud limiter remains unchanged",()=>{
  const row=forecastRow("2026-08-17T01:00:00Z",{Cloud:{ActualValue:80}});
  assert.equal(app.overallForRow(row,{IsAboveHorizon:false}),25);
});

test("settings migration preserves locations and defaults the target type",()=>{
  const settings=app.normalizeSettings({
    apiKey:"secret",
    activeLocationId:"home",
    locations:[{id:"home",name:"Home",lat:44.9,lon:-85.2,bortle:4,alertThreshold:"green"}]
  });
  assert.equal(settings.version,5);
  assert.equal(settings.targetType,"emission");
  assert.equal(settings.weatherSource,"foreca-fallback");
  assert.equal(settings.forecaToken,"");
  assert.equal(settings.locations[0].bortle,4);
  assert.equal(settings.locations[0].alertThreshold,"green");
});

test("weather source selection validates known choices",()=>{
  assert.equal(app.normalizeWeatherSource("foreca"),"foreca");
  assert.equal(app.normalizeWeatherSource("open-meteo"),"open-meteo");
  assert.equal(app.normalizeWeatherSource("unknown"),"foreca-fallback");
});

test("weather providers receive coordinates rounded to two decimals",()=>{
  assert.deepEqual(app.roundedWeatherLocation({lat:44.98028,lon:-85.21117}),{lat:44.98,lon:-85.21});
});

test("Foreca data normalizes into the provider-independent weather shape",()=>{
  const normalized=app.normalizeForecaWeather(
    {current:{temperature:61,feelsLikeTemp:59,relHumidity:72,visibility:16000,windGust:11,symbolPhrase:"partly cloudy"}},
    {forecast:[{time:"2026-08-17T01:00:00Z",temperature:54,relHumidity:80,precipProb:5,precipAccum:0,visibility:12000,windGust:9,thunderProb:0,symbolPhrase:"clear"}]},
    {forecast:[{time:"2026-08-17T01:00:00Z",AQI:112,AQI_PM2P5:112,PM2P5:39}]}
  );
  assert.equal(normalized.meta.provider,"foreca");
  assert.equal(normalized.current.temperature_2m,61);
  assert.equal(normalized.hourly.visibility[0],12000);
  assert.equal(normalized.hourly.us_aqi[0],112);
});

test("air quality can produce a supporting smoke warning",()=>{
  const rows=[forecastRow("2026-08-17T01:00:00Z")];
  const weather={
    meta:{provider:"foreca"},
    current:{temperature_2m:65},
    hourly_units:{visibility:"m"},
    hourly:{
      time:["2026-08-17T01:00:00Z"],temperature_2m:[60],precipitation_probability:[0],precipitation:[0],
      weather_code:[0],weather_phrase:["clear"],thunder_probability:[0],visibility:[16000],wind_gusts_10m:[5],us_aqi:[112]
    }
  };
  const summary=app.weatherSummaryForRows(rows,weather);
  assert.equal(summary.watch,"Smoke / air quality");
  assert.equal(summary.severity,"watch");
  assert.equal(summary.provider,"foreca");
});

test("Foreca-preferred mode falls back to Open-Meteo when no token is configured",async()=>{
  const originalFetch=global.fetch;
  const requested=[];
  global.fetch=async input=>{
    const url=String(input);
    requested.push(url);
    const payload=url.includes("air-quality-api")
      ?{hourly:{time:["2026-08-17T01:00"],us_aqi:[20],us_aqi_pm2_5:[20],pm2_5:[4],aerosol_optical_depth:[0.05]}}
      :{current:{temperature_2m:60},hourly_units:{visibility:"m"},hourly:{time:["2026-08-17T01:00"],temperature_2m:[55],precipitation_probability:[0],precipitation:[0],weather_code:[0],visibility:[16000],wind_gusts_10m:[5]}};
    return new Response(JSON.stringify(payload),{status:200,headers:{"Content-Type":"application/json"}});
  };
  try{
    const result=await app.fetchSupplementalWeather(
      {lat:44.98028,lon:-85.21117},
      {weatherSource:"foreca-fallback",forecaToken:""}
    );
    assert.equal(result.meta.provider,"open-meteo");
    assert.match(result.meta.notice,/Using Open-Meteo backup/);
    assert.equal(requested.length,2);
    assert.ok(requested.every(url=>url.includes("latitude=44.98")&&url.includes("longitude=-85.21")));
  }finally{
    global.fetch=originalFetch;
  }
});

test("weather summary aligns UTC hourly data to the selected dark period",()=>{
  const rows=[
    forecastRow("2026-08-17T01:00:00Z"),
    forecastRow("2026-08-17T02:00:00Z"),
    forecastRow("2026-08-17T03:00:00Z")
  ];
  const weather={
    current:{temperature_2m:67,apparent_temperature:66},
    hourly_units:{visibility:"m"},
    hourly:{
      time:["2026-08-17T00:00","2026-08-17T01:00","2026-08-17T02:00","2026-08-17T03:00","2026-08-17T04:00"],
      temperature_2m:[60,55,51,48,47],
      precipitation_probability:[0,10,60,35,10],
      precipitation:[0,0,0.04,0.01,0],
      weather_code:[0,0,45,61,0],
      visibility:[16000,14000,4000,10000,16000],
      wind_gusts_10m:[5,10,22,15,7]
    }
  };
  const summary=app.weatherSummaryForRows(rows,weather);
  assert.equal(summary.currentTemperature,67);
  assert.equal(summary.low,48);
  assert.equal(summary.rain,60);
  assert.equal(summary.gust,22);
  assert.equal(summary.watch,"Fog / low visibility");
  assert.equal(summary.severity,"danger");
  assert.ok(summary.visibilityMiles>2&&summary.visibilityMiles<3);
});

test("weather visibility honors imperial feet from the live API shape",()=>{
  const rows=[forecastRow("2026-08-17T01:00:00Z")];
  const weather={
    current:{temperature_2m:65},
    hourly_units:{visibility:"ft"},
    hourly:{
      time:["2026-08-17T01:00"],
      temperature_2m:[60],
      precipitation_probability:[0],
      precipitation:[0],
      weather_code:[0],
      visibility:[5280],
      wind_gusts_10m:[5]
    }
  };
  assert.equal(app.weatherSummaryForRows(rows,weather).visibilityMiles,1);
});

test("filter guidance distinguishes emission from broadband targets",()=>{
  const moon={IsAboveHorizon:true,IlluminationPercent:70};
  assert.equal(app.filterRecommendation({targetType:"emission",bortle:6,moon,transparency:80,weather:null}).title,"L-Pro or unfiltered");
  assert.equal(app.filterRecommendation({targetType:"broadband",bortle:6,moon,transparency:80,weather:null}).title,"Unfiltered / L-Pro comparison");
});

test("preparation guidance promotes hazards, clothing, and dew control",()=>{
  const guidance=app.preparationGuidance({severity:"danger",watch:"Rain likely",low:38,gust:12},{dew:40});
  assert.deepEqual(guidance,["Rain likely","Cold-weather layers for 38°F","Dew control from setup"]);
});
