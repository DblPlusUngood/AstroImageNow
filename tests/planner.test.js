"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),crypto=require("node:crypto");
const P=require("../planner.js"),C=require("../data/targets.js"),E=require("../equipment.js"),A=require("../vendor/astronomy.browser.min.js");
const site={id:"test",lat:40,lon:-83,bortle:8},rig=E.rigs[0],filter=rig.filters[1];
const close=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} versus ${expected}`);

test("catalog has unique, finite J2000 coordinates and traceable size data",()=>{
  assert.equal(C.targets.length,31);assert.equal(new Set(C.targets.map(t=>t.id)).size,31);
  for(const t of C.targets){assert.equal(t.epoch,"J2000");assert.ok(t.raHours>=0&&t.raHours<24);assert.ok(t.decDeg>=-90&&t.decDeg<=90);assert.ok(t.sources);assert.ok(!Number.isNaN(t.majorArcmin));}
  const m31=C.targets.find(t=>t.designation==='M31');close(m31.raHours,.71231944444,1e-9);close(m31.decDeg,41.2690555556,1e-9);
  assert.equal(m31.majorArcmin,177.83);assert.equal(C.license,"CC-BY-SA-4.0");
});

test("J2000 meridian and pole agree with independent spherical geometry",()=>{
  // GMST at 2000-01-01 12:00 UT = 18.697374558 h (USNO). Nutation is below this tolerance.
  const target={epoch:"J2000",raHours:18.697374558,decDeg:0};
  const location={lat:40,lon:0};
  const pos=P.position(target,'2000-01-01T12:00:00Z',location);
  close(pos.altitude,50,.05);close(pos.azimuth,180,.05);
  close(P.position({epoch:"J2000",raHours:0,decDeg:90},'2000-01-01T12:00:00Z',location).altitude,40,.05);
  assert.ok(P.position(target,'2000-01-01T12:00:00Z',{lat:40,lon:180}).altitude<-49);
});

test("fixed catalog coordinates are precessed consistently with Astronomy Engine fixed stars",()=>{
  const t=C.targets.find(t=>t.designation==='M31'),date=new Date('2050-10-01T04:00:00Z');
  A.DefineStar(A.Body.Star1,t.raHours,t.decDeg,1000000);
  const eq=A.Equator(A.Body.Star1,date,new A.Observer(40,-83,0),true,false);
  const expected=A.Horizon(date,new A.Observer(40,-83,0),eq.ra,eq.dec,null);
  close(P.position(t,date,site).altitude,expected.altitude,.02);
  close(P.position(t,date,site).azimuth,expected.azimuth,.02);
});

test("night boundaries follow the site's time zone across both daylight-saving transitions",()=>{
  const spring=P.zonedNoon('2026-03-08','America/New_York')-P.zonedNoon('2026-03-07','America/New_York');
  const autumn=P.zonedNoon('2026-11-01','America/New_York')-P.zonedNoon('2026-10-31','America/New_York');
  assert.equal(spring,23*3600000);assert.equal(autumn,25*3600000);
  assert.equal(new Date(P.zonedNoon('2026-09-19','America/New_York')).toISOString(),'2026-09-19T16:00:00.000Z');
  assert.equal(P.dateAt('2026-09-20T02:00:00Z','America/New_York'),'2026-09-19');
  assert.equal(P.validDate('2026-02-30'),false);
});

test("nominal Z73 field and image scale expose the real M31 and M45 framing limit",()=>{
  const field=P.fieldOfView(rig);close(field.widthDeg,1.506925,1e-6);close(field.pixelScale,1.803618,1e-6);
  for(const id of['M31','M45'])assert.equal(P.framing(C.targets.find(t=>t.designation===id),rig).kind,'mosaic');
  assert.equal(P.framing(C.targets.find(t=>t.catalogId==='NGC0281'),rig).kind,'comfortable');
  assert.equal(P.framing(C.targets.find(t=>t.designation==='M57'),rig).kind,'small');
  assert.equal(P.framing(C.targets.find(t=>t.catalogId==='NGC2264'),rig).kind,'unknown');
});

test("target windows never leave darkness or the chosen altitude threshold",()=>{
  const plan=P.plan(C.targets,'2026-09-19',site,'America/New_York',rig,{filter,minAltitude:40});
  assert.equal(plan.context.threshold,-18);
  for(const r of plan.results)if(r.window){
    assert.ok(r.window.minutes>0);
    assert.equal(r.window.minutes,(r.window.end-r.window.start)/60000);
    assert.ok(r.window.samples.every(s=>s.altitude>=40&&s.sunAltitude<=-18));
  }
});

test("no-darkness and inaccessible-target cases do not invent an imaging window",()=>{
  const polar=P.plan(C.targets,'2026-06-21',{lat:80,lon:0,bortle:1},'Etc/UTC',rig);
  assert.equal(polar.context.threshold,null);assert.ok(polar.results.every(r=>r.window===null));
  const t={...C.targets[0],decDeg:-85};
  const r=P.plan([t],'2026-09-19',site,'America/New_York',rig).results[0];
  assert.equal(r.window,null);assert.equal(r.band,'Too low in darkness');
});

test("Moon below the horizon removes the Moon caution, with type-aware separation when up",()=>{
  const galaxy=C.targets.find(t=>t.designation==='M33');
  const s={moonAltitude:-2,illumination:.99,moonSeparation:10};assert.equal(P.moonCaution(galaxy,s,filter),false);
  s.moonAltitude=30;assert.equal(P.moonCaution(galaxy,s,filter),true);
  s.moonSeparation=120;assert.equal(P.moonCaution(galaxy,s,filter),false);
  const emission=C.targets.find(t=>t.catalogId==='NGC0281');s.moonSeparation=45;
  assert.equal(P.moonCaution(emission,s,filter),true);assert.equal(P.moonCaution(emission,s,{kind:'dual-band'}),false);
});

test("site brightness changes the dark-sky advice without changing celestial geometry",()=>{
  const target=C.targets.find(t=>t.designation==='M33');
  const home=P.plan([target],'2026-09-19',site,'America/New_York',rig,{filter}).results[0];
  const dark=P.plan([target],'2026-09-19',{...site,bortle:3},'America/New_York',rig,{filter}).results[0];
  assert.equal(home.darkSky,true);assert.equal(dark.darkSky,false);
  assert.equal(home.peak.altitude,dark.peak.altitude);
  assert.equal(P.plan([target],'2026-09-19',{...site,bortle:null},'America/New_York',rig,{filter}).results[0].darkSky,false);
});

test("saved plans are local candidates with valid IDs and no inherited credentials",()=>{
  const entry={date:'2026-09-19',targetId:C.targets[0].id,siteId:site.id,rigId:rig.id,filterId:'l-pro',minAltitude:40,apiKey:'secret',forecaToken:'token',lat:40};
  const plans=P.normalizePlans([entry,entry,{...entry,targetId:'bad'},{...entry,date:'bad'}],C.targets,[site],E.rigs);
  assert.equal(plans.length,1);assert.equal(plans[0].status,'planned');
  assert.ok(!JSON.stringify(plans).includes('secret'));assert.ok(!('lat' in plans[0]));
  assert.equal(plans[0].filterId,'l-pro');assert.equal(plans[0].minAltitude,40);
  const invalid=P.normalizePlans([{...entry,filterId:'unowned-filter',minAltitude:99}],C.targets,[site],E.rigs)[0];
  assert.equal(invalid.filterId,'none');assert.equal(invalid.minAltitude,30);
});

test("shared Sun calculations agree with sampled night geometry",()=>{
  const ctx=P.nightContext('2026-09-19',site,'America/New_York');
  for(const s of ctx.samples.filter((_,i)=>i%6===0))close(P.sunAltitude(new Date(s.ms).toISOString(),site),s.sunAltitude,1e-9);
});

test("vendored engine matches the pinned upstream artifact",()=>{
  const provenance=require('../data/provenance.json');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../vendor/astronomy.browser.min.js'))).digest('hex');
  assert.equal(hash,provenance.sha256['astronomy.browser.min.js']);
});

test("only reconciled owned filters appear in the rig and the L-Pro is not presented as dual-band",()=>{
  assert.deepEqual(rig.filters.map(f=>f.id),['none','l-pro']);
  assert.match(P.filterAdvice(C.targets.find(t=>t.catalogId==='NGC0281'),filter,site),/not a dual-band/);
  assert.equal(E.separateRig.mode,'lunar-planetary');
});
