const COOKIE_NAME='daoyou_session';
const ADMIN_EMAILS=['xinhua.felix@icloud.com','920719197@qq.com'];
export async function onRequestGet(context){
  const {request,env}=context;
  const cookie=request.headers.get('Cookie')||'';
  const m=cookie.match(new RegExp(COOKIE_NAME+'=([a-f0-9]+)'));
  if(!m)return new Response(JSON.stringify({error:'未登录'}),{status:401});
  const sid=m[1];
  const uid=await env.DAOYOU_DATA.get('session:'+sid);
  if(!uid)return new Response(JSON.stringify({error:'会话过期'}),{status:401});
  const userRaw=await env.DAOYOU_DATA.get('user:'+uid);
  const user=userRaw?JSON.parse(userRaw):null;
  if(!user||!ADMIN_EMAILS.includes(user.email))return new Response(JSON.stringify({error:'无权限'}),{status:403});

  const [guidesRaw,jobsRaw,feedbackRaw]=await Promise.all([
    env.DAOYOU_DATA.get('guides'),
    env.DAOYOU_DATA.get('jobs'),
    env.DAOYOU_DATA.get('feedback')
  ]);
  return new Response(JSON.stringify({
    user,
    guides:guidesRaw?JSON.parse(guidesRaw):[],
    jobs:jobsRaw?JSON.parse(jobsRaw):[],
    feedback:feedbackRaw?JSON.parse(feedbackRaw):[]
  }),{headers:{'Content-Type':'application/json'}});
}
