const COOKIE_NAME='daoyou_session';
function getSession(request){
  const cookie=request.headers.get('Cookie')||'';
  const m=cookie.match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  return m?m[1]:null;
}
function maskContact(c){
  c=String(c||'');
  if(/^1\d{10}$/.test(c))return c.slice(0,3)+'****'+c.slice(-4);
  return c.length<7?c:c.slice(0,2)+'****'+c.slice(-3);
}
export async function onRequestGet(context){
  const {request,env}=context;
  const sid=getSession(request);
  const loggedIn=!!sid && !!(await env.DAOYOU_DATA.get('session:'+sid));
  const raw=await env.DAOYOU_DATA.get('jobs');
  const list=raw?JSON.parse(raw):[];
  const safe=list.map(j=>({
    id:j.id,title:j.title,city:j.city,dateRange:j.dateRange,tourists:j.tourists,
    language:j.language,budget:j.budget,
    contact:loggedIn?j.contact:maskContact(j.contact),
    contactMasked:!loggedIn,
    note:j.note,createdAt:j.createdAt
  }));
  return new Response(JSON.stringify({list:safe,loggedIn}),{headers:{'Content-Type':'application/json'}});
}
export async function onRequestPost(context){
  const {request,env}=context;
  const body=await request.json();
  if(!body.title||!body.city)return new Response(JSON.stringify({error:'缺少标题或目的地'}),{status:400});
  const raw=await env.DAOYOU_DATA.get('jobs');
  const list=raw?JSON.parse(raw):[];
  list.unshift({
    id:Date.now(),title:String(body.title).slice(0,60),city:String(body.city).slice(0,30),
    dateRange:String(body.dateRange||'').slice(0,40),tourists:String(body.tourists||'').slice(0,30),
    language:String(body.language||'').slice(0,30),budget:String(body.budget||'').slice(0,30),
    contact:String(body.contact||'').slice(0,60),note:String(body.note||'').slice(0,300),
    createdAt:new Date().toISOString()
  });
  await env.DAOYOU_DATA.put('jobs',JSON.stringify(list));
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
}
