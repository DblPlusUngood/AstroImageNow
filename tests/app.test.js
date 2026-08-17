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
  assert.equal(settings.version,3);
  assert.equal(settings.targetType,"emission");
  assert.equal(settings.locations[0].bortle,4);
  assert.equal(settings.locations[0].alertThreshold,"green");
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
  assert.equal(app.filterRecommendation({targetType:"emission",bortle:6,moon,transparency:80,weather:null}).title,"Dual-band useful");
  assert.equal(app.filterRecommendation({targetType:"broadband",bortle:6,moon,transparency:80,weather:null}).title,"UV/IR cut or none");
});

test("preparation guidance promotes hazards, clothing, and dew control",()=>{
  const guidance=app.preparationGuidance({severity:"danger",watch:"Rain likely",low:38,gust:12},{dew:40});
  assert.deepEqual(guidance,["Rain likely","Cold-weather layers for 38°F","Dew control from setup"]);
});
