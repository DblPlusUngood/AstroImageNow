"use strict";
// Nominal optical specifications; ownership/status reconciled with the rig record 2026-09-19.
const AstroEquipment={
  version:1,
  rigs:[{
    id:"z73-533",name:"Z73 + ASI533MC Pro",mode:"deep-sky",focalLengthMm:430,
    sensorWidthMm:11.31,sensorHeightMm:11.31,pixelSizeUm:3.76,
    flattener:"Flat73A 1.0×",mount:"Star Adventurer GTi",
    guider:"Elite Drawer OAG + ASI120MM Mini",
    readiness:"OAG installed; optical spacing still needs field verification.",
    filters:[{id:"none",name:"Unfiltered",kind:"none"},{id:"l-pro",name:"Optolong L-Pro",kind:"broadband"}],
    sources:["https://support.williamoptics.com/products/zenithstar-73-iii","https://www.zwoastro.com/product/asi533-pro-series/"]
  }],
  separateRig:{id:"c8",name:"C8 / NexStar 8SE",mode:"lunar-planetary",note:"Lunar/planetary and family live view; camera connection and commissioning remain separate from this deep-sky planner."}
};
if(typeof module!=="undefined")module.exports=AstroEquipment;
