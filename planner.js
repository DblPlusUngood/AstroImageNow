"use strict";
const TargetPlanner=(()=>{
  const A=typeof module!=="undefined"?require("./vendor/astronomy.browser.min.js"):Astronomy;
  const STEP=10*60000,MINUTE=60000;
  const cache=new Map(),solarCache=new Map();
  const radians=Math.PI/180;
  function validDate(value){return typeof value==="string"&&/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value}
  function dateAt(time,timeZone){return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(time))}
  function addDays(date,days){if(!validDate(date))throw Error("Choose a valid date.");const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
  function zonedNoon(date,timeZone){
    if(!validDate(date))throw Error("Choose a valid date.");
    const desired=Date.parse(`${date}T12:00:00Z`);
    let guess=desired;
    const formatter=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
    for(let i=0;i<3;i++){
      const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
      const asUTC=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
      guess+=desired-asUTC;
    }
    return guess;
  }
  function observerFor(site){
    if(!Number.isFinite(site?.lat)||Math.abs(site.lat)>90||!Number.isFinite(site?.lon)||Math.abs(site.lon)>180)throw Error("Select a valid observing site.");
    return new A.Observer(site.lat,site.lon,Number.isFinite(site.elevationM)?site.elevationM:0);
  }
  function vectorFor(target,time){
    if(target.epoch!=="J2000"||!Number.isFinite(target.raHours)||target.raHours<0||target.raHours>=24||!Number.isFinite(target.decDeg)||Math.abs(target.decDeg)>90)throw Error("Target coordinates unavailable.");
    return A.VectorFromSphere(new A.Spherical(target.decDeg,target.raHours*15,1),time);
  }
  function altitude(vector,rotation){return A.HorizonFromVector(A.RotateVector(rotation,vector),null)}
  function position(target,date,site){
    const time=A.MakeTime(new Date(date)),observer=observerFor(site);
    const h=altitude(vectorFor(target,time),A.Rotation_EQJ_HOR(time,observer));
    return{altitude:h.lat,azimuth:h.lon};
  }
  function sunAltitude(date,site){
    const key=JSON.stringify([date,site.lat,site.lon,site.elevationM||0]);
    if(solarCache.has(key))return solarCache.get(key);
    const time=A.MakeTime(new Date(date)),observer=observerFor(site);
    const value=altitude(A.Equator(A.Body.Sun,time,observer,false,true).vec,A.Rotation_EQJ_HOR(time,observer)).lat;
    if(solarCache.size>=2000)solarCache.clear();
    solarCache.set(key,value);return value;
  }
  function nightContext(date,site,timeZone){
    const key=JSON.stringify([date,site.lat,site.lon,site.elevationM||0,timeZone]);
    if(cache.has(key))return cache.get(key);
    const observer=observerFor(site),start=zonedNoon(date,timeZone),end=zonedNoon(addDays(date,1),timeZone),samples=[];
    for(let ms=start;ms<=end;ms+=STEP){
      const time=A.MakeTime(new Date(ms)),rotation=A.Rotation_EQJ_HOR(time,observer);
      const sun=A.Equator(A.Body.Sun,time,observer,false,true).vec;
      const moon=A.Equator(A.Body.Moon,time,observer,false,true).vec;
      samples.push({ms,rotation,sunAltitude:altitude(sun,rotation).lat,moonAltitude:altitude(moon,rotation).lat,moonVector:moon,illumination:A.Illumination(A.Body.Moon,time).phase_fraction});
    }
    const threshold=samples.some(p=>p.sunAltitude<=-18)?-18:samples.some(p=>p.sunAltitude<=-12)?-12:null;
    const result={date,timeZone,start,end,samples,threshold,stepMinutes:10};
    if(cache.size>=20)cache.delete(cache.keys().next().value);
    cache.set(key,result);return result;
  }
  function longestWindow(samples,predicate){
    let best=[],current=[];
    for(const sample of samples){
      if(predicate(sample))current.push(sample);
      else{if(current.length>best.length)best=current;current=[]}
    }
    if(current.length>best.length)best=current;
    return best.length>1?{start:best[0].ms,end:best.at(-1).ms,minutes:(best.at(-1).ms-best[0].ms)/MINUTE,samples:best}:null;
  }
  function fieldOfView(rig){
    if(![rig?.focalLengthMm,rig?.sensorWidthMm,rig?.sensorHeightMm,rig?.pixelSizeUm].every(x=>Number.isFinite(x)&&x>0))return null;
    return{widthDeg:2*Math.atan(rig.sensorWidthMm/(2*rig.focalLengthMm))/radians,heightDeg:2*Math.atan(rig.sensorHeightMm/(2*rig.focalLengthMm))/radians,pixelScale:206.264806*rig.pixelSizeUm/rig.focalLengthMm};
  }
  function framing(target,rig){
    const field=fieldOfView(rig);
    if(!field||!target.framingReliable||!Number.isFinite(target.majorArcmin)||target.majorArcmin<=0)return{kind:"unknown",label:"Framing needs checking",field};
    const major=target.majorArcmin,minor=Number.isFinite(target.minorArcmin)&&target.minorArcmin>0?target.minorArcmin:major;
    const width=field.widthDeg*60,height=field.heightDeg*60;
    // Conservative rectangle, allowing deliberate camera rotation. Unknown minor axis uses a major-diameter square.
    let fill=Infinity,rotationDeg=0;
    for(let angle=0;angle<=90;angle++){
      const c=Math.cos(angle*radians),s=Math.sin(angle*radians);
      const ratio=Math.max((major*c+minor*s)/width,(major*s+minor*c)/height);
      if(ratio<fill){fill=ratio;rotationDeg=angle}
    }
    const kind=fill>1?"mosaic":fill>.85?"tight":fill<.25?"small":"comfortable";
    const label={mosaic:"Crop or mosaic",tight:"Tight fit",small:"Small in the frame",comfortable:"Comfortable fit"}[kind];
    return{kind,label,fill,rotationDeg,field,conservativeMinor:!target.minorArcmin};
  }
  function moonCaution(target,sample,filter){
    if(sample.moonAltitude<=0||sample.illumination<.25)return false;
    if(["cluster","globular","planetary-nebula"].includes(target.objectType))return sample.illumination>=.5&&sample.moonSeparation<30;
    const emission=["emission","supernova"].includes(target.objectType);
    const limit=emission&&filter?.kind==="dual-band"?35:target.lightPollution==="high"?75:55;
    return sample.moonSeparation<limit;
  }
  function filterAdvice(target,filter,site){
    const emission=["emission","supernova"].includes(target.objectType);
    if(filter?.kind==="dual-band")return emission?"Selected dual-band filter suits emission lines; it cannot recover detail lost to cloud or haze.":"Use unfiltered/broadband for this target; a dual-band filter discards much of its continuum light.";
    if(filter?.id==="l-pro")return emission?"L-Pro is a broadband light-pollution filter, not a dual-band filter. Judge it against your unfiltered baseline.":"L-Pro is optional; compare with unfiltered data. It cannot replace darker sky for faint broadband structure.";
    return emission?"Unfiltered imaging is possible; light pollution and Moon remain limiting factors.":"Unfiltered is a useful broadband baseline; darker sky improves faint structure.";
  }
  function evaluate(target,context,rig,site,{minAltitude=30,filter=null}={}){
    if(!Number.isFinite(minAltitude)||minAltitude<15||minAltitude>75)throw Error("Altitude threshold must be between 15° and 75°.");
    const vector=vectorFor(target,new Date(context.start));
    const samples=context.samples.map(sample=>{
      const h=altitude(vector,sample.rotation);
      return{...sample,altitude:h.lat,azimuth:h.lon,moonSeparation:A.AngleBetween(vector,sample.moonVector)};
    });
    const dark=p=>context.threshold!==null&&p.sunAltitude<=context.threshold;
    const useful=p=>dark(p)&&p.altitude>=minAltitude;
    const geometryWindow=longestWindow(samples,useful);
    const moonWindow=longestWindow(samples,p=>useful(p)&&!moonCaution(target,p,filter));
    const window=moonWindow?.minutes>=60?moonWindow:geometryWindow;
    const darkSamples=samples.filter(dark);
    const peak=darkSamples.length?darkSamples.reduce((a,b)=>a.altitude>b.altitude?a:b):null;
    const framingResult=framing(target,rig);
    const selected=window?.samples||[];
    const moonUp=selected.filter(p=>p.moonAltitude>0);
    const moonRisk=selected.some(p=>moonCaution(target,p,filter));
    const separation=moonUp.length?Math.min(...moonUp.map(p=>p.moonSeparation)):null;
    const illumination=moonUp.length?Math.max(...moonUp.map(p=>p.illumination)):null;
    const darkSky=target.lightPollution==="high"&&Number.isFinite(site.bortle)&&site.bortle>=6;
    let band="Promising geometry";
    if(!window)band=context.threshold===null?"No dark window":"Too low in darkness";
    else if(window.minutes<60)band="Short window";
    else if(framingResult.kind==="mosaic")band="Crop / mosaic project";
    else if(darkSky)band="Dark-sky priority";
    else if(moonRisk)band="Moon caution";
    else if(["small","unknown","tight"].includes(framingResult.kind))band=framingResult.label;
    // Internal ordering only: these weights are editorial heuristics, not an imaging-quality score.
    const framingPenalty={mosaic:20,unknown:8,small:12,tight:4,comfortable:0}[framingResult.kind];
    const rank=!window?-1000:(window.minutes/60)*5+(peak?.altitude||0)/10-(moonRisk?15:0)-(darkSky?12:0)-framingPenalty;
    return{target,samples,window,geometryWindow,peak,framing:framingResult,moonRisk,moonMinSeparation:separation,moonIllumination:illumination,moonBelowThroughout:!!selected.length&&!moonUp.length,darkSky,band,rank,minAltitude,filterAdvice:filterAdvice(target,filter,site)};
  }
  function plan(catalog,date,site,timeZone,rig,options={}){
    const context=nightContext(date,site,timeZone);
    const results=catalog.map(target=>evaluate(target,context,rig,site,options)).sort((a,b)=>b.rank-a.rank||a.target.id.localeCompare(b.target.id));
    return{context,results};
  }
  function normalizePlans(raw,catalog,sites,rigs){
    if(!Array.isArray(raw))return[];
    const seen=new Set();
    return raw.filter(p=>{
      if(!p||!validDate(p.date)||!catalog.some(t=>t.id===p.targetId)||!sites.some(s=>s.id===p.siteId)||!rigs.some(r=>r.id===p.rigId))return false;
      const key=[p.date,p.siteId,p.rigId,p.targetId].join("|");if(seen.has(key))return false;seen.add(key);return true;
    }).slice(0,100).map(p=>({date:p.date,siteId:p.siteId,rigId:p.rigId,targetId:p.targetId,
      filterId:rigs.find(r=>r.id===p.rigId).filters.some(f=>f.id===p.filterId)?p.filterId:"none",
      minAltitude:[20,30,40,50].includes(p.minAltitude)?p.minAltitude:30,
      status:"planned",createdAt:typeof p.createdAt==="string"?p.createdAt:null}));
  }
  return{validDate,dateAt,addDays,zonedNoon,observerFor,position,sunAltitude,nightContext,longestWindow,fieldOfView,framing,moonCaution,filterAdvice,evaluate,plan,normalizePlans};
})();
if(typeof module!=="undefined")module.exports=TargetPlanner;
