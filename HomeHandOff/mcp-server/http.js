import http from 'node:http';
import crypto from 'node:crypto';
import { readDb, writeDb, verifyAccount, readAuthStore, createHomeownerAccount, createJudgeDemoSession, callTool, allowed, validRole, audit, resetDb } from './core.js';

const PORT = Number(process.env.HH_API_PORT || process.env.PORT || 3001);
const HOST = process.env.HH_API_HOST || '0.0.0.0';
const sessions = new Map();
let setupInProgress=false;
const mime = { 'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store', 'vary':'Origin' };
const send = (res, status, body, headers = {}) => { res.writeHead(status, { ...mime, ...(res.hhCors||{}), ...headers }); res.end(JSON.stringify(body)); };
function sessionFrom(req) { const cookies = Object.fromEntries((req.headers.cookie||'').split(';').map(pair=>pair.trim().split('=').map(decodeURIComponent))); return sessions.get(cookies.hh_session); }
async function body(req) { let raw=''; for await (const chunk of req) { raw += chunk; if(raw.length>1_000_000) throw new Error('Request body too large'); } return raw ? JSON.parse(raw) : {}; }
const server = http.createServer(async (req,res) => {
  const origin=req.headers.origin;
  if(origin&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin))res.hhCors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'};
  if(req.method==='OPTIONS'){res.writeHead(204,{...mime,...(res.hhCors||{})});return res.end();}
  const url = new URL(req.url,'http://127.0.0.1');
  try {
    if(url.pathname==='/health'&&req.method==='GET')return send(res,200,{status:'ok'});
    if(url.pathname==='/api/health'&&req.method==='GET')return send(res,200,{status:'ok'});
    if(url.pathname==='/api/status'&&req.method==='GET') return send(res,200,{status:'Connected',service:'HomeHandoff Local API + MCP tool layer',mcpToolLayer:'Available',mcpTransport:'stdio JSON-RPC; MCP clients launch mcp-server/mcp.js',sdkInstalled:false,protocol:'MCP initialize, tools/list, tools/call',dataFile:'mcp-server/data/household.json'});
    if(url.pathname==='/api/tools/demo'&&req.method==='GET'){
      const [wifi,restricted]=await Promise.all([callTool('search_home_instruction',{query:'How do I restart the Wi-Fi?',role:'Babysitter'}),callTool('get_guide_location',{guideId:'water-motor-switch',role:'Babysitter'})]);
      return send(res,200,{status:'ok',tests:{search_home_instruction:{input:{query:'How do I restart the Wi-Fi?',role:'Babysitter'},result:wifi},get_guide_location:{input:{guideId:'water-motor-switch',role:'Babysitter'},result:restricted}}});
    }
    if(url.pathname==='/api/auth/setup-status'&&req.method==='GET'){const store=await readAuthStore();return send(res,200,{homeownerConfigured:Boolean(store.homeowner)});}
    if(url.pathname==='/api/auth/setup'&&req.method==='POST'){
      if(setupInProgress)return send(res,409,{error:'Homeowner setup is already in progress. Please wait and try signing in.'});
      setupInProgress=true;
      try{
        const input=await body(req),account=await createHomeownerAccount(input);
        if(!account)return send(res,409,{error:'A homeowner account is already configured. Sign in instead.'});
        const token=crypto.randomBytes(24).toString('hex');sessions.set(token,{...account,accountRole:'Homeowner'});
        return send(res,201,{email:account.email,role:'Homeowner',accountRole:'Homeowner',name:account.name},{'set-cookie':`hh_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`});
      }finally{setupInProgress=false;}
    }
    if(url.pathname==='/api/session'&&req.method==='GET'){const session=sessionFrom(req);return session?send(res,200,{email:session.email,role:session.role,accountRole:session.accountRole,name:session.name}):send(res,401,{error:'Not logged in'});}
    if(url.pathname==='/api/demo-session'&&req.method==='POST'){
      const {role}=await body(req),account=createJudgeDemoSession(role);
      if(!account)return send(res,400,{error:'Choose Homeowner, Babysitter, or Family Member for the judge demo.'});
      const token=crypto.randomBytes(24).toString('hex');sessions.set(token,account);
      return send(res,200,account,{'set-cookie':`hh_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`});
    }
    if(url.pathname==='/api/login'&&req.method==='POST'){const input=await body(req),store=await readAuthStore(),account=await verifyAccount(input.email,input.password,store);if(!account)return send(res,401,{error:'Email or password is incorrect'});const token=crypto.randomBytes(24).toString('hex');sessions.set(token,{...account,accountRole:account.role});return send(res,200,{email:account.email,role:account.role,accountRole:account.role,name:account.name},{'set-cookie':`hh_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`});}
    if(url.pathname==='/api/logout'&&req.method==='POST'){const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)hh_session=([^;]+)/)?.[1];if(cookie)sessions.delete(decodeURIComponent(cookie));return send(res,200,{ok:true},{'set-cookie':'hh_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});}
    if(url.pathname==='/api/session/role'&&req.method==='POST'){const session=sessionFrom(req);if(!session)return send(res,401,{error:'Login required'});const {role}=await body(req);if(!validRole(role))return send(res,400,{error:'Invalid role'});if(session.accountRole!=='Homeowner'&&role!==session.accountRole)return send(res,403,{error:'Log in with the matching demo account to use this role'});session.role=role;return send(res,200,{role:session.role,accountRole:session.accountRole});}
    if(url.pathname.startsWith('/api/tools/')){if(req.method!=='POST')return send(res,405,{error:'POST required'});const session=sessionFrom(req);if(!session)return send(res,401,{error:'Login required'});const name=url.pathname.slice('/api/tools/'.length),input=await body(req);if(session.accountRole!=='Homeowner')input.role=session.role;const result=await callTool(name,input);return send(res,200,{tool:name,result});}
    const session=sessionFrom(req);
    if(url.pathname==='/api/guides'&&req.method==='GET'){if(!session)return send(res,401,{error:'Login required'});const role=session.role;const db=await readDb();return send(res,200,{guides:db.guides.filter((g)=>allowed(g,role)),role});}
    if(url.pathname==='/api/guides'&&req.method==='POST'){if(!session)return send(res,401,{error:'Login required'});const input=await body(req);if(session.role!=='Homeowner')return send(res,403,{error:'Only the homeowner can create or update guides'});const db=await readDb();let guide=input.guide;if(!guide||!guide.title||!Array.isArray(guide.steps))return send(res,400,{error:'Invalid guide'});const previous=db.guides.find((g)=>g.id===guide.id);guide={...guide,version:previous?(Number(previous.version)||1)+1:1,lastUpdated:new Date().toISOString(),updatedBy:session.name,allowedRoles:Array.isArray(guide.allowedRoles)?guide.allowedRoles.filter(validRole):['Homeowner'],steps:guide.steps.map((s,i)=>typeof s==='string'?{id:`${guide.id}-step-${i+1}`,text:s}:s)};db.guides=previous?db.guides.map(g=>g.id===guide.id?guide:g):[guide,...db.guides];audit(db,previous?'guide updated':'guide created',{guideId:guide.id,role:session.role});await writeDb(db);return send(res,200,{guide});}
    if(url.pathname.startsWith('/api/guides/')&&req.method==='DELETE'){if(!session)return send(res,401,{error:'Login required'});if(session.role!=='Homeowner')return send(res,403,{error:'Only the homeowner can delete guides'});const guideId=decodeURIComponent(url.pathname.slice('/api/guides/'.length));const db=await readDb();db.guides=db.guides.filter(g=>g.id!==guideId);await writeDb(db);return send(res,200,{ok:true});}
    if(url.pathname==='/api/requests'&&req.method==='GET'){if(!session)return send(res,401,{error:'Login required'});if(session.role!=='Homeowner')return send(res,403,{error:'Homeowner only'});const db=await readDb();return send(res,200,{requests:db.requests});}
    if(url.pathname==='/api/my-requests'&&req.method==='GET'){if(!session)return send(res,401,{error:'Login required'});const db=await readDb();return send(res,200,{requests:session.role==='Homeowner'?db.requests:db.requests.filter((r)=>r.role===session.role)});}
    if(url.pathname==='/api/requests/cancel'&&req.method==='POST'){if(!session)return send(res,401,{error:'Login required'});const input=await body(req),db=await readDb();const request=db.requests.find((r)=>r.id===input.requestId&&r.role===session.role&&r.status==='Pending');if(!request)return send(res,404,{error:'Pending request not found'});request.status='Cancelled';audit(db,'access request cancelled',{requestId:request.id,guideId:request.guideId,role:session.role});await writeDb(db);return send(res,200,{request});}
    if(url.pathname==='/api/requests/review'&&req.method==='POST'){if(!session)return send(res,401,{error:'Login required'});if(session.role!=='Homeowner')return send(res,403,{error:'Homeowner only'});const input=await body(req);if(!['Approved','Denied'].includes(input.status))return send(res,400,{error:'Invalid status'});const db=await readDb();const request=db.requests.find((r)=>r.id===input.requestId);if(!request)return send(res,404,{error:'Request not found'});request.status=input.status;if(input.status==='Approved'){const guide=db.guides.find((g)=>g.id===request.guideId);if(guide&&!guide.allowedRoles.includes(request.role)){guide.allowedRoles.push(request.role);guide.version=(Number(guide.version)||1)+1;guide.updatedBy=session.name;guide.lastUpdated=new Date().toISOString();}}audit(db,`access ${input.status.toLowerCase()}`,{requestId:request.id,guideId:request.guideId,role:request.role});await writeDb(db);return send(res,200,{request});}
    if(url.pathname==='/api/audit/event'&&req.method==='POST'){if(!session)return send(res,401,{error:'Login required'});const input=await body(req);const events=['guide viewed','guide marked helpful'];if(!events.includes(input.event))return send(res,400,{error:'Unsupported audit event'});const db=await readDb();audit(db,input.event,{guideId:String(input.guideId||''),role:session.role});await writeDb(db);return send(res,200,{ok:true});}
    if(url.pathname==='/api/audit'&&req.method==='GET'){if(!session)return send(res,401,{error:'Login required'});if(session.role!=='Homeowner')return send(res,403,{error:'Homeowner only'});return send(res,200,{audit:(await readDb()).audit});}
    if(url.pathname==='/api/migrate'&&req.method==='POST'){if(!session)return send(res,401,{error:'Login required'});if(session.role!=='Homeowner')return send(res,403,{error:'Homeowner only'});const input=await body(req),db=await readDb();if(Array.isArray(input.guides)){for(const guide of input.guides){if(guide?.id&&guide?.title&&!db.guides.some(g=>g.id===guide.id))db.guides.push({...guide,version:1,updatedBy:guide.savedBy||session.name});}}if(Array.isArray(input.requests)){for(const request of input.requests){if(request?.id&&!db.requests.some(r=>r.id===request.id))db.requests.push(request);}}await writeDb(db);return send(res,200,{migrated:true});}
    if(url.pathname==='/api/reset'&&req.method==='POST'){if(!session)return send(res,401,{error:'Login required'});if(session.role!=='Homeowner')return send(res,403,{error:'Homeowner only'});await resetDb();return send(res,200,{ok:true});}
    return send(res,404,{error:'Not found'});
  } catch(error) { return send(res,400,{error:error.message||'Bad request'}); }
});
server.on('error',(error)=>{console.error(`HomeHandoff API failed to start on ${HOST}:${PORT}: ${error.message}`);process.exitCode=1;});
server.listen(PORT,HOST,()=>console.error(`HomeHandoff local API listening at http://${HOST}:${PORT} (health: http://localhost:${PORT}/health)`));
