import { parseFilters, filterRows, filterURL } from "./map-filters.js?v=20261029b";
const NATIONAL = {"title":"《导游管理办法》第二十七条（国家层面鼓励性依据）","issuer":"国家旅游局令第44号，自2018年1月1日起施行","quote":"鼓励景区对持有导游证从事执业活动或者与执业相关活动的导游免除门票。","note":"该条款性质为「鼓励」而非强制性法律义务，因此是否免票、是否要求带团、是否仅限首道门票，由各地景区/文旅部门自行制定；这也是各省、各景区政策口径不一的根本原因。","source_title":"导游管理办法_文化和旅游部_中国政府网","source_url":"https://www.gov.cn/zhengce/2017-11/01/content_5712513.htm"};
/* ================= 状态与工具 ================= */
const state = parseFilters(location.search, RAW_DATA);
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const COND_CLS = { '带团免票':'cond-tour', '个人持证免票':'cond-self', '资格证免票':'cond-qual', '本身免费':'cond-free', '不免':'cond-no', '待核实':'cond-pend', '未说明':'cond-unknown' };

/* ================= 统计 ================= */
const total = RAW_DATA.length;
const verified=RAW_DATA.filter(r=>r.verification==='已查证').length;
document.getElementById('verification-summary').textContent=`已收录 ${total} 条 · 已查证 ${verified} 条 · 单方报告 ${total-verified} 条`;
const nFree = RAW_DATA.filter(r=>r.category==='本身免费').length;
const nSelf = RAW_DATA.filter(r=>r.condition_type==='个人持证免票').length;
const nTour = RAW_DATA.filter(r=>r.condition_type==='带团免票').length;
const nNo = RAW_DATA.filter(r=>r.category==='不免').length;
const nPend = RAW_DATA.filter(r=>r.category==='待核实').length;
const nCoord = RAW_DATA.filter(r=>r.lat!=null && r.lng!=null).length;
const nNoCoord = total - nCoord;
document.getElementById('count-no').textContent=nNo;
document.getElementById('count-pending').textContent=nPend;
document.getElementById('count-no-coord').textContent=nNoCoord;
const provCount = {};
RAW_DATA.forEach(r=>provCount[r.province]=(provCount[r.province]||0)+1);
const provOrder = Object.keys(provCount).sort((a,b)=>provCount[b]-provCount[a]||a.localeCompare(b,'zh'));
document.getElementById('stats').innerHTML =
  `<div class="stat"><b>${total}</b><span>景区总数</span></div>`+
  `<div class="stat"><b>${nFree}</b><span>本身免费</span></div>`+
  `<div class="stat"><b>${nSelf}</b><span>个人持证免票</span></div>`+
  `<div class="stat"><b>${nTour}</b><span>带团免票</span></div>`+
  `<div class="stat"><b>${nNo}</b><span>不免</span></div>`+
  `<div class="stat"><b>${nPend}</b><span>待核实</span></div>`+
  `<div class="stat"><b>${nCoord}</b><span>已标注坐标</span></div>`+
  `<div class="stat"><b>${nNoCoord}</b><span>坐标待核实</span></div>`;

document.getElementById('nationalBox').innerHTML =
  `<h3>${esc(NATIONAL.title)}</h3>`+
  `<p>“${esc(NATIONAL.quote)}”</p>`+
  `<p class="note">${esc(NATIONAL.note)}<br>来源：<a href="${esc(NATIONAL.source_url)}" target="_blank" rel="noopener">${esc(NATIONAL.source_title)}</a></p>`;

/* ================= 筛选导航 ================= */
const catCount = {};
RAW_DATA.forEach(r=>catCount[r.category]=(catCount[r.category]||0)+1);
const typeNav = document.getElementById('typeNav');
let th = `<span class="rowlabel">政策类型</span><button data-cat="全部" class="active" type="button">全部<span class="n">${total}</span></button>`;
[['持证免票',catCount['持证免票']||0,''],['本身免费',nFree,'t-free'],['带团免票',nTour,''],['不免',nNo,'t-no'],['待核实',nPend,'t-pend']].forEach(([c,n,cls])=>{
  th += `<button data-cat="${c}" class="${cls}" type="button">${c}<span class="n">${n}</span></button>`;
});
typeNav.innerHTML = th;
typeNav.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  state.category=b.dataset.cat;
  typeNav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
  renderAll();
});

