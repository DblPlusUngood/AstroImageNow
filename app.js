"use strict";

const Providers=typeof module!=="undefined"?require("./providers.js"):AstroProviders;
const API_BASE=Providers.ASTRO_BASE;
const APP_VERSION="1.10.0";
const SNAPSHOT_KEY="astroImageNowLastGoodV1";
const SETTINGS_KEY="astroImageNowSettings";
const LEGACY_SETTINGS_KEY="astroTonightSettings";
const COLORS={green:"#22c55e",lime:"#84cc16",yellow:"#eab308",orange:"#f97316",red:"#ef4444",blue:"#60a5fa"};
const ALERT_THRESHOLDS=[
  {id:"yellow",label:"Yellow",score:48,color:COLORS.yellow},
  {id:"lime",label:"Lime",score:65,color:COLORS.lime},
  {id:"green",label:"Green",score:80,color:COLORS.green}
];
const TARGET_TYPES=["emission","broadband","reflection","other"];
const WEATHER_SOURCES=["foreca-fallback","foreca","open-meteo"];
const INFO_CONTENT={
  cloud:{
    title:"Cloud cover",
    body:"The modeled percentage of sky covered by cloud. Lower is better. Thin cloud can still reduce contrast even when the percentage looks modest."
  },
  transparency:{
    title:"Transparency",
    body:"Transparency is atmospheric clarity: how much clean target light reaches the camera. Moisture, thin cirrus, smoke, dust, haze, and pollution can reduce contrast and brighten the background.",
    extra:"Transparency and seeing are independent. A sky can be clear but turbulent, or steady but hazy."
  },
  seeing:{
    title:"Seeing",
    body:"Seeing is atmospheric steadiness. Turbulent air bends starlight moment to moment, making stars and fine detail softer even when focus and guiding are good.",
    extra:"At your wide-field focal length, moderate seeing is usually less limiting than cloud or poor transparency."
  },
  wind:{
    title:"Wind",
    body:"Astrospheric wind is used in the imaging score because sustained wind can disturb tracking and shake the rig. The weather strip separately watches forecast gusts, which can be higher."
  },
  bortle:{
    title:"Bortle class",
    body:"Bortle is a 1-to-9 description of a location's typical night-sky brightness, from very dark to heavily light polluted. It is useful site context, not a changing weather condition.",
    extra:"The value is always approximate and can vary locally with nearby lights, direction, season, snow, and development."
  },
  moon:{
    title:"Moon context",
    body:"A bright Moon above the horizon raises the sky background and can reduce broadband contrast. Its effect depends on illumination, altitude, target separation, and filter choice."
  },
  dew:{
    title:"Dew margin",
    body:"Dew margin is air temperature minus dew point. A small margin means surfaces can reach the dew point easily, so heaters and shields should be operating before moisture forms."
  },
  visibility:{
    title:"Visibility and weather watch",
    body:"General-weather visibility can reveal surface fog, haze, moisture, smoke, or aerosols. It supports the transparency forecast but does not replace it because upper-atmosphere problems may not reduce surface visibility.",
    extra:"This strip also watches precipitation, thunderstorms, fog codes, and wind gusts without changing the app's astronomy score."
  }
};
const $=id=>document.getElementById(id);
const state={
  settings:null,
  forecast:null,
  weather:null,
  weatherError:"",
  weatherNotice:"",
  moons:[],
  providerStatus:{},
  fetchedAt:null,
  forecastStale:false,
  weatherStale:false,
  refreshId:0,
  refreshController:null,
  dataContext:null,
  lastGood:null,
  swRegistration:null,
  storageNotice:"",
  selectedNightIndex:0,
  darknessThreshold:-18,
  diagnostic:"",
  editingLocationId:null
};

