import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function navigation(){
 const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const code=source.match(/function show\(v[\s\S]*?(?=\nfunction goPostJob)/)?.[0];assert.ok(code);
 const make=()=>({classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},querySelector(){return {textContent:'Page'};}});
 const nodes=Object.fromEntries(['view-home','view-map','view-guides','view-jobs','view-feedback','view-me','view-admin','navlinks','main'].map(k=>[k,make()]));
 const calls=[];let focused=0;nodes.main.focus=()=>focused++;
 const location={hash:''};
 const history={pushState(_state,_title,url){calls.push(url);location.hash=url;},replaceState(){}};
 const document={getElementById:k=>nodes[k]||null,querySelectorAll:()=>[],querySelector:()=>null,title:''};
 const context={document,location,history,window:{scrollTo(){}},closeMenu(){},loadGuides(){},loadJobs(){},loadMe(){},loadAdmin(){}};
 vm.runInNewContext(code,context);
 return {show:context.show,calls,focused:()=>focused};
}
test('history traversal renders the target without inserting a new history entry',()=>{
 const n=navigation();n.show('map',{historyMode:'none'});assert.equal(n.calls.length,0);
 n.show('home',{historyMode:'none'});assert.equal(n.calls.length,0);
});
test('selecting the current view twice does not duplicate history entries',()=>{
 const n=navigation();n.show('guides');n.show('guides');assert.equal(n.calls.length,1);
});
test('initial route rendering does not steal keyboard focus',()=>{
 const n=navigation();n.show('map',{historyMode:'none',focus:false});assert.equal(n.focused(),0);
});