const nav = document.getElementById('provnav');
let navHtml = `<span class="rowlabel">省份</span><button data-prov="全部" class="active" type="button">全部<span class="n">${total}</span></button>`;
provOrder.forEach(p=>{ navHtml += `<button data-prov="${esc(p)}" type="button">${esc(p)}<span class="n">${provCount[p]}</span></button>`; });
nav.innerHTML = navHtml;
nav.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  state.province=b.dataset.prov;
  nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
  renderAll();
});

/* ================= 过滤与来源渲染 ================= */
function getFiltered(){ return filterRows(RAW_DATA,state); }

function srcHtml(r){
  const links=(r.sources||[]).map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`).join(' · ');
  return `${r.platform?`<span class="plat">${esc(r.platform)}</span>`:''}<span>来源：</span>${(r.sources||[]).length>1?`<span class="nosrc">${esc(r.source_title||'')}</span> · `:''}${links||`<span class="nosrc">${esc(r.source_title||'未记录来源')}（暂无直达链接，需进一步核验）</span>`}${r.time?`<span class="nosrc"> · 来源记录日期：${esc(r.time)}</span>`:''}`;
}
function cardHtml(r){
  const badges=[
    `<span class="badge ${COND_CLS[r.condition_type]||'cond-unknown'}">${esc(r.condition_type||'未说明')}</span>`,
    `<span class="badge ${r.verification==='已查证'?'vfy-yes':'vfy-one'}">${esc(r.verification||'未说明')}</span>`
  ];
  if(r.from_comment) badges.push('<span class="badge badge-cmt">评论补充</span>');
  let h=`<article class="card"><h3>${esc(r.name)}</h3>`+
    `<div class="loc"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>${esc(r.province)} · ${esc(r.city)}${r.address?' · '+esc(r.address):''}</div>`+
    `<div class="badges">${badges.join('')}</div>`;
  if(r.lat==null||r.lng==null||r.coordinate_status==='待核实'){
    h+=`<div class="coord-warn"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>坐标待核实</div>`;
  }
  h+=`<p class="policy">${esc(r.policy)}</p>`+
    `<div class="src">${srcHtml(r)}</div></article>`;
  return h;
}

/* ================= 列表：分批懒渲染 ================= */
const BATCH=50;
let items=[], rendered=0, io=null, sentinel=null;
function buildItems(rows){
  const arr=[];
  if(!rows.length)return arr;
  if(state.province==='全部'){
    provOrder.forEach(p=>{
      const g=rows.filter(r=>r.province===p);
      if(!g.length) return;
      arr.push({h:p,n:g.length});
      g.forEach(r=>arr.push({c:r}));
    });
  } else {
    arr.push({h:state.province,n:rows.length});
    rows.forEach(r=>arr.push({c:r}));
  }
  return arr;
}
function appendBatch(){
  let html='';
  for(let i=0;i<BATCH && rendered<items.length;i++,rendered++){
    const it=items[rendered];
    html+=it.h?`<h2 class="group-h">${esc(it.h)}<span class="cnt">${it.n} 处</span></h2>`:cardHtml(it.c);
  }
  sentinel.insertAdjacentHTML('beforebegin',html);
  const done=rendered>=items.length;
  document.getElementById('load-more').hidden=done||!!io;
  if(done){io?.disconnect();sentinel.remove();}
}
function renderList(rows){
  const el=document.getElementById('list');
  items=buildItems(rows);io?.disconnect();io=null;
  document.getElementById('load-more').hidden=true;
  if(!items.length){el.innerHTML='<div class="empty">没有匹配的景区，可清除筛选后再试。</div>';return;}
  el.innerHTML='';rendered=0;sentinel=document.createElement('div');el.appendChild(sentinel);
  if(typeof IntersectionObserver==='function')io=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)appendBatch();},{rootMargin:'600px'});
  appendBatch();
  if(io&&rendered<items.length)io.observe(sentinel);
}
document.getElementById('load-more').addEventListener('click',appendBatch);

/* ================= 地图：markercluster ================= */
let map=null,mcg=null;
/* 瓦片源：高德中文(GCJ02)为主，Esri/Carto(WGS84)自动回退，避免 OSM 对本地文件打开方式封禁 */
let TILE_MODE='gcj';
const TILE_LAYERS=[
  {url:'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}', att:'© 高德地图', mode:'gcj'},
  {url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', att:'Tiles © Esri', mode:'wgs'},
  {url:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', att:'© OpenStreetMap contributors © CARTO', mode:'wgs', sub:'abcd'}
];
let tileIdx=0, tileSwitchLock=false, tileLayer=null;
function setTileLayer(idx){
  const cfg=TILE_LAYERS[idx];
  tileIdx=idx;tileSwitchLock=false;
  TILE_MODE=cfg.mode;
  if(tileLayer) map.removeLayer(tileLayer);
  const opts={attribution:cfg.att, maxZoom:18};
  if(cfg.sub) opts.subdomains=cfg.sub;
  tileLayer=L.tileLayer(cfg.url,opts).addTo(map);
  tileLayer.on('tileerror',function(){
    if(tileIdx!==idx||tileSwitchLock)return;
    if(idx>=TILE_LAYERS.length-1){document.getElementById('map-message').textContent='底图暂时加载失败，景区列表和筛选仍可使用。';return;}
    tileSwitchLock=true;
    setTimeout(function(){ setTileLayer(idx+1); renderMap(); },600);
  });
}

/* WGS84 → GCJ02（高德）坐标转换，标准公开算法 */
function transformLat(x,y){
  var ret=-100.0+2.0*x+3.0*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
  ret+=(20.0*Math.sin(6.0*x*Math.PI)+20.0*Math.sin(2.0*x*Math.PI))*2.0/3.0;
  ret+=(20.0*Math.sin(y*Math.PI)+40.0*Math.sin(y/3.0*Math.PI))*2.0/3.0;
  ret+=(160.0*Math.sin(y/12.0*Math.PI)+320*Math.sin(y*Math.PI/30.0))*2.0/3.0;
  return ret;
}
function transformLng(x,y){
  var ret=300.0+x+2.0*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
  ret+=(20.0*Math.sin(6.0*x*Math.PI)+20.0*Math.sin(2.0*x*Math.PI))*2.0/3.0;
  ret+=(20.0*Math.sin(x*Math.PI)+40.0*Math.sin(x/3.0*Math.PI))*2.0/3.0;
  ret+=(150.0*Math.sin(x/12.0*Math.PI)+300.0*Math.sin(x/30.0*Math.PI))*2.0/3.0;
  return ret;
}
function wgs2gcj(lat,lng){
  var a=6378245.0, ee=0.00669342162296594323, PI=Math.PI;
  var dLat=transformLat(lng-105.0,lat-35.0), dLng=transformLng(lng-105.0,lat-35.0);
  var radLat=lat/180.0*PI, magic=Math.sin(radLat);
  magic=1-ee*magic*magic;
  var sqrtMagic=Math.sqrt(magic);
  dLat=(dLat*180.0)/((a*(1-ee))/(magic*sqrtMagic)*PI);
  dLng=(dLng*180.0)/(a/sqrtMagic*Math.cos(radLat)*PI);
  return [lat+dLat, lng+dLng];
}
function geoLat(lat,lng){ return TILE_MODE==='gcj'?wgs2gcj(lat,lng)[0]:lat; }
function geoLng(lat,lng){ return TILE_MODE==='gcj'?wgs2gcj(lat,lng)[1]:lng; }
function mapUnavailable(){
 document.getElementById('map-message').textContent='地图组件暂时无法加载，景区列表、搜索和来源链接仍可使用。';
 document.getElementById('mapPane').innerHTML='<div class="empty">地图暂不可用，请使用景区列表，或稍后重新加载此页。</div>';
}
function initializeMap(){
 if(typeof L==='undefined'||typeof L.markerClusterGroup!=='function'){mapUnavailable();return;}
 try{
  map=L.map('mapPane',{attributionControl:true,worldCopyJump:true,maxZoom:18}).setView([35.5,107],4);
mcg = L.markerClusterGroup({
  maxClusterRadius:48,
  iconCreateFunction:function(cl){
    const n=cl.getChildCount();
    const cls = n<15 ? 'cl-sm' : n<60 ? 'cl-md' : 'cl-lg';
    return L.divIcon({html:`<div class="cluster ${cls}"><span>${n}</span></div>`, className:'', iconSize:null});
  }
});
map.addLayer(mcg);

  setTileLayer(0);
 }catch(error){map?.remove();map=null;mcg=null;mapUnavailable();}
}
function markerCls(r){
  const v = r.verification==='已查证';
  switch(r.category){
    case '本身免费': return v?'m-free-v':'m-free-o';
    case '不免': return v?'m-no-v':'m-no-o';
    case '待核实': return v?'m-pend-v':'m-pend-o';
    default: return v?'m-verified':'m-one';
  }
}
function renderMap(filtered=getFiltered()){
  if(!map||!mcg)return;
  mcg.clearLayers();
  const rows=filtered.filter(r=>r.lat!=null&&r.lng!=null);
  const pts=[];
  rows.forEach(r=>{
    const icon=L.divIcon({className:'', html:`<div class="marker-dot ${markerCls(r)}" style="width:12px;height:12px"></div>`, iconSize:[12,12], iconAnchor:[6,6]});
    const isV=r.verification==='已查证';
    const popup=`<div class="pop-name">${esc(r.name)}</div>`+
      `<div class="pop-loc">${esc(r.province)} · ${esc(r.city)}</div>`+
      `<div class="pop-policy">${esc(r.policy)}</div>`+
      `<div class="badges" style="margin:4px 0"><span class="badge ${COND_CLS[r.condition_type]||'cond-unknown'}">${esc(r.condition_type||'未说明')}</span><span class="badge ${isV?'vfy-yes':'vfy-one'}">${esc(r.verification)}</span></div>`+
      `<div class="pop-src">${srcHtml(r)}</div>`;
    const mlat=geoLat(r.lat,r.lng), mlng=geoLng(r.lat,r.lng);
    L.marker([mlat,mlng],{icon}).bindPopup(popup).addTo(mcg);
    pts.push([mlat,mlng]);
  });
  if(pts.length===1){ map.setView(pts[0],9); }
  else if(pts.length>1){ map.fitBounds(L.latLngBounds(pts).pad(0.1)); }
  else { map.setView([35.5,107],4); }
}
function renderAll(){
 const rows=getFiltered();renderList(rows);renderMap(rows);
 document.getElementById('result-count').textContent=`找到 ${rows.length} 条景区记录，其中 ${rows.filter(r=>r.lat!=null&&r.lng!=null).length} 条已标注坐标。`;
 document.getElementById('search').value=state.query;
 document.getElementById('verified-only').checked=state.verifiedOnly;
 for(const button of typeNav.querySelectorAll('button')){const active=button.dataset.cat===state.category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
 for(const button of nav.querySelectorAll('button')){const active=button.dataset.prov===state.province;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}
 const url=filterURL(location.href,state);if(url!==location.href)history.replaceState(null,'',url);
}

/* ================= 搜索与 Tab ================= */
let searchTimer;
document.getElementById('search').addEventListener('input',event=>{
 state.query=event.target.value.slice(0,120);clearTimeout(searchTimer);searchTimer=setTimeout(renderAll,180);
});
document.getElementById('verified-only').addEventListener('change',event=>{state.verifiedOnly=event.target.checked;renderAll();});
document.getElementById('clear-filters').addEventListener('click',()=>{clearTimeout(searchTimer);Object.assign(state,parseFilters('',RAW_DATA));renderAll();document.getElementById('search').focus();});
document.getElementById('copy-filters').addEventListener('click',async()=>{
 const url=filterURL(location.href,state);
 try{await navigator.clipboard.writeText(url);document.getElementById('share-status').textContent='筛选链接已复制。';}
 catch{const field=document.getElementById('share-link');field.hidden=false;field.value=url;field.focus();field.select();document.getElementById('share-status').textContent='请复制已选中的筛选链接。';}
});
function setTab(which){
  const toMap = which==='map';
  document.getElementById('mapPane').classList.toggle('hidden', !toMap);
  document.getElementById('listPane').classList.toggle('hidden', toMap);
  document.getElementById('tabMap').classList.toggle('active', toMap);
  document.getElementById('tabList').classList.toggle('active', !toMap);
  document.getElementById('tabMap').setAttribute('aria-selected', toMap?'true':'false');
  document.getElementById('tabList').setAttribute('aria-selected', toMap?'false':'true');
  if(toMap&&map)setTimeout(()=>map.invalidateSize(),60);
}
document.getElementById('tabList').addEventListener('click',()=>setTab('list'));
document.getElementById('tabMap').addEventListener('click',()=>setTab('map'));

initializeMap();
setTab('list');
renderAll();
