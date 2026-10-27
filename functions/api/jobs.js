const COOKIE_NAME='daoyou_session';
function getSession(request){
  const cookie=request.headers.get('Cookie')||'';
  const m=cookie.match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  return m?m[1]:null;
}
async function currentUid(request,env){
  const sid=getSession(request);if(!sid)return null;
  return await env.DAOYOU_DATA.get('session:'+sid);
}
function maskContact(c){
  c=String(c||'');
  if(/^1\d{10}$/.test(c))return c.slice(0,3)+'****'+c.slice(-4);
  return c.length<7?c:c.slice(0,2)+'****'+c.slice(-3);
}
// 从 dateRange 字符串提取结束日期，兼容旧格式 "2026-11-15 至 11-20" 和新 ISO "2026-11-20"
function parseEndDate(j){
  if(j.endDate)return j.endDate;
  const dr=String(j.dateRange||'');
  // 新格式：dateRange 本身就是 "YYYY-MM-DD 至 YYYY-MM-DD"
  let m=dr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s*至?\s*(?:(\d{4})[-\/])?(\d{1,2})[-\/](\d{1,2})/);
  if(m){
    const y=m[4]?m[4]:m[1];
    return `${y}-${m[5].padStart(2,'0')}-${m[6].padStart(2,'0')}`;
  }
  return '';
}
export async function onRequestGet(context){
  const {request,env}=context;
  const sid=getSession(request);
  const uid=sid?await env.DAOYOU_DATA.get('session:'+sid):null;
  const loggedIn=!!uid;
  const raw=await env.DAOYOU_DATA.get('jobs');
  const list=raw?JSON.parse(raw):[];
  const safe=list.map(j=>{
    const isMine=!!j.ownerUid && j.ownerUid===uid;
    const apps=j.applicants||[];
    return {
    id:j.id,
    mine:isMine,
    title:j.title,city:j.city,dateRange:j.dateRange,tourists:j.tourists,
    endDate:parseEndDate(j),
    language:j.language,budget:j.budget,
    contact:loggedIn?j.contact:maskContact(j.contact),
    contactMasked:!loggedIn,
    applicants:isMine?apps.map(a=>({name:(typeof a==='object'?a.name:'导游')})):[],
    applicantsCount:apps.length,
    note:j.note,createdAt:j.createdAt
    };
  });
  return new Response(JSON.stringify({list:safe,loggedIn}),{headers:{'Content-Type':'application/json'}});
}
export async function onRequestPost(context){
  const {request,env}=context;
  const body=await request.json();
  if(!body.title||!body.city||!body.contact)return new Response(JSON.stringify({error:'请填写标题、目的地和联系方式'}),{status:400});
  const uid=await currentUid(request,env);
  const raw=await env.DAOYOU_DATA.get('jobs');
  const list=raw?JSON.parse(raw):[];
  list.unshift({
    id:Date.now(),ownerUid:uid||null,
    title:String(body.title).slice(0,60),city:String(body.city).slice(0,30),
    dateRange:String(body.dateRange||'').slice(0,40),tourists:String(body.tourists||'').slice(0,30),
    language:String(body.language||'').slice(0,30),budget:String(body.budget||'').slice(0,30),
    contact:String(body.contact||'').slice(0,60),note:String(body.note||'').slice(0,300),
    applicants:[],createdAt:new Date().toISOString()
  });
  await env.DAOYOU_DATA.put('jobs',JSON.stringify(list));
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
}
// POST /api/jobs/apply 已拆分到 functions/api/jobs/apply.js（本文件只处理 /api/jobs）
export async function onRequestDelete(context){
  const {request,env}=context;
  const uid=await currentUid(request,env);
  if(!uid)return new Response(JSON.stringify({error:'未登录'}),{status:401});
  const url=new URL(request.url);
  const id=Number(url.searchParams.get('id'));
  const raw=await env.DAOYOU_DATA.get('jobs');
  let list=raw?JSON.parse(raw):[];
  const before=list.length;
  list=list.filter(j=>!(j.id===id && j.ownerUid===uid));
  if(list.length===before)return new Response(JSON.stringify({error:'找不到这条记录或不是你发布的'}),{status:403});
  await env.DAOYOU_DATA.put('jobs',JSON.stringify(list));
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
}
