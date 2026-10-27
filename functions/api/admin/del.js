const COOKIE_NAME='daoyou_session';
const ADMIN_EMAILS=['xinhua.felix@icloud.com','920719197@qq.com'];
async function isAdmin(request,env){
  const cookie=request.headers.get('Cookie')||'';
  const m=cookie.match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  if(!m)return false;
  const uid=await env.DAOYOU_DATA.get('session:'+m[1]);
  if(!uid)return false;
  const u=await env.DAOYOU_DATA.get('user:'+uid);
  if(!u)return false;
  return ADMIN_EMAILS.includes(JSON.parse(u).email);
}
export async function onRequestDelete(context){
  const {request,env}=context;
  if(!await isAdmin(request,env))return new Response(JSON.stringify({error:'无权限'}),{status:403});
  const url=new URL(request.url);
  const kind=url.searchParams.get('kind');
  const id=Number(url.searchParams.get('id'));
  if(!['guides','jobs','feedback'].includes(kind))return new Response(JSON.stringify({error:'无效类型'}),{status:400});
  const raw=await env.DAOYOU_DATA.get(kind);
  let list=raw?JSON.parse(raw):[];
  list=list.filter(x=>x.id!==id);
  await env.DAOYOU_DATA.put(kind,JSON.stringify(list));
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
}
