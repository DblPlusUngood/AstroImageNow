const CACHE="astro-image-now-v1.13.0";
const FILES=["./","./index.html","./providers.js","./vendor/astronomy.browser.min.js","./data/targets.js","./filters.js","./forecast-model.js","./journal.js","./advisor.js","./equipment.js","./planner.js","./planner-ui.js","./data/solar-system.js","./opportunities.js","./site-forecasts.js","./theme.css","./data/README.md","./data/OpenNGC-LICENSE.txt","./vendor/astronomy-LICENSE.txt","./app.js","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png"];
const SHELL=new Set(FILES.map(file=>new URL(file,self.location).href));

self.addEventListener("install",event=>{
  // Bypass an older browser HTTP-cache entry when installing a newer app shell.
  const requests=FILES.map(file=>new Request(new URL(file,self.location),{cache:"reload"}));
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(requests)));
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith("astro-image-now-")&&key!==CACHE).map(key=>caches.delete(key))
  )));
});

self.addEventListener("message",event=>{
  if(event.data?.type==="APPLY_UPDATE")self.skipWaiting();
});

self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  url.hash=""; // A section anchor identifies the same cached document, including on offline reload.
  if(event.request.method!=="GET"||!SHELL.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.href)).then(response=>response||fetch(event.request)));
});
