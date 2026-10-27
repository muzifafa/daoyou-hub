const COOKIE_NAME='daoyou_session';
export async function onRequestPost(context){
  const sid=(context.request.headers.get('Cookie')||'').match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  if(sid)await context.env.DAOYOU_DATA.delete('session:'+sid[1]);
  return new Response(JSON.stringify({ok:true}),{
    headers:{
      'Content-Type':'application/json',
      'Set-Cookie':COOKIE_NAME+'=; Path=/; HttpOnly; Secure; Max-Age=0'
    }
  });
}
