const CACHE='daoyou-v4-policy-freshness';
const ASSETS=['/','/index.html','/manifest.json','/robots.txt'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
async function taggedScenic(response, offline) {
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  headers.set('Cache-Control','no-store');headers.set('X-Scenic-Source',offline?'offline':'network');
  const metadata={offline,fetchedAt:headers.get('X-Scenic-Fetched-At')||null};
  return new Response('globalThis.SCENIC_DELIVERY='+JSON.stringify(metadata)+';\n'+await response.text(),{status:200,headers});
}
async function freshScenic(request) {
  try {
    const response=await fetch(request,{cache:'no-store'});
    if(!response.ok)throw new Error('Scenic response unavailable');
    const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');
    headers.set('X-Scenic-Fetched-At',new Date().toISOString());
    const stored=new Response(await response.text(),{status:200,headers});
    try { const cache=await caches.open(CACHE);await cache.put(request,stored.clone()); } catch { /* Fresh data still works if cache storage is full. */ }
    return taggedScenic(stored,false);
  } catch {
    const cached=await caches.match(request);
    if(cached)return taggedScenic(cached,true);
    return new Response('throw new Error("景区资料暂不可用，请联网后重新读取。");',{status:503,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});
  }
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/reset-password'))return;
  if(url.pathname==='/scenic-data.js'){event.respondWith(freshScenic(event.request));return;}
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('/'))));return;
  }
  event.respondWith(caches.match(event.request).then(cached=>{
    const network=fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;}).catch(()=>cached);
    return cached||network;
  }));
});
