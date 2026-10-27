const COOKIE_NAME='daoyou_session';
async function sha256(s){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function onRequestPost(context){
  const {request,env}=context;
  try{
    const body=await request.json();
    const email=String(body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    const uid=await env.DAOYOU_DATA.get('user:email:'+email);
    if(!uid)return json({error:'邮箱未注册'},400);
    const u=JSON.parse(await env.DAOYOU_DATA.get('user:'+uid));
    const hash=await sha256(u.salt+password);
    if(hash!==u.hash)return json({error:'密码错误'},400);
    const sid=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
    await env.DAOYOU_DATA.put('session:'+sid,uid,{expirationTtl:60*60*24*30});
    return new Response(JSON.stringify({ok:true,name:u.name}),{
      headers:{
        'Content-Type':'application/json',
        'Set-Cookie':`${COOKIE_NAME}=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
      }
    });
  }catch(e){return json({error:'登录失败'},500)}
}
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}})}
