"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const app=require("../app.js");
const hour=3600000,start=Date.parse("2026-10-19T01:00:00Z"),now=start+2*hour+22*60000;
const times=Array.from({length:10},(_,i)=>new Date(start+i*hour).toISOString());
const rows=times.map(UTCForecastHour=>({UTCForecastHour}));
function weather(first=2){
  const time=times.slice(first),values=n=>time.map(()=>n);
  return{hourly:{time,temperature_2m:values(45),precipitation_probability:values(2),precipitation:values(0),wind_gusts_10m:values(7),visibility:values(29872),thunder_probability:values(0)}};
}
test("elapsed darkness does not make complete remaining-night weather incomplete",()=>{
  const w=weather(),wholeNight=app.weatherSummaryForRows(rows,w),remaining=app.weatherSummaryForRows(rows,w,now);
  assert.equal(wholeNight.complete,false);
  assert.equal(remaining.entries.length,8);
  assert.equal(remaining.complete,true);
  assert.equal(app.operationalVerdict(92,remaining)[0],"GO");
});
test("missing current-hour or future weather still requires CHECK WEATHER",()=>{
  for(const index of[0,3,7]){
    const w=weather();for(const field of Object.values(w.hourly))field.splice(index,1);
    const summary=app.weatherSummaryForRows(rows,w,now);
    assert.equal(summary.complete,false);
    assert.equal(app.operationalVerdict(92,summary)[0],"CHECK WEATHER");
  }
});
test("missing current hazard fields remain unknown after elapsed hours are removed",()=>{
  for(const field of["precipitation_probability","precipitation","wind_gusts_10m","visibility","thunder_probability"]){
    const w=weather();w.hourly[field][0]=null;
    assert.equal(app.weatherSummaryForRows(rows,w,now).complete,false,field);
  }
});
test("current-hour storms still block setup while elapsed storms do not",()=>{
  const w=weather(0);w.hourly.thunder_probability[0]=80;
  assert.equal(app.weatherSummaryForRows(rows,w,now).severity,"clear");
  w.hourly.thunder_probability[2]=80;
  assert.equal(app.operationalVerdict(92,app.weatherSummaryForRows(rows,w,now))[0],"NO-GO");
});
test("future nights retain full coverage requirements and elapsed nights give no go-ahead",()=>{
  assert.equal(app.weatherSummaryForRows(rows,weather(),start-hour).complete,false);
  assert.equal(app.weatherSummaryForRows(rows,weather(0),start-hour).complete,true);
  assert.equal(app.weatherSummaryForRows(rows,weather(),start+10*hour),null);
});
