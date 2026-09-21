"use strict";
const TargetAdvisor=(()=>{
  const P=typeof module!=="undefined"?require("./planner.js"):TargetPlanner;
  const E=typeof module!=="undefined"?require("./equipment.js"):AstroEquipment;
  const F=typeof module!=="undefined"?require("./filters.js"):ImagingFilters;
  const O=typeof module!=="undefined"?require("./opportunities.js"):ImagingOpportunities;
  const J=typeof module!=="undefined"?require("./journal.js"):ObservingJournal;
  function propose({catalog,solar,date,site,timeZone,rig,mode,filter,policy="auto",includePlanned=false,minAltitude=30,data,journal=[]}){
    const scope=E.telescopes.find(t=>t.id===rig.telescopeId);
    const choices=policy==="selected"?[{rig,mode}]:[
      ...policy!=="planetary"?[{rig:E.resolve("z73","native","533"),mode:"deep-sky"},{rig:E.resolve("ultracat56","native","533"),mode:"deep-sky"}]:[],
      ...policy!=="deep-sky"?[{rig:E.resolve("c8","native","r6ii"),mode:"planetary"}]:[]
    ];
    const context=P.nightContext(date,site,timeZone),night=context.samples.filter(s=>s.sunAltitude<=-6);
    const moonBright=night.some(s=>s.moonAltitude>=15&&s.illumination>=.5);
    const candidates=[];
    for(const choice of choices){
      const targets=choice.mode==="planetary"?solar:catalog;
      for(const target of targets){
        const recommended=F.recommend(target,{rig:choice.rig,site,moonBright,includePlanned});
        const chosen=policy==="selected"?filter:recommended.filter;
        const result=P.evaluate(target,context,choice.rig,site,{minAltitude,filter:chosen});
        if(!result.geometryWindow)continue;
        const match=O.match(result,data,choice.rig,choice.mode,chosen,choice.mode==="planetary"?20:60),history=J.history(journal,target.id);
        const available=match.window?.minutes||0;
        const quality={supported:100,estimated:65,caution:45,unknown:0,stale:0,limited:-70,geometry:-100}[match.kind];
        const frame={comfortable:8,tight:0,small:-8,mosaic:-24,unknown:-5}[result.framing.kind];
        const rank=quality+Math.min(available/60,6)*3+(result.peak?.altitude||0)/15+(target.body?0:frame)-(result.darkSky?12:0)-(result.moonRisk?10:0)-(choice.rig.telescopeId==="ultracat56"?4:0)+history.rank;
        const reasons=[];
        if(target.body)reasons.push("Bright subject; steady air and altitude matter most.");
        else if(F.emission(target)&&chosen.kind==="dual-band")reasons.push("Emission-line target suited to Ha/O III imaging.");
        else reasons.push(result.framing.label+" with this rig.");
        if(result.darkSky)reasons.push("Faint structure favors the darker site.");
        if(result.moonRisk)reasons.push("Moonlight limits faint contrast.");
        if(history.state!=="unknown")reasons.push(history.label+".");
        if(choice.rig.telescopeId==="ultracat56")reasons.push("Verify the new rig's mount and camera connection.");
        if(choice.rig.telescopeId==="c8")reasons.push("Verify camera adapter, focus and clearance.");
        if(choice.rig.telescopeId==="c8"&&choice.mode==="deep-sky")reasons.push("Use short exposures: the 8SE alt-az mount has field rotation.");
        candidates.push({result,match,rig:choice.rig,mode:choice.mode,filter:chosen,rank,history,reasons});
      }
    }
    candidates.sort((a,b)=>b.rank-a.rank||a.result.target.id.localeCompare(b.result.target.id));
    const seen=new Set(),picks=candidates.filter(c=>{if(seen.has(c.result.target.id))return false;seen.add(c.result.target.id);return true}).slice(0,3);
    const promising=picks.some(c=>c.match.window);
    let heading=promising?"A few good starting points":"Keep these on the planning list";
    let summary=promising?(moonBright?"The bright Moon is up for part of the night. Favor bright subjects or emission lines when it interferes.":"Compare visibility, conditions and framing before choosing a rig."):data.stale?"Refresh conditions before deciding what to set up.":"No strong conditions match yet. These are visible candidates, not a setup recommendation.";
    if(policy==="selected")heading=`Ideas for your ${scope.shortName}`;
    return{heading,summary,picks,candidates,moonBright,promising};
  }
  return{propose};
})();
if(typeof module!=="undefined")module.exports=TargetAdvisor;
