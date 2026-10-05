// Versioned local slots with one recovery copy each and portable JSON files.
export const SLOT_IDS=['autosave','slot1','slot2','slot3'];
export function createMemoryStorage() {
  const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}

export function createSaveSystem({storage,version,migrations={},prefix='quarry.save.',validateState=()=>{},maxImportBytes=8*1024*1024}) {
  const key=id=>{if(!SLOT_IDS.includes(id))throw new Error('Unknown save slot');return prefix+id;};
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const checksum=record=>{
    const text=JSON.stringify({version:record.version,savedAt:record.savedAt,summary:record.summary,state:record.state});
    let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
    return (hash>>>0).toString(16).padStart(8,'0');
  };
  function decode(raw) {
    if(!raw)return null;
    let r;try{r=JSON.parse(raw);}catch{throw new Error('The save file is incomplete or damaged');}
    if(!object(r)||(r.format&&r.format!=='quarry-save')||!Number.isInteger(r.version)||r.version<1
      ||!Number.isFinite(r.savedAt)||r.savedAt<0||!object(r.state)||!object(r.summary??{}))throw new Error('This is not a valid Quarry save');
    if(r.checksum!==undefined&&r.checksum!==checksum(r))throw new Error('The save failed its integrity check; use a recovery copy');
    return r;
  }
  function migrate(record) {
    if(record.version>version)throw new Error(`Save is from a newer game version (${record.version})`);
    let state=structuredClone(record.state),v=record.version;
    while(v<version){const fn=migrations[v];if(!fn)throw new Error(`No migration from save version ${v}`);state=fn(state);v++;}
    validateState(state);return state;
  }
  function read(slot,backup=false) {
    try{const record=decode(storage.getItem(key(slot)+(backup?'.backup':'')));return {record,error:null};}
    catch(e){return {record:null,error:e.message};}
  }
  function serialize(state,summary={}) {
    validateState(state);
    const record={format:'quarry-save',version,savedAt:Date.now(),summary,state};
    record.checksum=checksum(record);
    const raw=JSON.stringify(record);decode(raw); // serialization must finish before either storage write
    return {record,raw};
  }
  function save(slot,state,summary={}) {
    key(slot);
    const {record,raw}=serialize(state,summary);
    const previous=read(slot);
    if(previous.record?.version>version)throw new Error('Keep the newer-version save; choose another slot');
    if(previous.record){
      try{migrate(previous.record);}catch{return writePrimary();} // keep a known recovery copy if the primary is damaged
      storage.setItem(key(slot)+'.backup',JSON.stringify(previous.record));
    }
    return writePrimary();
    function writePrimary(){storage.setItem(key(slot),raw);return record;}
  }
  function loadWithInfo(slot,{backup=false}={}) {
    const primary=read(slot,backup);
    if(!primary.record&&!primary.error&&!backup) {
      const b=read(slot,true);if(!b.record&&!b.error)return null;
    }
    let error=primary.error;
    if(primary.record){try{return {state:migrate(primary.record),savedAt:primary.record.savedAt,recovered:backup};}catch(e){error=e.message;}}
    if(!backup) {
      const b=read(slot,true);error??=b.error;
      if(b.record){try{return {state:migrate(b.record),savedAt:b.record.savedAt,recovered:true};}catch(e){error??=e.message;}}
    }
    if(error)throw new Error(error);
    return null;
  }
  function list() {
    return SLOT_IDS.map(slotId=>{
      const p=read(slotId),b=read(slotId,true),r=p.record??b.record;
      return {slotId,empty:!r&&!p.error&&!b.error,savedAt:r?.savedAt??0,summary:r?.summary??{},version:r?.version,
        corrupt:!p.record&&!!(p.error??b.error),error:p.error??b.error,hasPrimary:!!p.record,hasBackup:!!b.record,
        backup:b.record?{savedAt:b.record.savedAt,summary:b.record.summary??{},version:b.record.version}:null};
    });
  }
  function latest(){return list().filter(s=>!s.empty&&(s.hasPrimary||s.hasBackup)).sort((a,b)=>b.savedAt-a.savedAt)[0]??null;}
  function inspectImport(text) {
    if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>maxImportBytes)throw new Error('Save file is too large');
    const record=decode(text);if(!record)throw new Error('The save file is empty');
    return {...record,state:migrate(record),originalVersion:record.version,version};
  }
  function importSave(slot,text) {
    if(slot==='autosave')throw new Error('Import into a manual slot');
    const r=inspectImport(text);return save(slot,r.state,r.summary);
  }
  function exportSave(slot,{backup=false}={}) {
    const r=read(slot,backup);if(r.error)throw new Error(r.error);if(!r.record)throw new Error('This slot is empty');
    return JSON.stringify({...r.record,format:'quarry-save'});
  }
  function remove(slot){storage.removeItem(key(slot));storage.removeItem(key(slot)+'.backup');}
  return {save,load:(slot,opts)=>loadWithInfo(slot,opts)?.state??null,loadWithInfo,list,latest,remove,inspectImport,importSave,exportSave,
    exportState:(state,summary)=>serialize(state,summary).raw};
}
