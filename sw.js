const CACHE="astro-image-now-v1.11.0";
const FILES=["./","./index.html","./providers.js","./vendor/astronomy.browser.min.js","./data/targets.js","./equipment.js","./planner.js","./planner-ui.js","./data/README.md","./data/OpenNGC-LICENSE.txt","./vendor/astronomy-LICENSE.txt","./app.js","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png"];
const SHELL=new Set(FILES.map(file=>new URL(file,self.location).href));

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
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
  if(event.request.method!=="GET"||!SHELL.has(event.request.url))return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(response=>response||fetch(event.request)));
});
