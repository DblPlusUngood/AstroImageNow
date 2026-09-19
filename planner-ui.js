"use strict";
const TargetPlannerUI=(()=>{
  const P=TargetPlanner,C=AstroCatalog,E=AstroEquipment;
  const KEY="astroImageNowPlannerV1";
  let context=null,preferences={date:null,followNight:true,targetId:null,filterId:"l-pro",minAltitude:30},plans=[],query="",initialized=false;
  let calculatedKey=null,calculated=null,notice="";
  const $=id=>document.getElementById(id);
  function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node}
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify({version:1,preferences,plans}));notice=""}catch{notice="The plan is visible, but this browser could not save it. Keep the app open until you have copied the details."}
  }
  function read(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||"null");
      if(saved?.version!==1)return;
      const p=saved.preferences||{};
      preferences={date:P.validDate(p.date)?p.date:null,followNight:p.followNight!==false,targetId:C.targets.some(t=>t.id===p.targetId)?p.targetId:null,filterId:E.rigs[0].filters.some(f=>f.id===p.filterId)?p.filterId:"l-pro",minAltitude:[20,30,40,50].includes(p.minAltitude)?p.minAltitude:30};
      plans=Array.isArray(saved.plans)?saved.plans:[];
    }catch{notice="Saved target planning data could not be read. Your forecast settings are separate."}
  }
  function fmt(ms){return new Intl.DateTimeFormat("en-US",{timeZone:context.timeZone,hour:"numeric",minute:"2-digit"}).format(new Date(ms))}
  function span(window){return window?`${fmt(window.start)}–${fmt(window.end)} · ${(window.minutes/60).toFixed(1)} h`:"No useful dark window"}
  function date(){return preferences.followNight?context.nightDate:preferences.date||context.nightDate}
  function button(text,handler){const b=el("button",text,"btn");b.type="button";b.addEventListener("click",handler);return b}
  function init(){
    if(initialized)return;initialized=true;read();
    let resizeTimer;
    window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(context),100)});
    $("plannerDate").addEventListener("change",event=>{if(!P.validDate(event.target.value)||!event.target.checkValidity())return;preferences.date=event.target.value;preferences.followNight=false;persist();render(context)});
    $("plannerFollow").addEventListener("click",()=>{preferences.followNight=true;persist();render(context)});
    $("plannerFilter").addEventListener("change",event=>{preferences.filterId=event.target.value;persist();render(context)});
    $("plannerAltitude").addEventListener("change",event=>{preferences.minAltitude=Number(event.target.value);persist();render(context)});
    $("plannerSearch").addEventListener("input",event=>{query=event.target.value;render(context)});
    $("plannerTarget").addEventListener("change",event=>{preferences.targetId=event.target.value;persist();render(context)});
    $("plannerSave").addEventListener("click",()=>{
      if(!preferences.targetId)return;
      const entry={date:date(),targetId:preferences.targetId,siteId:context.location.id,rigId:E.rigs[0].id,filterId:preferences.filterId,minAltitude:preferences.minAltitude,status:"planned",createdAt:new Date().toISOString()};
      plans=P.normalizePlans([entry,...plans],C.targets,context.sites,E.rigs);persist();render(context);
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
    const dark=samples.filter(s=>night.threshold!==null&&s.sunAltitude<=night.threshold);
    const shade=dark.length?`<rect x="${x(dark[0].ms)}" y="${top}" width="${x(dark.at(-1).ms)-x(dark[0].ms)}" height="${height-top-bottom}" fill="#172c47"/>`:'';
    const ticks=[0,.25,.5,.75,1].map(r=>`<text x="${x(start+r*(end-start))}" y="${height-6}" text-anchor="middle" fill="#9eb0c5" font-size="11">${escape(fmt(start+r*(end-start)).replace(':00',''))}</text>`).join('');
    const levels=[0,30,60,90].map(a=>`<line x1="${left}" x2="${width-right}" y1="${y(a)}" y2="${y(a)}" stroke="#30415a"/><text x="${left-5}" y="${y(a)+4}" text-anchor="end" fill="#9eb0c5" font-size="10">${a}°</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Target altitude in blue, Moon altitude dashed gray; shaded astronomical or nautical darkness"><title>${escape(result.target.name)} altitude and Moon altitude</title>${shade}${levels}<path d="${path('altitude')}" fill="none" stroke="#60a5fa" stroke-width="2.5"/><path d="${path('moonAltitude')}" fill="none" stroke="#c5cdd7" stroke-width="1.5" stroke-dasharray="5 4"/>${ticks}</svg>`;
  }
  function renderSavedPlans(ctx){
    $("plannerPlans").replaceChildren(...plans.map(p=>{
      const row=el("li"),target=C.targets.find(t=>t.id===p.targetId),site=ctx.sites.find(s=>s.id===p.siteId);
      const rig=E.rigs.find(r=>r.id===p.rigId),filter=rig.filters.find(f=>f.id===p.filterId);
      row.append(el("span",`${p.date} · ${site.name} · ${target.designation} ${target.name} · ${rig.name} · ${filter.name} · ≥${p.minAltitude}°`),button("Remove",()=>{plans=plans.filter(x=>x!==p);persist();render(context)}));return row;
    }));
    $("plannerPlansCount").textContent=`Planned targets (${plans.length})`;
  }
  function render(ctx){
    if(!ctx||!$("targetPlanner"))return;context=ctx;init();
    const rig=E.rigs[0],filter=rig.filters.find(f=>f.id===preferences.filterId)||rig.filters[0],day=date();
    plans=P.normalizePlans(plans,C.targets,ctx.sites,E.rigs);
    renderSavedPlans(ctx);
    $("plannerDate").value=day;
    $("plannerFollow").textContent=preferences.followNight?"Following selected night":"Follow selected night";
    $("plannerFollow").disabled=preferences.followNight;
    $("plannerAltitude").value=String(preferences.minAltitude);
    $("plannerFilter").replaceChildren(...rig.filters.map(f=>{const option=el("option",f.name);option.value=f.id;return option}));
    $("plannerFilter").value=filter.id;
    const field=P.fieldOfView(rig);
    $("plannerRig").textContent=`${rig.name} · ${rig.focalLengthMm} mm · ${field.widthDeg.toFixed(2)}° × ${field.heightDeg.toFixed(2)}° · ${field.pixelScale.toFixed(2)}″/pixel`;
    $("plannerRigNote").textContent=rig.readiness;
    $("plannerSite").textContent=`${ctx.location.name} · ${day} · ${ctx.timeZone}`;
    const key=JSON.stringify([day,ctx.location.lat,ctx.location.lon,ctx.location.bortle,ctx.timeZone,rig.id,filter.id,preferences.minAltitude]);
    try{
      if(key!==calculatedKey){calculated=P.plan(C.targets,day,ctx.location,ctx.timeZone,rig,{minAltitude:preferences.minAltitude,filter});calculatedKey=key}
      const forecast=ctx.conditionsForDate(day);
      $("plannerForecast").textContent=forecast.message;
      $("plannerForecast").dataset.severity=forecast.severity;
      $("plannerMethod").textContent=`${calculated.context.threshold===-18?'Astronomical darkness':calculated.context.threshold===-12?'Nautical-darkness fallback':'No astronomical or nautical darkness'} · 10-minute samples · minimum altitude ${preferences.minAltitude}°. Terrain, trees, buildings and mount limits are not modeled. Geometry is not permission to set up in unsafe weather.`;
      const normalized=query.toLowerCase().replace(/[^a-z0-9]/g,'');
      const results=calculated.results.filter(r=>[r.target.name,r.target.designation,r.target.catalogId,...r.target.aliases].some(s=>s.toLowerCase().replace(/[^a-z0-9]/g,'').includes(normalized)));
      $("plannerCount").textContent=`${results.length} of ${C.targets.length} curated deep-sky targets`;
      const options=results.map(r=>{const option=el("option",`${r.target.designation} · ${r.target.name} — ${r.band}`);option.value=r.target.id;return option});
      $("plannerTarget").replaceChildren(...options);
      const selected=results.find(r=>r.target.id===preferences.targetId)||results[0];
      $("plannerPicks").replaceChildren(...results.filter(r=>r.window).slice(0,3).map(r=>{
        const card=el("article",undefined,"target-pick");
        card.append(el("strong",`${r.target.designation} · ${r.target.name}`),el("span",r.band,"target-band"),el("p",span(r.window),"sub"),button("Inspect target",()=>{preferences.targetId=r.target.id;persist();render(context)}));return card;
      }));
      $("plannerDetail").classList.toggle("hidden",!selected);
      if(!selected){$("plannerEmpty").textContent="No catalog entries match this search.";return}
      $("plannerEmpty").textContent="";
      preferences.targetId=selected.target.id;$("plannerTarget").value=selected.target.id;
      $("plannerTargetName").textContent=`${selected.target.designation} · ${selected.target.name}`;
      $("plannerBand").textContent=selected.band;
      $("plannerWindow").textContent=span(selected.window);
      $("plannerPeak").textContent=selected.peak?`Highest in darkness: ${Math.round(selected.peak.altitude)}° at about ${fmt(selected.peak.ms)}.`:"No dark samples on this date.";
      $("plannerChart").innerHTML=chart(selected,calculated.context);
      const major=selected.target.majorArcmin,minor=selected.target.minorArcmin;
      $("plannerFraming").textContent=`${selected.framing.label}. Catalog size ${major?`${major.toFixed(1)}′${minor?` × ${minor.toFixed(1)}′`:" (minor axis unavailable)"}`:"unavailable"}. Nominal field, before edge cropping; inspect a survey image for composition.`;
      $("plannerMoon").textContent=selected.moonBelowThroughout?"Moon below the horizon throughout this suggested window.":selected.moonMinSeparation!==null?`Moon above the horizon during part or all of the window: up to ${Math.round(selected.moonIllumination*100)}% illuminated; nearest separation ${Math.round(selected.moonMinSeparation)}°. ${selected.moonRisk?"Moonlight is a planning caution for this target.":"No Moon caution at these sampled times; sky background may still be affected."}`:"No useful window for a Moon assessment.";
      $("plannerFilterAdvice").textContent=selected.filterAdvice;
      $("plannerSiteAdvice").textContent=selected.darkSky?`Save faint structure for a darker site if practical. ${ctx.location.name} is set to Bortle ${ctx.location.bortle}; compare actual site conditions before traveling.`:!Number.isFinite(ctx.location.bortle)?"Site sky brightness is unknown; set Bortle in the location profile to enable that comparison.":selected.target.lightPollution==="high"?`This target benefits strongly from darker skies. The selected site is set to Bortle ${ctx.location.bortle}; this is site context, not a measured nightly sky brightness.`:`The selected site is set to Bortle ${ctx.location.bortle}. Clouds, Moon and local lighting can still limit the session.`;
      $("plannerObjectNote").textContent=selected.target.notes;
      const hasPlan=plans.some(p=>p.targetId===selected.target.id&&p.siteId===ctx.location.id&&p.date===day&&p.rigId===rig.id);
      $("plannerSave").disabled=false;$("plannerSave").textContent=hasPlan?"Update saved target":"Save target for this night";
      $("plannerMessage").textContent=notice;
    }catch{$("plannerEmpty").textContent="Target planning is unavailable for this date or location. The weather dashboard remains usable.";$("plannerDetail").classList.add("hidden");$("plannerPicks").replaceChildren()}
  }
  return{render};
})();
