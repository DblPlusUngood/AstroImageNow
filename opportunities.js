"use strict";
const ImagingOpportunities=(()=>{
  const P=typeof module!=="undefined"?require("./planner.js"):TargetPlanner;
  const Forecast=typeof module!=="undefined"?require("./forecast-model.js"):ForecastModel;
  const HOUR=3600000,MAX_AGE=3*HOUR;
  // Both neighboring hourly samples must support an interval. Never extrapolate over gaps.
  function bracket(rows,ms){
    let low=null;
    for(const row of rows){
      if(row.ms===ms)return[row];
      if(row.ms>ms)return low&&row.ms-low.ms<=HOUR?[low,row]:null;
      low=row;
    }
    return null;
  }
  function prepare(snapshot,summarizeWeather,now=Date.now()){
    const fresh=data=>{const age=now-Date.parse(data?.meta?.fetchedAt);return Number.isFinite(age)&&age>=-60000&&age<=MAX_AGE};
    return{
      stale:!!snapshot&&(snapshot.forecastStale||snapshot.weatherStale||(snapshot.forecast&&!fresh(snapshot.forecast))||(snapshot.weather&&!fresh(snapshot.weather))),
      astronomy:Forecast.rows(snapshot?.forecast,snapshot?.weather).map(row=>({ms:Date.parse(row.UTCForecastHour),row})).filter(r=>Number.isFinite(r.ms)).sort((a,b)=>a.ms-b.ms),
      weather:(snapshot?.weather?.hourly?.time||[]).map(time=>({ms:Date.parse(time),summary:summarizeWeather([{UTCForecastHour:time}],snapshot.weather)})).filter(r=>Number.isFinite(r.ms)).sort((a,b)=>a.ms-b.ms),
      provider:snapshot?.weather?.meta?.provider||null,now
    };
  }
  function assess(ms,data,rig,mode){
    if(ms<data.now)return{kind:"unknown",reason:"Time has passed"};
    if(data.stale)return{kind:"unknown",reason:"Saved forecast is stale"};
    const astro=bracket(data.astronomy,ms),weather=bracket(data.weather,ms);
    if(!weather)return{kind:"unknown",reason:"No weather coverage"};
    const summaries=weather.map(r=>r.summary);
    const danger=summaries.find(s=>s?.severity==="danger");
    if(danger)return{kind:"blocked",reason:danger.watch};
    if(summaries.some(s=>!s?.complete))return{kind:"unknown",reason:"Hazard data incomplete"};
    if(!astro)return{kind:"unknown",reason:"No astronomy coverage"};
    const needs=["Cloud","Wind"];
    if(astro.some(({row})=>needs.some(key=>!Number.isFinite(row[key]?.ActualValue))))return{kind:"unknown",reason:"Astronomy detail incomplete"};
    const measured=key=>astro.every(r=>Number.isFinite(r.row[key]?.ActualValue));
    const available=key=>astro.map(r=>r.row[key]?.ActualValue).filter(Number.isFinite);
    const estimated=astro.some(r=>r.row.estimated)||(mode==="planetary"?!measured("Seeing"):!measured("Transparency"));
    const worst=key=>Math.max(...astro.map(r=>r.row[key]?.ActualValue));
    if(worst("Cloud")>40)return{kind:"limited",reason:"Cloud cover above 40%"};
    if(worst("Wind")*2.236936>12)return{kind:"limited",reason:"Sustained wind above 12 mph"};
    if(mode==="planetary"){
      const minimum=rig.configurationId==="barlow"?4:3;
      if(available("Seeing").some(value=>value<minimum))return{kind:"limited",reason:`Seeing below ${minimum}/5 for this configuration`};
    }else{
      if(available("Transparency").some(value=>value>13))return{kind:"limited",reason:"Transparency is limiting"};
      if(rig.focalLengthMm>=1000&&available("Seeing").some(value=>value<3))return{kind:"limited",reason:"Seeing below 3/5 for long focal length"};
    }
    const watch=summaries.find(s=>s.severity==="watch");
    if(watch)return{kind:"caution",reason:watch.watch,estimated};
    const dew=astro.map(({row})=>Number.isFinite(row.Temperature?.ActualValue)&&Number.isFinite(row.DewPoint?.ActualValue)?(row.Temperature.ActualValue-row.DewPoint.ActualValue)*9/5:null);
    if(dew.some(value=>value===null))return{kind:"caution",reason:"Dew margin unavailable",estimated:true};
    if(Math.min(...dew)<4)return{kind:"caution",reason:"Narrow dew margin; plan dew control",estimated};
    if(estimated)return{kind:"estimated",estimated:true,reason:mode==="planetary"?"Weather estimate; seeing may be unavailable":"Weather estimate; transparency or seeing may be unavailable"};
    return{kind:"supported",reason:mode==="planetary"?"Cloud, seeing and wind align":"Cloud, transparency and wind align"};
  }
  function match(result,data,rig,mode,filter=null,minWindowMinutes=0){
    const samples=result.samples.map(s=>{
      let assessment=assess(s.ms,data,rig,mode);
      if(mode!=="planetary"&&["supported","estimated"].includes(assessment.kind)&&P.moonCaution(result.target,s,filter))assessment={kind:"caution",reason:"Moonlight caution",estimated:assessment.estimated};
      return{...s,assessment};
    });
    const eligible=s=>s.sunAltitude<=result.threshold&&s.altitude>=result.minAltitude&&result.threshold!==null;
    const usable=window=>window&&window.minutes>=minWindowMinutes?window:null;
    const supported=usable(P.longestWindow(samples,s=>eligible(s)&&s.assessment.kind==="supported"));
    const estimate=usable(P.longestWindow(samples,s=>eligible(s)&&["supported","estimated"].includes(s.assessment.kind)));
    const caution=usable(P.longestWindow(samples,s=>eligible(s)&&["supported","estimated","caution"].includes(s.assessment.kind)));
    const window=supported||estimate||caution;
    const counts=new Map();
    for(const s of samples.filter(eligible))if(s.assessment.kind!=="supported")counts.set(s.assessment.reason,(counts.get(s.assessment.reason)||0)+1);
    const reasons=[...counts].sort((a,b)=>b[1]-a[1]).map(([reason])=>reason);
    const kind=supported?"supported":estimate?"estimated":caution?"caution":!result.geometryWindow?"geometry":data.stale?"stale":reasons.some(r=>/coverage|incomplete/.test(r))?"unknown":"limited";
    const estimated=!!window?.samples.some(s=>s.assessment.estimated);
    const label={supported:"Forecast-supported window",estimated:"≈ Weather-based window",caution:`${estimated?"≈ ":""}Window with caution`,geometry:"No usable altitude window",stale:"Stale forecast · geometry only",unknown:"Forecast coverage incomplete",limited:"No matching forecast window"}[kind];
    return{kind,label,window,reasons,samples,estimated};
  }
  return{bracket,prepare,assess,match,MAX_AGE};
})();
if(typeof module!=="undefined")module.exports=ImagingOpportunities;
