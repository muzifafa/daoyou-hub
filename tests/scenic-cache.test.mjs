import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {onRequest} from '../functions/_middleware.js';
test('scenic data runtime responses require immediate revalidation',async()=>{
 const r=await onRequest({request:new Request('https://example.test/scenic-data.js'),next:async()=>new Response('data',{headers:{'Cache-Control':'public, max-age=14400'}})});
 assert.match(r.headers.get('Cache-Control'),/max-age=0/);
});
function worker(){
 const handlers={},store=new Map();let fetcher=async()=>new Response('const RAW_DATA=["new"]');let mode;
 const ctx={location:{origin:"https://example.test"},URL,Response,Headers,Date,console,fetch:async(_request,options)=>{mode=options?.cache;return fetcher()},self:{addEventListener:(type,fn)=>{handlers[type]=fn}},caches:{open:async()=>({put:async(req,res)=>store.set(req.url||req,res.clone()),addAll:async()=>{}}),match:async req=>store.get(req.url||req)?.clone()},};
 vm.runInNewContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),ctx);
 return {store,setFetch(fn){fetcher=fn},get mode(){return mode},async request(){let promise;const waits=[];handlers.fetch({request:new Request('https://example.test/scenic-data.js'),respondWith(p){promise=p},waitUntil(p){waits.push(p)}});const r=await promise;await Promise.all(waits);return r;}};
}
test('a new scenic version replaces cached policy data on the first request',async()=>{
 const w=worker();w.store.set('https://example.test/scenic-data.js',new Response('const RAW_DATA=["old"]'));
 const r=await w.request();const s=await r.text();assert.match(s,/new/);assert.doesNotMatch(s,/old/);assert.equal(w.mode,'no-store');
});
test('offline scenic fallback is identified and preserves the last successful version',async()=>{
 const w=worker();await w.request();w.setFetch(async()=>{throw new Error('offline')});
 const r=await w.request();assert.equal(r.headers.get('X-Scenic-Source'),'offline');const s=await r.text();assert.match(s,/new/);assert.match(s,/"offline":true/);
});
