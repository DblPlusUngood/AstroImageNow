"use strict";

// Browser/Node shared provider boundary. Never return credentials or raw error bodies.
const AstroProviders=(()=>{
  const ASTRO_BASE="https://v2-api-public.astrospheric.com/api";
  const FORECA_BASE="https://weatherapi.foreca.net/api/v1";
  const WEATHER_BASE="https://api.open-meteo.com/v1/forecast";
  const AIR_BASE="https://air-quality-api.open-meteo.com/v1/air-quality";
  const HOUR=3600000;

  class ProviderError extends Error{
    constructor(provider,code,status=null){
      const descriptions={
        auth:"authentication was rejected. Check the saved API token/key",
        forbidden:"access was denied. Check the account permissions or credit allowance",
        rate:"request limit reached. Try again later",
        timeout:"request timed out",
        aborted:"request cancelled",
        network:"could not be reached (network or browser access error)",
        schema:"returned incomplete or invalid data",
        http:"request failed",
        missing:"token is not configured"
      };
      super(`${provider}: ${descriptions[code]||descriptions.http}${status?` (HTTP ${status})`:""}.`);
      this.name="ProviderError";this.code=code;this.status=status;this.provider=provider;
    }
  }

  function number(value,min=-Infinity,max=Infinity){
    if(!["number","string"].includes(typeof value)||typeof value==="string"&&!value.trim())return null;
    const n=Number(value);
    return Number.isFinite(n)&&n>=min&&n<=max?n:null;
  }

  function timeMs(value){
    if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value))return NaN;
    return Date.parse(/Z$|[+-]\d\d:\d\d$/.test(value)?value:`${value}Z`);
  }

  function roundedLocation(location){
    const lat=number(location?.lat,-90,90),lon=number(location?.lon,-180,180);
    if(lat===null||lon===null)throw new ProviderError("Location","schema");
    return{lat:Math.round(lat*100)/100,lon:Math.round(lon*100)/100};
  }

  async function requestJson(url,options={},provider,context={}){
    const controller=new AbortController();
    const cancel=()=>controller.abort();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort()},context.timeoutMs??12000);
    context.signal?.addEventListener("abort",cancel,{once:true});
    if(context.signal?.aborted)controller.abort();
    try{
      const response=await fetch(url,{...options,signal:controller.signal,cache:"no-store"});
      if(!response.ok){
        const code=response.status===401?"auth":response.status===403?"forbidden":response.status===429?"rate":"http";
        throw new ProviderError(provider,code,response.status);
      }
      let data;
      try{data=await response.json()}catch(error){
        if(controller.signal.aborted)throw error;
        throw new ProviderError(provider,"schema");
      }
      if(!data||typeof data!=="object"||Array.isArray(data)||data.ErrorInfo||data.error)throw new ProviderError(provider,"schema");
      return data;
    }catch(error){
      if(error instanceof ProviderError)throw error;
      throw new ProviderError(provider,timedOut?"timeout":context.signal?.aborted?"aborted":"network");
    }finally{
      clearTimeout(timer);
      context.signal?.removeEventListener("abort",cancel);
    }
  }

  function coverage(times){
    const sorted=times.map(timeMs).filter(Number.isFinite).sort((a,b)=>a-b);
    return sorted.length?{from:new Date(sorted[0]).toISOString(),through:new Date(sorted.at(-1)).toISOString(),hours:sorted.length}:null;
  }

  async function capture(id,run,context={}){
    try{
      const data=await run();
      const record={id,status:data.meta?.partial?"partial":"ok",fetchedAt:new Date().toISOString(),coverage:coverage(data.HourlyForecast?.map(r=>r.UTCForecastHour)||data.hourly?.time||data.forecast?.map(r=>r.time)||[]),modelTime:data.ModelTime||null,creditCost:number(data.APICreditCostOfCall,0),creditsRemaining:number(data.APICreditsRemaining,0),error:null};
      context.onStatus?.(record);
      return{data,record};
    }catch(error){
      const safe=error instanceof ProviderError?error:new ProviderError(id,"schema");
      const record={id,status:"failed",fetchedAt:null,attemptedAt:new Date().toISOString(),coverage:null,error:{code:safe.code,httpStatus:safe.status,message:safe.message}};
      context.onStatus?.(record);
      return{data:null,record};
    }
  }

  const ranges={Cloud:[0,100],Transparency:[0,100],Seeing:[0,5],Wind:[0,150],Temperature:[100,400],DewPoint:[100,400]};
  function normalizeAstronomy(data,variables){
    if(!Array.isArray(data.HourlyForecast))throw new ProviderError("Astrospheric","schema");
    let partial=false;
    const byTime=new Map();
    for(const raw of data.HourlyForecast){
      const ms=timeMs(raw.UTCForecastHour);
      if(!Number.isFinite(ms)){partial=true;continue}
      const row={UTCForecastHour:new Date(ms).toISOString()};
      for(const key of variables){
        const value=number(raw[key]?.ActualValue,...(ranges[key]||[]));
        if(value===null)partial=true;
        row[key]={ActualValue:value};
      }
      byTime.set(ms,row);
    }
    if(!byTime.size)throw new ProviderError("Astrospheric","schema");
    let zone="Etc/UTC";
    try{new Intl.DateTimeFormat("en",{timeZone:data.TimeZone});zone=data.TimeZone||zone}catch{partial=true}
    return{TimeZone:zone,ModelTime:data.ModelTime||null,APICreditCostOfCall:number(data.APICreditCostOfCall,0),APICreditsRemaining:number(data.APICreditsRemaining,0),HourlyForecast:[...byTime].sort((a,b)=>a[0]-b[0]).map(x=>x[1]),meta:{partial}};
  }

  function astronomy(endpoint,body,key,context={}){
    if(!key)return Promise.reject(new ProviderError("Astrospheric","missing"));
    return requestJson(`${ASTRO_BASE}/${endpoint}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,APIKey:key})},"Astrospheric",context);
  }

  function mergeAstronomy(core,extra){
    const data=core||extra;
    if(!data)return null;
    // Never mix model runs. The next refresh can retrieve a coherent pair.
    const mismatch=core&&extra&&core.ModelTime&&extra.ModelTime&&core.ModelTime!==extra.ModelTime;
    const byTime=new Map();
    for(const source of mismatch?[core]:[core,extra])for(const row of source?.HourlyForecast||[])byTime.set(row.UTCForecastHour,{...byTime.get(row.UTCForecastHour),...row});
    return{...data,HourlyForecast:[...byTime.values()].sort((a,b)=>Date.parse(a.UTCForecastHour)-Date.parse(b.UTCForecastHour)),meta:{partial:!core||!extra||!!mismatch||core.meta?.partial||extra.meta?.partial,modelMismatch:!!mismatch}};
  }

  function normalizeForecaWeather(currentData,hourlyData,airData={}){
    const current=currentData?.current||{};
    const raw=hourlyData?.forecast;
    if(!Array.isArray(raw))throw new ProviderError("Foreca hourly","schema");
    const forecast=[...new Map(raw.filter(r=>Number.isFinite(timeMs(r.time))).map(r=>[timeMs(r.time),r])).values()].sort((a,b)=>timeMs(a.time)-timeMs(b.time));
    if(!forecast.length)throw new ProviderError("Foreca hourly","schema");
    const air=new Map((airData?.forecast||[]).map(r=>[timeMs(r.time),r]));
    const pick=(key,min=-Infinity,max=Infinity)=>forecast.map(r=>number(r[key],min,max));
    const inches=value=>{const n=number(value,0);return n===null?null:n/25.4};
    return{
      meta:{provider:"foreca",label:"Weather data by Foreca",url:"https://www.foreca.com/",hasAirQuality:air.size>0,partial:forecast.length!==raw.length||!currentData?.current},
      current:{time:current.time||null,temperature_2m:number(current.temperature,-150,150),apparent_temperature:number(current.feelsLikeTemp,-150,200),relative_humidity_2m:number(current.relHumidity,0,100),weather_code:null,weather_phrase:typeof current.symbolPhrase==="string"?current.symbolPhrase:"",precipitation:inches(current.precipAccum),visibility:number(current.visibility,0),wind_gusts_10m:number(current.windGust,0,350)},
      hourly_units:{temperature_2m:"°F",precipitation:"inch",visibility:"m",wind_gusts_10m:"mph"},
      hourly:{time:forecast.map(r=>new Date(timeMs(r.time)).toISOString()),temperature_2m:pick("temperature",-150,150),relative_humidity_2m:pick("relHumidity",0,100),dew_point_2m:pick("dewPoint",-150,150),wind_speed_10m:pick("windSpeed",0,350),precipitation_probability:pick("precipProb",0,100),precipitation:forecast.map(r=>inches(r.precipAccum)),weather_code:forecast.map(()=>null),weather_phrase:forecast.map(r=>typeof r.symbolPhrase==="string"?r.symbolPhrase:""),thunder_probability:pick("thunderProb",0,100),cloud_cover:pick("cloudiness",0,100),visibility:pick("visibility",0),wind_gusts_10m:pick("windGust",0,350),us_aqi:forecast.map(r=>number(air.get(timeMs(r.time))?.AQI,0)),us_aqi_pm2_5:forecast.map(r=>number(air.get(timeMs(r.time))?.AQI_PM2P5,0))}
    };
  }

  async function fetchForeca(location,token,context={}){
    if(!token)throw new ProviderError("Foreca","missing");
    const point=roundedLocation(location);
    const coordinate=`${point.lon},${point.lat}`;
    const headers={Authorization:`Bearer ${token.trim()}`};
    const query="dataset=full&tempunit=F&windunit=MPH&tz=UTC";
    // Keep low-tier request-per-second limits happy and make optional failures independent.
    const hourly=await capture("foreca-hourly",async()=>{
      const data=await requestJson(`${FORECA_BASE}/forecast/hourly/${coordinate}?periods=168&${query}`,{headers},"Foreca hourly",context);
      normalizeForecaWeather(null,data);
      return data;
    },context);
    if(!hourly.data)throw new ProviderError("Foreca hourly",hourly.record.error.code,hourly.record.error.httpStatus);
    const current=await capture("foreca-current",async()=>{
      const data=await requestJson(`${FORECA_BASE}/current/${coordinate}?${query}`,{headers},"Foreca current",context);
      if(!data.current||number(data.current.temperature,-150,150)===null)throw new ProviderError("Foreca current","schema");
      return data;
    },context);
    const air=await capture("foreca-air",async()=>{
      const data=await requestJson(`${FORECA_BASE}/air-quality/forecast/hourly/${coordinate}?periods=84&tz=UTC`,{headers},"Foreca air quality",context);
      if(!Array.isArray(data.forecast)||!data.forecast.some(r=>Number.isFinite(timeMs(r.time))&&number(r.AQI,0)!==null))throw new ProviderError("Foreca air quality","schema");
      return data;
    },context);
    const data=normalizeForecaWeather(current.data,hourly.data,air.data);
    data.meta.fetchedAt=hourly.record.fetchedAt;
    data.meta.partial||=!current.data||!air.data;
    data.meta.notices=[!current.data?current.record.error.message:"",!air.data?air.record.error.message:""].filter(Boolean);
    return data;
  }

  function normalizeOpenWeather(data){
    if(!Array.isArray(data.hourly?.time)||!data.hourly.time.some(t=>Number.isFinite(timeMs(t))))throw new ProviderError("Open-Meteo","schema");
    const bounds={temperature_2m:[-150,150],dew_point_2m:[-150,150],wind_speed_10m:[0,350],relative_humidity_2m:[0,100],precipitation_probability:[0,100],precipitation:[0,Infinity],weather_code:[0,99],visibility:[0,Infinity],wind_gusts_10m:[0,350],cloud_cover:[0,100]};
    const indexes=data.hourly.time.map((t,i)=>[timeMs(t),i]).filter(x=>Number.isFinite(x[0])).sort((a,b)=>a[0]-b[0]);
    const hourly={time:indexes.map(([ms])=>new Date(ms).toISOString())};
    for(const[key,range]of Object.entries(bounds))hourly[key]=indexes.map(([,i])=>number(data.hourly[key]?.[i],...range));
    return{meta:{provider:"open-meteo",label:"Weather data by Open-Meteo",url:"https://open-meteo.com/",hasAirQuality:false},current:{time:data.current?.time||null,temperature_2m:number(data.current?.temperature_2m,-150,150),apparent_temperature:number(data.current?.apparent_temperature,-150,200)},hourly_units:{visibility:data.hourly_units?.visibility||"m",precipitation:"inch"},hourly};
  }

  async function fetchOpenMeteo(location,context={}){
    const p=roundedLocation(location);
    const params=new URLSearchParams({latitude:p.lat,longitude:p.lon,current:"temperature_2m,apparent_temperature",hourly:"temperature_2m,dew_point_2m,relative_humidity_2m,wind_speed_10m,precipitation_probability,precipitation,weather_code,visibility,wind_gusts_10m,cloud_cover",temperature_unit:"fahrenheit",wind_speed_unit:"mph",precipitation_unit:"inch",timezone:"GMT",forecast_days:"8"});
    const weather=await capture("open-meteo-weather",async()=>normalizeOpenWeather(await requestJson(`${WEATHER_BASE}?${params}`,{},"Open-Meteo",context)),context);
    if(!weather.data)throw new ProviderError("Open-Meteo",weather.record.error.code,weather.record.error.httpStatus);
    const airParams=new URLSearchParams({latitude:p.lat,longitude:p.lon,hourly:"us_aqi,us_aqi_pm2_5,pm2_5,aerosol_optical_depth",timezone:"GMT",forecast_days:"5"});
    const air=await capture("open-meteo-air",async()=>{
      const data=await requestJson(`${AIR_BASE}?${airParams}`,{},"Open-Meteo air quality",context);
      if(!Array.isArray(data.hourly?.time)||!data.hourly.time.length)throw new ProviderError("Open-Meteo air quality","schema");
      return data;
    },context);
    const data=weather.data;
    data.meta.fetchedAt=weather.record.fetchedAt;
    data.meta.hasAirQuality=!!air.data;
    if(air.data){
      const byTime=new Map(air.data.hourly.time.map((t,i)=>[timeMs(t),i]));
      for(const key of["us_aqi","us_aqi_pm2_5","pm2_5","aerosol_optical_depth"])data.hourly[key]=data.hourly.time.map(t=>number(air.data.hourly[key]?.[byTime.get(timeMs(t))],0));
    }
    data.meta.notices=air.data?[]:[air.record.error.message];
    return data;
  }

  async function supplemental(location,settings,context={}){
    if(settings.weatherSource==="open-meteo")return fetchOpenMeteo(location,context);
    try{return await fetchForeca(location,settings.forecaToken,context)}catch(error){
      if(context.signal?.aborted||settings.weatherSource==="foreca")throw error;
      const data=await fetchOpenMeteo(location,context);
      data.meta.fallbackFrom="foreca";
      data.meta.fallbackReason=error instanceof ProviderError?error.message:"Foreca unavailable.";
      data.meta.notice=`${data.meta.fallbackReason} Using Open-Meteo backup.`;
      return data;
    }
  }

  return{ASTRO_BASE,FORECA_BASE,HOUR,ProviderError,number,timeMs,coverage,roundedLocation,requestJson,capture,normalizeAstronomy,astronomy,mergeAstronomy,normalizeForecaWeather,normalizeOpenWeather,fetchForeca,fetchOpenMeteo,supplemental};
})();
if(typeof module!=="undefined")module.exports=AstroProviders;
