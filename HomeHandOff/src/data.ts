
export type Role = 'Homeowner' | 'Family Member' | 'Babysitter' | 'Guest' | 'Child Mode';
export type GuideStep = { id: string; text: string; title?: string; explanation?: string; action?: string };
export type Guide = {
  id: string; title: string; category: string; savedBy: string; lastUpdated: string;
  allowedRoles: Role[]; shortDescription: string; mediaType: 'image' | 'video';
  mediaCaption: string; safetyNote: string; keywords: string[]; steps: GuideStep[];
  important?: boolean; estimatedMinutes?: number;
  version?: number; updatedBy?: string; videoNoteUrl?: string; transcript?: string;
};
export type AccessRequest = {
  id: string; guideId: string; role: Role; reason: string; status: 'Pending' | 'Approved' | 'Denied' | 'Cancelled'; createdAt: string;
};
export const roles: Role[] = ['Homeowner', 'Family Member', 'Babysitter', 'Guest', 'Child Mode'];
export const normalize = (s: string) => s.toLowerCase().replace(/wi[\s-]?fi/g,'wifi').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const aliases: Record<string,string[]> = { router:['wifi','internet','network'], 'water pump':['water motor','switch','pump'], laundry:['washing machine','clothes'], blackout:['power cut','electricity'], tv:['fire tv','television','remote'], television:['fire tv','tv','remote'], 'set up':['fire tv','television','remote'] };
export function findGuide(query: string, guides: Guide[]) {
  const q=normalize(query); if(!q)return undefined;
  const expanded=normalize(`${q} ${Object.entries(aliases).filter(([key])=>q.includes(key)).flatMap(([,values])=>values).join(' ')}`);
  const tokens=[...new Set(expanded.split(' ').filter(w=>w.length>2 && !['show','where','what','with','from','this','that','how','does','can','the','for','please','step','two','one','household','home','guide','instruction','instructions','help','using','should'].includes(w)))];
  let best: Guide|undefined,bestScore=0;
  for(const guide of guides){const hay=normalize([guide.title,guide.category,guide.shortDescription,...guide.keywords].join(' '));const score=tokens.reduce((sum,token)=>sum+(hay.includes(token)?(token.length>5?2:1):0),0);if(score>bestScore){best=guide;bestScore=score}}
  // Require more than one weak token match so an unrelated question (for
  // example, a garage-code request matching only “door”) is not presented
  // as saved household guidance.
  return bestScore>=2?best:undefined;
}
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
export function normalizeGuide(value: unknown): Guide | undefined {
  if(!value || typeof value!=='object')return undefined;
  const raw=value as Record<string,unknown>,id=text(raw.id),title=text(raw.title);
  if(!id||!title)return undefined;
  const rolesValue=Array.isArray(raw.allowedRoles)?raw.allowedRoles.filter((r):r is Role=>roles.includes(r as Role)):[];
  const stepsValue=Array.isArray(raw.steps)?raw.steps.map((step,i)=>{
    if(typeof step==='string')return {id:`${id}-step-${i+1}`,text:step.trim()};
    if(!step||typeof step!=='object')return undefined;
    const item=step as Record<string,unknown>,title=text(item.title),explanation=text(item.explanation),action=text(item.action);
    const stepText=text(item.text)||[explanation,action].filter(Boolean).join('\n');
    return stepText?{id:text(item.id)||`${id}-step-${i+1}`,text:stepText,title:title||undefined,explanation:explanation||undefined,action:action||undefined}:undefined;
  }).filter((step):step is GuideStep=>Boolean(step?.text)):[];
  const keywords=Array.isArray(raw.keywords)?raw.keywords.map(text).filter(Boolean):[];
  return {id,title,category:text(raw.category)||'Household',savedBy:text(raw.savedBy)||'Homeowner',lastUpdated:text(raw.lastUpdated)||new Date().toISOString().slice(0,10),allowedRoles:rolesValue,shortDescription:text(raw.shortDescription),mediaType:raw.mediaType==='video'?'video':'image',mediaCaption:text(raw.mediaCaption),safetyNote:text(raw.safetyNote),keywords,steps:stepsValue,important:raw.important===true,estimatedMinutes:Number.isFinite(raw.estimatedMinutes)?Math.max(1,Number(raw.estimatedMinutes)):undefined,version:Number.isFinite(raw.version)?Number(raw.version):undefined,updatedBy:text(raw.updatedBy),videoNoteUrl:text(raw.videoNoteUrl),transcript:text(raw.transcript)};
}

