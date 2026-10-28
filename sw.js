const CACHE='daoyou-v3';
const ASSETS=['/','/index.html','/manifest.json','/robots.txt'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  // API 请求不缓存
  if(url.pathname.startsWith('/api/'))return;
  // 跨域请求（字体、CDN）不缓存
  if(url.origin!==location.origin)return;
  // 导航请求：network-first，离线时 fallback cache
  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request).then(resp=>{
        const clone=resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request,clone));
        return resp;
      }).catch(()=>caches.match(e.request).then(r=>r||caches.match('/')))
    );
    return;
  }
  // 静态资源：stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const network=fetch(e.request).then(resp=>{
        if(resp&&resp.status===200){
          const clone=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request,clone));
        }
        return resp;
      }).catch(()=>cached);
      return cached||network;
    })
  );
});
