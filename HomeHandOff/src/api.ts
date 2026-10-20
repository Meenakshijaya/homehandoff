import type { AccessRequest, Guide, Role } from './data';

export type DemoSession = { email:string; role:Role; accountRole:Role; name:string };
export async function api<T>(path:string, options:RequestInit = {}):Promise<T>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),5000);
  let response:Response;
  try{
    // Keep requests same-origin: Vite proxies /api during local development and
    // the Netlify Function proxies /api to the persistent Node API in production.
    response=await fetch(`/api${path}`,{...options,signal:controller.signal,credentials:'include',headers:{'content-type':'application/json',...(options.headers||{})}});
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw new Error('The local service did not respond within 5 seconds. Start the app with pnpm dev.');
    throw new Error('Cannot reach the HomeHandoff local service. Start the app with pnpm dev.');
  }finally{window.clearTimeout(timer)}
  const contentType=response.headers.get('content-type')||'';
  const data=await response.json().catch(()=>({error:`HTTP ${response.status}`}));
  if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
  if(!contentType.includes('application/json'))throw new Error('The local service returned a non-JSON response. Start the app with pnpm dev.');
  return data as T;
}
export const loadSession=()=>api<DemoSession>('/session');
export const loadRoleGuides=()=>api<{guides:Guide[];role:Role}>('/guides');
export const loadHomeownerRequests=()=>api<{requests:AccessRequest[]}>('/requests');
export const loadRoleRequests=()=>api<{requests:AccessRequest[]}>('/my-requests');
