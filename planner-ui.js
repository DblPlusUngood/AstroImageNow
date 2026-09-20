"use strict";
const TargetPlannerUI=(()=>{
  const P=TargetPlanner,C=AstroCatalog,E=AstroEquipment,O=ImagingOpportunities,allTargets=[...C.targets,...SolarSystemTargets];
  const KEY="astroImageNowPlannerV1";
  let context=null,preferences={date:null,followNight:true,targetId:null,rigId:"z73-533",mode:"deep-sky",filterId:"l-pro",minAltitude:30},plans=[],query="",initialized=false;
  let calculatedKey=null,calculated=null,notice="";
  const $=id=>document.getElementById(id);
  function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node}
  function rig(){return E.rigs.find(r=>r.id===preferences.rigId)||E.rigs[0]}
  function options(id,items,value){$(id).replaceChildren(...items.map(item=>{const option=el("option",item.name);option.value=item.id;return option}));$(id).value=value}
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify({version:1,preferences,plans}));notice=""}catch{notice="The plan is visible, but this browser could not save it. Keep the app open until you have copied the details."}
  }
  function read(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||"null");
      if(saved?.version!==1)return;
      const p=saved.preferences||{},selected=E.rigs.find(r=>r.id===p.rigId)||E.rigs[0];
      preferences={date:P.validDate(p.date)?p.date:null,followNight:p.followNight!==false,targetId:allTargets.some(t=>t.id===p.targetId)?p.targetId:null,rigId:selected.id,mode:["deep-sky","planetary"].includes(p.mode)?p.mode:selected.mode,filterId:selected.filters.some(f=>f.id===p.filterId)?p.filterId:selected.filters[0].id,minAltitude:[20,30,40,50].includes(p.minAltitude)?p.minAltitude:30};
      plans=Array.isArray(saved.plans)?saved.plans:[];
    }catch{notice="Saved target planning data could not be read. Your forecast settings are separate."}
  }
  function fmt(ms,zone=context.timeZone){return new Intl.DateTimeFormat("en-US",{timeZone:zone,hour:"numeric",minute:"2-digit"}).format(new Date(ms))}
  function span(window,zone=context.timeZone){return window?`${fmt(window.start,zone)}–${fmt(window.end,zone)} · ${(window.minutes/60).toFixed(1)} h`:"No usable window"}
  function date(){return preferences.followNight?context.nightDate:preferences.date||context.nightDate}
  function button(text,handler){const b=el("button",text,"btn");b.type="button";b.addEventListener("click",handler);return b}
  function resetSearch(){query="";$("plannerSearch").value="";preferences.targetId=null}
  function selectRig(scope,configuration,camera,power){
    const selected=E.resolve(scope,configuration,camera,power);preferences.rigId=selected.id;
    if(!selected.filters.some(f=>f.id===preferences.filterId))preferences.filterId="none";
    persist();render(context);
  }
  function init(){
    if(initialized)return;initialized=true;read();
    let resizeTimer;
    window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(context),100)});
    $("plannerScope").addEventListener("change",event=>{const scope=E.telescopes.find(s=>s.id===event.target.value);preferences.mode=scope.mode;resetSearch();selectRig(scope.id,"native",scope.defaultCamera,2)});
    $("plannerConfiguration").addEventListener("change",event=>{const r=rig();selectRig(r.telescopeId,event.target.value,r.cameraId,2)});
    $("plannerCamera").addEventListener("change",event=>{const r=rig();selectRig(r.telescopeId,r.configurationId,event.target.value,r.barlowPower)});
    $("plannerBarlow").addEventListener("change",event=>{const r=rig();selectRig(r.telescopeId,"barlow",r.cameraId,Number(event.target.value))});
    $("plannerMode").addEventListener("change",event=>{preferences.mode=event.target.value;resetSearch();persist();render(context)});
    $("plannerDate").addEventListener("change",event=>{if(!P.validDate(event.target.value)||!event.target.checkValidity())return;preferences.date=event.target.value;preferences.followNight=false;persist();render(context)});
    $("plannerFollow").addEventListener("click",()=>{preferences.followNight=true;persist();render(context)});
    $("plannerFilter").addEventListener("change",event=>{preferences.filterId=event.target.value;persist();render(context)});
    $("plannerAltitude").addEventListener("change",event=>{preferences.minAltitude=Number(event.target.value);persist();render(context)});
    $("plannerSearch").addEventListener("input",event=>{query=event.target.value;render(context)});
    $("plannerTarget").addEventListener("change",event=>{preferences.targetId=event.target.value;persist();render(context)});
    $("plannerCompare").addEventListener("click",()=>context.refreshComparison());
    $("plannerSave").addEventListener("click",()=>{
      if(!preferences.targetId)return;
      const entry={date:date(),targetId:preferences.targetId,siteId:context.location.id,rigId:rig().id,filterId:preferences.filterId,minAltitude:preferences.minAltitude,status:"planned",createdAt:new Date().toISOString()};
      plans=P.normalizePlans([entry,...plans],allTargets,context.sites,E.rigs);persist();render(context);
      $("plannerMessage").textContent=notice||"Saved on this device. This is a plan, not an automatic telescope command.";
    });
  }
  function chart(result,night){
    const width=Math.max(300,Math.min(640,$("plannerChart").clientWidth||640)),height=190,left=30,right=25,top=12,bottom=32;
    const samples=result.samples.filter(s=>s.ms>=night.start+4*3600000&&s.ms<=night.end-4*3600000);
    const start=samples[0].ms,end=samples.at(-1).ms;
    const x=t=>left+(t-start)/(end-start)*(width-left-right),y=a=>top+(90-a)/120*(height-top-bottom);
    const path=key=>samples.map((s,i)=>`${i?'L':'M'}${x(s.ms).toFixed(1)},${y(Math.max(-30,s[key])).toFixed(1)}`).join(' ');
    const escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const dark=samples.filter(s=>result.threshold!==null&&s.sunAltitude<=result.threshold);
    const shade=dark.length?`<rect x="${x(dark[0].ms)}" y="${top}" width="${x(dark.at(-1).ms)-x(dark[0].ms)}" height="${height-top-bottom}" fill="#2d2d32"/>`:'';
    const ticks=[0,.25,.5,.75,1].map(r=>`<text x="${x(start+r*(end-start))}" y="${height-6}" text-anchor="middle" fill="#aaaab2" font-size="11">${escape(fmt(start+r*(end-start)).replace(':00',''))}</text>`).join('');
    const levels=[0,30,60,90].map(a=>`<line x1="${left}" x2="${width-right}" y1="${y(a)}" y2="${y(a)}" stroke="#3a3a40"/><text x="${left-5}" y="${y(a)+4}" text-anchor="end" fill="#aaaab2" font-size="10">${a}°</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Target altitude in papaya, Moon altitude dashed gray; shaded darkness or selected twilight limit"><title>${escape(result.target.name)} altitude and Moon altitude</title>${shade}${levels}<path d="${path('altitude')}" fill="none" stroke="#e99a65" stroke-width="2.5"/><path d="${path('moonAltitude')}" fill="none" stroke="#c5cdd7" stroke-width="1.5" stroke-dasharray="5 4"/>${ticks}</svg>`;
  }
  function renderSavedPlans(ctx){
    $("plannerPlans").replaceChildren(...plans.map(p=>{
      const row=el("li"),target=allTargets.find(t=>t.id===p.targetId),site=ctx.sites.find(s=>s.id===p.siteId);
      const selectedRig=E.rigs.find(r=>r.id===p.rigId),filter=selectedRig.filters.find(f=>f.id===p.filterId);
      row.append(el("span",`${p.date} · ${site.name} · ${target.name} · ${selectedRig.name} · ${filter.name} · ≥${p.minAltitude}°`),button("Remove",()=>{plans=plans.filter(x=>x!==p);persist();render(context)}));return row;
    }));
    $("plannerPlansCount").textContent=`Planned targets (${plans.length})`;
  }
  function opportunityText(match,zone=context.timeZone){return`${match.label}${match.window?`: ${span(match.window,zone)}`:""}`}
  function renderSites(selected,selectedRig,filter,day){
    $("plannerCompare").disabled=context.comparisonBusy||context.sites.length<2;
    $("plannerCompare").textContent=context.comparisonBusy?"Refreshing other sites…":"Refresh site comparison";
    $("plannerSites").replaceChildren(...context.sites.map(site=>{
      const snapshot=context.snapshotForSite(site),zone=snapshot?.forecast?.TimeZone||site.timeZone||context.timeZone;
      const data=O.prepare(snapshot,context.summarizeWeather),result=P.plan([selected.target],day,site,zone,selectedRig,{minAltitude:preferences.minAltitude,filter}).results[0];
      const retrieved=Date.parse(snapshot?.weather?.meta?.fetchedAt);
      const match=O.match(result,data,selectedRig,preferences.mode,filter),card=el("article",undefined,"site-result");card.dataset.opportunity=match.kind;
      card.append(el("h4",site.name),el("p",`${day} · ${zone} · ${Number.isFinite(site.bortle)?`Bortle ${site.bortle}`:"Sky brightness unknown"}`,"eyebrow"),el("p",opportunityText(match,zone)),el("p",`Geometry: ${span(result.window,zone)}`,"sub"));
      card.append(el("p",snapshot?`${data.provider||"Weather unavailable"}${Number.isFinite(retrieved)?` · retrieved ${fmt(retrieved,zone)}`:""} · ${match.reasons.slice(0,2).join("; ")||"No forecast limitation in the matched window"}`:"Forecast not loaded for this site. Refresh comparison to check conditions.","planner-help"));
      if(result.darkSky)card.append(el("p","This faint target benefits from a darker sky.","planner-help"));
      else if(selected.target.body)card.append(el("p","For bright lunar/planetary detail, seeing and altitude usually matter more than the site's Bortle class.","planner-help"));
      return card;
    }));
  }
  function render(ctx){
    if(!ctx||!$("targetPlanner"))return;context=ctx;init();
    const selectedRig=rig(),scope=E.telescopes.find(s=>s.id===selectedRig.telescopeId),filter=selectedRig.filters.find(f=>f.id===preferences.filterId)||selectedRig.filters[0],day=date(),moving=preferences.mode==="planetary";
    plans=P.normalizePlans(plans,allTargets,ctx.sites,E.rigs);renderSavedPlans(ctx);
    options("plannerScope",E.telescopes.map(s=>({...s,name:s.shortName})),scope.id);options("plannerConfiguration",scope.configurations,selectedRig.configurationId);options("plannerCamera",E.cameras,selectedRig.cameraId);
    $("plannerBarlowField").classList.toggle("hidden",selectedRig.configurationId!=="barlow");$("plannerBarlow").value=String(selectedRig.barlowPower===3?3:2);$("plannerMode").value=preferences.mode;
    $("plannerDate").value=day;$("plannerFollow").textContent=preferences.followNight?"Following selected night":"Follow selected night";$("plannerFollow").disabled=preferences.followNight;
    $("plannerAltitude").value=String(preferences.minAltitude);options("plannerFilter",selectedRig.filters,filter.id);
    const field=P.fieldOfView(selectedRig);
    $("plannerRig").textContent=`${selectedRig.focalLengthMm.toLocaleString("en-US",{maximumFractionDigits:0})} mm · f/${selectedRig.fRatio.toFixed(1)} · ${field.widthDeg.toFixed(2)}° × ${field.heightDeg.toFixed(2)}° · ${field.pixelScale.toFixed(2)}″/pixel`;
    $("plannerRigNote").textContent=selectedRig.readiness;
    $("plannerSite").textContent=`${ctx.location.name} · ${day} · ${ctx.timeZone}`;
    const catalog=moving?SolarSystemTargets:C.targets,key=JSON.stringify([day,ctx.location.lat,ctx.location.lon,ctx.location.bortle,ctx.timeZone,selectedRig.id,filter.id,preferences.mode,preferences.minAltitude]);
    try{
      if(key!==calculatedKey){calculated=P.plan(catalog,day,ctx.location,ctx.timeZone,selectedRig,{minAltitude:preferences.minAltitude,filter});calculatedKey=key}
      const data=O.prepare(ctx.snapshotForSite(ctx.location),ctx.summarizeWeather);
      $("plannerForecast").textContent=`${data.stale?"Saved forecast is stale; refresh before setup. ":""}${moving?"Lunar/planetary windows use cloud, seeing and wind; the dashboard score above remains a wide-field deep-sky assessment.":"Deep-sky windows use cloud, transparency and wind."} Each window also checks rain, storm, fog and gust hazards. ${data.provider?`Weather: ${data.provider}.`:"Weather not loaded."}`;
      $("plannerForecast").dataset.severity=data.stale?"unknown":"clear";
      $("plannerMethod").textContent=`${moving?"Sun below −6° (end of civil twilight)":calculated.context.threshold===-18?"Astronomical darkness":calculated.context.threshold===-12?"Nautical-darkness fallback":"No astronomical or nautical darkness"} · 10-minute geometry samples · minimum altitude ${preferences.minAltitude}°. Forecast intervals require both neighboring hourly samples; gaps and expired data stay unknown. Terrain, trees, buildings and mount limits are not modeled.`;
      const normalized=query.toLowerCase().replace(/[^a-z0-9]/g,'');
      const results=calculated.results.map(r=>({...r,opportunity:O.match(r,data,selectedRig,preferences.mode,filter)})).filter(r=>[r.target.name,r.target.designation,r.target.catalogId,...r.target.aliases].some(s=>s.toLowerCase().replace(/[^a-z0-9]/g,'').includes(normalized)));
      const order={supported:0,caution:1,unknown:2,stale:2,limited:3,geometry:4};
      results.sort((a,b)=>order[a.opportunity.kind]-order[b.opportunity.kind]||b.rank-a.rank);
      $("plannerCount").textContent=`${results.length} of ${catalog.length} ${moving?"lunar/planetary":"curated deep-sky"} targets`;
      options("plannerTarget",results.map(r=>({id:r.target.id,name:`${r.target.body?r.target.name:`${r.target.designation} · ${r.target.name}`} — ${r.band}`})),preferences.targetId);
      const selected=results.find(r=>r.target.id===preferences.targetId)||results[0];
      $("plannerPicks").replaceChildren(...results.filter(r=>r.window).slice(0,3).map(r=>{
        const card=el("article",undefined,"target-pick");card.dataset.opportunity=r.opportunity.kind;
        card.append(el("strong",r.target.body?r.target.name:`${r.target.designation} · ${r.target.name}`),el("span",r.band,"target-band"),el("p",opportunityText(r.opportunity),"sub"),el("p",`Geometry: ${span(r.window)}`,"planner-help"),button("Inspect target",()=>{preferences.targetId=r.target.id;persist();render(context)}));return card;
      }));
      $("plannerDetail").classList.toggle("hidden",!selected);
      if(!selected){$("plannerEmpty").textContent="No catalog entries match this search.";$("plannerSites").replaceChildren();return}
      $("plannerEmpty").textContent="";preferences.targetId=selected.target.id;$("plannerTarget").value=selected.target.id;
      $("plannerTargetName").textContent=selected.target.body?selected.target.name:`${selected.target.designation} · ${selected.target.name}`;$("plannerBand").textContent=selected.band;
      $("plannerOpportunity").textContent=opportunityText(selected.opportunity);$("plannerOpportunity").parentElement.dataset.opportunity=selected.opportunity.kind;
      $("plannerLimits").textContent=`${selected.opportunity.reasons.length?`Outside supported intervals: ${selected.opportunity.reasons.slice(0,3).join("; ")}. `:""}${selected.moonRisk?"Moonlight remains a caution even if the weather aligns. ":""}A forecast match is a planning aid; check the sky and equipment before setup.`;
      $("plannerWindow").textContent=`Geometry${moving?"":" / preferred Moon window"}: ${span(selected.window)}`;
      $("plannerPeak").textContent=selected.peak?`Highest ${moving?"after civil twilight":"in darkness"}: ${Math.round(selected.peak.altitude)}° at about ${fmt(selected.peak.ms)}.`:"No night samples on this date.";
      $("plannerChart").innerHTML=chart(selected,calculated.context);
      const major=selected.target.majorArcmin,minor=selected.target.minorArcmin;
      $("plannerFraming").textContent=moving?`Nominal sensor field ${field.widthDeg.toFixed(2)}° × ${field.heightDeg.toFixed(2)}°. Planet/Moon disk size and camera video crop are not modeled. More Barlow power increases image scale; it does not guarantee more resolved detail.`:`${selected.framing.label}. Catalog size ${major?`${major.toFixed(1)}′${minor?` × ${minor.toFixed(1)}′`:" (minor axis unavailable)"}`:"unavailable"}. Nominal field, before edge cropping; inspect a survey image for composition.`;
      $("plannerMoon").textContent=selected.target.body==="Moon"?`${Math.round((selected.peak?.illumination||0)*100)}% illuminated near its highest night altitude. Choose features by terminator lighting.`:moving?"Moonlight does not carry the deep-sky sky-background penalty in this mode. Local glare can still affect observing.":selected.moonBelowThroughout?"Moon below the horizon throughout this suggested window.":selected.moonMinSeparation!==null?`Moon up during part or all of the window: up to ${Math.round(selected.moonIllumination*100)}% illuminated; nearest separation ${Math.round(selected.moonMinSeparation)}°. ${selected.moonRisk?"Moonlight is a planning caution.":"No Moon caution at these sampled times."}`:"No useful window for a Moon assessment.";
      $("plannerFilterAdvice").textContent=selected.filterAdvice;
      $("plannerSiteAdvice").textContent=moving?"For bright lunar/planetary detail, prioritize steady air, altitude and unobstructed views over a darker Bortle class.":selected.darkSky?`${ctx.location.name} is set to Bortle ${ctx.location.bortle}; faint structure benefits from a darker site. Compare each site's weather below before traveling.`:!Number.isFinite(ctx.location.bortle)?"Site sky brightness is unknown; set Bortle in the location profile.":`The selected site is set to Bortle ${ctx.location.bortle}. Clouds, Moon and local lighting can still limit the session.`;
      $("plannerObjectNote").textContent=selected.target.notes;
      const hasPlan=plans.some(p=>p.targetId===selected.target.id&&p.siteId===ctx.location.id&&p.date===day&&p.rigId===selectedRig.id);
      $("plannerSave").disabled=false;$("plannerSave").textContent=hasPlan?"Update saved target":"Save target for this night";$("plannerMessage").textContent=notice;
      renderSites(selected,selectedRig,filter,day);
    }catch{$("plannerEmpty").textContent="Target planning is unavailable for this date or location. The weather dashboard remains usable.";$("plannerDetail").classList.add("hidden");$("plannerPicks").replaceChildren();$("plannerSites").replaceChildren()}
  }
  return{render};
})();
