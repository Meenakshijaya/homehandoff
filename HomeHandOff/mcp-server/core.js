import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import seeds from '../shared/seed-guides.json' with { type: 'json' };

const here = path.dirname(fileURLToPath(import.meta.url));
export const dataFile = path.join(here, 'data', 'household.json');
export const roles = ['Homeowner', 'Family Member', 'Babysitter', 'Guest', 'Child Mode'];
const judgeDemoRoles = new Set(['Homeowner', 'Family Member', 'Babysitter']);
export function createJudgeDemoSession(role) {
  if (!judgeDemoRoles.has(role)) return undefined;
  const slug = role === 'Family Member' ? 'family' : role.toLowerCase();
  return { email: `${slug}@demo.com`, role, accountRole: role, name: `${role} Demo` };
}
export const denied = 'This guide is restricted by the homeowner.';
export const notFound = 'No household instruction has been saved for this yet.';
const demoAccounts = {
  'homeowner@demo.com': { salt: 'hh-judge-homeowner-v1', hash: 'e7618769c37dacce37626d6d2520108d293129df7360748a678d2ab1dbbb1d173738bcd6c2464b1f691ef02feed71e1b64e62d7c45753f6d00c22038f26e988c', role: 'Homeowner', name: 'Homeowner Demo' },
  'babysitter@demo.com': { salt: 'hh-judge-babysitter-v1', hash: 'f4483abf52f4eeac3912b358b3dd1768d2ecc49423fd8ac6a67f096176ec058dc136d86be55ebb46cf9fdfcc94cc4a658ec454b485990f41b673479573f32624', role: 'Babysitter', name: 'Babysitter Demo' },
  'family@demo.com': { salt: 'hh-judge-family-v1', hash: '8f706c0065da23aaa9a5981259e335a32235fedbfc7c6c21c9f5bc154caafe9782ba785331af25de69b37b9030f2ce5acf1501db57e48a974b1f3dbfb1abb0ce', role: 'Family Member', name: 'Family Member Demo' },
  'babysitter@homehandoff.demo': { salt: 'hh-demo-babysitter-v1', hash: '0097015e4bbd14ef4a2d1a1ac627920f58286571640619dc0064b6f6898f2bfb46bb0325bb41445d0d780fec2907e9d7189e7d61ab81accf9da5475a5f2bc034', role: 'Babysitter', name: 'Babysitter' },
  'guest@homehandoff.demo': { salt: 'hh-demo-guest-v1', hash: 'c6bd9db4424ffde4ed5c0c377de45bdbc58d23af6b9e161989ed9e9768427432b298d24803aa51724e7251c578079119b5ee6089dd3c2a2004a0f96af0907d81', role: 'Guest', name: 'Guest' },
};
const authFile=path.join(here,'data','auth.json');
const prepareGuide=(guide)=>({...guide,version:Number(guide.version)||1,updatedBy:guide.updatedBy||guide.savedBy,videoNoteUrl:guide.videoNoteUrl||'',transcript:guide.transcript||'',steps:(guide.steps||[]).map((step,index)=>typeof step==='string'?{id:`${guide.id}-step-${index+1}`,text:step}:({...step,id:step.id||`${guide.id}-step-${index+1}`,text:step.text||[step.explanation,step.action].filter(Boolean).join('\n')}))});
const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const validRole = (role) => roles.includes(role);
const normalize = (value) => String(value ?? '').toLowerCase().replace(/wi[\s-]?fi/g, 'wifi').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export async function readDb() {
  await mkdir(path.dirname(dataFile), { recursive: true });
  let db;
  try { db=JSON.parse(await readFile(dataFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = { guides: seeds.map(prepareGuide), requests: [], audit: [] };
    await writeDb(initial);
    return initial;
  }
  if(!Array.isArray(db.guides))db.guides=[];
  if(!Array.isArray(db.requests))db.requests=[];
  if(!Array.isArray(db.audit))db.audit=[];
  const known=new Set(db.guides.map((guide)=>guide?.id).filter(Boolean));
  let changed=false;
  db.guides=db.guides.map((guide)=>{
    const normalized=prepareGuide(guide);
    if(JSON.stringify(normalized)!==JSON.stringify(guide))changed=true;
    return normalized;
  });
  const missing=seeds.filter((guide)=>!known.has(guide.id)).map(prepareGuide);
  if(missing.length){db.guides.push(...missing);changed=true}
  if(changed)await writeDb(db);
  return db;
}
export async function writeDb(db) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const tmp = `${dataFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  await rename(tmp, dataFile);
}
export async function readAuthStore(){
  try{return JSON.parse(await readFile(authFile,'utf8'))}
  catch(error){if(error.code==='ENOENT')return {homeowner:null};throw error}
}
export async function createHomeownerAccount({email,name,password}){
  const normalized=String(email||'').trim().toLowerCase(),displayName=String(name||'').trim();
  if(!/^\S+@\S+\.\S+$/.test(normalized))throw new Error('Enter a valid email address.');
  if(displayName.length<2||displayName.length>80)throw new Error('Name must be between 2 and 80 characters.');
  if(typeof password!=='string'||password.length<10)throw new Error('Choose a password with at least 10 characters.');
  const store=await readAuthStore();
  if(store.homeowner)return undefined;
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key.toString('hex'))));
  const updated={...store,homeowner:{email:normalized,name:displayName,salt,hash}};
  await mkdir(path.dirname(authFile),{recursive:true});
  const tmp=`${authFile}.tmp`;
  await writeFile(tmp,`${JSON.stringify(updated,null,2)}\n`,'utf8');
  await rename(tmp,authFile);
  return {email:normalized,name:displayName,role:'Homeowner'};
}
export async function resetDb() {
  const db=await readDb();
  const seedIds=new Set(seeds.map((guide)=>guide.id));
  const userGuides=db.guides.filter((guide)=>!seedIds.has(guide.id));
  db.guides=[...seeds.map(prepareGuide),...userGuides];
  db.requests=[];db.audit=[];
  await writeDb(db);return db;
}
function scoreGuide(query, guide) {
  const normalizedQuery=normalize(query);
  const terms = normalizedQuery.split(' ').filter((w) => w.length > 2 && !['show','where','what','with','from','this','that','how','does','can','the','for','please','step','two','one','internet','working','household','home','guide','instruction','instructions','query','help','using','should'].includes(w));
  const normalized = normalize([guide.title, guide.category, guide.shortDescription, ...(guide.keywords || [])].join(' '));
  const aliases = normalizedQuery.includes('internet') ? ['wifi','router','network'] : normalizedQuery.includes('pet') ? ['dog','feeding','food'] : /\b(tv|television)\b/.test(normalizedQuery) ? ['fire','television','remote'] : [];
  return terms.reduce((sum, term) => sum + (normalized.includes(term) ? (term.length > 5 ? 2 : 1) : 0), 0) + aliases.reduce((sum, term) => sum + (normalized.includes(term) ? (term.length > 5 ? 2 : 1) : 0), 0);
}
export async function findMatchingGuide(query, guides) {
  const match=guides.map((guide)=>({guide,score:scoreGuide(query,guide)})).sort((a,b)=>b.score-a.score)[0];
  // Ignore a lone generic match (such as “door” for an unrelated garage-code question).
  return match?.score>=2?match.guide:undefined;
}
function addAudit(db, event, detail = {}) {
  db.audit.unshift({ id: id('audit'), event, createdAt: new Date().toISOString(), ...detail });
  db.audit = db.audit.slice(0, 500);
}
function allowed(guide, role) { return role === 'Homeowner' || guide.allowedRoles.includes(role); }
export async function searchHomeInstruction({ query, role }) {
  if (!validRole(role)) return 'A valid household role is required.';
  const db = await readDb();
  const guide = await findMatchingGuide(query, db.guides);
  if (!guide) return notFound;
  if (!allowed(guide, role)) return { permissionStatus:'Denied', guideId:guide.id, voiceResponse:denied };
  return { guideId: guide.id, title: guide.title, savedBy: guide.savedBy, shortDescription: guide.shortDescription, permissionStatus: 'Allowed', voiceResponse: `${guide.title}, saved by ${guide.savedBy}. ${guide.shortDescription}` };
}
export async function getGuideStep({ guideId, stepNumber, role }) {
  if (!validRole(role)) return 'A valid household role is required.';
  const guide = (await readDb()).guides.find((item) => item.id === guideId);
  if (!guide) return 'The requested household guide could not be found.';
  if (!allowed(guide, role)) return denied;
  const index = Number(stepNumber) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= guide.steps.length) return 'That step does not exist in this guide.';
  const step = guide.steps[index];
  return typeof step === 'string'
    ? { guideId: guide.id, title: guide.title, stepNumber: index + 1, totalSteps: guide.steps.length, instruction: step }
    : { guideId: guide.id, title: guide.title, stepNumber: index + 1, totalSteps: guide.steps.length, instruction: step.text, stepTitle: step.title, explanation: step.explanation, action: step.action };
}
export async function getGuideLocation({ guideId, role }) {
  if (!validRole(role)) return 'A valid household role is required.';
  const guide = (await readDb()).guides.find((item) => item.id === guideId);
  if (!guide) return 'The requested household guide could not be found.';
  if (!allowed(guide, role)) return denied;
  return { guideId: guide.id, location: guide.mediaCaption || 'No location description has been saved.' };
}
export async function requestGuideAccess({ guideId, role, reason = '' }) {
  if (!validRole(role)) return 'A valid household role is required.';
  const db = await readDb();
  if (!db.guides.some((item) => item.id === guideId)) return 'The requested household guide could not be found.';
  if (role === 'Homeowner') return 'The homeowner already has access to this guide.';
  const existing = db.requests.find((request) => request.guideId === guideId && request.role === role && request.status === 'Pending');
  if (!existing) db.requests.unshift({ id: id('request'), guideId, role, reason: String(reason).slice(0, 500), status: 'Pending', createdAt: new Date().toISOString() });
  addAudit(db, 'access requested', { guideId, role });
  await writeDb(db);
  return 'Access request sent to the homeowner.';
}
export async function createHouseholdGuide(input) {
  if (input.role !== 'Homeowner') return 'Only the homeowner can create household guides.';
  const db = await readDb();
  const title = String(input.title ?? '').trim();
  const stepList = Array.isArray(input.steps) ? input.steps.map((step) => String(step).trim()).filter(Boolean) : [];
  if (!title || !String(input.category ?? '').trim() || !stepList.length) return 'A title, category, and at least one step are required.';
  const guideId = id('guide');
  const guide = { id: guideId, title, category: String(input.category).trim(), savedBy: String(input.savedBy || 'Homeowner').trim(), lastUpdated: new Date().toISOString(), version: 1, updatedBy: String(input.savedBy || 'Homeowner').trim(), allowedRoles: Array.isArray(input.allowedRoles) ? input.allowedRoles.filter(validRole) : ['Homeowner'], shortDescription: String(input.shortDescription || '').trim(), mediaType: 'image', mediaCaption: String(input.mediaCaption || '').trim(), safetyNote: String(input.safetyNote || '').trim(), keywords: [], steps: stepList.map((text, index) => ({ id: `${guideId}-step-${index+1}`, text })), videoNoteUrl: '', transcript: '' };
  db.guides.unshift(guide); addAudit(db, 'guide created', { guideId, role: 'Homeowner' }); await writeDb(db);
  return { message: 'Household guide created successfully.', guideId };
}
export const tools = [
  { name: 'search_home_instruction', description: 'Search household guides for a role. Restricted guide details are never returned.', inputSchema: { type:'object', properties:{ query:{type:'string'}, role:{type:'string',enum:roles} }, required:['query','role'], additionalProperties:false } },
  { name: 'get_guide_step', description: 'Get one numbered instruction step after checking the role.', inputSchema: { type:'object', properties:{ guideId:{type:'string'}, stepNumber:{type:'number'}, role:{type:'string',enum:roles} }, required:['guideId','stepNumber','role'], additionalProperties:false } },
  { name: 'get_guide_location', description: 'Get a permitted guide location caption after checking the role.', inputSchema: { type:'object', properties:{ guideId:{type:'string'}, role:{type:'string',enum:roles} }, required:['guideId','role'], additionalProperties:false } },
  { name: 'request_guide_access', description: 'Create a local access request without granting access.', inputSchema: { type:'object', properties:{ guideId:{type:'string'}, role:{type:'string',enum:roles}, reason:{type:'string'} }, required:['guideId','role','reason'], additionalProperties:false } },
  { name: 'create_household_guide', description: 'Create a household guide. Only Homeowner role is allowed.', inputSchema: { type:'object', properties:{ role:{type:'string',enum:roles}, title:{type:'string'}, category:{type:'string'}, savedBy:{type:'string'}, allowedRoles:{type:'array',items:{type:'string',enum:roles}}, shortDescription:{type:'string'}, mediaCaption:{type:'string'}, safetyNote:{type:'string'}, steps:{type:'array',items:{type:'string'}} }, required:['role','title','category','savedBy','allowedRoles','shortDescription','mediaCaption','safetyNote','steps'], additionalProperties:false } },
];
export async function callTool(name, input) {
  switch(name) {
    case 'search_home_instruction': return searchHomeInstruction(input);
    case 'get_guide_step': return getGuideStep(input);
    case 'get_guide_location': return getGuideLocation(input);
    case 'request_guide_access': return requestGuideAccess(input);
    case 'create_household_guide': return createHouseholdGuide(input);
    default: throw new Error(`Unknown MCP tool: ${name}`);
  }
}
export async function verifyAccount(email,password,store){
  const normalized=String(email||'').trim().toLowerCase();
  if(typeof password!=='string')return undefined;
  const owner=store?.homeowner;
  const records=[demoAccounts[normalized],owner&&normalized===owner.email?{...owner,role:'Homeowner',name:owner.name||'Homeowner'}:undefined].filter(Boolean);
  for(const record of records){
    const candidate=await new Promise((resolve,reject)=>crypto.scrypt(password,record.salt,64,(error,key)=>error?reject(error):resolve(key)));
    const expected=Buffer.from(record.hash,'hex');
    if(expected.length===candidate.length&&crypto.timingSafeEqual(expected,candidate))return {email:normalized,role:record.role,name:record.name};
  }
  return undefined;
}
export function audit(db, event, detail) { addAudit(db, event, detail); }
export { allowed, id, validRole };
