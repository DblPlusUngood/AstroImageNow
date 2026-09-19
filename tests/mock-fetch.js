"use strict";

(()=>{
  // Test data only; never use real credentials in this local fixture.
  if(navigator.serviceWorker)navigator.serviceWorker.register=()=>Promise.resolve({addEventListener(){},update:async()=>{}});
  const start=new Date();
  start.setUTCMinutes(0,0,0);
  start.setUTCHours(start.getUTCHours()-6);
  const hourIso=index=>new Date(start.getTime()+index*3600000).toISOString();
  const actual=value=>({ActualValue:value});
  const phase=index=>index%24;
  const cloud=index=>phase(index)>=2&&phase(index)<=6?12:phase(index)>=7&&phase(index)<=9?38:22;

  localStorage.setItem("astroImageNowSettings",JSON.stringify({
    version:5,
    apiKey:"visual-test-key",
    forecaToken:"visual-test-token",
    weatherSource:"foreca-fallback",
    targetType:"emission",
    activeLocationId:"home",
    locations:[
      {id:"home",name:"Home",lat:40,lon:-83,bortle:5,alertThreshold:"green"},
      {id:"jgap",name:"JGAP",lat:39.5,lon:-82.5,bortle:3,alertThreshold:"yellow"}
    ]
  }));

  const astroRows=Array.from({length:82},(_,index)=>({
    UTCForecastHour:hourIso(index),
    Cloud:actual(cloud(index)),
    Transparency:actual(phase(index)>=1&&phase(index)<=7?7:12),
    Seeing:actual(phase(index)%3===0?3:4),
    Temperature:actual(273.15+(58-index*.08-32)*5/9),
    DewPoint:actual(273.15+(49-index*.06-32)*5/9),
    Wind:actual(phase(index)>=4&&phase(index)<=8?2.2:3.4)
  }));

  const weatherTimes=Array.from({length:192},(_,index)=>hourIso(index).slice(0,16));
  const weather={
    current:{temperature_2m:61,apparent_temperature:60,relative_humidity_2m:72,weather_code:1,precipitation:0,visibility:63360,wind_gusts_10m:8},
    hourly_units:{visibility:"ft"},
    hourly:{
      time:weatherTimes,
      temperature_2m:weatherTimes.map((_,index)=>56-Math.sin(index/5)*7),
      relative_humidity_2m:weatherTimes.map((_,index)=>70+Math.round(Math.sin(index/4)*12)),
      precipitation_probability:weatherTimes.map((_,index)=>index>=27&&index<=30?45:8),
      precipitation:weatherTimes.map(()=>0),
      weather_code:weatherTimes.map((_,index)=>index===29?45:1),
      visibility:weatherTimes.map((_,index)=>index===29?24000:63360),
      wind_gusts_10m:weatherTimes.map((_,index)=>index>=50&&index<=54?21:9)
    }
  };

  const json=data=>Promise.resolve(new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}}));
  window.fetch=(input,options={})=>{
    const url=String(input);
    if(url.includes("weatherapi.foreca.net/api/v1/current/"))return json({current:{temperature:61,feelsLikeTemp:60,relHumidity:72,symbolPhrase:"partly cloudy",precipAccum:0,visibility:19312,windGust:8}});
    if(url.includes("weatherapi.foreca.net/api/v1/forecast/hourly/"))return json({forecast:weatherTimes.slice(0,168).map((time,index)=>({
      time:`${time}:00Z`,temperature:56-Math.sin(index/5)*7,relHumidity:70+Math.round(Math.sin(index/4)*12),
      precipProb:index>=27&&index<=30?45:8,precipAccum:0,symbolPhrase:index===29?"fog":"partly cloudy",
      visibility:index===29?7315:19312,windGust:index>=50&&index<=54?21:9,thunderProb:0
    }))});
    if(url.includes("weatherapi.foreca.net/api/v1/air-quality/"))return json({forecast:weatherTimes.slice(0,84).map(time=>({time:`${time}:00Z`,AQI:32,AQI_PM2P5:32,PM2P5:7}))});
    if(url.includes("air-quality-api.open-meteo.com"))return json({hourly:{time:weatherTimes.slice(0,120),us_aqi:weatherTimes.slice(0,120).map(()=>30),us_aqi_pm2_5:weatherTimes.slice(0,120).map(()=>30),pm2_5:weatherTimes.slice(0,120).map(()=>6),aerosol_optical_depth:weatherTimes.slice(0,120).map(()=>.08)}});
    if(url.includes("api.open-meteo.com"))return json(weather);
    if(url.includes("/GetForecastData")){
      const body=JSON.parse(options.body||"{}");
      const variables=new Set(body.Variables||[]);
      const rows=astroRows.map(row=>{
        const result={UTCForecastHour:row.UTCForecastHour};
        for(const variable of variables)result[variable]=row[variable];
        return result;
      });
      return json({TimeZone:"America/New_York",ModelTime:hourIso(0),APICreditsRemaining:742,HourlyForecast:rows});
    }
    if(url.includes("/Moon"))return json({IsAboveHorizon:true,IlluminationPercent:58,Altitude:34});
    if(url.includes("/RiseSet"))return json({});
    return Promise.reject(new Error(`Unexpected visual-test request: ${url}`));
  };
})();
