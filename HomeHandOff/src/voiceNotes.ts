export type VoiceNote = { id:string; guideId:string; createdAt:string; mimeType:string; audio:Blob };

const DB_NAME='homehandoff-audio';
const STORE='voiceNotes';
let database:Promise<IDBDatabase>|undefined;

function openDatabase():Promise<IDBDatabase>{
  if(!('indexedDB' in window))return Promise.reject(new Error('This browser does not support saved audio storage.'));
  if(!database)database=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:'id'});store.createIndex('guideId','guideId',{unique:false})}};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Could not open browser audio storage.'));
    request.onblocked=()=>reject(new Error('Audio storage is busy in another tab. Close other HomeHandoff tabs and retry.'));
  });
  return database;
}

export async function listVoiceNotes(guideId:string):Promise<VoiceNote[]>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const request=db.transaction(STORE,'readonly').objectStore(STORE).index('guideId').getAll(guideId);request.onsuccess=()=>resolve((request.result as VoiceNote[]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));request.onerror=()=>reject(new Error('Could not load saved voice notes.'))});
}
export async function saveVoiceNote(note:VoiceNote):Promise<void>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,'readwrite');transaction.objectStore(STORE).put(note);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(new Error('Could not save the recording in browser audio storage.'));transaction.onabort=()=>reject(new Error('Audio storage cancelled the recording.'))});
}
export async function deleteVoiceNote(id:string):Promise<void>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const transaction=db.transaction(STORE,'readwrite');transaction.objectStore(STORE).delete(id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(new Error('Could not delete the voice note.'));transaction.onabort=()=>reject(new Error('Audio storage cancelled the deletion.'))});
}
