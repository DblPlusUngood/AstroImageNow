"use strict";
const ObservingJournal=(()=>{
  const KEY="astroImageNowJournalV1",MAX=1000;
  const P=typeof module!=="undefined"?require("./planner.js"):TargetPlanner;
  function normalize(raw,{targets,sites,rigs}){
    if(!Array.isArray(raw))return[];
    const seen=new Set();return raw.filter(e=>{
      if(!e||typeof e.id!=="string"||!e.id||e.id.length>100||seen.has(e.id)||!P.validDate(e.date)||!targets.some(t=>t.id===e.targetId)||typeof e.siteId!=="string"||!e.siteId||e.siteId.length>100||!rigs.some(r=>r.id===e.rigId)||!["attempted","captured","revisit"].includes(e.outcome))return false;
      seen.add(e.id);return true;
    }).slice(0,MAX).map(e=>({id:e.id,date:e.date,targetId:e.targetId,siteId:e.siteId,siteName:typeof e.siteName==="string"?e.siteName.slice(0,100):sites.find(s=>s.id===e.siteId)?.name||"Previous site",rigId:e.rigId,
      filterId:rigs.find(r=>r.id===e.rigId).filters.some(f=>f.id===e.filterId)?e.filterId:"none",outcome:e.outcome,
      integrationMinutes:typeof e.integrationMinutes==="number"&&Number.isFinite(e.integrationMinutes)&&e.integrationMinutes>=0&&e.integrationMinutes<=100000?e.integrationMinutes:null,
      notes:typeof e.notes==="string"?e.notes.slice(0,1500):"",createdAt:typeof e.createdAt==="string"?e.createdAt:null}));
  }
  function history(entries,targetId){
    const sessions=entries.filter(e=>e.targetId===targetId).sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt).localeCompare(String(a.createdAt)));
    if(!sessions.length)return{state:"unknown",label:"No sessions logged",count:0,rank:0};
    const latest=sessions[0];return{state:latest.outcome,label:latest.outcome==="revisit"?"Marked for another try":latest.outcome==="captured"?"Previously captured":"Previously attempted",count:sessions.length,rank:latest.outcome==="revisit"?8:latest.outcome==="captured"?-4:3};
  }
  function read(storage){try{const saved=JSON.parse(storage.getItem(KEY)||"null");return saved?.version===1&&Array.isArray(saved.entries)?saved.entries:[]}catch{return[]}}
  function save(storage,entries){storage.setItem(KEY,JSON.stringify({version:1,entries}))}
  function exportJSON(entries){return JSON.stringify({application:"AstroImageNow",version:1,entries},null,2)}
  return{KEY,MAX,normalize,history,read,save,exportJSON};
})();
if(typeof module!=="undefined")module.exports=ObservingJournal;