function createLocationId(){
  return`location-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}

function normalizeBortle(value){
  if(value===""||value===null||value===undefined)return null;
  const bortle=Math.round(Number(value));
  return bortle>=1&&bortle<=9?bortle:null;
}

function normalizeAlertThreshold(value){
  return ALERT_THRESHOLDS.some(threshold=>threshold.id===value)?value:"yellow";
}

function normalizeTargetType(value){
  return TARGET_TYPES.includes(value)?value:"emission";
}

function normalizeWeatherSource(value){
  return WEATHER_SOURCES.includes(value)?value:"foreca-fallback";
}

function normalizeLocation(location,idFallback=createLocationId()){
  if(!location)return null;
  const latitude=Providers.number(location.lat,-90,90);
  const longitude=Providers.number(location.lon,-180,180);
  if(latitude===null||longitude===null)return null;
  let timeZone=null;
  if(typeof location.timeZone==="string"){
    try{new Intl.DateTimeFormat("en",{timeZone:location.timeZone});timeZone=location.timeZone}catch{}
  }
  return{
    id:String(location.id||idFallback),
    name:String(location.name||location.locationName||"Observing location"),
    lat:latitude,
    lon:longitude,
    timeZone,
    bortle:normalizeBortle(location.bortle),
    alertThreshold:normalizeAlertThreshold(location.alertThreshold)
  };
}

function normalizeSettings(raw){
  if(!raw||typeof raw!=="object")return null;
  let locations=[];
  if(Array.isArray(raw.locations)){
    locations=raw.locations.map((location,index)=>normalizeLocation(location,`location-${index+1}`)).filter(Boolean);
  }else{
    const legacyLocation=normalizeLocation(raw,"location-home");
    if(legacyLocation)locations=[legacyLocation];
  }
  if(!locations.length)return null;
  const requestedActive=String(raw.activeLocationId||locations[0].id);
  const activeLocationId=locations.some(location=>location.id===requestedActive)?requestedActive:locations[0].id;
  return{
    version:5,
    apiKey:String(raw.apiKey||""),
    forecaToken:String(raw.forecaToken||""),
    weatherSource:normalizeWeatherSource(raw.weatherSource),
    targetType:normalizeTargetType(raw.targetType),
    activeLocationId,
    selectedNightKey:typeof raw.selectedNightKey==="string"?raw.selectedNightKey:null,
    locations
  };
}

function storedSettings(){
  try{
    const current=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");
    if(current)return normalizeSettings(current);
    const legacy=JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY)||"null");
    const migrated=normalizeSettings(legacy);
    if(migrated)localStorage.setItem(SETTINGS_KEY,JSON.stringify(migrated));
    return migrated;
  }catch{return null}
}

function saveSettings(settings){
  const normalized=normalizeSettings(settings);
  if(!normalized)throw new Error("At least one valid observing location is required.");
  state.settings=normalized;
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(normalized));
  return normalized;
}

function activeLocation(){
  const settings=state.settings;
  if(!settings)return null;
  if(Array.isArray(settings.locations)){
    return settings.locations.find(location=>location.id===settings.activeLocationId)||settings.locations[0]||null;
  }
  return normalizeLocation(settings,"location-home");
}

function alertThresholdFor(location=activeLocation()){
  return ALERT_THRESHOLDS.find(threshold=>threshold.id===location?.alertThreshold)||ALERT_THRESHOLDS[0];
}

function colorForScore(score){
  if(!Number.isFinite(score))return"#8b9bb0";
  if(score>=80)return COLORS.green;
  if(score>=65)return COLORS.lime;
  if(score>=48)return COLORS.yellow;
  if(score>=30)return COLORS.orange;
  return COLORS.red;
}

function verdictForScore(score){
  if(!Number.isFinite(score))return["UNKNOWN","Astronomy assessment incomplete"];
  if(score>=75)return["GO","Set up the telescope"];
  if(score>=48)return["MARGINAL","Conditional imaging night"];
  return["NO-GO","Skip the full setup"];
}

function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,value))}
function cloudScore(value){const n=Providers.number(value,0,100);return n===null?null:100-n}

function transparencyScore(value){
  value=Providers.number(value,0,100);
  if(value===null)return null;
  if(value<=5)return 100-value*2;
  if(value<=9)return 88-(value-5)*5;
  if(value<=13)return 68-(value-9)*5;
  if(value<=23)return 48-(value-13)*2;
  if(value<=27)return 25-(value-23)*4;
  return 5;
}

function seeingScore(value){
  value=Providers.number(value,0,5);
  return value===null?null:({0:5,1:25,2:45,3:62,4:82,5:100})[Math.round(value)];
}

function windToMph(value){const n=Providers.number(value,0,150);return n===null?null:n*2.236936}

function windScore(value){
  const mph=windToMph(value);
  if(mph===null)return null;
  if(mph<=4)return 100;
  if(mph<=8)return 85;
  if(mph<=12)return 65;
  if(mph<=17)return 43;
  if(mph<=23)return 22;
  return 5;
}

function kelvinToF(kelvin){const n=Providers.number(kelvin,100,400);return n===null?null:(n-273.15)*9/5+32}

function dewMarginF(temperature,dewPoint){
  const temperatureF=kelvinToF(temperature);
  const dewPointF=kelvinToF(dewPoint);
  return temperatureF===null||dewPointF===null?null:temperatureF-dewPointF;
}

function dewScore(temperature,dewPoint){
  const margin=dewMarginF(temperature,dewPoint);
  if(margin===null)return null;
  if(margin>=10)return 100;
  if(margin>=7)return 86;
  if(margin>=5)return 70;
  if(margin>=3)return 50;
  if(margin>=1.5)return 28;
  return 10;
}

function moonScore(moon){
  if(!moon||typeof moon.IsAboveHorizon!=="boolean")return null;
  if(!moon.IsAboveHorizon)return 100;
  const illumination=Providers.number(moon.IlluminationPercent,0,100);
  if(illumination===null)return null;
  if(illumination<=20)return 92;
  if(illumination<=40)return 80;
  if(illumination<=65)return 67;
  if(illumination<=85)return 55;
  return 45;
}

function weightedScore(scores){
  if(!["cloud","transparency","seeing","wind","dew","moon"].every(key=>Number.isFinite(scores[key])))return null;
  return clamp(
    scores.cloud*.36+
    scores.transparency*.27+
    scores.seeing*.12+
    scores.wind*.10+
    scores.dew*.10+
    scores.moon*.05
  );
}

function fmtTime(iso,timeZone){
  if(!iso)return"—";
  return new Intl.DateTimeFormat("en-US",{timeZone,hour:"numeric",minute:"2-digit"}).format(new Date(iso));
}

function fmtHour(iso,timeZone){
  return new Intl.DateTimeFormat("en-US",{timeZone,hour:"numeric"})
    .format(new Date(iso)).replace(" ","").toLowerCase();
}

function fmtUpdated(iso=state.fetchedAt){
  return iso?new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date(iso)):"not fetched";
}

function fmtNightDate(iso,timeZone){
  return new Intl.DateTimeFormat("en-US",{
    timeZone,
    weekday:"short",
    month:"short",
    day:"numeric"
  }).format(new Date(iso));
}

function api(endpoint,body,context={}){
  return Providers.astronomy(endpoint,body,state.settings?.apiKey,context);
}

function roundedWeatherLocation(location){return Providers.roundedLocation(location)}
function normalizeForecaWeather(current,hourly,air){return Providers.normalizeForecaWeather(current,hourly,air)}
async function fetchSupplementalWeather(location,settings=state.settings,context={}){
  return Providers.supplemental(location,settings,context);
}

function weatherTimeMs(value){
  if(!value)return NaN;
  const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:`${value}Z`;
  return Date.parse(normalized);
}

function finiteValues(values){
  return values.filter(value=>value!==null&&value!==undefined&&value!=="").map(Number).filter(Number.isFinite);
}

function optionalNumber(value){
  return value===null||value===undefined||value===""?NaN:Number(value);
}

function visibilityToMiles(value,unit="m"){
  if(value===null||value===undefined||value==="")return null;
  const numeric=Number(value);
  if(!Number.isFinite(numeric))return null;
  const normalized=String(unit).toLowerCase();
  if(normalized==="ft"||normalized.includes("feet"))return numeric/5280;
  if(normalized==="km")return numeric/1.609344;
  if(normalized==="mi")return numeric;
  return numeric/1609.344;
}

function weatherSummaryForRows(rows,weather=state.weather){
  if(!weather||!Array.isArray(weather.hourly?.time)||!rows?.length)return null;
  const start=Date.parse(rows[0].UTCForecastHour)-31*60*1000;
  const end=Date.parse(rows[rows.length-1].UTCForecastHour)+31*60*1000;
  const visibilityUnit=weather.hourly_units?.visibility||"m";
  const entries=weather.hourly.time.map((time,index)=>{
    const visibility=weather.hourly.visibility?.[index];
    return{
      time,
      timeMs:weatherTimeMs(time),
      temperature:optionalNumber(weather.hourly.temperature_2m?.[index]),
      rainProbability:optionalNumber(weather.hourly.precipitation_probability?.[index]),
      precipitation:optionalNumber(weather.hourly.precipitation?.[index]),
      code:optionalNumber(weather.hourly.weather_code?.[index]),
      phrase:String(weather.hourly.weather_phrase?.[index]||""),
      thunderProbability:optionalNumber(weather.hourly.thunder_probability?.[index]),
      visibility:optionalNumber(visibility),
      visibilityMiles:visibilityToMiles(visibility,visibilityUnit),
      gust:optionalNumber(weather.hourly.wind_gusts_10m?.[index]),
      aqi:optionalNumber(weather.hourly.us_aqi?.[index]),
      aqiPm25:optionalNumber(weather.hourly.us_aqi_pm2_5?.[index]),
      pm25:optionalNumber(weather.hourly.pm2_5?.[index]),
      aerosolOpticalDepth:optionalNumber(weather.hourly.aerosol_optical_depth?.[index])
    };
  }).filter(entry=>entry.timeMs>=start&&entry.timeMs<=end);
  if(!entries.length)return null;

  const temperatures=finiteValues(entries.map(entry=>entry.temperature));
  const rainProbabilities=finiteValues(entries.map(entry=>entry.rainProbability));
  const precipitation=finiteValues(entries.map(entry=>entry.precipitation));
  const visibilityMilesValues=finiteValues(entries.map(entry=>entry.visibilityMiles));
  const gusts=finiteValues(entries.map(entry=>entry.gust));
  const aqiValues=finiteValues(entries.map(entry=>entry.aqi));
  const aqiPm25Values=finiteValues(entries.map(entry=>entry.aqiPm25));
  const pm25Values=finiteValues(entries.map(entry=>entry.pm25));
  const aerosolValues=finiteValues(entries.map(entry=>entry.aerosolOpticalDepth));
  const low=temperatures.length?Math.min(...temperatures):null;
  const rain=rainProbabilities.length?Math.max(...rainProbabilities):null;
  const rainAmount=precipitation.length?precipitation.reduce((sum,value)=>sum+value,0):null;
  const visibilityMiles=visibilityMilesValues.length?Math.min(...visibilityMilesValues):null;
  const gust=gusts.length?Math.max(...gusts):null;
  const aqi=aqiValues.length?Math.max(...aqiValues):null;
  const aqiPm25=aqiPm25Values.length?Math.max(...aqiPm25Values):null;
  const pm25=pm25Values.length?Math.max(...pm25Values):null;
  const aerosolOpticalDepth=aerosolValues.length?Math.max(...aerosolValues):null;
  const stormEntry=entries.find(entry=>entry.code>=95||entry.thunderProbability>=30||/thunder/i.test(entry.phrase));
  const fogEntry=entries.find(entry=>entry.code===45||entry.code===48||/fog|mist/i.test(entry.phrase));
  const rainEntry=entries.find(entry=>entry.rainProbability>=50||entry.precipitation>=0.03);
  const visibilityEntry=entries.find(entry=>entry.visibilityMiles!==null&&entry.visibilityMiles<6);
  const gustEntry=entries.find(entry=>entry.gust>=18);
  const airEntry=entries.find(entry=>entry.aqi>=101||entry.aqiPm25>=101||entry.aerosolOpticalDepth>=0.4);

  const hazardsComplete=entries.every(entry=>
    Number.isFinite(entry.rainProbability)&&Number.isFinite(entry.precipitation)&&Number.isFinite(entry.gust)&&Number.isFinite(entry.visibility)
    &&(Number.isFinite(entry.code)||Number.isFinite(entry.thunderProbability))
  );
  const expectedHours=Math.round((Date.parse(rows.at(-1).UTCForecastHour)-Date.parse(rows[0].UTCForecastHour))/3600000)+1;
  const complete=hazardsComplete&&entries.length>=expectedHours;
  let watch=complete?"No major hazard":"Hazard data incomplete";
  let watchTime=null;
  let severity=complete?"clear":"unknown";
  if(stormEntry){watch="Storm risk";watchTime=stormEntry.time;severity="danger"}
  else if(fogEntry||visibilityMiles!==null&&visibilityMiles<3){watch="Fog / low visibility";watchTime=(fogEntry||visibilityEntry)?.time||null;severity="danger"}
  else if(rain!==null&&rain>=50||rainAmount!==null&&rainAmount>=0.05){watch="Rain likely";watchTime=rainEntry?.time||null;severity="danger"}
  else if(gust!==null&&gust>=25){watch="Strong gusts";watchTime=gustEntry?.time||null;severity="danger"}
  else if(rain!==null&&rain>=25){watch="Rain possible";watchTime=rainEntry?.time||null;severity="watch"}
  else if(visibilityMiles!==null&&visibilityMiles<6){watch="Haze / fog possible";watchTime=visibilityEntry?.time||null;severity="watch"}
  else if(aqi!==null&&aqi>=101||aqiPm25!==null&&aqiPm25>=101||aerosolOpticalDepth!==null&&aerosolOpticalDepth>=0.4){watch="Smoke / air quality";watchTime=airEntry?.time||null;severity="watch"}
  else if(gust!==null&&gust>=18){watch="Gusty";watchTime=gustEntry?.time||null;severity="watch"}

  return{
    entries,
    currentTemperature:Number.isFinite(optionalNumber(weather.current?.temperature_2m))?Number(weather.current.temperature_2m):null,
    currentApparent:Number.isFinite(optionalNumber(weather.current?.apparent_temperature))?Number(weather.current.apparent_temperature):null,
    low,
    rain,
    rainAmount,
    visibilityMiles,
    gust,
    aqi,
    aqiPm25,
    pm25,
    aerosolOpticalDepth,
    provider:weather.meta?.provider||"unknown",
    complete,
    watch,
    watchTime,
    severity
  };
}

function filterRecommendation({targetType,bortle,moon,transparency,weather}){
  const target=normalizeTargetType(targetType);
  const illumination=Number(moon?.IlluminationPercent||0);
  const brightMoon=Boolean(moon?.IsAboveHorizon)&&illumination>=35;
  const brightSite=Number.isFinite(Number(bortle))&&Number(bortle)>=5;
  const reducedClarity=Number.isFinite(transparency)&&transparency<48
    ||weather?.visibilityMiles!==null&&weather?.visibilityMiles<6
    ||weather?.aqi!==null&&weather?.aqi>=101
    ||weather?.aerosolOpticalDepth!==null&&weather?.aerosolOpticalDepth>=0.4;

  if(target==="emission"){
    if(reducedClarity)return{title:"Dual-band optional",reason:"It can improve emission contrast, but haze or poor transparency still removes target signal."};
    if(brightMoon||brightSite)return{title:"Dual-band useful",reason:brightMoon?"An illuminated Moon is above the horizon during this night.":`Bortle ${bortle} sky glow favors narrow emission bands.`};
    return{title:"No filter required",reason:"Dark-site and Moon conditions do not demand a contrast filter for this emission target."};
  }
  if(target==="broadband")return{title:"UV/IR cut or none",reason:"Keep the broad spectrum for galaxies and clusters; a dual-band filter would discard useful signal and color."};
  if(target==="reflection")return{title:"UV/IR cut or none",reason:"Reflection nebulae and dust are broadband targets, so preserve their continuum light."};
  return{title:"Use the test plan",reason:"Choose the filter required by the equipment or comparison you intend to run."};
}

function preparationGuidance(weather,components){
  const guidance=[];
  if(weather?.severity==="danger")guidance.push(weather.watch);
  if(weather?.low!==null&&weather?.low<40)guidance.push(`Cold-weather layers for ${Math.round(weather.low)}°F`);
  else if(weather?.low!==null&&weather?.low<55)guidance.push(`Bring a layer for ${Math.round(weather.low)}°F`);
  if(Number.isFinite(components.dew)&&components.dew<65)guidance.push("Dew control from setup");
  if(!weather||weather.severity==="unknown")guidance.push("Check current weather before setup");
  if(weather?.severity==="watch"&&!guidance.includes(weather.watch))guidance.push(weather.watch);
  if(weather?.gust!==null&&weather?.gust>=18&&!guidance.some(item=>item.includes("gust")))guidance.push(`Plan for ${Math.round(weather.gust)} mph gusts`);
  if(!guidance.length)guidance.push("No unusual preparation beyond the standard setup");
  return guidance.slice(0,3);
}

function hourlyRows(){
  const byTime=new Map();
  for(const time of state.weather?.hourly?.time||[]){
    const ms=weatherTimeMs(time);
    if(Number.isFinite(ms))byTime.set(ms,{UTCForecastHour:new Date(ms).toISOString()});
  }
  for(const row of state.forecast?.HourlyForecast||[]){
    const ms=weatherTimeMs(row.UTCForecastHour);
    if(Number.isFinite(ms))byTime.set(ms,row);
  }
  return[...byTime].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}

function sunAltitudeDeg(iso,latitude,longitude){
  const date=new Date(iso);
  const radians=Math.PI/180;
  const degrees=180/Math.PI;
  const julianDate=date.getTime()/86400000+2440587.5;
  const n=julianDate-2451545;
  const meanLongitude=(280.460+0.9856474*n)%360;
  const meanAnomaly=(357.528+0.9856003*n)%360;
  const eclipticLongitude=(meanLongitude+1.915*Math.sin(meanAnomaly*radians)+0.020*Math.sin(2*meanAnomaly*radians)+360)%360;
  const obliquity=(23.439-0.0000004*n)*radians;
  const lambda=eclipticLongitude*radians;
  const declination=Math.asin(Math.sin(obliquity)*Math.sin(lambda));
  const rightAscension=Math.atan2(Math.cos(obliquity)*Math.sin(lambda),Math.cos(lambda))*degrees;
  const siderealTime=(280.46061837+360.98564736629*(julianDate-2451545.0))%360;
  let hourAngle=((siderealTime+longitude-rightAscension+540)%360)-180;
  hourAngle*=radians;
  const phi=latitude*radians;
  return Math.asin(
    Math.sin(phi)*Math.sin(declination)+
    Math.cos(phi)*Math.cos(declination)*Math.cos(hourAngle)
  )*degrees;
}

function groupedDarkRows(threshold){
  const rows=hourlyRows();
  const location=activeLocation();
  const latitude=Number(location?.lat);
  const longitude=Number(location?.lon);
  if(!rows.length||!Number.isFinite(latitude)||!Number.isFinite(longitude))return[];

  const groups=[];
  let current=[];
  for(const row of rows){
    const isDark=sunAltitudeDeg(row.UTCForecastHour,latitude,longitude)<=threshold;
    if(current.length&&Date.parse(row.UTCForecastHour)-Date.parse(current.at(-1).UTCForecastHour)>3600000){groups.push(current);current=[]}
    if(isDark){
      current.push(row);
    }else if(current.length){
      groups.push(current);
      current=[];
    }
  }
  if(current.length)groups.push(current);
  return groups;
}

function upcomingGroups(groups){
  if(!groups.length)return[];
  const now=Date.now();
  const currentIndex=groups.findIndex(group=>{
    const start=new Date(group[0].UTCForecastHour).getTime()-30*60*1000;
    const end=new Date(group[group.length-1].UTCForecastHour).getTime()+90*60*1000;
    return now>=start&&now<=end;
  });
  const futureIndex=groups.findIndex(group=>
    new Date(group[group.length-1].UTCForecastHour).getTime()>=now
  );
  if(currentIndex<0&&futureIndex<0)return[];
  const startIndex=currentIndex>=0?currentIndex:futureIndex;
  return groups.slice(startIndex,startIndex+7);
}

function availableNights(){
  const astronomical=upcomingGroups(groupedDarkRows(-18));
  if(astronomical.length){
    state.darknessThreshold=-18;
    return astronomical;
  }

  const nautical=upcomingGroups(groupedDarkRows(-12));
  if(nautical.length){
    state.darknessThreshold=-12;
    return nautical;
  }

  const rows=hourlyRows();
  state.darknessThreshold=null;
  return[];
}

function darkRows(){
  const nights=availableNights();
  if(!nights.length)return[];
  state.selectedNightIndex=clamp(state.selectedNightIndex,0,nights.length-1);
  return nights[state.selectedNightIndex];
}

function moonForNight(index=state.selectedNightIndex){
  return state.moons[index]||null;
}

function rowValue(row,name){return row?.[name]?.ActualValue}
function seriesValue(name,index){return rowValue(darkRows()[index],name)}
function forecastTime(index){return darkRows()[index]?.UTCForecastHour}
function timelineLength(){return darkRows().length}

function hourlyScoresForRow(row,moon){
  return{
    cloud:cloudScore(rowValue(row,"Cloud")),
    transparency:transparencyScore(rowValue(row,"Transparency")),
    seeing:seeingScore(rowValue(row,"Seeing")),
    wind:windScore(rowValue(row,"Wind")),
    dew:dewScore(rowValue(row,"Temperature"),rowValue(row,"DewPoint")),
    moon:moonScore(moon)
  };
}

function overallForRow(row,moon){
  const scores=hourlyScoresForRow(row,moon);
  let overall=weightedScore(scores);
  if(overall===null)return null;
  const cloud=Number(rowValue(row,"Cloud"));
  const wind=windToMph(rowValue(row,"Wind"));
  const transparency=rowValue(row,"Transparency");
  const dewMargin=dewMarginF(rowValue(row,"Temperature"),rowValue(row,"DewPoint"));
  if(Number.isFinite(cloud)){
    if(cloud>=75)overall=Math.min(overall,25);
    else if(cloud>=50)overall=Math.min(overall,47);
  }
  if(wind!==null){
    if(wind>=22)overall=Math.min(overall,25);
    else if(wind>=16)overall=Math.min(overall,47);
  }
  if(transparency!==undefined&&transparency!==null&&Number(transparency)>23)overall=Math.min(overall,47);
  if(dewMargin!==null&&dewMargin<1.5)overall=Math.min(overall,47);
  return clamp(overall);
}

function hourlyScores(index){
  return hourlyScoresForRow(darkRows()[index],moonForNight());
}

function overallAt(index){
  return overallForRow(darkRows()[index],moonForNight());
}

function findBestWindowForRows(rows,moon){
  const good=rows.map(row=>{const score=overallForRow(row,moon);return Number.isFinite(score)&&score>=65});
  let best={start:-1,end:-1,len:0};
  let current=-1;
  for(let index=0;index<=rows.length;index++){
    if(index<rows.length&&good[index]&&current<0)current=index;
    if((index===rows.length||!good[index])&&current>=0){
      if(index-current>best.len)best={start:current,end:index-1,len:index-current};
      current=-1;
    }
  }

  if(best.start<0){
    let bestIndex=0;
    let bestScore=-1;
    for(let index=0;index<rows.length;index++){
      const score=overallForRow(rows[index],moon);
      if(Number.isFinite(score)&&score>bestScore){
        bestScore=score;
        bestIndex=index;
      }
    }
    return{start:bestIndex,end:bestIndex,len:rows.length?1:0,score:bestScore>=0?bestScore:null};
  }

  let sum=0;
  for(let index=best.start;index<=best.end;index++)sum+=overallForRow(rows[index],moon);
  best.score=sum/best.len;
  return best;
}

function findBestWindow(){
  return findBestWindowForRows(darkRows(),moonForNight());
}

function summaryForNight(rows,moon){
  const best=findBestWindowForRows(rows,moon);
  const center=Math.round((best.start+best.end)/2);
  const components=hourlyScoresForRow(rows[center],moon);
  const score=best.score;
  return{best,center,components,score};
}

function conditionText(label,score){
  if(!Number.isFinite(score))return"Unavailable";
  if(score>=80)return`${label} · Excellent`;
  if(score>=65)return`${label} · Good`;
  if(score>=48)return`${label} · Marginal`;
  if(score>=30)return`${label} · Poor`;
  return`${label} · Limiting`;
}

function scoreText(score){return Number.isFinite(score)?String(Math.round(score)):"—"}
function nightKey(rows,timeZone="Etc/UTC"){
  if(!rows.length)return null;
  const middle=Date.parse(rows[Math.floor(rows.length/2)].UTCForecastHour)-12*3600000;
  return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(middle));
}
function nightLabelFor(rows,index,timeZone){
  const evening=new Date(Date.parse(rows[Math.floor(rows.length/2)].UTCForecastHour)-12*3600000);
  return index===0?"Tonight":fmtNightDate(evening.toISOString(),timeZone);
}
// Hourly values are samples; never extend a window beyond its last dark sample.
function windowEnd(rows,best){return rows[best.end]?.UTCForecastHour||null}

function renderOutlook(nights,timeZone){
  const threshold=alertThresholdFor();
  $("outlookSub").textContent=`${nights.length} upcoming ${nights.length===1?"night":"nights"} available · ${threshold.label} alert threshold (${threshold.score}+)`;
  $("nightOutlook").innerHTML=nights.map((rows,index)=>{
    const summary=summaryForNight(rows,moonForNight(index));
    const hasAstronomy=rows.some(row=>row.Cloud||row.Transparency);
    const weather=weatherSummaryForRows(rows);
    const operational=operationalVerdict(summary.score,weather,state.forecastStale||state.weatherStale)[0];
    const verdict=operational==="UNKNOWN"?(hasAstronomy?"INCOMPLETE":"WEATHER ONLY"):operational;
    const status=verdict==="NO-GO"?COLORS.red:["STALE","CHECK WEATHER"].includes(verdict)?"#8b9bb0":colorForScore(summary.score);
    const label=nightLabelFor(rows,index,timeZone);
    const start=rows[summary.best.start]?.UTCForecastHour;
    const end=windowEnd(rows,summary.best);
    const windowText=!Number.isFinite(summary.score)?weather?.watch||"Astronomy unavailable":summary.best.len>1
      ?`${summary.best.len-1} hr · ${fmtTime(start,timeZone)}–${fmtTime(end,timeZone)}`
      :`Best hour · ${fmtTime(start,timeZone)}`;
    const horizon=index<2?"Near term":index<4?"Planning":"Watch";
    return`<button class="night-option" type="button" data-night-index="${index}" aria-pressed="${index===state.selectedNightIndex}" style="--night-status:${status}"><span class="night-date">${label} · ${horizon}</span><span class="night-score">${scoreText(summary.score)}</span><span class="night-verdict">${verdict}</span><span class="night-window">${windowText}</span></button>`;
  }).join("");
}

function renderQuickLocationSelect(){
  const select=$("quickLocationSelect");
  const locations=state.settings?.locations||[];
  select.replaceChildren();
  for(const location of locations){
    const option=document.createElement("option");
    option.value=location.id;
    option.textContent=location.name;
    select.append(option);
  }
  select.value=state.settings?.activeLocationId||"";
  select.classList.toggle("hidden",locations.length<2);
}

function renderWeatherAndPlan(rows,timeZone,components,moon){
  const weather=weatherSummaryForRows(rows);
  const targetType=normalizeTargetType(state.settings?.targetType);
  const location=activeLocation();
  $("targetSelect").value=targetType;

  if(weather){
    $("weatherNow").textContent=weather.currentTemperature===null?"—":`${Math.round(weather.currentTemperature)}°F`;
    $("weatherLow").textContent=weather.low===null?"—":`${Math.round(weather.low)}°F`;
    $("weatherRain").textContent=weather.rain===null?"—":`${Math.round(weather.rain)}%`;
    const watchTime=weather.watchTime?fmtTime(new Date(weatherTimeMs(weather.watchTime)).toISOString(),timeZone):"";
    $("weatherWatch").textContent=`${weather.watch}${watchTime?` · ${watchTime}`:""}`;
    const watchColor=state.weatherStale||weather.severity==="unknown"?"#8b9bb0":weather.severity==="danger"?COLORS.red:weather.severity==="watch"?COLORS.yellow:COLORS.green;
    $("weatherWatch").style.color=watchColor;
    $("weatherStrip").style.borderLeft=`4px solid ${watchColor}`;

    const diagnostic=[];
    if(weather.visibilityMiles!==null)diagnostic.push(`Visibility ${weather.visibilityMiles.toFixed(weather.visibilityMiles<10?1:0)} mi`);
    if(weather.gust!==null)diagnostic.push(`Gusts to ${Math.round(weather.gust)} mph`);
    if(weather.aqi!==null)diagnostic.push(`Air quality index ${Math.round(weather.aqi)}`);
    if(Number.isFinite(components.transparency)&&components.transparency<48&&weather.visibilityMiles!==null){
      diagnostic.push(weather.visibilityMiles<6
        ?"Reduced surface visibility may be contributing to poor transparency"
        :"Surface visibility looks normal; elevated haze, moisture, or the astronomy model may explain poor transparency");
    }
    const note=$("weatherNote");
    const source=state.weather?.meta||{label:"Supplemental weather source",url:"#"};
    const prefix=[state.weatherStale?"STALE — last saved weather; refresh failed":null,`Retrieved ${fmtUpdated(source.fetchedAt)}`,state.weatherNotice,state.weatherError,...diagnostic].filter(Boolean).join(" · ");
    note.replaceChildren();
    if(prefix)note.append(`${prefix} · `);
    const link=document.createElement("a");
    link.href=source.url;
    link.target="_blank";
    link.rel="noopener";
    link.textContent=source.label;
    note.append(link);
    if(source.provider==="open-meteo"&&source.hasAirQuality)note.append(" · Air-quality data incorporates CAMS");
  }else{
    $("weatherNow").textContent="—";
    $("weatherLow").textContent="—";
    $("weatherRain").textContent="—";
    $("weatherWatch").textContent="Unavailable";
    $("weatherWatch").style.color="var(--muted)";
    $("weatherStrip").style.borderLeft="1px solid var(--line)";
    $("weatherNote").textContent=state.weatherError||"No weather forecast overlaps this selected night.";
  }

  const filter=filterRecommendation({
    targetType,
    bortle:location?.bortle,
    moon,
    transparency:components.transparency,
    weather
  });
  $("planCard").style.borderLeft=`4px solid ${COLORS.blue||"#60a5fa"}`;
  $("filterValue").textContent=filter.title;
  $("filterReason").textContent=filter.reason;
  $("prepareLine").textContent=`Prepare: ${preparationGuidance(weather,components).join(" · ")}`;
}

function operationalVerdict(score,weather,stale=false){
  if(stale)return["STALE","Refresh conditions before setup"];
  if(weather?.severity==="danger")return["NO-GO",weather.watch];
  if(!Number.isFinite(score))return["UNKNOWN","Astronomy assessment incomplete"];
  if(!weather||weather.complete===false||weather.severity==="unknown")return["CHECK WEATHER","Weather assessment incomplete"];
  return verdictForScore(score);
}

function render(){
  const expired=time=>Number.isFinite(Date.parse(time))&&Date.now()-Date.parse(time)>3*3600000;
  if(expired(state.forecast?.meta?.fetchedAt))state.forecastStale=true;
  if(expired(state.weather?.meta?.fetchedAt))state.weatherStale=true;
  const forecast=state.forecast||{};
  const location=activeLocation();
  if(!location)return;
  const timeZone=forecast.TimeZone||location.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nights=availableNights();
  $("headerSub").textContent=`${location.name} · Forecast retrieved ${fmtUpdated()}`;
  renderQuickLocationSelect();
  renderDiagnostics();
  const failed=Object.values(state.providerStatus).filter(p=>p.status==="failed"&&!p.id.startsWith("foreca")&&!p.id.includes("air"));
  $("dataNotice").textContent=[state.forecastStale?"Astronomy: saved forecast, not refreshed.":null,state.weatherStale?"Weather: saved forecast, not refreshed.":null,...failed.map(p=>p.error.message),state.storageNotice].filter(Boolean).join(" ");
  $("dataNotice").classList.toggle("hidden",!$("dataNotice").textContent);
  if(!nights.length){
    $("statusBadge").textContent="UNKNOWN";$("statusTitle").textContent="No usable night forecast";
    $("statusCopy").textContent=hourlyRows().length?"No astronomical or nautical darkness is available in this forecast. Weather data remains in diagnostics.":"Waiting for provider data. If a request fails, its status appears in diagnostics.";
    for(const id of["scoreRing","bestWindow","bestWindowTime","nightChip","moonValue","moonStatus","moonDetail","dewValue","dewStatus","dewDetail","filterValue","filterReason","prepareLine","weatherNow","weatherLow","weatherRain","weatherWatch"])$(id).textContent="—";
    for(const id of["metricGrid","nightOutlook","timeline","scoreDetails"])$(id).replaceChildren();
    for(const id of["hero","statusBadge","scoreRing"])$(id).style.setProperty("--status","#8b9bb0");
    $("locationLabel").textContent=location.name;
    $("bortleRef").classList.add("hidden");
    $("outlookSub").textContent="No upcoming dark window available.";
    $("weatherNote").textContent=state.weatherError||"Weather forecast not yet available for a dark window.";
    $("footer").textContent=`AstroImageNow ${APP_VERSION}`;
    return;
  }
  const selected=nights.findIndex(rows=>nightKey(rows,timeZone)===state.settings.selectedNightKey);
  if(selected>=0)state.selectedNightIndex=selected;
  state.selectedNightIndex=clamp(state.selectedNightIndex,0,nights.length-1);

  const rows=darkRows();
  const moon=moonForNight();
  const summary=summaryForNight(rows,moon);
  const best=summary.best;
  const center=summary.center;
  const components=summary.components;
  const overall=summary.score;
  const weather=weatherSummaryForRows(rows);
  const [verdict,title]=operationalVerdict(overall,weather,state.forecastStale||state.weatherStale);
  const status=verdict==="NO-GO"?COLORS.red:verdict==="STALE"||verdict==="CHECK WEATHER"?"#8b9bb0":colorForScore(overall);
  const nightLabel=nightLabelFor(rows,state.selectedNightIndex,timeZone);
  const darknessLabel=state.darknessThreshold===-18?"Astronomical darkness":state.darknessThreshold===-12?"Nautical-darkness fallback":"Available forecast hours";

  $("hero").style.setProperty("--status",status);
  $("statusBadge").style.setProperty("--status",status);
  $("scoreRing").style.setProperty("--status",status);
  $("statusBadge").textContent=verdict;
  $("statusTitle").textContent=title;
  $("scoreRing").textContent=scoreText(overall);
  $("locationLabel").textContent=`${location.name} · ${nightLabel}`;
  $("bortleRef").textContent=location.bortle?`Bortle ${location.bortle}`:"";
  $("bortleRef").classList.toggle("hidden",!location.bortle);
  $("nightChip").textContent=`${darknessLabel}: ${fmtTime(rows[0].UTCForecastHour,timeZone)} → ${fmtTime(rows[rows.length-1].UTCForecastHour,timeZone)}`;

  const reasons=[];
  const limits=[];
  if(components.cloud>=80)reasons.push("low cloud cover");
  if(components.transparency>=80)reasons.push("strong transparency");
  if(components.seeing>=80)reasons.push("good seeing");
  if(components.wind>=80)reasons.push("light wind");
  for(const[key,label]of[["cloud","cloud cover"],["transparency","poor transparency"],["wind","wind"],["dew","dew"],["seeing","seeing"]])if(Number.isFinite(components[key])&&components[key]<48)limits.push(label);
  if(!reasons.length&&!limits.length)reasons.push("mixed but workable conditions");

  $("statusCopy").textContent=verdict==="GO"
    ?`Conditions are favorable: ${reasons.join(", ")}.${limits.length?" Main caution: "+limits.join(", ")+".":""} The green band below is your best setup target.`
    :verdict==="MARGINAL"
      ?`Conditions are mixed.${limits.length?" Main limitation: "+limits.join(", ")+".":""} A shorter or lower-risk session may still be worthwhile.`
      :`Conditions are currently poor enough that a full imaging setup is unlikely to pay off.${limits.length?" Main limitation: "+limits.join(", ")+".":""}`;
  if(verdict==="UNKNOWN")$("statusCopy").textContent="Available weather and individual astronomy metrics are shown below. Missing astronomy or Moon data prevents a complete imaging score.";
  if(verdict==="STALE")$("statusCopy").textContent="These are previously saved conditions. Do not use them as a current go-ahead until refreshed.";
  if(verdict==="CHECK WEATHER")$("statusCopy").textContent="The astronomy score is available, but weather hazards could not be fully assessed. Check current conditions before setup.";
  if(weather?.severity==="danger"&&!state.weatherStale)$("statusCopy").textContent=`${weather.watch} is forecast during this night. The ring shows the astronomy score; the operational verdict accounts for this weather hazard.`;

  const startIso=rows[best.start]?.UTCForecastHour;
  const endIso=windowEnd(rows,best);
  $("bestWindow").textContent=!Number.isFinite(overall)?"Not assessed":best.len>1?`${best.len-1} hr imaging window`:"Best dark hour";
  $("bestWindowTime").textContent=!Number.isFinite(overall)?"Astronomy detail unavailable":best.len>1
    ?`${fmtTime(startIso,timeZone)} → ${fmtTime(endIso,timeZone)}`
    :fmtTime(startIso,timeZone);
  $("windowMarker").style.left=`${best.score??0}%`;
  $("windowMarker").classList.toggle("hidden",!Number.isFinite(best.score));

  const cloudValue=seriesValue("Cloud",center);
  const transparencyValue=seriesValue("Transparency",center);
  const seeingValue=seriesValue("Seeing",center);
  const windValue=windToMph(seriesValue("Wind",center));
  const metricData=[
    ["Cloud",cloudValue==null?"—":`${Math.round(cloudValue)}%`,components.cloud,"cloud"],
    ["Transparency",transparencyValue==null?"—":`${Number(transparencyValue).toFixed(0)}`,components.transparency,"transparency"],
    ["Seeing",seeingValue==null?"—":`${Number(seeingValue).toFixed(0)} / 5`,components.seeing,"seeing"],
    ["Wind",windValue==null?"—":`${windValue.toFixed(1)} mph`,components.wind,"wind"]
  ];
  $("metricGrid").innerHTML=metricData.map(([name,value,score,info])=>
    `<div class="card metric" style="--status:${colorForScore(score)}"><div class="label label-row"><span>${name}</span><button class="info-button" type="button" data-info="${info}" aria-label="About ${name}">i</button></div><div class="metric-value">${value}</div><div class="metric-status">${conditionText(score>=48?"GO":"CAUTION",score)}</div></div>`
  ).join("");

  renderOutlook(nights,timeZone);
  $("nightDetailTitle").textContent=`${nightLabel} at a glance`;

  const timelineRows=[
    ["Overall",index=>overallAt(index),index=>`Score ${scoreText(overallAt(index))}`],
    ["Cloud",index=>cloudScore(seriesValue("Cloud",index)),index=>`${scoreText(seriesValue("Cloud",index))}% cloud`],
    ["Transparency",index=>transparencyScore(seriesValue("Transparency",index)),index=>`Value ${seriesValue("Transparency",index)}`],
    ["Seeing",index=>seeingScore(seriesValue("Seeing",index)),index=>`${seriesValue("Seeing",index)}/5`],
    ["Dew risk",index=>dewScore(seriesValue("Temperature",index),seriesValue("DewPoint",index)),index=>{
      const margin=dewMarginF(seriesValue("Temperature",index),seriesValue("DewPoint",index));
      return margin==null?"Dew point unavailable":`${margin.toFixed(1)}°F margin`;
    }]
  ];
  const hourCells=Array.from({length:timelineLength()},(_,index)=>
    `<div class="cell">${fmtHour(forecastTime(index),timeZone)}</div>`
  ).join("");
  $("timeline").innerHTML=timelineRows.map(([name,scoreFn,tipFn])=>
    `<div class="trow"><div class="tname">${name}</div><div class="cells" style="--n:${timelineLength()}">${Array.from({length:timelineLength()},(_,index)=>`<div class="cell" style="--c:${colorForScore(scoreFn(index))}" data-tip="${fmtTime(forecastTime(index),timeZone)} · ${tipFn(index)}"></div>`).join("")}</div></div>`
  ).join("")+`<div class="trow hours"><div></div><div class="cells" style="--n:${timelineLength()}">${hourCells}</div></div>`;

  const illumination=Number(moon?.IlluminationPercent||0);
  const moonConditionScore=moonScore(moon);
  $("moonCard").style.borderLeft=`4px solid ${colorForScore(moonConditionScore)}`;
  $("moonValue").textContent=moon?`${illumination.toFixed(0)}% illuminated`:"Unavailable";
  $("moonStatus").style.color=colorForScore(moonConditionScore);
  $("moonStatus").textContent=moon?(moon.IsAboveHorizon?"Moon above horizon":"Moon below horizon"):"Moon data unavailable";
  $("moonDetail").textContent=moon?`Mid-night snapshot · ${fmtTime(moon.TimeUTC,timeZone)}${Number.isFinite(moon.Altitude)?` · ${moon.Altitude.toFixed(0)}°`:""}`:"";

  const dewMargin=dewMarginF(seriesValue("Temperature",center),seriesValue("DewPoint",center));
  $("dewCard").style.borderLeft=`4px solid ${colorForScore(components.dew)}`;
  $("dewValue").textContent=dewMargin==null?"—":`${dewMargin.toFixed(1)}°F`;
  $("dewStatus").style.color=colorForScore(components.dew);
  $("dewStatus").textContent=conditionText(components.dew>=65?"GO":"WATCH",components.dew);
  $("dewDetail").textContent=components.dew===null?"Dew assessment unavailable.":components.dew<65?"Run dew control from setup.":"Comfortable margin at the best imaging window.";
  renderWeatherAndPlan(rows,timeZone,components,moon);

  const detailEntries=[
    ["Cloud",components.cloud],
    ["Transparency",components.transparency],
    ["Seeing",components.seeing],
    ["Wind",components.wind],
    ["Dew",components.dew],
    ["Moon context",components.moon]
  ];
  $("scoreDetails").innerHTML=detailEntries.map(([name,score])=>
    `<div class="score-item"><div class="score-head"><span>${name}</span><strong>${scoreText(score)}</strong></div><div class="small-scale"><span class="small-marker ${Number.isFinite(score)?"":"hidden"}" style="left:${score??0}%"></span></div></div>`
  ).join("");

  const creditRecords=Object.values(state.providerStatus).filter(record=>Number.isFinite(record.creditsRemaining));
  const credits=creditRecords.length?Math.min(...creditRecords.map(r=>r.creditsRemaining)):"—";
  $("footer").textContent=`AstroImageNow ${APP_VERSION} · Astronomy score uses capped hourly values · Model ${forecast.ModelTime||"unavailable"} · API credits remaining ${credits}`;
}

function contextFor(settings=state.settings){
  const location=activeLocation();
  return JSON.stringify([location?.id,location?.lat,location?.lon,settings?.weatherSource]);
}

function readSnapshot(context){
  try{
    const data=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||"null");
    return data?.version===1&&data.context===context?data:null;
  }catch{return null}
}

function saveSnapshot(){
  if(!state.forecast&&!state.weather)return;
  const data={version:1,context:state.dataContext,forecast:state.forecast,weather:state.weather,moons:state.moons,providerStatus:state.providerStatus,fetchedAt:state.fetchedAt};
  state.lastGood=data;
  try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(data))}catch{state.storageNotice="Forecast could not be saved on this device."}
}

function diagnosticSummary(){
  return{
    appVersion:APP_VERSION,
    serviceWorker:{controlled:typeof navigator!=="undefined"&&!!navigator.serviceWorker?.controller,waiting:!!state.swRegistration?.waiting},
    configuredWeatherSource:state.settings?.weatherSource,
    weatherProvider:state.weather?.meta?.provider||null,
    astronomyStale:state.forecastStale,
    weatherStale:state.weatherStale,
    providers:Object.values(state.providerStatus).map(record=>({id:record.id,status:record.status,fetchedAt:record.fetchedAt||null,coverage:record.coverage||null,modelTime:record.modelTime||null,creditCost:record.creditCost??null,creditsRemaining:record.creditsRemaining??null,error:record.error?{code:record.error.code,httpStatus:record.error.httpStatus,message:record.error.message}:null})),
    storageNotice:state.storageNotice||null
  };
}

function renderDiagnostics(){
  state.diagnostic=JSON.stringify(diagnosticSummary(),null,2);
  $("diagBox").textContent=state.diagnostic;
  $("diagWrap").classList.remove("hidden");
}

async function refresh(){
  const id=++state.refreshId;
  state.refreshController?.abort();
  const controller=new AbortController();
  state.refreshController=controller;
  const settings={...state.settings};
  const location={...activeLocation()};
  const contextKey=contextFor(settings);
  const saved=state.dataContext===contextKey?state.lastGood:readSnapshot(contextKey);
  state.dataContext=contextKey;
  state.forecast=saved?.forecast||null;
  state.weather=saved?.weather||null;
  state.moons=saved?.moons||[];
  state.fetchedAt=saved?.fetchedAt||null;
  state.forecastStale=!!state.forecast;
  state.weatherStale=!!state.weather;
  state.providerStatus={};
  state.weatherError="";
  state.weatherNotice="";
  $("refreshBtn").disabled=true;
  $("refreshBtn").textContent="Refreshing…";
  $("errorBox").classList.add("hidden");
  const current=()=>id===state.refreshId&&!controller.signal.aborted;
  const context={signal:controller.signal,onStatus:record=>{if(current()){state.providerStatus[record.id]=record;renderDiagnostics()}}};
  const common={Latitude:location.lat,Longitude:location.lon};
  render();
  try{
    const weatherTask=Providers.capture("weather",()=>fetchSupplementalWeather(location,settings,context),context).then(result=>{
      if(!current())return;
      if(result.data){
        state.weather=result.data;state.weatherStale=false;
        state.weatherNotice=[result.data.meta.notice,...(result.data.meta.notices||[])].filter(Boolean).join(" ");
        state.fetchedAt=result.record.fetchedAt;
      }else state.weatherError=result.record.error.message;
      render();
    });
    const astronomyTask=Promise.all([
      ["astronomy-core",["Cloud","Seeing","Temperature"]],
      ["astronomy-extra",["Transparency","DewPoint","Wind"]]
    ].map(([name,variables])=>Providers.capture(name,async()=>Providers.normalizeAstronomy(await Providers.astronomy("GetForecastData",{...common,ForecastLength:168,Variables:variables},settings.apiKey,context),variables),context))).then(results=>{
      if(!current())return;
      const data=Providers.mergeAstronomy(results[0].data,results[1].data);
      if(data){
        data.meta.fetchedAt=results.filter(r=>r.data).map(r=>r.record.fetchedAt).sort().at(-1);
        state.forecast=data;state.forecastStale=false;state.moons=[];state.fetchedAt=data.meta.fetchedAt;
      }
      render();
    });
    await Promise.all([weatherTask,astronomyTask]);
    if(!current())return;
    if(state.forecast&&!state.forecastStale){
      const nights=availableNights();
      const moons=[];
      for(const rows of nights){
        if(!current())return;
        if(!rows.some(row=>row.Cloud||row.Transparency)){moons.push(null);continue}
        const middle=rows[Math.floor(rows.length/2)];
        const result=await Providers.capture(`moon-${nightKey(rows,state.forecast.TimeZone)}`,async()=>{
          const data=await Providers.astronomy("Moon",{...common,Time:middle.UTCForecastHour},settings.apiKey,context);
          if(typeof data.IsAboveHorizon!=="boolean"||Providers.number(data.IlluminationPercent,0,100)===null)throw new Providers.ProviderError("Astrospheric Moon","schema");
          return{IsAboveHorizon:data.IsAboveHorizon,IlluminationPercent:data.IlluminationPercent,Altitude:Providers.number(data.Altitude,-90,90),TimeUTC:data.TimeUTC||middle.UTCForecastHour,APICreditCostOfCall:Providers.number(data.APICreditCostOfCall,0),APICreditsRemaining:Providers.number(data.APICreditsRemaining,0)};
        },context);
        moons.push(result.data);
      }
      if(!current())return;
      state.moons=moons;
    }
    if(state.forecast&&!state.forecastStale||state.weather&&!state.weatherStale)saveSnapshot();
  }catch(error){
    if(current()){$("errorBox").textContent="Refresh could not finish. Open diagnostics for provider status.";$("errorBox").classList.remove("hidden")}
  }finally{
    if(current()){
      $("refreshBtn").disabled=false;$("refreshBtn").textContent="Refresh";
      render();renderDiagnostics();
    }
  }
}

function thresholdIndex(thresholdId){
  const index=ALERT_THRESHOLDS.findIndex(threshold=>threshold.id===thresholdId);
  return index>=0?index:0;
}

function updateThresholdControl(){
  const input=$("alertThreshold");
  const threshold=ALERT_THRESHOLDS[Number(input.value)]||ALERT_THRESHOLDS[0];
  $("thresholdControl").style.setProperty("--threshold-color",threshold.color);
  input.setAttribute("aria-valuetext",`${threshold.label}, score ${threshold.score} or higher`);
}

function updateWeatherSourceControl(){
  const source=normalizeWeatherSource($("weatherSource").value);
  $("forecaTokenField").classList.toggle("hidden",source==="open-meteo");
}

function fillLocationForm(location){
  $("locationName").value=location?.name??"";
  $("lat").value=location?.lat??"";
  $("lon").value=location?.lon??"";
  $("bortle").value=location?.bortle??"";
  $("alertThreshold").value=thresholdIndex(location?.alertThreshold);
  updateThresholdControl();
}

function renderSavedLocationSelect(){
  const select=$("savedLocationSelect");
  const locations=state.settings?.locations||[];
  select.replaceChildren();
  if(!locations.length||!state.editingLocationId){
    const option=document.createElement("option");
    option.value="";
    option.textContent="New location";
    select.append(option);
  }
  for(const location of locations){
    const option=document.createElement("option");
    option.value=location.id;
    option.textContent=location.name;
    select.append(option);
  }
  select.value=state.editingLocationId||"";
  $("deleteLocation").disabled=!state.editingLocationId||locations.length<=1;
}

function selectLocationForEditing(locationId){
  const location=state.settings?.locations?.find(item=>item.id===locationId)||null;
  state.editingLocationId=location?.id||null;
  renderSavedLocationSelect();
  fillLocationForm(location);
}

function openInfo(key){
  const content=INFO_CONTENT[key];
  if(!content)return;
  $("infoTitle").textContent=content.title;
  $("infoBody").innerHTML=`<p>${content.body}</p>${content.extra?`<p>${content.extra}</p>`:""}`;
  const dialog=$("infoDialog");
  if(typeof dialog.showModal==="function")dialog.showModal();
  else dialog.setAttribute("open","");
}

function closeInfo(){
  const dialog=$("infoDialog");
  if(typeof dialog.close==="function")dialog.close();
  else dialog.removeAttribute("open");
}

function showSetup(){
  $("dashboard").classList.add("hidden");
  $("setupView").classList.remove("hidden");
  state.settings=state.settings||storedSettings();
  $("apiKey").value=state.settings?.apiKey||"";
  $("forecaToken").value=state.settings?.forecaToken||"";
  $("weatherSource").value=normalizeWeatherSource(state.settings?.weatherSource);
  updateWeatherSourceControl();
  $("cancelSetup").classList.toggle("hidden",!state.settings);
  if(state.settings){
    selectLocationForEditing(state.settings.activeLocationId);
  }else{
    state.editingLocationId=null;
    renderSavedLocationSelect();
    fillLocationForm({
      name:"Home",
      lat:"",
      lon:"",
      bortle:null,
      alertThreshold:"yellow"
    });
  }
  $("setupError").classList.add("hidden");
}

function openDashboard(){
  $("setupView").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  refresh();
}

function initialize(){
  $("saveSetup").addEventListener("click",()=>{
    const apiKey=$("apiKey").value.trim();
    const forecaToken=$("forecaToken").value.trim();
    const weatherSource=normalizeWeatherSource($("weatherSource").value);
    const location={
      id:state.editingLocationId||createLocationId(),
      name:$("locationName").value.trim()||"Observing location",
      lat:Providers.number($("lat").value,-90,90),
      lon:Providers.number($("lon").value,-180,180),
      bortle:normalizeBortle($("bortle").value),
      alertThreshold:ALERT_THRESHOLDS[Number($("alertThreshold").value)]?.id||"yellow"
    };
    if(!apiKey){
      $("setupError").textContent="Enter your Astrospheric API key.";
      $("setupError").classList.remove("hidden");
      return;
    }
    if(weatherSource==="foreca"&&!forecaToken){
      $("setupError").textContent="Foreca only requires a Foreca API token. Add the token or select a source with Open-Meteo.";
      $("setupError").classList.remove("hidden");
      return;
    }
    if(!Number.isFinite(location.lat)||location.lat<-90||location.lat>90||!Number.isFinite(location.lon)||location.lon<-180||location.lon>180){
      $("setupError").textContent="Enter valid latitude and longitude.";
      $("setupError").classList.remove("hidden");
      return;
    }
    const locations=[...(state.settings?.locations||[])];
    const existingIndex=locations.findIndex(item=>item.id===location.id);
    if(existingIndex>=0)locations[existingIndex]=location;
    else locations.push(location);
    saveSettings({
      version:5,
      apiKey,
      forecaToken,
      weatherSource,
      targetType:state.settings?.targetType||"emission",
      activeLocationId:location.id,
      selectedNightKey:state.settings?.selectedNightKey,
      locations
    });
    state.editingLocationId=location.id;
    openDashboard();
  });

  $("weatherSource").addEventListener("change",updateWeatherSourceControl);

  $("savedLocationSelect").addEventListener("change",event=>{
    selectLocationForEditing(event.target.value);
  });

  $("newLocation").addEventListener("click",()=>{
    state.editingLocationId=null;
    renderSavedLocationSelect();
    fillLocationForm(null);
    $("locationName").focus();
  });

  $("deleteLocation").addEventListener("click",()=>{
    const locations=state.settings?.locations||[];
    const location=locations.find(item=>item.id===state.editingLocationId);
    if(!location||locations.length<=1)return;
    if(!window.confirm(`Delete ${location.name}?`))return;
    const remaining=locations.filter(item=>item.id!==location.id);
    const activeLocationId=state.settings.activeLocationId===location.id
      ?remaining[0].id
      :state.settings.activeLocationId;
    saveSettings({...state.settings,activeLocationId,locations:remaining});
    selectLocationForEditing(activeLocationId);
  });

  $("alertThreshold").addEventListener("input",updateThresholdControl);

  $("targetSelect").addEventListener("change",event=>{
    if(!state.settings)return;
    saveSettings({...state.settings,targetType:normalizeTargetType(event.target.value)});
    render();
  });

  document.addEventListener("click",event=>{
    const infoButton=event.target.closest("[data-info]");
    if(infoButton)openInfo(infoButton.dataset.info);
  });
  $("infoClose").addEventListener("click",closeInfo);
  $("infoDialog").addEventListener("click",event=>{
    if(event.target===$("infoDialog"))closeInfo();
  });

  $("cancelSetup").addEventListener("click",()=>{
    if(!state.settings)return;
    $("setupView").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
  });

  $("useLocation").addEventListener("click",async()=>{
    $("setupError").classList.add("hidden");
    const apiKey=$("apiKey").value.trim();
    if(!apiKey){
      $("setupError").textContent="Enter your Astrospheric API key first, then use approximate location.";
      $("setupError").classList.remove("hidden");
      return;
    }
    const button=$("useLocation");
    const prior=button.textContent;
    button.textContent="Locating…";
    button.disabled=true;
    try{
      const data=await Providers.astronomy("IpLookup",{},apiKey);
      const latitude=Providers.number(data.Latitude,-90,90);
      const longitude=Providers.number(data.Longitude,-180,180);
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){
        throw new Error("Astrospheric could not determine an approximate location from this connection.");
      }
      $("lat").value=latitude.toFixed(6);
      $("lon").value=longitude.toFixed(6);
      $("locationName").value="Approximate current location";
    }catch(error){
      $("setupError").textContent="Could not determine approximate location: "+error.message;
      $("setupError").classList.remove("hidden");
    }finally{
      button.textContent=prior;
      button.disabled=false;
    }
  });

  $("nightOutlook").addEventListener("click",event=>{
    const button=event.target.closest("[data-night-index]");
    if(!button)return;
    state.selectedNightIndex=Number(button.dataset.nightIndex);
    const rows=availableNights()[state.selectedNightIndex]||[];
    saveSettings({...state.settings,selectedNightKey:nightKey(rows,state.forecast?.TimeZone||activeLocation()?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone)});
    render();
  });

  $("diagBtn").addEventListener("click",()=>{
    $("diagBox").textContent=state.diagnostic||"No diagnostic information recorded.";
    $("diagBox").classList.toggle("hidden");
  });

  $("checkUpdateBtn").addEventListener("click",async()=>{
    try{
      await state.swRegistration?.update();
      $("updateNotice").classList.remove("hidden");
      $("updateMessage").textContent=state.swRegistration?.waiting?"An app update is ready. Apply when you are ready to reload.":"Update check complete. No waiting update was found.";
      $("applyUpdateBtn").classList.toggle("hidden",!state.swRegistration?.waiting);
    }catch{$("updateNotice").classList.remove("hidden");$("updateMessage").textContent="Could not check for an update. Try again when online."}
    renderDiagnostics();
  });
  $("applyUpdateBtn").addEventListener("click",()=>{
    const worker=state.swRegistration?.waiting;
    if(!worker)return;
    navigator.serviceWorker.addEventListener("controllerchange",()=>window.location.reload(),{once:true});
    worker.postMessage({type:"APPLY_UPDATE"});
  });

  $("quickLocationSelect").addEventListener("change",event=>{
    if(!state.settings?.locations?.some(location=>location.id===event.target.value))return;
    saveSettings({...state.settings,activeLocationId:event.target.value,selectedNightKey:null});
    state.selectedNightIndex=0;
    refresh();
  });

  $("refreshBtn").addEventListener("click",refresh);
  $("settingsBtn").addEventListener("click",showSetup);
  state.settings=storedSettings();
  if(state.settings)openDashboard();
  else showSetup();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.settings)render()});
  setInterval(()=>{if(!document.hidden&&state.settings)render()},60000);

  if("serviceWorker"in navigator&&location.protocol.startsWith("http")){
    navigator.serviceWorker.register("./sw.js").then(registration=>{
      state.swRegistration=registration;
      const announce=()=>{
        if(!registration.waiting)return;
        $("updateMessage").textContent="An app update is ready. Your saved settings will be kept.";
        $("updateNotice").classList.remove("hidden");
        $("applyUpdateBtn").classList.remove("hidden");
      };
      announce();
      registration.addEventListener("updatefound",()=>registration.installing?.addEventListener("statechange",announce));
    }).catch(()=>{state.storageNotice="Offline app installation is unavailable in this browser."});
  }
}

if(typeof window!=="undefined"&&typeof document!=="undefined")initialize();

if(typeof module!=="undefined"){
  module.exports={
    state,
    refresh,
    render,
    diagnosticSummary,
    operationalVerdict,
    contextFor,
    nightKey,
    windowEnd,
    APP_VERSION,
    ALERT_THRESHOLDS,
    TARGET_TYPES,
    normalizeBortle,
    normalizeAlertThreshold,
    normalizeTargetType,
    normalizeWeatherSource,
    normalizeLocation,
    normalizeSettings,
    activeLocation,
    alertThresholdFor,
    colorForScore,
    verdictForScore,
    cloudScore,
    transparencyScore,
    seeingScore,
    windScore,
    dewScore,
    moonScore,
    weightedScore,
    sunAltitudeDeg,
    groupedDarkRows,
    availableNights,
    darkRows,
    hourlyScoresForRow,
    overallForRow,
    findBestWindowForRows,
    summaryForNight,
    weatherTimeMs,
    roundedWeatherLocation,
    normalizeForecaWeather,
    fetchSupplementalWeather,
    visibilityToMiles,
    weatherSummaryForRows,
    filterRecommendation,
    preparationGuidance
  };
}
