"use strict";

const API_BASE="https://v2-api-public.astrospheric.com/api";
const SETTINGS_KEY="astroImageNowSettings";
const LEGACY_SETTINGS_KEY="astroTonightSettings";
const COLORS={green:"#22c55e",lime:"#84cc16",yellow:"#eab308",orange:"#f97316",red:"#ef4444"};
const ALERT_THRESHOLDS=[
  {id:"yellow",label:"Yellow",score:48,color:COLORS.yellow},
  {id:"lime",label:"Lime",score:65,color:COLORS.lime},
  {id:"green",label:"Green",score:80,color:COLORS.green}
];
const $=id=>document.getElementById(id);
const state={
  settings:null,
  forecast:null,
  moons:[],
  sun:null,
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

function normalizeLocation(location,idFallback=createLocationId()){
  if(!location)return null;
  const latitude=Number(location.lat);
  const longitude=Number(location.lon);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
  return{
    id:String(location.id||idFallback),
    name:String(location.name||location.locationName||"Observing location"),
    lat:latitude,
    lon:longitude,
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
    version:2,
    apiKey:String(raw.apiKey||""),
    activeLocationId,
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
  if(score>=80)return COLORS.green;
  if(score>=65)return COLORS.lime;
  if(score>=48)return COLORS.yellow;
  if(score>=30)return COLORS.orange;
  return COLORS.red;
}

function verdictForScore(score){
  if(score>=75)return["GO","Set up the telescope"];
  if(score>=48)return["MARGINAL","Conditional imaging night"];
  return["NO-GO","Skip the full setup"];
}

function clamp(value,min=0,max=100){return Math.max(min,Math.min(max,value))}
function cloudScore(value){return clamp(100-Number(value))}

function transparencyScore(value){
  value=Number(value);
  if(value<=5)return 100-value*2;
  if(value<=9)return 88-(value-5)*5;
  if(value<=13)return 68-(value-9)*5;
  if(value<=23)return 48-(value-13)*2;
  if(value<=27)return 25-(value-23)*4;
  return 5;
}

function seeingScore(value){
  return({0:5,1:25,2:45,3:62,4:82,5:100})[Math.round(Number(value))]??50;
}

function windToMph(value){return Number(value)*2.236936}

function windScore(value){
  const mph=windToMph(value);
  if(mph<=4)return 100;
  if(mph<=8)return 85;
  if(mph<=12)return 65;
  if(mph<=17)return 43;
  if(mph<=23)return 22;
  return 5;
}

function kelvinToF(kelvin){return(Number(kelvin)-273.15)*9/5+32}

function dewMarginF(temperature,dewPoint){
  const temperatureF=kelvinToF(temperature);
  const dewPointF=kelvinToF(dewPoint);
  return temperatureF===null||dewPointF===null?null:temperatureF-dewPointF;
}

function dewScore(temperature,dewPoint){
  const margin=dewMarginF(temperature,dewPoint);
  if(margin>=10)return 100;
  if(margin>=7)return 86;
  if(margin>=5)return 70;
  if(margin>=3)return 50;
  if(margin>=1.5)return 28;
  return 10;
}

function moonScore(moon){
  if(!moon||!moon.IsAboveHorizon)return 100;
  const illumination=Number(moon.IlluminationPercent||0);
  if(illumination<=20)return 92;
  if(illumination<=40)return 80;
  if(illumination<=65)return 67;
  if(illumination<=85)return 55;
  return 45;
}

function weightedScore(scores){
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

function fmtUpdated(){
  return new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date());
}

function fmtNightDate(iso,timeZone){
  return new Intl.DateTimeFormat("en-US",{
    timeZone,
    weekday:"short",
    month:"short",
    day:"numeric"
  }).format(new Date(iso));
}

async function api(endpoint,body){
  const response=await fetch(`${API_BASE}/${endpoint}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...body,APIKey:state.settings.apiKey})
  });
  let data={};
  try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(data.ErrorInfo||`Astrospheric returned HTTP ${response.status}`);
  if(data.ErrorInfo)throw new Error(data.ErrorInfo);
  return data;
}

function hourlyRows(){
  return Array.isArray(state.forecast?.HourlyForecast)?state.forecast.HourlyForecast:[];
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
  const startIndex=currentIndex>=0?currentIndex:futureIndex>=0?futureIndex:0;
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
  return rows.length?[rows.slice(0,12)]:[];
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
  const good=rows.map(row=>overallForRow(row,moon)>=65);
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
      if(score>bestScore){
        bestScore=score;
        bestIndex=index;
      }
    }
    return{start:bestIndex,end:bestIndex,len:1,score:bestScore};
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
  const score=weightedScore(components);
  return{best,center,components,score};
}

function conditionText(label,score){
  if(score>=80)return`${label} · Excellent`;
  if(score>=65)return`${label} · Good`;
  if(score>=48)return`${label} · Marginal`;
  if(score>=30)return`${label} · Poor`;
  return`${label} · Limiting`;
}

function renderOutlook(nights,timeZone){
  const threshold=alertThresholdFor();
  $("outlookSub").textContent=`${nights.length} upcoming ${nights.length===1?"night":"nights"} available · ${threshold.label} alert threshold (${threshold.score}+)`;
  $("nightOutlook").innerHTML=nights.map((rows,index)=>{
    const summary=summaryForNight(rows,moonForNight(index));
    const status=colorForScore(summary.score);
    const verdict=verdictForScore(summary.score)[0];
    const label=index===0?"Tonight":fmtNightDate(rows[0].UTCForecastHour,timeZone);
    const start=rows[summary.best.start]?.UTCForecastHour;
    const end=rows[summary.best.end]?.UTCForecastHour;
    const windowText=summary.best.len>1
      ?`${summary.best.len} hr · ${fmtTime(start,timeZone)}–${fmtTime(end,timeZone)}`
      :`Best hour · ${fmtTime(start,timeZone)}`;
    return`<button class="night-option" type="button" data-night-index="${index}" aria-pressed="${index===state.selectedNightIndex}" style="--night-status:${status}"><span class="night-date">${label}</span><span class="night-score">${Math.round(summary.score)}</span><span class="night-verdict">${verdict}</span><span class="night-window">${windowText}</span></button>`;
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

function render(){
  const forecast=state.forecast;
  const location=activeLocation();
  const timeZone=forecast.TimeZone||"America/Detroit";
  const nights=availableNights();
  if(!nights.length)throw new Error("No forecast data returned for this location.");
  state.selectedNightIndex=clamp(state.selectedNightIndex,0,nights.length-1);

  const rows=darkRows();
  const moon=moonForNight();
  const summary=summaryForNight(rows,moon);
  const best=summary.best;
  const center=summary.center;
  const components=summary.components;
  const overall=summary.score;
  const [verdict,title]=verdictForScore(overall);
  const status=colorForScore(overall);
  const nightLabel=state.selectedNightIndex===0?"Tonight":fmtNightDate(rows[0].UTCForecastHour,timeZone);
  const darknessLabel=state.darknessThreshold===-18?"Astronomical darkness":state.darknessThreshold===-12?"Nautical-darkness fallback":"Available forecast hours";

  $("hero").style.setProperty("--status",status);
  $("statusBadge").style.setProperty("--status",status);
  $("scoreRing").style.setProperty("--status",status);
  $("statusBadge").textContent=verdict;
  $("statusTitle").textContent=title;
  $("scoreRing").textContent=Math.round(overall);
  $("locationLabel").textContent=`${location.name} · ${nightLabel}`;
  $("bortleRef").textContent=location.bortle?`Bortle ${location.bortle}`:"";
  $("bortleRef").classList.toggle("hidden",!location.bortle);
  $("nightChip").textContent=`${darknessLabel}: ${fmtTime(rows[0].UTCForecastHour,timeZone)} → ${fmtTime(rows[rows.length-1].UTCForecastHour,timeZone)}`;
  $("headerSub").textContent=`${location.name} · Updated ${fmtUpdated()}`;
  renderQuickLocationSelect();

  const reasons=[];
  const limits=[];
  if(components.cloud>=80)reasons.push("low cloud cover");
  if(components.transparency>=80)reasons.push("strong transparency");
  if(components.seeing>=80)reasons.push("good seeing");
  if(components.wind>=80)reasons.push("light wind");
  if(components.cloud<48)limits.push("cloud cover");
  if(components.transparency<48)limits.push("poor transparency");
  if(components.wind<48)limits.push("wind");
  if(components.dew<48)limits.push("dew");
  if(components.seeing<48)limits.push("seeing");
  if(!reasons.length&&!limits.length)reasons.push("mixed but workable conditions");

  $("statusCopy").textContent=verdict==="GO"
    ?`Conditions are favorable: ${reasons.join(", ")}.${limits.length?" Main caution: "+limits.join(", ")+".":""} The green band below is your best setup target.`
    :verdict==="MARGINAL"
      ?`Conditions are mixed.${limits.length?" Main limitation: "+limits.join(", ")+".":""} A shorter or lower-risk session may still be worthwhile.`
      :`Conditions are currently poor enough that a full imaging setup is unlikely to pay off.${limits.length?" Main limitation: "+limits.join(", ")+".":""}`;

  const startIso=rows[best.start]?.UTCForecastHour;
  const endIso=rows[best.end]?.UTCForecastHour;
  $("bestWindow").textContent=best.len>1?`${best.len} hr green window`:"Best dark hour";
  $("bestWindowTime").textContent=best.len>1
    ?`${fmtTime(startIso,timeZone)} → ${fmtTime(endIso,timeZone)}`
    :fmtTime(startIso,timeZone);
  $("windowMarker").style.left=`${best.score}%`;

  const cloudValue=seriesValue("Cloud",center);
  const transparencyValue=seriesValue("Transparency",center);
  const seeingValue=seriesValue("Seeing",center);
  const windValue=windToMph(seriesValue("Wind",center));
  const metricData=[
    ["Cloud",`${Math.round(cloudValue)}%`,components.cloud],
    ["Transparency",transparencyValue==null?"—":`${Number(transparencyValue).toFixed(0)}`,components.transparency],
    ["Seeing",`${Number(seeingValue).toFixed(0)} / 5`,components.seeing],
    ["Wind",windValue==null?"—":`${windValue.toFixed(1)} mph`,components.wind]
  ];
  $("metricGrid").innerHTML=metricData.map(([name,value,score])=>
    `<div class="card metric" style="--status:${colorForScore(score)}"><div class="label">${name}</div><div class="metric-value">${value}</div><div class="metric-status">${conditionText(score>=48?"GO":"CAUTION",score)}</div></div>`
  ).join("");

  renderOutlook(nights,timeZone);
  $("nightDetailTitle").textContent=`${nightLabel} at a glance`;

  const timelineRows=[
    ["Overall",index=>overallAt(index),index=>`Score ${Math.round(overallAt(index))}`],
    ["Cloud",index=>cloudScore(seriesValue("Cloud",index)),index=>`${Math.round(seriesValue("Cloud",index))}% cloud`],
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
  $("moonDetail").textContent=moon?`Altitude ${Number(moon.Altitude||0).toFixed(0)}°`:"";

  const dewMargin=dewMarginF(seriesValue("Temperature",center),seriesValue("DewPoint",center));
  $("dewCard").style.borderLeft=`4px solid ${colorForScore(components.dew)}`;
  $("dewValue").textContent=dewMargin==null?"—":`${dewMargin.toFixed(1)}°F`;
  $("dewStatus").style.color=colorForScore(components.dew);
  $("dewStatus").textContent=conditionText(components.dew>=65?"GO":"WATCH",components.dew);
  $("dewDetail").textContent=components.dew<65?"Run dew control from setup.":"Comfortable margin at the best imaging window.";

  $("adviceCard").style.borderLeft=`4px solid ${status}`;
  $("adviceTitle").textContent=verdict==="GO"?"Worth setting up":verdict==="MARGINAL"?"Use a shorter plan":"Protect the evening";
  $("adviceText").textContent=verdict==="GO"
    ?"Weather should not be the main limiting factor. Use dew control from the start and treat this as a good opportunity to operate the rig."
    :verdict==="MARGINAL"
      ?"If setup time is low, a focused test or shorter imaging run can still be worthwhile. Avoid turning the night into a troubleshooting marathon."
      :"Skip the full imaging deployment unless you specifically want a bench/setup test.";

  const detailEntries=[
    ["Cloud",components.cloud],
    ["Transparency",components.transparency],
    ["Seeing",components.seeing],
    ["Wind",components.wind],
    ["Dew",components.dew],
    ["Moon context",components.moon]
  ];
  $("scoreDetails").innerHTML=detailEntries.map(([name,score])=>
    `<div class="score-item"><div class="score-head"><span>${name}</span><strong>${Math.round(score)}</strong></div><div class="small-scale"><span class="small-marker" style="left:${score}%"></span></div></div>`
  ).join("");

  const credits=forecast.APICreditsRemaining??forecast.APICreditsRemainingToday??"—";
  $("footer").textContent=`Selected-night astronomical scoring · Astrospheric model ${forecast.ModelTime||"—"} · API credits remaining ${credits}`;
}

async function fetchNightMoons(common){
  const nights=availableNights();
  const moons=[];
  for(const rows of nights){
    const middleRow=rows[Math.floor(rows.length/2)];
    try{
      moons.push(await api("Moon",{...common,Time:middleRow.UTCForecastHour}));
    }catch(error){
      moons.push(null);
      state.diagnostic+=`\n\nMOON LOOKUP ERROR (${middleRow.UTCForecastHour})\n${error.message}`;
    }
  }
  return moons;
}

async function refresh(){
  $("dashboard").classList.add("loading");
  $("errorBox").classList.add("hidden");
  $("diagWrap").classList.add("hidden");
  $("diagBox").classList.add("hidden");
  state.diagnostic="";
  try{
    const location=activeLocation();
    if(!location)throw new Error("Select a valid observing location.");
    const common={Latitude:location.lat,Longitude:location.lon};
    const forecastOptions={...common,ForecastLength:168,PrettyPrint:true};
    const core=await api("GetForecastData",{
      ...forecastOptions,
      Variables:["Cloud","Seeing","Temperature"]
    });
    state.diagnostic="CORE FORECAST RESPONSE\n"+JSON.stringify(core,null,2);
    if(!(core&&typeof core==="object"&&Array.isArray(core.HourlyForecast)&&core.HourlyForecast.length>0)){
      throw new Error(`Astrospheric did not return HourlyForecast data for ${location.lat}, ${location.lon}.`);
    }

    const extra=await api("GetForecastData",{
      ...forecastOptions,
      Variables:["Transparency","DewPoint","Wind"]
    });
    state.diagnostic+="\n\nEXTRA FORECAST RESPONSE\n"+JSON.stringify(extra,null,2);
    const extraByTime=new Map((extra.HourlyForecast||[]).map(row=>[row.UTCForecastHour,row]));
    const mergedHourly=(core.HourlyForecast||[]).map(row=>({
      ...row,
      ...(extraByTime.get(row.UTCForecastHour)||{})
    }));
    state.forecast={...core,...extra,HourlyForecast:mergedHourly};
    state.selectedNightIndex=0;

    state.moons=await fetchNightMoons(common);
    state.sun=await api("RiseSet",{...common,Object:"Sun",Days:7});
    state.diagnostic+="\n\nNIGHT MOON RESPONSES\n"+JSON.stringify(state.moons,null,2)+"\n\nSUN RESPONSE\n"+JSON.stringify(state.sun,null,2);
    render();
  }catch(error){
    $("errorBox").textContent=error.message;
    $("errorBox").classList.remove("hidden");
    $("diagWrap").classList.remove("hidden");
    const location=activeLocation();
    state.diagnostic=`REQUESTED LOCATION\n${location?.lat??"—"}, ${location?.lon??"—"}\n\n${state.diagnostic||""}\n\nERROR\n${error.stack||error.message||error}`;
  }finally{
    $("dashboard").classList.remove("loading");
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

function showSetup(){
  $("dashboard").classList.add("hidden");
  $("setupView").classList.remove("hidden");
  state.settings=state.settings||storedSettings();
  $("apiKey").value=state.settings?.apiKey||"";
  $("cancelSetup").classList.toggle("hidden",!state.settings);
  if(state.settings){
    selectLocationForEditing(state.settings.activeLocationId);
  }else{
    state.editingLocationId=null;
    renderSavedLocationSelect();
    fillLocationForm({
      name:"Bellaire, Michigan",
      lat:44.98028,
      lon:-85.21117,
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
    const location={
      id:state.editingLocationId||createLocationId(),
      name:$("locationName").value.trim()||"Observing location",
      lat:Number($("lat").value),
      lon:Number($("lon").value),
      bortle:normalizeBortle($("bortle").value),
      alertThreshold:ALERT_THRESHOLDS[Number($("alertThreshold").value)]?.id||"yellow"
    };
    if(!apiKey){
      $("setupError").textContent="Enter your Astrospheric API key.";
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
      version:2,
      apiKey,
      activeLocationId:location.id,
      locations
    });
    state.editingLocationId=location.id;
    openDashboard();
  });

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
      const response=await fetch(`${API_BASE}/IpLookup`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({APIKey:apiKey})
      });
      let data={};
      try{data=await response.json()}catch{}
      if(!response.ok)throw new Error(data.ErrorInfo||`Astrospheric returned HTTP ${response.status}`);
      if(data.ErrorInfo)throw new Error(data.ErrorInfo);
      const latitude=Number(data.Latitude);
      const longitude=Number(data.Longitude);
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
    render();
  });

  $("diagBtn").addEventListener("click",()=>{
    $("diagBox").textContent=state.diagnostic||"No diagnostic information recorded.";
    $("diagBox").classList.toggle("hidden");
  });

  $("testKnownBtn").addEventListener("click",async()=>{
    const button=$("testKnownBtn");
    const prior=button.textContent;
    button.textContent="Testing…";
    button.disabled=true;
    try{
      const data=await api("GetForecastData",{
        Latitude:39.03,
        Longitude:-110.32,
        Variables:["Cloud","Seeing","Temperature"],
        ForecastLength:24,
        PrettyPrint:true
      });
      state.diagnostic+="\n\nKNOWN-GOOD ASTROSPHERIC EXAMPLE SITE (39.03, -110.32)\n"+JSON.stringify(data,null,2);
      $("diagBox").textContent=state.diagnostic;
      $("diagBox").classList.remove("hidden");
    }catch(error){
      state.diagnostic+="\n\nKNOWN-GOOD SITE TEST ERROR\n"+(error.stack||error.message||error);
      $("diagBox").textContent=state.diagnostic;
      $("diagBox").classList.remove("hidden");
    }finally{
      button.textContent=prior;
      button.disabled=false;
    }
  });

  $("quickLocationSelect").addEventListener("change",event=>{
    if(!state.settings?.locations?.some(location=>location.id===event.target.value))return;
    saveSettings({...state.settings,activeLocationId:event.target.value});
    state.selectedNightIndex=0;
    refresh();
  });

  $("refreshBtn").addEventListener("click",refresh);
  $("settingsBtn").addEventListener("click",showSetup);
  state.settings=storedSettings();
  if(state.settings)openDashboard();
  else showSetup();

  if("serviceWorker"in navigator&&location.protocol.startsWith("http")){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

if(typeof window!=="undefined"&&typeof document!=="undefined")initialize();

if(typeof module!=="undefined"){
  module.exports={
    state,
    ALERT_THRESHOLDS,
    normalizeBortle,
    normalizeAlertThreshold,
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
    summaryForNight
  };
}
