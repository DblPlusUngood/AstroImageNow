"use strict";
// Shared meteorological fallback. Missing seeing/transparency are never synthesized.
const ForecastModel=(()=>{
  const finite=value=>typeof value==="number"&&Number.isFinite(value);
  const ms=value=>Date.parse(/Z$|[+-]\d\d:\d\d$/.test(value)?value:`${value}Z`);
  function rows(forecast,weather){
    const byTime=new Map();
    for(const row of forecast?.HourlyForecast||[])if(Number.isFinite(ms(row.UTCForecastHour)))byTime.set(ms(row.UTCForecastHour),{...row});
    const h=weather?.hourly||{};
    for(let i=0;i<(h.time?.length||0);i++){
      const time=ms(h.time[i]);if(!Number.isFinite(time))continue;
      const row=byTime.get(time)||{UTCForecastHour:new Date(time).toISOString()},fallback=[];
      const values={Cloud:h.cloud_cover?.[i],Wind:finite(h.wind_speed_10m?.[i])?h.wind_speed_10m[i]/2.236936:null,
        Temperature:finite(h.temperature_2m?.[i])?(h.temperature_2m[i]-32)*5/9+273.15:null,
        DewPoint:finite(h.dew_point_2m?.[i])?(h.dew_point_2m[i]-32)*5/9+273.15:null};
      for(const [key,value] of Object.entries(values))if(!finite(row[key]?.ActualValue)&&finite(value)){row[key]={ActualValue:value};fallback.push(key)}
      row.fallbackFields=fallback;row.weatherSource=weather.meta?.provider||"weather";byTime.set(time,row);
    }
    return[...byTime].sort((a,b)=>a[0]-b[0]).map(([,row])=>({...row,estimated:!!row.fallbackFields?.length||["Cloud","Transparency","Seeing","Wind","Temperature","DewPoint"].some(key=>!finite(row[key]?.ActualValue))}));
  }
  return{rows};
})();
if(typeof module!=="undefined")module.exports=ForecastModel;
