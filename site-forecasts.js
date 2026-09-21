"use strict";
const SiteForecasts=(()=>{
  const Providers=typeof module!=="undefined"?require("./providers.js"):AstroProviders;
  const KEY="astroImageNowSiteForecastsV1";
  const key=(site,settings)=>JSON.stringify([site.id,site.lat,site.lon,settings.weatherSource]);
  function pair(sites=[]){
    // Resolve existing profiles, including generated IDs. Never invent coordinates or
    // choose an arbitrary profile when names are ambiguous.
    const unique=predicate=>{const matches=sites.filter(predicate);return matches.length===1?matches[0]:null};
    const home=unique(s=>s.id==="home"||/^home\b/i.test(s.name||""));
    const jgap=unique(s=>s.id==="jgap"||/\bjgap\b|john glenn astro(?:nomy)? park/i.test(s.name||""));
    if(home&&home===jgap)return{home:null,jgap:null,sites:[],missing:["Home","JGAP"]};
    return{home,jgap,sites:[home,jgap].filter(Boolean),missing:[!home&&"Home",!jgap&&"JGAP"].filter(Boolean)};
  }
  function create(storage){
    let entries=new Map(),generation=0,controller=null;
    try{
      const saved=JSON.parse(storage?.getItem(KEY)||"null");
      if(saved?.version===1&&Array.isArray(saved.entries))for(const [id,value] of saved.entries.slice(0,10))if(typeof id==="string"&&value&&typeof value==="object")entries.set(id,{forecast:value.forecast,weather:value.weather,forecastStale:true,weatherStale:true});
    }catch{}
    function get(site,settings){return entries.get(key(site,settings))||null}
    function put(site,settings,value){
      // Whitelist forecast fields; never persist settings, tokens or requests.
      const id=key(site,settings);entries.delete(id);
      entries.set(id,{forecast:value.forecast||null,weather:value.weather||null,forecastStale:!!value.forecastStale,weatherStale:!!value.weatherStale});
      while(entries.size>10)entries.delete(entries.keys().next().value);
      try{storage?.setItem(KEY,JSON.stringify({version:1,entries:[...entries]}))}catch{}
    }
    function cancel(){generation++;controller?.abort();controller=null}
    async function refresh(sites,settings,onChange=()=>{}){
      cancel();const id=generation;controller=new AbortController();
      const context={signal:controller.signal};
      const captured={...settings};
      for(const site of sites.map(s=>({...s}))){
        if(id!==generation)return;
        const previous=get(site,captured);
        put(site,captured,{...previous,forecastStale:true,weatherStale:true});onChange();
        const common={Latitude:site.lat,Longitude:site.lon};
        const results=await Promise.all([
          Providers.capture("comparison-weather",()=>Providers.supplemental(site,captured,context),context),
          ...[["Cloud","Seeing","Temperature"],["Transparency","DewPoint","Wind"]].map((variables,i)=>Providers.capture(`comparison-astronomy-${i}`,async()=>Providers.normalizeAstronomy(await Providers.astronomy("GetForecastData",{...common,ForecastLength:168,Variables:variables},captured.apiKey,context),variables),context))
        ]);
        if(id!==generation)return;
        const forecast=Providers.mergeAstronomy(results[1].data,results[2].data);
        if(forecast)forecast.meta.fetchedAt=results.slice(1).filter(r=>r.data).map(r=>r.record.fetchedAt).sort().at(-1);
        put(site,captured,{forecast:forecast||previous?.forecast,weather:results[0].data||previous?.weather,forecastStale:!forecast&&!!previous?.forecast,weatherStale:!results[0].data&&!!previous?.weather});onChange();
      }
    }
    return{get,put,cancel,refresh};
  }
  return{create,key,pair};
})();
if(typeof module!=="undefined")module.exports=SiteForecasts;
