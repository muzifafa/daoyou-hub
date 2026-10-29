import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const base=new URL('../',import.meta.url);
function filters(){
 const path=new URL('map-filters.js',base);assert.ok(fs.existsSync(path),'map filter helpers have not been implemented');
 return fs.readFileSync(path,'utf8').replace(/\bexport\s+/g,'');
}
const rows=[{name:'西柏坡',province:'河北',city:'石家庄',category:'持证免票',condition_type:'带团免票',verification:'已查证',policy:'test',sources:[],lat:38,lng:114},{name:'测试公园',province:'山东',city:'济南',category:'本身免费',verification:'一方称',policy:'test',sources:[]}];
test('map filters restore only supported provinces, categories and bounded queries',()=>{
 const context={URLSearchParams,URL};vm.createContext(context);vm.runInContext(filters(),context);
 const result=vm.runInContext('parseFilters("?province=未知&category=未知&q="+"x".repeat(200)+"&verified=1",'+JSON.stringify(rows)+')',context);
 assert.equal(result.province,'全部');assert.equal(result.category,'全部');assert.equal(result.query.length,120);assert.equal(result.verifiedOnly,true);
});
test('evidence filtering and shared URLs retain the chosen search conditions',()=>{
 const context={URLSearchParams,URL};vm.createContext(context);vm.runInContext(filters(),context);
 const result=vm.runInContext('(()=>{const state=parseFilters("?province=河北&category=带团免票&q=西柏坡&verified=1",'+JSON.stringify(rows)+');return {count:filterRows('+JSON.stringify(rows)+',state).length,url:filterURL("https://example.test/map",state)};})()',context);
 assert.equal(result.count,1);const url=new URL(result.url);assert.equal(url.searchParams.get('q'),'西柏坡');assert.equal(url.searchParams.get('verified'),'1');
});
function boot(data){
 const nodes={};function node(id){return nodes[id]??= {id,innerHTML:'',textContent:'',hidden:false,value:'',events:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){},querySelectorAll(){return[];},addEventListener(type,fn){this.events[type]=fn;},appendChild(child){child.parent=this;},insertAdjacentHTML(_position,html){(this.parent||this).innerHTML+=html;},remove(){}};}
 const html=fs.readFileSync(new URL('map.html',base),'utf8');
 const app=fs.existsSync(new URL('map.js',base))?fs.readFileSync(new URL('map.js',base),'utf8').replace(/^import[^\n]+\n/,''):html.match(/<script>\s*(const NATIONAL[\s\S]*?)<\/script>/)[1];
 const helper=fs.existsSync(new URL('map-filters.js',base))?filters():'';
 const context={RAW_DATA:data,URL,URLSearchParams,location:{href:'https://example.test/map',search:''},history:{replaceState(){}},document:{getElementById:node,createElement:()=>node('created-'+Object.keys(nodes).length),querySelectorAll(){return[];}},window:{matchMedia:()=>({matches:false}),addEventListener(){}},setTimeout,clearTimeout,console,navigator:{}};
 assert.doesNotThrow(()=>vm.runInNewContext(helper+'\n'+app,context),'list browsing must survive an unavailable map library and observer');
 return nodes;
}
test('a small result set renders without Leaflet or IntersectionObserver',()=>{
 const nodes=boot(rows);assert.ok(nodes.list.innerHTML.includes('西柏坡'));assert.equal(nodes['load-more'].hidden,true);assert.match(nodes['map-message'].textContent,/列表|名录/);
});
test('older browsers retain manual access to later result batches',()=>{
 const data=Array.from({length:75},(_,i)=>({...rows[0],name:'景区'+i}));
 const nodes=boot(data);assert.equal(nodes['load-more'].hidden,false);nodes['load-more'].events.click();assert.equal(nodes['load-more'].hidden,true);assert.ok(nodes.list.innerHTML.includes('景区74'));
});

test('failed tiles can advance through all providers allowed by the page policy',async()=>{
 const app=fs.readFileSync(new URL('map.js',base),'utf8');const code=app.match(/let TILE_MODE[\s\S]*?(?=\/\* WGS84)/)[0];
 const handlers=[],urls=[],message={textContent:''};
 const context={document:{getElementById:()=>message},map:{removeLayer(){}},L:{tileLayer(url){urls.push(url);return {addTo(){return this;},on(_name,handler){handlers.push(handler);return this;}};}},renderMap(){},setTimeout(fn){fn();}};
 vm.createContext(context);vm.runInContext(code,context);vm.runInContext('setTileLayer(0)',context);
 handlers[0]();handlers[1]();handlers[2]();handlers[0]();
 assert.equal(urls.length,3);assert.match(message.textContent,/列表/);
 const {onRequest}=await import('../functions/_middleware.js');const response=await onRequest({request:new Request('https://example.test/map'),next:async()=>new Response('map')});
 const policy=response.headers.get('Content-Security-Policy');assert.ok(policy.includes('https://server.arcgisonline.com'));assert.ok(policy.includes('https://*.basemaps.cartocdn.com'));
});
