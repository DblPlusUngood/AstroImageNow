"use strict";
// Ownership: reconciled rig record + user confirmation, 2026-09-19. Optical values are nominal.
const AstroEquipment=(()=>{
  const F=typeof module!=="undefined"?require("./filters.js"):ImagingFilters;
  const cameras=[
    {id:"533",name:"ASI533MC Pro",sensorWidthMm:11.31,sensorHeightMm:11.31,pixelSizeUm:3.76,note:"Shared cooled camera; use one optical train at a time."},
    {id:"r6ii",name:"Canon R6 Mark II",sensorWidthMm:36,sensorHeightMm:24,pixelSizeUm:6,note:"Full still-image sensor field; vignetting and video crop/ROI are not modeled. Adapter compatibility needs verification."}
  ];
  const telescopes=[
    {id:"z73",name:"William Optics Z73",shortName:"Z73",mode:"deep-sky",defaultCamera:"533",apertureMm:73,
      configurations:[{id:"native",name:"Flat73A · 1×",focalLengthMm:430}],
      readiness:"Star Adventurer GTi · Elite Drawer OAG + ASI120MM Mini installed; optical spacing still needs field verification."},
    {id:"c8",name:"C8 / NexStar 8SE",shortName:"C8 / NexStar 8SE",mode:"planetary",defaultCamera:"r6ii",apertureMm:203.2,
      configurations:[{id:"native",name:"Native · f/10",focalLengthMm:2032},{id:"reduced",name:"f/6.3 reducer",focalLengthMm:1280.16},{id:"barlow",name:"Barlow",focalLengthMm:2032}],
      readiness:"Native alt-az mount favors lunar/planetary video and short exposures. Long deep-sky exposures are limited by field rotation. Camera adapters, focus and clearance need commissioning; Barlows are 1.25-inch."},
    {id:"ultracat56",name:"William Optics UltraCat 56",shortName:"UltraCat 56",mode:"deep-sky",defaultCamera:"533",apertureMm:56,
      configurations:[{id:"native",name:"Native · f/4.8",focalLengthMm:269}],
      readiness:"Owned, newly added. Planning baseline shares the ASI533; mount, camera connection and guiding are not yet verified. Petzval design needs no external field flattener."}
  ];
  const rigs=[];
  for(const scope of telescopes)for(const config of scope.configurations)for(const power of config.id==="barlow"?[2,3]:[1])for(const camera of cameras){
    const focalLengthMm=config.focalLengthMm*power;
    const id=scope.id==="z73"&&camera.id==="533"?"z73-533":`${scope.id}-${config.id}${power>1?power:""}-${camera.id}`;
    rigs.push({...camera,id,telescopeId:scope.id,configurationId:config.id,cameraId:camera.id,barlowPower:power,
      name:`${scope.name} · ${power>1?`${power}× Barlow`:config.name} + ${camera.name}`,
      mode:scope.mode,focalLengthMm,apertureMm:scope.apertureMm,fRatio:focalLengthMm/scope.apertureMm,
      readiness:`${scope.readiness} ${camera.note}`,
      // Planning choices are distinct from ownership and mechanical compatibility.
      filters:F.choices});
  }
  function resolve(scopeId,configId,cameraId,power=2){
    return rigs.find(r=>r.telescopeId===scopeId&&r.configurationId===configId&&r.cameraId===cameraId&&(configId!=="barlow"||r.barlowPower===Number(power)))||rigs[0];
  }
  return{version:2,cameras,telescopes,rigs,resolve};
})();
if(typeof module!=="undefined")module.exports=AstroEquipment;
