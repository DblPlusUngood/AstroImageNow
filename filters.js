"use strict";
const ImagingFilters=(()=>{
  const choices=[
    {id:"none",name:"Unfiltered",kind:"none",status:"available"},
    {id:"l-pro",name:"L-Pro",kind:"broadband",status:"owned"},
    {id:"l-ultimate",name:"L-Ultimate",kind:"dual-band",status:"planned"},
    {id:"uv-ir",name:"UV/IR-cut",kind:"uv-ir",status:"proposed"}
  ];
  const emission=target=>["emission","supernova","planetary-nebula"].includes(target.objectType);
  function advice(target,filter,rig){
    let text;
    if(filter?.id==="l-ultimate")text=target.body?"Use a broad visible-light option for natural-color lunar/planetary work.":emission(target)?"Ha/O III emission detail; useful under light pollution or a bright Moon. Cloud and seeing still matter.":"Switch to a broadband option: this filter removes much of a galaxy, star cluster or reflection nebula's light.";
    else if(filter?.id==="l-pro")text=target.body?"For natural-color lunar/planetary capture, prefer no added filter on the Canon or UV/IR-cut on the ASI533.":"Broadband light-pollution option. Compare color and faint detail with a clear-sky baseline.";
    else if(filter?.id==="uv-ir")text=rig?.cameraId==="r6ii"?"Usually unnecessary on an unmodified Canon; its internal filtering already limits UV/IR.":"Broad visible light for natural-color stars, galaxies and planetary capture; limits out-of-band light on the ASI533.";
    else text=rig?.cameraId==="533"?"Maximum throughput. The ASI533 has an AR window; UV/IR-cut is the proposed natural-color baseline.":"Broadband baseline, especially for galaxies, clusters, reflection nebulae and natural-color planets.";
    if(filter?.status==="planned")text+=" Planned filter.";
    if(filter?.status==="proposed")text+=" Proposed filter.";
    if(filter&&filter.id!=="none"&&rig&&!(rig.telescopeId==="z73"&&rig.cameraId==="533"&&filter.id==="l-pro"))text+=" Confirm the filter/adapter path.";
    return text;
  }
  function recommend(target,{rig,site={},moonBright=false,includePlanned=false}={}){
    let id="none",reason="Preserve broadband color and continuum detail.";
    if(target.body){id=rig?.cameraId==="533"&&includePlanned?"uv-ir":"none";reason="Broad visible light for lunar/planetary detail."}
    else if(emission(target)&&(moonBright||site.bortle>=6)){
      id=includePlanned?"l-ultimate":"l-pro";reason=includePlanned?"Isolate Ha/O III emission under the bright sky.":"Use the owned broadband option; L-Ultimate is the planned emission upgrade.";
    }else if(rig?.cameraId==="533"&&includePlanned){id="uv-ir";reason="Natural-color broadband capture with the ASI533."}
    else if(rig?.cameraId==="533"&&site.bortle>=6){id="l-pro";reason="Owned broadband option for this bright site."}
    return{filter:choices.find(f=>f.id===id),reason};
  }
  return{choices,advice,recommend,emission};
})();
if(typeof module!=="undefined")module.exports=ImagingFilters;
