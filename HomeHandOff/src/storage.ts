import { AccessRequest, Guide, normalizeGuide, roles, Role } from './data';
export const STORAGE_VERSION = 3;
export function writeLocal(key:string,value:unknown):boolean{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
export function readRole():Role{try{const value=JSON.parse(localStorage.getItem('hh-role')||'"Homeowner"');return roles.includes(value)?value:'Homeowner'}catch{return 'Homeowner'}}
export function saveRole(role:Role){try{localStorage.setItem('hh-role',JSON.stringify(role))}catch{/* private mode or quota; current view still works */}}
export function loadGuides():Guide[]{
  let raw:string|null=null;try{raw=localStorage.getItem('hh-guides')}catch{return []}
  if(raw===null){writeLocal('hh-guides',[]);try{localStorage.setItem('hh-storage-version',String(STORAGE_VERSION))}catch{}return []}
  try{
    const parsed:unknown=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error('Guide data is not a list');
    const normalized=parsed.map(normalizeGuide).filter((guide):guide is Guide=>Boolean(guide));
    if(normalized.length!==parsed.length){try{localStorage.setItem('hh-guides-recovery',raw)}catch{}}
    // Seed guides are served by the role-filtering API, never bundled into the browser.
    const existingIds=new Set<string>();
    const merged=normalized.filter(guide=>{if(existingIds.has(guide.id))return false;existingIds.add(guide.id);return true});
    if(merged.length!==parsed.length||Number(localStorage.getItem('hh-storage-version'))!==STORAGE_VERSION){writeLocal('hh-guides',merged);try{localStorage.setItem('hh-storage-version',String(STORAGE_VERSION))}catch{}}
    return merged;
  }catch{try{localStorage.setItem('hh-guides-recovery',raw)}catch{};return []}
}
export function loadIds(key:string):string[]{try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x.filter((v):v is string=>typeof v==='string'):[]}catch{return []}}
export function loadRequests():AccessRequest[]{try{const x:unknown=JSON.parse(localStorage.getItem('hh-access-requests')||'[]');if(!Array.isArray(x))return[];return x.filter((r):r is AccessRequest=>Boolean(r&&typeof r==='object'&&typeof r.id==='string'&&typeof r.guideId==='string'&&roles.includes(r.role)&&['Pending','Approved','Denied','Cancelled'].includes(r.status)))}catch{return[]}}
