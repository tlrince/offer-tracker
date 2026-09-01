
/* ================= Supabase 云同步 ================= */
let cloudClient=null;
let cloudUser=null;
let cloudSyncTimer=null;
let cloudSyncing=false;
let cloudSyncQueued=false;
let cloudAuthSubscription=null;

function cloudCacheKey(userId){return CLOUD_CACHE_PREFIX+userId;}
function cloudDeletesKey(userId){return CLOUD_DELETES_PREFIX+userId;}
function activeRecordsKey(){return cloudUser?cloudCacheKey(cloudUser.id):LS_KEY;}
function readRecordsFromKey(key){
  try{
    const raw=localStorage.getItem(key);
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr.map(normalizeRecord):[];
  }catch(e){return [];}
}
function readCloudConfig(){
  try{return JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)||'null');}
  catch(e){return null;}
}
function readPendingDeletes(){
  if(!cloudUser)return [];
  try{const x=JSON.parse(localStorage.getItem(cloudDeletesKey(cloudUser.id))||'[]');return Array.isArray(x)?x.map(String):[];}
  catch(e){return [];}
}
function writePendingDeletes(ids){
  if(cloudUser)localStorage.setItem(cloudDeletesKey(cloudUser.id),JSON.stringify([...new Set(ids)]));
}
function markCloudDelete(id){
  if(!cloudUser)return;
  writePendingDeletes([...readPendingDeletes(),String(id)]);
}
function replaceRecords(next){
  const normalized=next.map(normalizeRecord);
  if(cloudUser){
    const keep=new Set(normalized.map(r=>r.id));
    records.forEach(r=>{if(!keep.has(r.id))markCloudDelete(r.id);});
  }
  records=normalized;
  persist();
}
function setCloudStatus(kind,text){
  const dot=$('#cloudDot'),label=$('#cloudBtnText'),status=$('#cloudSyncStatus');
  if(dot){dot.className='cloud-dot'+(kind==='online'?' online':kind==='syncing'?' syncing':kind==='error'?' error':'');}
  if(label)label.textContent=cloudUser?(kind==='syncing'?'同步中':kind==='error'?'同步异常':'云端已连接'):(readCloudConfig()?'云端未登录':'本地模式');
  if(status)status.textContent=text||'';
  const hint=$('#storageHint');
  if(hint)hint.textContent=cloudUser?'云端数据已启用 · 本地保留离线缓存 · 建议定期导出 JSON 备份 🍁':'当前为本地模式 · 数据保存在浏览器 localStorage 中 · 建议定期导出备份 🍁';
}
function renderCloudPanel(){
  const cfg=readCloudConfig();
  if(cfg){
    if(document.activeElement!==$('#cloudUrl'))$('#cloudUrl').value=cfg.url||'';
    if(document.activeElement!==$('#cloudAnonKey'))$('#cloudAnonKey').value=cfg.anonKey||'';
  }
  $('#cloudGuestPanel').hidden=!!cloudUser;
  $('#cloudUserPanel').hidden=!cloudUser;
  $('#cloudUserEmail').textContent=cloudUser?.email||'';
  if(!cloudUser)setCloudStatus('local',cfg?'配置已保存，请登录':'尚未配置 Supabase');
}
function openCloudModal(){renderCloudPanel();$('#cloudModal').classList.add('show');}
function closeCloudModal(){$('#cloudModal').classList.remove('show');}
function createCloudClient(config){
  if(!window.supabase?.createClient)throw new Error('Supabase SDK 加载失败，请检查网络后重试');
  return window.supabase.createClient(config.url,config.anonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:CLOUD_AUTH_STORAGE_KEY}
  });
}
function switchToLocalMode(){
  const hadUser=!!cloudUser;
  cloudUser=null;
  if(hadUser){records=readRecordsFromKey(LS_KEY);renderAll();}
  renderCloudPanel();
  setCloudStatus('local',readCloudConfig()?'已退出云端账号':'本地模式');
}
async function activateCloudSession(session){
  if(!session?.user){switchToLocalMode();return;}
  if(cloudUser?.id===session.user.id){renderCloudPanel();return;}
  const localCandidate=readRecordsFromKey(LS_KEY);
  const cacheKey=cloudCacheKey(session.user.id);
  const hasUserCache=localStorage.getItem(cacheKey)!==null;
  cloudUser=session.user;
  records=hasUserCache?readRecordsFromKey(cacheKey):[];
  renderAll();renderCloudPanel();
  await syncCloud({firstConnect:!hasUserCache,importCandidate:localCandidate,showToast:true});
}
async function initCloud(){
  const config=readCloudConfig();
  renderCloudPanel();
  if(!config){setCloudStatus('local','尚未配置 Supabase');return;}
  try{
    cloudAuthSubscription?.unsubscribe?.();
    cloudClient=createCloudClient(config);
    const listener=cloudClient.auth.onAuthStateChange((_event,session)=>{
      setTimeout(()=>activateCloudSession(session),0);
    });
    cloudAuthSubscription=listener.data.subscription;
    const {data,error}=await cloudClient.auth.getSession();
    if(error)throw error;
    if(data.session)await activateCloudSession(data.session);
    else setCloudStatus('local','配置已保存，请登录');
  }catch(e){setCloudStatus('error',e.message);renderCloudPanel();}
}
async function saveCloudConfig(){
  const url=$('#cloudUrl').value.trim().replace(/\/$/,'');
  const anonKey=$('#cloudAnonKey').value.trim();
  try{
    const u=new URL(url);
    if(u.protocol!=='https:')throw new Error('Project URL 必须使用 HTTPS');
    if(!anonKey)throw new Error('请填写 anon public key');
  }catch(e){toast(e.message==='Invalid URL'?'Project URL 格式不正确':e.message,'error');return;}
  if(cloudUser)switchToLocalMode();
  localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify({url,anonKey}));
  await initCloud();
  toast('云端配置已保存','success');
}
async function cloudAuth(mode){
  if(!cloudClient){toast('请先保存 Supabase 配置','error');return;}
  const email=$('#cloudEmail').value.trim();
  const password=$('#cloudPassword').value;
  if(!email||password.length<6){toast('请填写邮箱和至少 6 位密码','error');return;}
  setCloudStatus('syncing',mode==='signup'?'正在注册…':'正在登录…');
  try{
    let result;
    if(mode==='signup'){
      const redirectTo=location.origin&&location.origin!=='null'?location.origin+location.pathname:undefined;
      result=await cloudClient.auth.signUp({email,password,options:redirectTo?{emailRedirectTo:redirectTo}:{}});
    }else result=await cloudClient.auth.signInWithPassword({email,password});
    if(result.error)throw result.error;
    if(result.data.session){await activateCloudSession(result.data.session);toast(mode==='signup'?'注册并登录成功':'登录成功','success');}
    else{setCloudStatus('local','请查收验证邮件后再登录');toast('注册成功，请先完成邮箱验证','success');}
  }catch(e){setCloudStatus('error',e.message);toast(`云端认证失败：${e.message}`,'error');}
}
async function signOutCloud(){
  try{if(cloudClient)await cloudClient.auth.signOut();}
  finally{switchToLocalMode();toast('已退出云端账号，本地原始数据仍保留','success');}
}
function recordToDb(r){
  return {
    id:r.id,user_id:cloudUser.id,company:r.company,company_group:r.companyGroup||null,
    position:r.position,status:r.status,channel:r.channel||null,apply_date:r.applyDate||null,
    interview_time:r.interviewTime?new Date(r.interviewTime).toISOString():null,link:r.link||null,
    referrer:r.referrer||null,referral_code:r.referralCode||null,location:r.location||null,
    salary:r.salary||null,priority:r.priority||null,note:r.note||null,
    created_at:r.createdAt||new Date().toISOString(),updated_at:r.updatedAt||new Date().toISOString(),
    status_updated_at:r.statusUpdatedAt||r.updatedAt||new Date().toISOString()
  };
}
function recordFromDb(r){
  return normalizeRecord({
    id:r.id,company:r.company,companyGroup:r.company_group,position:r.position,status:r.status,
    channel:r.channel,applyDate:r.apply_date||'',interviewTime:r.interview_time?String(r.interview_time).slice(0,16):'',
    link:r.link,referrer:r.referrer,referralCode:r.referral_code,location:r.location,salary:r.salary,
    priority:r.priority,note:r.note,createdAt:r.created_at,updatedAt:r.updated_at,statusUpdatedAt:r.status_updated_at
  });
}
function newerThan(a,b){return new Date(a||0).getTime()>new Date(b||0).getTime();}
function scheduleCloudSync(){
  if(!cloudUser||!cloudClient)return;
  clearTimeout(cloudSyncTimer);
  setCloudStatus('syncing','检测到本地修改，准备同步…');
  cloudSyncTimer=setTimeout(()=>syncCloud(),700);
}
async function syncCloud({firstConnect=false,importCandidate=[],showToast=false}={}){
  if(!cloudClient||!cloudUser)return;
  if(cloudSyncing){cloudSyncQueued=true;return;}
  cloudSyncing=true;cloudSyncQueued=false;
  setCloudStatus('syncing','正在同步云端数据…');
  try{
    const userId=cloudUser.id;
    const {data,error}=await cloudClient.from('applications').select('*').eq('user_id',userId);
    if(error)throw error;
    let remote=(data||[]).map(recordFromDb);
    let localList=records.map(normalizeRecord);
    if(firstConnect&&importCandidate.length){
      const ok=window.confirm(`检测到本地 ${importCandidate.length} 条投递记录，是否合并并上传到当前云端账号？\n\n选择“取消”不会删除本地数据。`);
      if(ok)localList=importCandidate.map(normalizeRecord);
    }
    const pending=readPendingDeletes();
    if(pending.length){
      const del=await cloudClient.from('applications').delete().eq('user_id',userId).in('id',pending);
      if(del.error)throw del.error;
      remote=remote.filter(r=>!pending.includes(r.id));
      writePendingDeletes([]);
    }
    const remoteMap=new Map(remote.map(r=>[r.id,r]));
    const merged=new Map(remoteMap);
    const upload=[];
    localList.forEach(local=>{
      const remoteRecord=remoteMap.get(local.id);
      if(!remoteRecord||newerThan(local.updatedAt,remoteRecord.updatedAt)){
        merged.set(local.id,local);
        upload.push(local);
      }
    });
    if(upload.length){
      const upsert=await cloudClient.from('applications').upsert(upload.map(recordToDb),{onConflict:'user_id,id'});
      if(upsert.error)throw upsert.error;
    }
    records=[...merged.values()].map(normalizeRecord);
    localStorage.setItem(cloudCacheKey(userId),JSON.stringify(records));
    renderAll();renderCloudPanel();
    const time=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    setCloudStatus('online',`同步完成：${records.length} 条 · ${time}`);
    if(showToast)toast(`云端同步完成，共 ${records.length} 条记录`,'success');
  }catch(e){
    setCloudStatus('error',`同步失败：${e.message}`);
    if(showToast)toast(`同步失败：${e.message}`,'error');
  }finally{
    cloudSyncing=false;
    if(cloudSyncQueued){cloudSyncQueued=false;scheduleCloudSync();}
  }
}
