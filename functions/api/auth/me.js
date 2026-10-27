const ADMIN_EMAILS=['xinhua.felix@icloud.com','920719197@qq.com'];
const COOKIE_NAME='daoyou_session';
export async function onRequestGet(context){
  const sid=(context.request.headers.get('Cookie')||'').match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  if(!sid)return json({loggedIn:false});
  const uid=await context.env.DAOYOU_DATA.get('session:'+sid[1]);
  if(!uid)return json({loggedIn:false});
  const u=await context.env.DAOYOU_DATA.get('user:'+uid);
  if(!u)return json({loggedIn:false});
  const d=JSON.parse(u);
  return json({loggedIn:true,name:d.name,email:d.email,isAdmin:ADMIN_EMAILS.includes(d.email)});
}
function json(o){return new Response(JSON.stringify(o),{headers:{'Content-Type':'application/json'}})}
