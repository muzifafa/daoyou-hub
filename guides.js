const COOKIE_NAME='daoyou_session';
function getSession(request){
  const cookie=request.headers.get('Cookie')||'';
  const m=cookie.match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  return m?m[1]:null;
}
async function currentUid(request,env){
  const sid=getSession(request);
  if(!sid)return null;
  return await env.DAOYOU_DATA.get('session:'+sid);
}
function maskPhone(p){
  p=String(p||'');
  if(/^1\d{10}$/.test(p))return p.slice(0,3)+'****'+p.slice(-4);
  return p.length<7?p:p.slice(0,2)+'****'+p.slice(-2);
}
export async function onRequestGet(context){
  const {request,env}=context;
  const sid=getSession(request);
  const uid=sid?await env.DAOYOU_DATA.get('session:'+sid):null;
  const loggedIn=!!uid;
  const raw=await env.DAOYOU_DATA.get('guides');
  const list=raw?JSON.parse(raw):[];
  const safe=list.map(g=>({
    id:g.id,
    mine:g.ownerUid===uid,
    name:g.name?g.name[0]+'**':'',
    licenseNo:g.licenseNo?g.licenseNo.slice(0,2)+'****'+g.licenseNo.slice(-2):'',
    city:g.city,
    languages:g.languages,
    agency:g.agency,
    expiry:g.expiry,
    specialty:g.specialty,
    phone:loggedIn?g.phone:maskPhone(g.phone),
    phoneMasked:!loggedIn,
    note:g.note,
    createdAt:g.createdAt
  }));
  return new Response(JSON.stringify({list:safe,loggedIn}),{headers:{'Content-Type':'application/json'}});
}
export async function onRequestPost(context){
  const {request,env}=context;
  const body=await request.json();
  if(!body.name||!body.city||!body.licenseNo)return new Response(JSON.stringify({error:'缺少必填项'}),{status:400});
  const licenseNo=String(body.licenseNo).trim().toUpperCase();
  if(!/^[A-Z]{3}\d{4}[A-Z]$/.test(licenseNo))return new Response(JSON.stringify({error:'导游证号格式不正确，请核对后重填'}),{status:400});
  let expiry=String(body.expiry||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry))expiry='';
  const uid=await currentUid(request,env);
  const raw=await env.DAOYOU_DATA.get('guides');
  const list=raw?JSON.parse(raw):[];
  list.unshift({
    id:Date.now(),
    ownerUid:uid||null,
    name:String(body.name).slice(0,30),
    licenseNo,
    city:String(body.city).slice(0,20),
    languages:String(body.languages||'').slice(0,60),
    agency:String(body.agency||'').slice(0,60),
    expiry,
    specialty:String(body.specialty||'').slice(0,100),
    phone:String(body.phone||'').slice(0,30),
    note:String(body.note||'').slice(0,200),
    createdAt:new Date().toISOString()
  });
  await env.DAOYOU_DATA.put('guides',JSON.stringify(list));
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
}
export async function onRequestDelete(context){
  const {request,env}=context;
  const uid=await currentUid(request,env);
  if(!uid)return new Response(JSON.stringify({error:'未登录'}),{status:401});
  const url=new URL(request.url);
  const id=Number(url.searchParams.get('id'));
  const raw=await env.DAOYOU_DATA.get('guides');
  let list=raw?JSON.parse(raw):[];
  const before=list.length;
  list=list.filter(g=>!(g.id===id && g.ownerUid===uid));
  if(list.length===before)return new Response(JSON.stringify({error:'找不到这条记录或不是你提交的'}),{status:403});
  await env.DAOYOU_DATA.put('guides',JSON.stringify(list));
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
}
