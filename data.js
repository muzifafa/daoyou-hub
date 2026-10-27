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
  const guides=guidesRaw?JSON.parse(guidesRaw):[];
  const jobs=jobsRaw?JSON.parse(jobsRaw):[];
  const feedback=feedbackRaw?JSON.parse(feedbackRaw):[];
  const today=new Date().toDateString();
  const guidesToday=guides.filter(g=>new Date(g.createdAt).toDateString()===today).length;
  const jobsToday=jobs.filter(j=>new Date(j.createdAt).toDateString()===today).length;
  return new Response(JSON.stringify({
    user,guides,jobs,feedback,
    stats:{guides:guides.length,jobs:jobs.length,feedback:feedback.length,guidesToday,jobsToday}
  }),{headers:{'Content-Type':'application/json'}});
}
