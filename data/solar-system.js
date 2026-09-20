"use strict";
// Positions are computed for the observer and time; these objects have no fixed catalog coordinates.
const SolarSystemTargets=[
  {body:"Moon",name:"Moon",notes:"Lunar detail depends on phase, lighting angle, seeing, focus and thermal equilibrium. A bright Moon is the subject in this mode, not a deep-sky sky-background penalty."},
  {body:"Venus",name:"Venus",notes:"Evening or morning twilight/night planning only. Phase imaging is distinct from cloud detail; no daytime or solar-proximity observing workflow is provided."},
  {body:"Mars",name:"Mars",notes:"Visibility alone does not establish a useful apparent diameter. Opposition, angular size and seasonal features are future event-aware refinements."},
  {body:"Jupiter",name:"Jupiter",notes:"Start at native focal length to establish focus and capture. Seeing and altitude matter strongly; transit and satellite-event predictions are not yet included."},
  {body:"Saturn",name:"Saturn",notes:"Steady air and altitude favor fine detail. Ring opening, angular size and event timing are not yet included in ranking."}
].map(t=>({...t,id:`solar-${t.body.toLowerCase()}`,designation:t.body,catalogId:t.body,aliases:[],objectType:"solar-system",lightPollution:"low",framingReliable:false}));
if(typeof module!=="undefined")module.exports=SolarSystemTargets;
