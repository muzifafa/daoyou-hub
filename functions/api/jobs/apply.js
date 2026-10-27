const COOKIE_NAME='daoyou_session';
function getSession(request){
  const cookie=request.headers.get('Cookie')||'';
  const m=cookie.match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  return m?m[1]:null;
}
const JSON_HEADERS={'Content-Type':'application/json'};

export async function onRequestPost(context){
  const {request,env}=context;
  const sid=getSession(request);
  const uid=sid?await env.DAOYOU_DATA.get('session:'+sid):null;
  if(!uid)return new Response(JSON.stringify({error:'请先登录后再接单'}),{status:401,headers:JSON_HEADERS});

  let body;
  try{body=await request.json();}catch(e){return new Response(JSON.stringify({error:'参数错误'}),{status:400,headers:JSON_HEADERS});}
  const id=Number(body.id);

  const raw=await env.DAOYOU_DATA.get('jobs');
  const list=raw?JSON.parse(raw):[];
  const j=list.find(x=>x.id===id);
  if(!j)return new Response(JSON.stringify({error:'需求不存在或已下架'}),{status:404,headers:JSON_HEADERS});
  if(j.ownerUid && j.ownerUid===uid)return new Response(JSON.stringify({error:'这是你自己发布的需求，无需报名'}),{status:400,headers:JSON_HEADERS});

  const u=await env.DAOYOU_DATA.get('user:'+uid);
  const uname=u?JSON.parse(u).name:'导游';

  j.applicants=j.applicants||[];
  const has=j.applicants.some(a=>(typeof a==='object'?a.uid:a)===uid);
  if(!has)j.applicants.push({uid,name:uname,at:Date.now()});
  await env.DAOYOU_DATA.put('jobs',JSON.stringify(list));
  return new Response(JSON.stringify({ok:true,count:j.applicants.length}),{headers:JSON_HEADERS});
}
