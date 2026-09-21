"use strict";
const TargetPlannerUI=(()=>{
  const P=TargetPlanner,C=AstroCatalog,E=AstroEquipment,O=ImagingOpportunities,F=ImagingFilters,J=ObservingJournal,A=TargetAdvisor,allTargets=[...C.targets,...SolarSystemTargets];
  const KEY="astroImageNowPlannerV1";
  let context=null,preferences={date:null,followNight:true,targetId:null,rigId:"z73-533",mode:"deep-sky",filterId:"l-pro",minAltitude:30,advisorPolicy:"auto",includePlanned:false},plans=[],query="",initialized=false;
  let calculatedKey=null,calculated=null,notice="",sessions=[],editingId=null,removedSession=null;
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
      preferences={date:P.validDate(p.date)?p.date:null,followNight:p.followNight!==false,targetId:allTargets.some(t=>t.id===p.targetId)?p.targetId:null,rigId:selected.id,mode:["deep-sky","planetary"].includes(p.mode)?p.mode:selected.mode,filterId:selected.filters.some(f=>f.id===p.filterId)?p.filterId:selected.filters[0].id,minAltitude:[20,30,40,50].includes(p.minAltitude)?p.minAltitude:30,advisorPolicy:["auto","deep-sky","planetary","selected"].includes(p.advisorPolicy)?p.advisorPolicy:"auto",includePlanned:p.includePlanned===true};
      plans=Array.isArray(saved.plans)?saved.plans:[];
    }catch{notice="Saved target planning data could not be read. Your forecast settings are separate."}
  }
  function fmt(ms,zone=context.timeZone){return new Intl.DateTimeFormat("en-US",{timeZone:zone,hour:"numeric",minute:"2-digit"}).format(new Date(ms))}
  function span(window,zone=context.timeZone){return window?`${fmt(window.start,zone)}–${fmt(window.end,zone)} · ${(window.minutes/60).toFixed(1)} h`:"No usable window"}
  function date(){return preferences.followNight?context.nightDate:preferences.date||context.nightDate}
  function button(text,handler){const b=el("button",text,"btn");b.type="button";b.addEventListener("click",handler);return b}
  function resetSearch(){query="";$("plannerSearch").value="";preferences.targetId=null}
  function selectRig(scope,configuration,camera,power){
    const selected=E.resolve(scope,configuration,camera,power);preferences.rigId=selected.id;preferences.advisorPolicy="selected";
    if(!selected.filters.some(f=>f.id===preferences.filterId))preferences.filterId="none";
    persist();render(context);
  }
  function init(){
    if(initialized)return;initialized=true;read();sessions=J.normalize(J.read(localStorage),{targets:allTargets,sites:context.sites,rigs:E.rigs});
    let resizeTimer;
    window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(context),100)});
    $("plannerScope").addEventListener("change",event=>{const scope=E.telescopes.find(s=>s.id===event.target.value);preferences.mode=scope.mode;resetSearch();selectRig(scope.id,"native",scope.defaultCamera,2)});
    $("plannerConfiguration").addEventListener("change",event=>{const r=rig();selectRig(r.telescopeId,event.target.value,r.cameraId,2)});
    $("plannerCamera").addEventListener("change",event=>{const r=rig();selectRig(r.telescopeId,r.configurationId,event.target.value,r.barlowPower)});
    $("plannerBarlow").addEventListener("change",event=>{const r=rig();selectRig(r.telescopeId,"barlow",r.cameraId,Number(event.target.value))});
    $("plannerMode").addEventListener("change",event=>{preferences.mode=event.target.value;preferences.advisorPolicy="selected";resetSearch();persist();render(context)});
    $("plannerDate").addEventListener("change",event=>{if(!P.validDate(event.target.value)||!event.target.checkValidity())return;preferences.date=event.target.value;preferences.followNight=false;persist();render(context)});
    $("plannerFollow").addEventListener("click",()=>{preferences.followNight=true;persist();render(context)});
    $("plannerFilter").addEventListener("change",event=>{preferences.filterId=event.target.value;preferences.advisorPolicy="selected";persist();render(context)});
    $("plannerAltitude").addEventListener("change",event=>{preferences.minAltitude=Number(event.target.value);persist();render(context)});
    $("plannerSearch").addEventListener("input",event=>{query=event.target.value;render(context)});
    $("plannerTarget").addEventListener("change",event=>{preferences.targetId=event.target.value;persist();render(context)});
    $("advisorPolicy").addEventListener("change",event=>{preferences.advisorPolicy=event.target.value;persist();render(context)});
    $("advisorPlanned").addEventListener("change",event=>{preferences.includePlanned=event.target.checked;persist();render(context)});
    $("journalStart").addEventListener("click",()=>editSession());
    $("journalCancel").addEventListener("click",()=>{$("journalForm").classList.add("hidden");editingId=null});
    $("journalForm").addEventListener("submit",event=>{
      event.preventDefault();if(!event.target.reportValidity())return;
      if(!editingId&&sessions.length>=J.MAX){$("journalMessage").textContent="The journal is full. Export a backup before removing an old entry.";return}
      const prior=sessions.find(e=>e.id===editingId),site=context.sites.find(s=>s.id===$("journalSite").value);
      const entry={id:editingId||crypto.randomUUID(),date:$("journalDate").value,targetId:$("journalTarget").value,siteId:$("journalSite").value,siteName:site?.name||prior?.siteName||"Previous site",rigId:$("journalRig").value,filterId:$("journalFilter").value,outcome:$("journalOutcome").value,integrationMinutes:$("journalMinutes").value===""?null:Number($("journalMinutes").value),notes:$("journalNotes").value.trim(),createdAt:prior?.createdAt||new Date().toISOString()};
      const valid=J.normalize([entry],{targets:allTargets,sites:context.sites,rigs:E.rigs});
      if(!valid.length){$("journalMessage").textContent="Check the session date, target and rig before saving.";return}
      if(saveSessions([valid[0],...sessions.filter(e=>e.id!==entry.id)])){
        editingId=null;$("journalForm").classList.add("hidden");$("journalMessage").textContent="Session saved on this device.";render(context);
      }
    });
    $("journalUndo").addEventListener("click",()=>{
      if(removedSession&&saveSessions([removedSession,...sessions])){removedSession=null;$("journalMessage").textContent="Session restored.";render(context)}
    });
    $("journalExport").addEventListener("click",()=>{
      const url=URL.createObjectURL(new Blob([J.exportJSON(sessions)],{type:"application/json"})),link=el("a");
      link.href=url;link.download=`AstroImageNow-journal-${P.dateAt(new Date(),context.timeZone)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      $("journalMessage").textContent="Journal export prepared. Keep the downloaded file as your backup.";
    });
    $("plannerSave").addEventListener("click",()=>{
      if(!preferences.targetId)return;
      const entry={date:date(),targetId:preferences.targetId,siteId:context.location.id,rigId:rig().id,filterId:preferences.filterId,minAltitude:preferences.minAltitude,status:"planned",createdAt:new Date().toISOString()};
      plans=P.normalizePlans([entry,...plans],allTargets,context.sites,E.rigs);persist();render(context);
      $("plannerMessage").textContent=notice||"Saved on this device. This is a plan, not an automatic telescope command.";
    });
  }
  function filterOptions(){return F.choices.map(f=>({...f,name:f.name+(["planned","proposed"].includes(f.status)?` · ${f.status}`:"")}))}
  function saveSessions(next){
    if(next.length>J.MAX){$("journalMessage").textContent="The journal is full. Export a backup before removing an old entry.";return false}
    try{J.save(localStorage,next);sessions=next;return true}catch{$("journalMessage").textContent="This browser could not save the journal. Your form is still open; copy the notes before leaving.";return false}
  }
  function editSession(entry=null){
    editingId=entry?.id||null;$("journalPanel").open=true;$("journalForm").classList.remove("hidden");$("journalEditing").textContent=entry?"Edit session":"New session";
    $("journalDate").value=entry?.date||date();options("journalTarget",allTargets.map(t=>({id:t.id,name:t.body?t.name:`${t.designation} · ${t.name}`})),entry?.targetId||preferences.targetId);
    const sites=[...context.sites];if(entry&&!sites.some(s=>s.id===entry.siteId))sites.push({id:entry.siteId,name:entry.siteName+" (previous site)"});
    options("journalSite",sites,entry?.siteId||context.location.id);options("journalRig",E.rigs,entry?.rigId||rig().id);options("journalFilter",filterOptions(),entry?.filterId||preferences.filterId);
    $("journalOutcome").value=entry?.outcome||"attempted";$("journalMinutes").value=entry?.integrationMinutes??"";$("journalNotes").value=entry?.notes||"";$("journalMessage").textContent="";
    $("journalForm").scrollIntoView({behavior:"smooth",block:"start"});$("journalDate").focus({preventScroll:true});
  }
  function renderJournal(){
    $("journalCount").textContent=`Observing journal (${sessions.length})`;$("journalIntro").textContent=sessions.length?"Your logged sessions help prioritize another try or a new subject.":"No sessions logged here yet. Inspect a target, then choose Log a session.";
    $("journalUndo").classList.toggle("hidden",!removedSession);$("journalExport").disabled=!sessions.length;
    $("journalEntries").replaceChildren(...[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt))).map(entry=>{
      const row=el("li"),target=allTargets.find(t=>t.id===entry.targetId),selectedRig=E.rigs.find(r=>r.id===entry.rigId),filter=F.choices.find(f=>f.id===entry.filterId);
      row.append(el("strong",`${entry.date} · ${target.body?target.name:target.designation+" · "+target.name}`),el("p",`${entry.siteName} · ${selectedRig.name} · ${filter.name}`,"planner-help"),el("p",`${{attempted:"Attempted",captured:"Captured successfully",revisit:"Want another try"}[entry.outcome]}${entry.integrationMinutes!==null?` · ${entry.integrationMinutes} min`:""}`,"sub"));
      if(entry.notes)row.append(el("p",entry.notes,"journal-note"));
      row.append(button("Edit",()=>editSession(entry)),button("Remove",()=>{if(saveSessions(sessions.filter(e=>e.id!==entry.id))){removedSession=entry;if(editingId===entry.id){editingId=null;$("journalForm").classList.add("hidden")}$("journalMessage").textContent="Session removed. Undo is available below.";render(context)}}));return row;
    }));
  }
  function renderAdvisor(data,selectedRig,filter,day){
    $("advisorPolicy").value=preferences.advisorPolicy;$("advisorPlanned").checked=preferences.includePlanned;
    const pair=SiteForecasts.pair(context.sites),assess=site=>{
      if(!site)return null;
      const snapshot=context.snapshotForSite(site),zone=snapshot?.forecast?.TimeZone||site.timeZone||context.timeZone;
      const prepared=site.id===context.location.id?data:O.prepare(snapshot,context.summarizeWeather);
      const advice=A.propose({catalog:C.targets,solar:SolarSystemTargets,date:day,site,timeZone:zone,rig:selectedRig,mode:preferences.mode,filter,policy:preferences.advisorPolicy,includePlanned:preferences.includePlanned,minAltitude:preferences.minAltitude,data:prepared,journal:sessions});
      return NightPlan.assess({site,data:prepared,advice});
    };
    const plan=NightPlan.choose(context.comparisonBusy?{busy:true}:{home:assess(pair.home),jgap:assess(pair.jgap),missing:pair.missing});
    $("advisorHeading").textContent=plan.heading;$("advisorSummary").textContent=plan.reason;
    $("advisorPicks").replaceChildren();
    if(!plan.primary)return;
    const zone=context.snapshotForSite(plan.site)?.forecast?.TimeZone||plan.site.timeZone||context.timeZone;
    [plan.primary,plan.alternative].filter(Boolean).forEach((pick,index)=>{
      const {target}=pick.result,card=el("article",undefined,"advisor-pick");card.dataset.opportunity=pick.match.kind;
      const scope=E.telescopes.find(s=>s.id===pick.rig.telescopeId),camera=E.cameras.find(c=>c.id===pick.rig.cameraId);
      const optics=pick.rig.configurationId==="barlow"?`${pick.rig.barlowPower}× Barlow`:pick.rig.configurationId==="reduced"?"f/6.3":"native";
      card.append(el("p",index?"Alternative":"Primary target","eyebrow"),el("h4",target.body?target.name:`${target.designation} · ${target.name}`),el("p",`${scope.shortName}${pick.rig.telescopeId==="c8"?` · ${optics}`:""} · ${camera.name}`,"advisor-rig"),el("p",`${pick.filter.name}${["planned","proposed"].includes(pick.filter.status)?` · ${pick.filter.status}`:""}`,"planner-help"),el("p",`${pick.match.estimated?"≈ ":""}${span(pick.match.window,zone)}`,"plan-window"));
      const cautions=[...new Set(pick.match.window.samples.filter(s=>s.assessment.kind==="caution").map(s=>s.assessment.reason))];
      const rationale=[...cautions,...pick.reasons.filter(r=>/Moonlight|another|attempt|captur|Verify|short exposures/.test(r))];
      if(rationale.length)card.append(el("p",rationale.slice(0,3).join(" "),"planner-help"));
      if(pick.match.estimated)card.append(el("p",pick.mode==="planetary"?"Seeing not fully resolved in this estimate.":"Specialized astronomy detail is incomplete.","planner-help"));
      card.append(button(index?"Explore alternative":"Use this plan",()=>{
        preferences.rigId=pick.rig.id;preferences.mode=pick.mode;preferences.filterId=pick.filter.id;resetSearch();preferences.targetId=target.id;preferences.advisorPolicy="selected";persist();
        context.selectSite(plan.site.id);render(context);$("plannerDetail").scrollIntoView({behavior:"smooth",block:"start"});
      }));$("advisorPicks").append(card);
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
    const pair=SiteForecasts.pair(context.sites);
    $("comparisonTarget").textContent=`${selected.target.body?selected.target.name:selected.target.designation+" · "+selected.target.name}${context.comparisonBusy?" · updating…":""}`;
    $("plannerSites").replaceChildren(...["home","jgap"].map(role=>{
      const site=pair[role],card=el("article",undefined,"site-result"),heading=el("div",undefined,"site-heading");heading.append(el("h4",role==="home"?"Home":"JGAP"));card.append(heading);
      if(!site){card.append(el("p","Saved profile missing or ambiguous. Check Settings.","planner-help"));return card}
      heading.append(el("span",Number.isFinite(site.bortle)?`Bortle ${site.bortle}`:"Bortle unknown","sub"));
      const snapshot=context.snapshotForSite(site),zone=snapshot?.forecast?.TimeZone||site.timeZone||context.timeZone;
      const data=O.prepare(snapshot,context.summarizeWeather),result=P.plan([selected.target],day,site,zone,selectedRig,{minAltitude:preferences.minAltitude,filter}).results[0];
      const match=O.match(result,data,selectedRig,preferences.mode,filter);card.dataset.opportunity=match.kind;
      card.append(el("p",context.comparisonBusy?"Updating forecast…":match.window?`${match.estimated?"≈ ":""}${span(match.window,zone)}`:match.label,"site-window"));
      const cautions=match.window?[...new Set(match.window.samples.filter(s=>s.assessment.kind==="caution").map(s=>s.assessment.reason))]:match.reasons;
      if(!context.comparisonBusy&&cautions.length)card.append(el("p",cautions.slice(0,2).join(" · "),"planner-help"));
      const details=el("details");details.append(el("summary","Geometry & limits"),el("p",`${day} · ${zone} · ${site.name}`,"planner-help"),el("p",`Visible: ${span(result.window,zone)}`,"planner-help"));
      if(match.reasons.length)details.append(el("p",match.reasons.slice(0,3).join(" · "),"planner-help"));
      card.append(details);return card;
    }));
  }
  function render(ctx){
    if(!ctx||!$("targetPlanner"))return;context=ctx;init();
    const selectedRig=rig(),scope=E.telescopes.find(s=>s.id===selectedRig.telescopeId),filter=selectedRig.filters.find(f=>f.id===preferences.filterId)||selectedRig.filters[0],day=date(),moving=preferences.mode==="planetary";
    plans=P.normalizePlans(plans,allTargets,ctx.sites,E.rigs);renderSavedPlans(ctx);renderJournal();
    options("plannerScope",E.telescopes.map(s=>({...s,name:s.shortName})),scope.id);options("plannerConfiguration",scope.configurations,selectedRig.configurationId);options("plannerCamera",E.cameras,selectedRig.cameraId);
    $("plannerBarlowField").classList.toggle("hidden",selectedRig.configurationId!=="barlow");$("plannerBarlow").value=String(selectedRig.barlowPower===3?3:2);$("plannerMode").value=preferences.mode;
    $("plannerDate").value=day;$("plannerFollow").textContent=preferences.followNight?"Following selected night":"Follow selected night";$("plannerFollow").disabled=preferences.followNight;
    $("plannerAltitude").value=String(preferences.minAltitude);options("plannerFilter",filterOptions(),filter.id);
    const field=P.fieldOfView(selectedRig);
    $("plannerRig").textContent=`${selectedRig.focalLengthMm.toLocaleString("en-US",{maximumFractionDigits:0})} mm · f/${selectedRig.fRatio.toFixed(1)} · ${field.widthDeg.toFixed(2)}° × ${field.heightDeg.toFixed(2)}° · ${field.pixelScale.toFixed(2)}″/pixel`;
    $("plannerRigNote").textContent=selectedRig.readiness;
    $("plannerSite").textContent=`${ctx.location.name} · ${day} · ${ctx.timeZone}`;
    const catalog=moving?SolarSystemTargets:C.targets,key=JSON.stringify([day,ctx.location.lat,ctx.location.lon,ctx.location.bortle,ctx.timeZone,selectedRig.id,filter.id,preferences.mode,preferences.minAltitude]);
    try{
      if(key!==calculatedKey){calculated=P.plan(catalog,day,ctx.location,ctx.timeZone,selectedRig,{minAltitude:preferences.minAltitude,filter});calculatedKey=key}
      const data=O.prepare(ctx.snapshotForSite(ctx.location),ctx.summarizeWeather);
      renderAdvisor(data,selectedRig,filter,day);
      $("plannerForecast").textContent=data.stale?"Saved forecast · refresh before setup.":!data.provider?"Weather unavailable for this site.":"";
      $("plannerForecast").classList.toggle("hidden",!$("plannerForecast").textContent);
      $("plannerForecast").dataset.severity="unknown";
      $("plannerMethod").textContent=`${moving?"Sun below −6° (end of civil twilight)":calculated.context.threshold===-18?"Astronomical darkness":calculated.context.threshold===-12?"Nautical-darkness fallback":"No astronomical or nautical darkness"} · 10-minute geometry samples · minimum altitude ${preferences.minAltitude}°. Forecast intervals require both neighboring hourly samples; ≈ marks a weather estimate when specialized data is absent; gaps and expired data stay unknown. Terrain, trees, buildings and mount limits are not modeled.`;
      const normalized=query.toLowerCase().replace(/[^a-z0-9]/g,'');
      const results=calculated.results.map(r=>({...r,opportunity:O.match(r,data,selectedRig,preferences.mode,filter)})).filter(r=>[r.target.name,r.target.designation,r.target.catalogId,...r.target.aliases].some(s=>s.toLowerCase().replace(/[^a-z0-9]/g,'').includes(normalized)));
      const order={supported:0,estimated:1,caution:2,unknown:3,stale:3,limited:4,geometry:5};
      results.sort((a,b)=>order[a.opportunity.kind]-order[b.opportunity.kind]||b.rank-a.rank);
      $("plannerCount").textContent=`${results.length} of ${catalog.length} ${moving?"lunar/planetary":"curated deep-sky"} targets`;
      options("plannerTarget",results.map(r=>({id:r.target.id,name:`${r.target.body?r.target.name:`${r.target.designation} · ${r.target.name}`} — ${r.band}`})),preferences.targetId);
      const selected=results.find(r=>r.target.id===preferences.targetId)||results[0];
      $("plannerDetail").classList.toggle("hidden",!selected);
      if(!selected){$("plannerEmpty").textContent="No catalog entries match this search.";$("plannerSites").replaceChildren();return}
      $("plannerEmpty").textContent="";preferences.targetId=selected.target.id;$("plannerTarget").value=selected.target.id;
      $("plannerTargetName").textContent=selected.target.body?selected.target.name:`${selected.target.designation} · ${selected.target.name}`;$("plannerBand").textContent=selected.band;
      $("plannerOpportunity").textContent=opportunityText(selected.opportunity);$("plannerOpportunity").parentElement.dataset.opportunity=selected.opportunity.kind;
      $("plannerLimits").textContent=`${selected.opportunity.reasons.length?`Outside supported intervals: ${selected.opportunity.reasons.slice(0,3).join("; ")}. `:""}${selected.moonRisk?"Moonlight remains a caution even if the weather aligns. ":""}`;
      $("plannerWindow").textContent=`Geometry${moving?"":" / preferred Moon window"}: ${span(selected.window)}`;
      $("plannerPeak").textContent=selected.peak?`Highest ${moving?"after civil twilight":"in darkness"}: ${Math.round(selected.peak.altitude)}° at about ${fmt(selected.peak.ms)}.`:"No night samples on this date.";
      $("plannerChart").innerHTML=chart(selected,calculated.context);
      const major=selected.target.majorArcmin,minor=selected.target.minorArcmin;
      $("plannerFraming").textContent=moving?`Nominal sensor field ${field.widthDeg.toFixed(2)}° × ${field.heightDeg.toFixed(2)}°. Disk size and video crop are not modeled.`:`${selected.framing.label}. Catalog size ${major?`${major.toFixed(1)}′${minor?` × ${minor.toFixed(1)}′`:" (minor axis unavailable)"}`:"unavailable"}. `;
      $("plannerMoon").textContent=selected.target.body==="Moon"?`${Math.round((selected.peak?.illumination||0)*100)}% illuminated near its highest night altitude. Choose features by terminator lighting.`:moving?"Moonlight is not a primary limit for this bright subject.":selected.moonBelowThroughout?"Moon below the horizon throughout this suggested window.":selected.moonMinSeparation!==null?`Moon up during part or all of the window: up to ${Math.round(selected.moonIllumination*100)}% illuminated; nearest separation ${Math.round(selected.moonMinSeparation)}°. ${selected.moonRisk?"Moonlight is a planning caution.":"No Moon caution at these sampled times."}`:"No useful window for a Moon assessment.";
      $("plannerFilterAdvice").textContent=selected.filterAdvice;
      $("plannerSiteAdvice").textContent=moving?"Steady air and altitude matter more than Bortle class.":selected.darkSky?`${ctx.location.name} is set to Bortle ${ctx.location.bortle}; faint structure benefits from a darker site. `:!Number.isFinite(ctx.location.bortle)?"Site sky brightness is unknown; set Bortle in the location profile.":`Bortle ${ctx.location.bortle}.`;
      $("plannerObjectNote").textContent=`${selected.target.notes} ${J.history(sessions,selected.target.id).label}.`;
      const hasPlan=plans.some(p=>p.targetId===selected.target.id&&p.siteId===ctx.location.id&&p.date===day&&p.rigId===selectedRig.id);
      $("plannerSave").disabled=false;$("plannerSave").textContent=hasPlan?"Update saved target":"Save target for this night";$("plannerMessage").textContent=notice;
      renderSites(selected,selectedRig,filter,day);
    }catch{$("plannerEmpty").textContent="Target planning is unavailable for this date or location. The weather dashboard remains usable.";$("plannerDetail").classList.add("hidden");$("plannerPicks").replaceChildren();$("plannerSites").replaceChildren();$("advisorPicks").replaceChildren();$("advisorHeading").textContent="Night plan unavailable";$("advisorSummary").textContent="Check the date and saved site profiles."}
  }
  return{render};
})();
