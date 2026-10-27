async function sha256(s){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function randomId(n=16){return [...crypto.getRandomValues(new Uint8Array(n))].map(b=>b.toString(16).padStart(2,'0')).join('');}
const COOKIE_NAME='daoyou_session';

export async function onRequestPost(context){
  const {request,env}=context;
  try{
    const body=await request.json();
    const email=String(body.email||'').trim().toLowerCase();
    const password=String(body.password||'');
    const name=String(body.name||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return json({error:'邮箱格式不正确'},400);
    if(password.length<6)return json({error:'密码至少6位'},400);
    if(!name)return json({error:'请填昵称'},400);
    const exist=await env.DAOYOU_DATA.get('user:email:'+email);
    if(exist)return json({error:'该邮箱已注册'},400);
    const uid=randomId(16);
    const salt=randomId(8);
    const hash=await sha256(salt+password);
    await env.DAOYOU_DATA.put('user:'+uid,JSON.stringify({uid,email,name,salt,hash,createdAt:new Date().toISOString()}));
    await env.DAOYOU_DATA.put('user:email:'+email,uid);
    const sid=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
    await env.DAOYOU_DATA.put('session:'+sid,uid,{expirationTtl:60*60*24*30});
    return new Response(JSON.stringify({ok:true,name}),{
      headers:{
        'Content-Type':'application/json',
        'Set-Cookie':COOKIE_NAME+'='+sid+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000'
      }
    });
  }catch(e){return json({error:'注册失败'},500)}
}
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}})}
