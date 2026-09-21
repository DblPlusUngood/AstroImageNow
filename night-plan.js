"use strict";
const NightPlan=(()=>{
  const F=typeof module!=="undefined"?require("./filters.js"):ImagingFilters;
  const quality=pick=>({supported:3,estimated:2,caution:1}[pick?.match.kind]||0);
  // Broadband filter choices share the same weather/Moon thresholds. Each site
  // may recommend a different one; never equate a dual-band and broadband train.
  const sameSetup=(a,b)=>a.result.target.id===b.result.target.id&&a.rig.id===b.rig.id&&
    (a.filter.id===b.filter.id||a.filter.kind!=="dual-band"&&b.filter.kind!=="dual-band");
  const filterFits=pick=>!(pick.filter.kind==="dual-band"&&!F.emission(pick.result.target))&&
    !(pick.mode==="planetary"&&pick.filter.id==="l-pro");
  function practical(pick){
    return filterFits(pick)&&quality(pick)>0&&pick.match.window?.minutes>=(pick.mode==="planetary"?20:60)&&
      (pick.mode==="planetary"||!["mosaic","unknown"].includes(pick.result.framing.kind));
  }
  function assess({site,data,advice}){
    const candidates=advice.candidates||advice.picks;
    if(candidates.length&&candidates.every(p=>!filterFits(p)))return{site,usable:[],candidates,state:"filter",reasons:[]};
    const usable=candidates.filter(practical);
    const uncertain=data.stale||!data.weather.length||candidates.some(p=>p.match.samples.some(s=>
      s.ms>=data.now&&p.result.threshold!==null&&s.sunAltitude<=p.result.threshold&&s.altitude>=p.result.minAltitude&&s.assessment.kind==="unknown"));
    const reasons=[...new Set(candidates.flatMap(p=>p.match.reasons))].filter(r=>r!=="Time has passed");
    return{site,usable,candidates,state:data.stale?"unknown":usable.length?"usable":uncertain?"unknown":"limited",reasons};
  }
  function choose({home,jgap,busy=false,missing=[]}){
    if(busy)return{state:"updating",heading:"Updating Home + JGAP",reason:"Checking both sites together."};
    if(missing.length||!home||!jgap)return{state:"unknown",heading:"Comparison incomplete",reason:`Check the saved ${missing.length?missing.join(" and "):"Home and JGAP"} profile${missing.length===1?"":"s"} in Settings.`};
    if(home.state==="filter"||jgap.state==="filter")return{state:"filter",heading:"Change the imaging filter",reason:"Choose Unfiltered or UV/IR-cut for natural-color planets and broadband targets. L-Ultimate is for emission-line targets."};
    if(home.state==="unknown"||jgap.state==="unknown"){
      const unavailable=[home.state==="unknown"&&"Home",jgap.state==="unknown"&&"JGAP"].filter(Boolean).join(" + ");
      return{state:"unknown",heading:"Travel choice not yet clear",reason:`${unavailable}: forecast is stale or incomplete. Refresh before deciding.`};
    }
    if(!home.usable.length&&!jgap.usable.length){
      const reasons=[...new Set([...home.reasons,...jgap.reasons])].filter(r=>!/estimate|unavailable|coverage|incomplete/.test(r)).slice(0,2);
      return{state:"neither",heading:"Neither site for this plan",reason:reasons.length?reasons.join(" · "):"No practical target window for this date, mode and altitude choice."};
    }
    let selected=home,primary=home.usable[0],reason="Comparable opportunities; Home is the simpler setup.";
    if(!primary){selected=jgap;primary=jgap.usable[0];reason="JGAP has a useful target window; Home has no practical match."}
    else{
      // Compare the same target and optics with comparable filters. Darkness alone is not a reason
      // to travel for planets; Bortle is site context, not a weather measurement.
      const advantage=jgap.usable.find(away=>{
        const here=home.usable.find(p=>sameSetup(p,away));
        if(!here||quality(away)<quality(primary)||quality(away)<quality(here))return false;
        if(away.match.window.minutes-here.match.window.minutes>=(away.mode==="planetary"?60:90))return true;
        return away.mode==="deep-sky"&&away.result.target.lightPollution==="high"&&away.filter.kind!=="dual-band"&&
          !away.result.moonRisk&&!here.result.moonRisk&&Number.isFinite(home.site.bortle)&&Number.isFinite(jgap.site.bortle)&&
          home.site.bortle-jgap.site.bortle>=2&&away.match.window.minutes>=120&&away.match.window.minutes>=here.match.window.minutes-30;
      });
      if(advantage){
        selected=jgap;primary=advantage;
        const here=home.usable.find(p=>sameSetup(p,primary));
        reason=primary.match.window.minutes-here.match.window.minutes>=(primary.mode==="planetary"?60:90)?"A substantially longer window for the same target and setup.":"Darker sky benefits this faint target, with a comparable weather window.";
      }else if(!jgap.usable.length)reason="Home has a useful target window; JGAP has no practical match.";
    }
    const others=selected.usable.filter(p=>p.result.target.id!==primary.result.target.id);
    const alternative=others.find(p=>p.rig.id===primary.rig.id&&p.filter.id===primary.filter.id)||others[0]||null;
    const estimated=primary.match.estimated||primary.match.kind==="estimated";
    return{state:selected===home?"home":"jgap",heading:`${estimated?"≈ ":""}${selected===home?"Plan for Home":"Consider JGAP"}`,reason,site:selected.site,primary,alternative,estimated};
  }
  return{assess,choose,practical};
})();
if(typeof module!=="undefined")module.exports=NightPlan;
