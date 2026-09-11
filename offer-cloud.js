/* Firebase Auth + Cloud Firestore 同步层。依赖 Firebase compat SDK 与 offer-config.js。 */
let cloudAuthClient=null;
let cloudDb=null;
let cloudUser=null;
let cloudSyncTimer=null;
let cloudSyncing=false;
let cloudSyncQueued=false;
let cloudUnsubscribe=null;

function cloudCacheKey(userId){return CLOUD_CACHE_PREFIX+userId;}
function cloudDeletesKey(userId){return CLOUD_DELETES_PREFIX+userId;}
function activeRecordsKey(){return cloudUser?cloudCacheKey(cloudUser.uid):LS_KEY;}
function readRecordsFromKey(key){
  try{
    const raw=localStorage.getItem(key);
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr.map(normalizeRecord):[];
  }catch(e){return [];}
}
function readPendingDeletes(){
  if(!cloudUser)return [];
  try{const x=JSON.parse(localStorage.getItem(cloudDeletesKey(cloudUser.uid))||'[]');return Array.isArray(x)?x.map(String):[];}
  catch(e){return [];}
}
function writePendingDeletes(ids){
  if(cloudUser)localStorage.setItem(cloudDeletesKey(cloudUser.uid),JSON.stringify([...new Set(ids)]));
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
  if(dot)dot.className='cloud-dot'+(kind==='online'?' online':kind==='syncing'?' syncing':kind==='error'?' error':'');
  if(label)label.textContent=cloudUser?(kind==='syncing'?'同步中':kind==='error'?'同步异常':'云端已连接'):'云端未登录';
  if(status)status.textContent=text||'';
  const hint=$('#storageHint');
  if(hint)hint.textContent=cloudUser?'Firebase 云同步已启用 · 本地保留离线缓存 · 建议定期导出 JSON 备份 🍁':'当前为本地模式 · 数据保存在浏览器 localStorage 中 · 建议定期导出备份 🍁';
}
function renderCloudPanel(){
  $('#cloudGuestPanel').hidden=!!cloudUser;
  $('#cloudUserPanel').hidden=!cloudUser;
  $('#cloudUserEmail').textContent=cloudUser?.email||'';
  if(!cloudUser)setCloudStatus('local','使用 Firebase Spark 免费计划');
}
function openCloudModal(){renderCloudPanel();$('#cloudModal').classList.add('show');}
function closeCloudModal(){$('#cloudModal').classList.remove('show');}
function friendlyFirebaseError(e){
  const code=e?.code||'';
  const map={
    'auth/operation-not-allowed':'尚未在 Firebase 控制台启用“邮箱/密码”登录',
    'auth/email-already-in-use':'该邮箱已经注册，请直接登录',
    'auth/invalid-credential':'邮箱或密码不正确',
    'auth/invalid-email':'邮箱格式不正确',
    'auth/weak-password':'密码强度不足，至少需要 8 位',
    'auth/too-many-requests':'尝试次数过多，请稍后再试',
    'auth/network-request-failed':'网络请求失败，请检查是否能访问 Firebase',
    'permission-denied':'没有访问该云端数据的权限'
  };
  return map[code]||e?.message||'未知错误';
}
function switchToLocalMode(){
  const hadUser=!!cloudUser;
  cloudUnsubscribe?.();cloudUnsubscribe=null;
  cloudUser=null;
  if(hadUser){records=readRecordsFromKey(LS_KEY);renderAll();}
  renderCloudPanel();setCloudStatus('local','已退出云端账号');
}
function cloudCollection(){return cloudDb.collection('users').doc(cloudUser.uid).collection('applications');}
function startCloudListener(){
  cloudUnsubscribe?.();
  cloudUnsubscribe=cloudCollection().onSnapshot(snapshot=>{
    if(cloudSyncing||cloudSyncTimer)return;
    records=snapshot.docs.map(d=>normalizeRecord(d.data()));
    localStorage.setItem(cloudCacheKey(cloudUser.uid),JSON.stringify(records));
    renderAll();
    setCloudStatus('online',`云端已更新：${records.length} 条`);
  },e=>setCloudStatus('error',`监听失败：${friendlyFirebaseError(e)}`));
}
async function activateCloudSession(user){
  if(!user){switchToLocalMode();return;}
  if(cloudUser?.uid===user.uid){renderCloudPanel();return;}
  const localCandidate=readRecordsFromKey(LS_KEY);
  const cacheKey=cloudCacheKey(user.uid);
  const hasUserCache=localStorage.getItem(cacheKey)!==null;
  cloudUser=user;
  records=hasUserCache?readRecordsFromKey(cacheKey):[];
  renderAll();renderCloudPanel();
  await syncCloud({firstConnect:!hasUserCache,importCandidate:localCandidate,showToast:true});
  if(cloudUser)startCloudListener();
}
async function initCloud(){
  renderCloudPanel();
  if(!window.firebase||!window.OFFER_FIREBASE_CONFIG){setCloudStatus('error','Firebase SDK 或配置加载失败');return;}
  try{
    const app=window.firebase.apps.length?window.firebase.app():window.firebase.initializeApp(window.OFFER_FIREBASE_CONFIG);
    cloudAuthClient=app.auth();
    cloudDb=app.firestore();
    try{await cloudDb.enablePersistence({synchronizeTabs:true});}catch(e){if(!['failed-precondition','unimplemented'].some(x=>String(e.code||'').includes(x)))console.warn(e);}
    cloudAuthClient.onAuthStateChanged(user=>activateCloudSession(user));
    setCloudStatus('local','Firebase 已就绪，请登录');
  }catch(e){setCloudStatus('error',friendlyFirebaseError(e));}
}
async function cloudAuth(mode){
  if(!cloudAuthClient){toast('Firebase 尚未初始化，请检查网络','error');return;}
  const email=$('#cloudEmail').value.trim();
  const password=$('#cloudPassword').value;
  if(!email||password.length<8){toast('请填写邮箱和至少 8 位密码','error');return;}
  setCloudStatus('syncing',mode==='signup'?'正在注册…':'正在登录…');
  try{
    if(mode==='signup')await cloudAuthClient.createUserWithEmailAndPassword(email,password);
    else await cloudAuthClient.signInWithEmailAndPassword(email,password);
    toast(mode==='signup'?'注册并登录成功':'登录成功','success');
  }catch(e){setCloudStatus('error',friendlyFirebaseError(e));toast(`认证失败：${friendlyFirebaseError(e)}`,'error');}
}
async function signOutCloud(){
  try{if(cloudAuthClient)await cloudAuthClient.signOut();}
  finally{switchToLocalMode();toast('已退出云端账号，本地原始数据仍保留','success');}
}
function newerThan(a,b){return new Date(a||0).getTime()>new Date(b||0).getTime();}
function scheduleCloudSync(){
  if(!cloudUser||!cloudDb)return;
  clearTimeout(cloudSyncTimer);
  setCloudStatus('syncing','检测到本地修改，准备同步…');
  cloudSyncTimer=setTimeout(()=>{cloudSyncTimer=null;syncCloud();},700);
}
async function commitCloudChanges(collection,uploads,deletes){
  const ops=[...deletes.map(id=>({type:'delete',ref:collection.doc(id)})),...uploads.map(r=>({type:'set',ref:collection.doc(r.id),data:r}))];
  for(let i=0;i<ops.length;i+=400){
    const batch=cloudDb.batch();
    ops.slice(i,i+400).forEach(op=>op.type==='delete'?batch.delete(op.ref):batch.set(op.ref,op.data));
    await batch.commit();
  }
}
async function syncCloud({firstConnect=false,importCandidate=[],showToast=false}={}){
  if(!cloudDb||!cloudUser)return;
  if(cloudSyncing){cloudSyncQueued=true;return;}
  cloudSyncing=true;cloudSyncQueued=false;
  setCloudStatus('syncing','正在同步 Firebase…');
  try{
    const userId=cloudUser.uid;
    const collection=cloudCollection();
    const snapshot=await collection.get();
    let remote=snapshot.docs.map(d=>normalizeRecord(d.data()));
    let localList=records.map(normalizeRecord);
    if(firstConnect&&importCandidate.length){
      const ok=window.confirm(`检测到本地 ${importCandidate.length} 条投递记录，是否合并并上传到当前云端账号？\n\n选择“取消”不会删除本地数据。`);
      if(ok)localList=importCandidate.map(normalizeRecord);
    }
    const pending=readPendingDeletes();
    remote=remote.filter(r=>!pending.includes(r.id));
    const remoteMap=new Map(remote.map(r=>[r.id,r]));
    const merged=new Map(remoteMap);
    const upload=[];
    localList.forEach(local=>{
      const remoteRecord=remoteMap.get(local.id);
      if(!remoteRecord||newerThan(local.updatedAt,remoteRecord.updatedAt)){
        merged.set(local.id,local);upload.push(local);
      }
    });
    await commitCloudChanges(collection,upload,pending);
    writePendingDeletes([]);
    records=[...merged.values()].map(normalizeRecord);
    localStorage.setItem(cloudCacheKey(userId),JSON.stringify(records));
    renderAll();renderCloudPanel();
    const time=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    setCloudStatus('online',`同步完成：${records.length} 条 · ${time}`);
    if(showToast)toast(`云端同步完成，共 ${records.length} 条记录`,'success');
  }catch(e){
    const message=friendlyFirebaseError(e);
    setCloudStatus('error',`同步失败：${message}`);
    if(showToast)toast(`同步失败：${message}`,'error');
  }finally{
    cloudSyncing=false;
    if(cloudSyncQueued){cloudSyncQueued=false;scheduleCloudSync();}
  }
}
