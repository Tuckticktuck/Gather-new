(() => {
"use strict";
const URL = "https://xrwldphmeafiakittcof.supabase.co";
const KEY = "sb_publishable_5Gws8f_CODwrHigG2U6Veg_bTRrBoeA";
const $ = (id) => document.getElementById(id);
const db = window.supabase.createClient(URL, KEY);
const ACCENTS = {
  lavender:{accent:"#b6a9ff",strong:"#9583ef",ink:"#211d35",soft:"#302d47",border:"#b6a9ff55"},
  blue:{accent:"#9bcfff",strong:"#589be0",ink:"#142b43",soft:"#243b58",border:"#9bcfff55"},
  mint:{accent:"#9be2c4",strong:"#55b993",ink:"#153b31",soft:"#24483d",border:"#9be2c455"},
  rose:{accent:"#ffb6ca",strong:"#e8799d",ink:"#411f30",soft:"#472b3a",border:"#ffb6ca55"},
  amber:{accent:"#ffd48c",strong:"#efa94c",ink:"#432f13",soft:"#4a381f",border:"#ffd48c55"},
  teal:{accent:"#9be2e4",strong:"#50b9be",ink:"#14373a",soft:"#234649",border:"#9be2e455"}
};
const FONT_SCALES = {small:"0.9",normal:"1",large:"1.15"};
const DEFAULT_PREFERENCES = {accent:"lavender",fontSize:"normal",shareOnlineStatus:true,messageNotificationMode:"temporary"};
const S = { user:null, profile:null, profiles:{}, chats:[], requests:[], friendRequests:[], friends:[], blockedUsers:[], deletedMessages:[], deletedMessageIds:new Set(), selectingMessages:false, selectedMessageIds:new Set(), folder:"friends", lastReadAt:{}, preferences:{...DEFAULT_PREFERENCES}, notificationTimers:{}, unreadCounts:{}, unreadCountsLoaded:false, totalUnreadCount:0, passwordRecovery:false, onlineFriends:new Set(), friendPresenceReady:new Set(), friendPresenceErrors:new Set(), friendPresenceChannels:{}, ownPresenceChannel:null, typingActive:false, friendPresenceSyncPromise:null, friendPresenceSyncQueued:false, pendingAvatarData:null, avatarChanged:false, pendingGroupAvatarData:null, groupAvatarChanged:false, groupAvatarConversationId:null, requestChannel:null, readChannel:null, presenceChannel:null, presenceReady:false, typingTimer:null, messageReads:{}, hasOlderMessages:false, loadingOlder:false, replyTo:null, searchConversationId:null, searchQuery:"", searchOffset:0, searchHasMore:false, directStatus:null, active:null, messages:[], channel:null, mode:"signin", picker:"direct", selected:new Set(), loading:null, loadError:null, timer:null };

function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
function status(id, text, kind) { const n=$(id); n.textContent=text||""; n.className="status"+(kind?" "+kind:""); }
function toast(text) { $("toast").textContent=text; $("toast").classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>$("toast").classList.remove("show"),3000); }
function setChatLoadStatus(message,retry=false){
  const box=$("chat-load-status");if(!box)return;
  box.hidden=!message;box.classList.toggle("error",retry);
  $("chat-load-message").textContent=message||"";$("retry-load-chats").hidden=!retry;
}
function loadUIPreferences(saved){
  S.preferences={
    accent:ACCENTS[saved?.accent]?saved.accent:DEFAULT_PREFERENCES.accent,
    fontSize:FONT_SCALES[saved?.fontSize]?saved.fontSize:DEFAULT_PREFERENCES.fontSize,
    shareOnlineStatus:saved?.shareOnlineStatus!==false,
    messageNotificationMode:saved?.messageNotificationMode==="persistent"?"persistent":"temporary"
  };
  applyUIPreferences();
}
function applyUIPreferences(){
  const accent=ACCENTS[S.preferences.accent]||ACCENTS.lavender;
  const root=document.documentElement;
  root.style.setProperty("--accent",accent.accent);
  root.style.setProperty("--accent-strong",accent.strong);
  root.style.setProperty("--accent-ink",accent.ink);
  root.style.setProperty("--accent-soft",accent.soft);
  root.style.setProperty("--accent-border",accent.border);
  root.style.setProperty("--accent-text",`color-mix(in srgb,${accent.accent} 74%,white)`);
  root.style.setProperty("--accent-badge",`color-mix(in srgb,${accent.accent} 17%,#191b25)`);
  root.style.setProperty("--accent-surface",`color-mix(in srgb,${accent.accent} 11%,#191b25)`);
  root.style.setProperty("--accent-hover",`color-mix(in srgb,${accent.accent} 20%,#20222d)`);
  root.style.setProperty("--accent-outline-soft",`color-mix(in srgb,${accent.accent} 20%,transparent)`);
  root.style.setProperty("--accent-outline",`color-mix(in srgb,${accent.accent} 40%,transparent)`);
  root.style.setProperty("--accent-outline-strong",`color-mix(in srgb,${accent.accent} 52%,transparent)`);
  root.style.setProperty("--accent-avatar",`color-mix(in srgb,${accent.accent} 45%,#292d42)`);
  root.style.setProperty("--accent-avatar-text",`color-mix(in srgb,${accent.accent} 76%,white)`);
  root.style.setProperty("--accent-gradient-light",`color-mix(in srgb,${accent.accent} 76%,white)`);
  root.style.setProperty("--accent-deep",`color-mix(in srgb,${accent.accent} 19%,#11131a)`);
  root.style.setProperty("--accent-panel",`color-mix(in srgb,${accent.accent} 13%,#191b25)`);
  root.style.setProperty("--accent-panel-raised",`color-mix(in srgb,${accent.accent} 17%,#1d202b)`);
  root.style.setProperty("--accent-input",`color-mix(in srgb,${accent.accent} 10%,#11131a)`);
  root.style.setProperty("--accent-chat",`color-mix(in srgb,${accent.accent} 25%,#11131a)`);
  root.style.setProperty("--accent-chat-border",`color-mix(in srgb,${accent.accent} 42%,#191b25)`);
  root.style.setProperty("--accent-muted",`color-mix(in srgb,${accent.accent} 30%,#9b9caf)`);
  root.style.setProperty("--accent-contrast",`color-mix(in srgb,${accent.accent} 80%,white)`);
  root.style.setProperty("--font-scale",FONT_SCALES[S.preferences.fontSize]||"1");
  document.querySelectorAll("[data-accent]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.accent===S.preferences.accent)));
  document.querySelectorAll("[data-font-size]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.fontSize===S.preferences.fontSize)));
  const onlineToggle=$("share-online-status");if(onlineToggle)onlineToggle.checked=S.preferences.shareOnlineStatus;
  document.querySelectorAll("[data-notification-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.notificationMode===S.preferences.messageNotificationMode)));
}
function saveUIPreferences(){
  applyUIPreferences();
  if(!S.user)return;
  const userId=S.user.id,snapshot={...S.preferences};
  $("settings-note").textContent="Saving to your Gather account…";
  clearTimeout(S.preferenceSaveTimer);
  S.preferenceSaveTimer=setTimeout(async()=>{
    const result=await db.from("profiles").update({preferences:snapshot}).eq("id",userId).select("preferences").single();
    if(S.user?.id!==userId)return;
    if(result.error){
      loadUIPreferences(S.profile?.preferences||DEFAULT_PREFERENCES);
      syncFriendPresence();
      $("settings-note").textContent="Couldn't save settings. Please try again.";
      toast("Appearance settings were not saved: "+result.error.message);
      return;
    }
    S.profile.preferences=result.data.preferences;
    $("settings-note").textContent="Saved to your account. Your theme and online-status choice follow you to other devices.";
    syncFriendPresence();
  },180);
}
function setAccent(accent){
  if(!ACCENTS[accent])return;
  S.preferences.accent=accent;saveUIPreferences();
}
function setFontSize(size){
  if(!FONT_SCALES[size])return;
  S.preferences.fontSize=size;saveUIPreferences();
}
function setMessageNotificationMode(mode){
  if(mode!=="temporary"&&mode!=="persistent")return;
  S.preferences.messageNotificationMode=mode;saveUIPreferences();
}
function openSettings(){
  applyUIPreferences();$("settings-modal").hidden=false;
}
function initials(s) { return (String(s||"?").trim()[0]||"?").toUpperCase(); }
function paintAvatar(node,name,imageData){
  if(!node)return;
  node.replaceChildren();
  node.classList.toggle("has-picture",!!imageData);
  if(imageData){
    const image=document.createElement("img");
    image.src=imageData;image.alt="";image.loading="lazy";image.decoding="async";
    image.onerror=()=>{node.classList.remove("has-picture");node.replaceChildren();node.textContent=initials(name);};
    node.append(image);
  }else node.textContent=initials(name);
}
function avatar(name,imageData=null){
  const node=el("span","avatar");
  paintAvatar(node,name,imageData);
  return node;
}
async function fetchProfileRecords(ids){
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(!unique.length)return {data:[],error:null};
  const profiles=await db.from("profiles").select("id,username,display_name").in("id",unique);
  if(profiles.error)return {data:null,error:profiles.error};
  const records=(profiles.data||[]).map(p=>({...p,avatar_data:null}));
  const pictures=await db.from("profile_avatars").select("user_id,image_data").in("user_id",unique);
  if(pictures.error){
    console.warn("Gather profile pictures could not be loaded:",pictures.error.message);
  }else{
    const byUser=new Map((pictures.data||[]).map(x=>[x.user_id,x.image_data]));
    records.forEach(p=>p.avatar_data=byUser.get(p.id)||null);
  }
  return {data:records,error:null};
}
function syncOwnAvatar(){
  if(!S.profile)return;
  paintAvatar($("user-initial"),S.profile.display_name,S.profile.avatar_data);
  paintAvatar($("profile-avatar-preview"),S.profile.display_name,S.profile.avatar_data);
}
function dateLabel(s) { if(!s)return ""; const d=new Date(s), now=new Date(); return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):d.toLocaleDateString([],{month:"short",day:"numeric"}); }
function loadReadState(){
  if(!S.user){S.lastReadAt={};return;}
  try{
    const saved=JSON.parse(localStorage.getItem("gather_last_read_"+S.user.id)||"null");
    S.lastReadAt=saved&&typeof saved==="object"&&!Array.isArray(saved)?saved:{};
  }catch(e){S.lastReadAt={};}
}
function saveReadState(){
  if(!S.user)return;
  try{localStorage.setItem("gather_last_read_"+S.user.id,JSON.stringify(S.lastReadAt));}catch(e){}
}
function updateUnreadSummary(){
  const total=Object.values(S.unreadCounts||{}).reduce((sum,value)=>sum+Number(value||0),0);
  S.totalUnreadCount=total;
  const sidebarBadge=$("sidebar-unread-count");
  if(sidebarBadge){sidebarBadge.textContent=total>99?"99+":String(total);sidebarBadge.hidden=total===0;}
  const workspaceSummary=$("workspace-unread-summary");
  if(workspaceSummary){
    workspaceSummary.textContent=total+" unread "+(total===1?"message":"messages")+" across your conversations";
    workspaceSummary.hidden=total===0;
  }
}
async function loadUnreadCounts(){
  if(!S.user)return false;
  const result=await db.rpc("get_my_unread_counts");
  if(result.error){console.warn("Unread counts could not be loaded:",result.error.message);S.unreadCountsLoaded=false;updateUnreadSummary();return false;}
  S.unreadCounts={};
  (result.data||[]).forEach(row=>{
    const count=Number(row.unread_count||0);
    if(row.conversation_id&&count>0)S.unreadCounts[row.conversation_id]=count;
  });
  S.unreadCountsLoaded=true;updateUnreadSummary();return true;
}
function chatHasUnread(chat){
  if(!chat)return false;
  if(S.unreadCountsLoaded)return Number(S.unreadCounts[chat.id]||0)>0;
  if(!chat.last||chat.last.sender_id===S.user?.id)return false;
  const lastAt=new Date(chat.last.created_at).getTime();
  return Number.isFinite(lastAt)&&lastAt>Number(S.lastReadAt[chat.id]||0);
}
async function markConversationRead(chatId){
  if(!S.user||!chatId)return false;
  const result=await db.rpc("mark_conversation_read",{p_conversation_id:chatId});
  if(result.error){console.warn("Conversation read status could not be saved:",result.error.message);return false;}
  await loadUnreadCounts();renderChats();return true;
}
function markChatRead(chatId,through=null){
  if(!chatId)return;
  const chat=S.chats.find(x=>x.id===chatId);
  const latest=through||(S.messages.filter(m=>m.conversation_id===chatId).slice(-1)[0]?.created_at)||chat?.last?.created_at;
  const at=latest?new Date(latest).getTime():Date.now();
  if(!Number.isFinite(at))return;
  S.lastReadAt[chatId]=Math.max(Number(S.lastReadAt[chatId]||0),at);
  saveReadState();
}
function showAuth() {
  clearMessageNotifications();
  $("password-recovery-modal").hidden=true;S.passwordRecovery=false;
  stopFriendPresence();
  if(S.channel){db.removeChannel(S.channel);S.channel=null;}
  if(S.requestChannel){db.removeChannel(S.requestChannel);S.requestChannel=null;}
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  if(S.presenceChannel){db.removeChannel(S.presenceChannel);S.presenceChannel=null;}
  clearTimeout(S.typingTimer);S.presenceReady=false;
  S.user=null;S.profile=null;S.profiles={};S.chats=[];S.messages=[];S.messageReads={};S.replyTo=null;S.hasOlderMessages=false;S.requests=[];S.friendRequests=[];S.friends=[];S.blockedUsers=[];S.deletedMessages=[];S.deletedMessageIds=new Set();S.lastReadAt={};S.folder="friends";S.directStatus=null;S.active=null;S.messages=[];S.loadError=null;S.avatarChanged=false;S.pendingAvatarData=null;loadUIPreferences(DEFAULT_PREFERENCES);
  setChatLoadStatus("");$("auth").hidden=false;$("app").hidden=true;
}
function showApp(){ $("auth").hidden=true;$("app").hidden=false; }
function authMode(mode){
  S.mode=mode; const signUp=mode==="signup";
  document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("name-wrap").hidden=!signUp;$("name").required=signUp;
  $("auth-title").textContent=signUp?"Make yourself at home.":"Welcome back.";
  $("auth-subtitle").textContent=signUp?"Create an account to start talking.":"Sign in to see your conversations.";
  $("auth-password-hint").textContent=signUp?"New passwords must be 12+ characters with uppercase and lowercase letters, a number, and a symbol.":"Sign in with your existing password. New Gather passwords must meet the stronger rules.";
  $("auth-submit").textContent=signUp?"Create account":"Sign in";$("password").autocomplete=signUp?"new-password":"current-password";$("forgot-password").hidden=signUp;
  status("auth-status","");
}
function openPasswordRecovery(){
  S.passwordRecovery=true;
  $("recovery-new-password").value="";$("recovery-confirm-password").value="";
  status("recovery-password-status","");
  $("password-recovery-modal").hidden=false;
  try{history.replaceState({},document.title,location.pathname+location.search);}catch(e){}
}
async function requestPasswordReset(){
  const email=$("email").value.trim();
  if(!email||!$("email").checkValidity()){
    status("auth-status","Enter the email address on your Gather account first.","error");
    $("email").focus();return;
  }
  const button=$("forgot-password");button.disabled=true;
  status("auth-status","Sending password-reset email…");
  const redirectTo=location.origin+location.pathname;
  const result=await db.auth.resetPasswordForEmail(email,{redirectTo});
  button.disabled=false;
  if(result.error){status("auth-status","Password-reset email could not be sent: "+result.error.message,"error");return;}
  status("auth-status","If a Gather account uses that email, password-reset instructions will arrive in its inbox. Check your spam folder too.","success");
}
async function completePasswordRecovery(e){
  e.preventDefault();
  const password=$("recovery-new-password").value,confirmation=$("recovery-confirm-password").value;
  const weak=strongPasswordError(password);
  if(weak){status("recovery-password-status",weak,"error");return;}
  if(password!==confirmation){status("recovery-password-status","The passwords do not match.","error");return;}
  const button=$("recovery-password-save");button.disabled=true;
  status("recovery-password-status","Updating your password…");
  const result=await db.auth.updateUser({password});
  button.disabled=false;
  if(result.error){status("recovery-password-status","Password could not be updated: "+result.error.message,"error");return;}
  S.passwordRecovery=false;$("password-recovery-modal").hidden=true;
  $("recovery-new-password").value="";$("recovery-confirm-password").value="";
  toast("Your Gather password has been updated.");
}
async function ensureProfile(user){
  const found=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(found.error)throw found.error;if(found.data)return found.data;
  const base=((user.email||"member").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g,"")||"member").slice(0,13);
  const username=(base.length>=3?base:"member")+"_"+user.id.replace(/-/g,"").slice(0,8);
  const display_name=((user.user_metadata&&user.user_metadata.display_name)||base||"Member").trim().slice(0,50)||"Member";
  const created=await db.from("profiles").insert({id:user.id,username,display_name}).select("*").single();
  if(created.error)throw created.error;return created.data;
}
async function signedIn(user,retry=false){
  if(!user||S.loading===user.id)return;
  if(!retry&&S.user&&S.user.id===user.id&&S.profile)return;
  S.loading=user.id;S.user=user;S.loadError=null;showApp();setChatLoadStatus("Loading your chats…");
  try{
    S.profile=await ensureProfile(user);
    if(S.user?.id!==user.id)return;
    loadReadState();
    loadUIPreferences(S.profile.preferences||DEFAULT_PREFERENCES);
    const ownPicture=await db.from("profile_avatars").select("image_data").eq("user_id",user.id).maybeSingle();
    S.profile.avatar_data=ownPicture.error?null:(ownPicture.data?.image_data||null);
    S.profiles[user.id]=S.profile;
    $("user-name").textContent=S.profile.display_name;
    syncOwnAvatar();
    subscribeRequests();
    const loaded=await loadChats();
    if(!loaded)throw new Error(S.loadError||"Please check your connection and try again.");
    subscribeMessages();
    setChatLoadStatus("");
    if(!await loadFriends())console.warn("Gather friend list could not be loaded.");
    if(!await loadBlocked())console.warn("Gather blocked list could not be loaded.");
    renderChats();
  }catch(e){
    const reason=S.loadError||e.message||"An unexpected error occurred.";
    setChatLoadStatus("Couldn't finish loading Gather. "+reason,true);
    console.error("Gather startup failed:",e);
  }finally{if(S.loading===user.id)S.loading=null;}
}
function chatTitle(c){
  if(c.kind==="group")return c.title||"Group chat";
  const other=c.members.find(m=>m.user_id!==S.user.id);return other&&S.profiles[other.user_id]?S.profiles[other.user_id].display_name:"Direct message";
}
function chatSub(c){
  if(c.kind==="group"){const names=c.members.map(m=>S.profiles[m.user_id]?.display_name||"Member");return c.members.length+" members"+(c.description?" · "+c.description:" · "+names.slice(0,3).join(", "));}
  const other=c.members.find(m=>m.user_id!==S.user.id),p=other&&S.profiles[other.user_id];
  const presence=other&&S.friendPresenceReady.has(other.user_id)?(S.onlineFriends.has(other.user_id)?" · Online":" · Offline"):"";
  return p?"@"+p.username+presence:"Private conversation";
}
async function loadChats(){
  if(!S.user)return false;
  S.loadError=null;
  const hidden=await db.from("user_deleted_messages").select("message_id").eq("user_id",S.user.id);
  if(hidden.error){S.loadError="Deleted-message settings could not be loaded: "+hidden.error.message;toast(S.loadError);return false;}
  S.deletedMessageIds=new Set((hidden.data||[]).map(x=>x.message_id));
  const m=await db.from("conversation_members").select("conversation_id,role,conversations!inner(id,kind,title,description,updated_at)").eq("user_id",S.user.id);
  if(m.error){S.loadError="Chats could not be loaded: "+m.error.message;toast(S.loadError);return false;}
  const rows=m.data||[],ids=[...new Set(rows.map(x=>x.conversation_id))];
  if(!ids.length){S.chats=[];S.profiles={};await loadUnreadCounts();renderChats();renderActive();return await loadRequests();}
  const [members,msgs,groupPics]=await Promise.all([
    db.from("conversation_members").select("conversation_id,user_id,role").in("conversation_id",ids),
    db.from("messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id",ids).order("created_at",{ascending:false}).limit(1000),
    db.from("group_avatars").select("conversation_id,image_data").in("conversation_id",ids)
  ]);
  if(members.error){S.loadError="Chat members could not be loaded: "+members.error.message;toast(S.loadError);return false;}
  const userIds=[...new Set(members.data.map(x=>x.user_id))];
  const p=await fetchProfileRecords(userIds);
  if(p.error){S.loadError="Member profiles could not be loaded: "+p.error.message;toast(S.loadError);return false;}
  S.profiles={};p.data.forEach(x=>S.profiles[x.id]=x);
  if(S.profile)S.profiles[S.user.id]=S.profile;
  const groupAvatarByChat={};
  if(groupPics.error)console.warn("Gather group pictures could not be loaded:",groupPics.error.message);
  else (groupPics.data||[]).forEach(x=>groupAvatarByChat[x.conversation_id]=x.image_data);
  const byChat={},last={},hasMessages={};members.data.forEach(x=>(byChat[x.conversation_id]??=[]).push(x));
  (msgs.data||[]).forEach(x=>{
    hasMessages[x.conversation_id]=true;
    if(!S.deletedMessageIds.has(x.id)&&!last[x.conversation_id])last[x.conversation_id]=x;
  });
  S.chats=rows.map(x=>({...x.conversations,avatar_data:groupAvatarByChat[x.conversation_id]||null,members:byChat[x.conversation_id]||[],last:last[x.conversation_id]||null,hasMessages:!!hasMessages[x.conversation_id]}))
    .sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  let readStateChanged=false;
  S.chats.forEach(chat=>{
    if(S.lastReadAt[chat.id]===undefined){
      S.lastReadAt[chat.id]=chat.last?new Date(chat.last.created_at).getTime():0;
      readStateChanged=true;
    }
  });
  if(readStateChanged)saveReadState();
  await loadUnreadCounts();
  renderChats();renderActive();return await loadRequests();
}
async function loadRequests(){
  if(!S.user)return false;
  const r=await db.from("conversation_requests").select("id,sender_id,recipient_id,status,created_at").or("sender_id.eq."+S.user.id+",recipient_id.eq."+S.user.id).order("created_at",{ascending:false}).limit(60);
  if(r.error){S.loadError="Chat requests could not be loaded: "+r.error.message;toast(S.loadError);return false;}
  S.requests=r.data||[];
  const ids=[...new Set(S.requests.flatMap(x=>[x.sender_id,x.recipient_id]).filter(id=>id!==S.user.id))];
  if(ids.length){
    const p=await fetchProfileRecords(ids);
    if(p.error){S.loadError="Request profiles could not be loaded: "+p.error.message;toast(S.loadError);return false;}
    p.data.forEach(x=>S.profiles[x.id]=x);
  }
  renderRequests();return true;
}
function refreshFriendPresenceUI(){
  renderFriends();renderChats();
  const active=S.chats.find(x=>x.id===S.active);
  if(active?.kind==="direct")$("chat-subtitle").textContent=chatSub(active);
}
function setFriendPresence(friendId,channel){
  if(S.friendPresenceChannels[friendId]!==channel)return;
  let online=false;
  try{const metas=Object.values(channel.presenceState()).flatMap(item=>item.metas||[]);online=metas.some(meta=>meta.user_id===friendId&&meta.online===true);}
  catch(error){console.warn("Friend presence could not be read:",error.message);}
  const wasOnline=S.onlineFriends.has(friendId);
  if(online){S.onlineFriends.add(friendId);S.friendPresenceErrors.delete(friendId);}else S.onlineFriends.delete(friendId);
  if(wasOnline!==online)refreshFriendPresenceUI();
}
function stopOwnOnlinePresence(){if(S.ownPresenceChannel){db.removeChannel(S.ownPresenceChannel);S.ownPresenceChannel=null;}}
function stopFriendPresence(){
  stopOwnOnlinePresence();
  Object.values(S.friendPresenceChannels).forEach(channel=>db.removeChannel(channel));
  S.friendPresenceChannels={};S.onlineFriends.clear();S.friendPresenceReady.clear();S.friendPresenceErrors.clear();
}
async function syncFriendPresence(){
  if(!S.user)return;
  if(S.friendPresenceSyncPromise){S.friendPresenceSyncQueued=true;return;}
  const uid=S.user.id;
  S.friendPresenceSyncPromise=(async()=>{
    do{
      S.friendPresenceSyncQueued=false;
      try{await db.realtime.setAuth();}catch(error){console.warn("Friend presence could not authenticate:",error.message);return;}
      if(S.user?.id!==uid)return;
      if(!S.preferences.shareOnlineStatus)stopOwnOnlinePresence();
      else if(!S.ownPresenceChannel){
        const ownChannel=db.channel("gather-presence:"+uid,{config:{private:true,presence:{key:uid}}});
        S.ownPresenceChannel=ownChannel;
        ownChannel.subscribe(async state=>{
          if(S.ownPresenceChannel!==ownChannel)return;
          if(state==="SUBSCRIBED"&&S.preferences.shareOnlineStatus){
            try{await ownChannel.track({user_id:uid,online:true});}catch(error){console.warn("Online status could not be shared:",error.message);}
          }else if(state==="CHANNEL_ERROR"||state==="TIMED_OUT")console.warn("Online status channel could not connect:",state);
        });
      }
      const friendIds=new Set(S.friends.map(friend=>friend.friend_id).filter(id=>id&&id!==uid));
      Object.entries(S.friendPresenceChannels).forEach(([friendId,channel])=>{
        if(!friendIds.has(friendId)){db.removeChannel(channel);delete S.friendPresenceChannels[friendId];S.onlineFriends.delete(friendId);S.friendPresenceReady.delete(friendId);S.friendPresenceErrors.delete(friendId);}
      });
      friendIds.forEach(friendId=>{
        if(S.friendPresenceChannels[friendId])return;
        const channel=db.channel("gather-presence:"+friendId,{config:{private:true,presence:{key:uid}}});
        S.friendPresenceChannels[friendId]=channel;
        const update=()=>setFriendPresence(friendId,channel);
        channel.on("presence",{event:"sync"},update).on("presence",{event:"join"},update).on("presence",{event:"leave"},update);
        channel.subscribe(state=>{
          if(S.friendPresenceChannels[friendId]!==channel)return;
          if(state==="SUBSCRIBED"){S.friendPresenceReady.add(friendId);S.friendPresenceErrors.delete(friendId);update();refreshFriendPresenceUI();}
          else if(state==="CHANNEL_ERROR"||state==="TIMED_OUT"||state==="CLOSED"){S.friendPresenceReady.delete(friendId);S.onlineFriends.delete(friendId);S.friendPresenceErrors.add(friendId);refreshFriendPresenceUI();}
        });
      });
      refreshFriendPresenceUI();
    }while(S.friendPresenceSyncQueued);
  })();
  try{await S.friendPresenceSyncPromise;}finally{S.friendPresenceSyncPromise=null;}
}
function setShareOnlineStatus(enabled){S.preferences.shareOnlineStatus=!!enabled;if(!S.preferences.shareOnlineStatus)stopOwnOnlinePresence();saveUIPreferences();}

async function loadFriends(){
  if(!S.user)return false;
  const [friendsResult,requestsResult]=await Promise.all([
    db.from("friendships").select("friend_id,created_at").eq("user_id",S.user.id).order("created_at",{ascending:false}),
    db.from("friend_requests").select("id,sender_id,recipient_id,status,created_at").or("sender_id.eq."+S.user.id+",recipient_id.eq."+S.user.id).order("created_at",{ascending:false}).limit(80)
  ]);
  if(friendsResult.error||requestsResult.error){
    const reason=friendsResult.error?.message||requestsResult.error?.message||"Unknown database error";
    console.error("Gather friends could not be loaded:",reason);
    $("friends-error").textContent="Friends could not be loaded. "+reason;
    return false;
  }
  S.friends=friendsResult.data||[];
  S.friendRequests=requestsResult.data||[];
  const ids=[...new Set([
    ...S.friends.map(x=>x.friend_id),
    ...S.friendRequests.flatMap(x=>[x.sender_id,x.recipient_id].filter(id=>id!==S.user.id))
  ])];
  if(ids.length){
    const profiles=await fetchProfileRecords(ids);
    if(profiles.error){
      $("friends-error").textContent="Friend profiles could not be loaded. "+profiles.error.message;
      return false;
    }
    profiles.data.forEach(x=>S.profiles[x.id]=x);
  }
  $("friends-error").textContent="";
  renderFriends();renderChats();
  syncFriendPresence();
  return true;
}
function subscribeRequests(){
  if(S.requestChannel){db.removeChannel(S.requestChannel);S.requestChannel=null;}
  if(!S.user)return;
  const uid=S.user.id;
  S.requestChannel=db.channel("requests-"+uid)
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles",filter:"id=eq."+uid},payload=>{
      const next=payload.new?.preferences;if(!next)return;
      const changed=next.accent!==S.preferences.accent||next.fontSize!==S.preferences.fontSize||next.shareOnlineStatus!==S.preferences.shareOnlineStatus;
      if(changed){S.profile.preferences=next;loadUIPreferences(next);syncFriendPresence();}
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"conversation_requests",filter:"recipient_id=eq."+uid},payload=>{
      loadRequests();toast("You received a new chat request.");
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"conversation_requests",filter:"sender_id=eq."+uid},payload=>{
      loadRequests();
      if(payload.new?.status==="accepted"){toast("Your chat request was accepted.");loadChats();}
      else if(payload.new?.status==="declined")toast("A chat request was declined.");
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"conversation_requests",filter:"recipient_id=eq."+uid},()=>loadRequests())
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"friend_requests",filter:"recipient_id=eq."+uid},()=>{
      loadFriends();toast("You received a friend request.");
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"friend_requests",filter:"sender_id=eq."+uid},payload=>{
      loadFriends();
      if(payload.new?.status==="accepted"){toast("Your friend request was accepted.");loadChats();}
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"friend_requests",filter:"recipient_id=eq."+uid},()=>loadFriends())
    .on("postgres_changes",{event:"*",schema:"public",table:"friendships",filter:"user_id=eq."+uid},()=>{
      loadFriends();loadChats();
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"user_deleted_messages",filter:"user_id=eq."+uid},payload=>{
      const messageId=payload.new?.message_id;
      if(messageId){S.deletedMessageIds.add(messageId);S.messages=S.messages.filter(x=>x.id!==messageId);renderMessages();}
      loadChats();if(S.folder==="deleted")loadDeletedMessages();
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"user_deleted_messages"},payload=>{
      if(payload.old?.user_id!==uid||!payload.old?.message_id)return;
      S.deletedMessageIds.delete(payload.old.message_id);
      if(S.active)loadMessages(S.active);
      loadChats();if(S.folder==="deleted")loadDeletedMessages();
    })
    .subscribe();
}
function dismissMessageNotification(messageId){
  const id=String(messageId||"");
  if(!id)return;
  if(S.notificationTimers[id]){clearTimeout(S.notificationTimers[id]);delete S.notificationTimers[id];}
  const card=$("message-notification-"+id);
  if(card)card.remove();
  const container=$("message-notifications");
  if(container)container.hidden=container.childElementCount===0;
}
function clearMessageNotifications(){
  Object.values(S.notificationTimers||{}).forEach(timer=>clearTimeout(timer));
  S.notificationTimers={};
  const container=$("message-notifications");
  if(container){container.replaceChildren();container.hidden=true;}
}
function showMessageNotification(message,chat){
  if(!message||!chat||!S.user||message.sender_id===S.user.id||S.active===chat.id)return;
  const container=$("message-notifications");
  if(!container||$("message-notification-"+message.id))return;
  const card=el("article","message-notification");
  card.id="message-notification-"+message.id;
  card.dataset.notificationId=message.id;
  const open=el("button","message-notification-open");
  open.type="button";
  open.setAttribute("aria-label","Open conversation "+chatTitle(chat));
  const heading=el("span","message-notification-heading");
  heading.append(el("strong","",chatTitle(chat)));
  const sender=S.profiles[message.sender_id]?.display_name||"A group member";
  heading.append(el("small","",chat.kind==="group"?sender+" sent a message":"New message"));
  const preview=el("span","message-notification-preview",message.body||"Sent a message");
  open.append(heading,preview);
  open.addEventListener("click",()=>{
    dismissMessageNotification(message.id);
    openChat(chat.id);
  });
  const dismiss=el("button","message-notification-dismiss","×");
  dismiss.type="button";
  dismiss.setAttribute("aria-label","Dismiss notification");
  dismiss.addEventListener("click",()=>dismissMessageNotification(message.id));
  card.append(open,dismiss);
  container.prepend(card);
  container.hidden=false;
  if(S.preferences.messageNotificationMode!=="persistent"){
    S.notificationTimers[message.id]=setTimeout(()=>dismissMessageNotification(message.id),5000);
  }
}
function subscribeMessages(){
  if(S.channel){db.removeChannel(S.channel);S.channel=null;}
  if(!S.user)return;
  const uid=S.user.id;
  S.channel=db.channel("messages-"+uid)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},async payload=>{
      const message=payload.new;
      if(!message?.id||!message.conversation_id||S.deletedMessageIds.has(message.id))return;
      const chat=S.chats.find(x=>x.id===message.conversation_id);
      if(!chat){loadChats();return;}
      if(!chat.last||new Date(message.created_at)>=new Date(chat.last.created_at)){chat.last=message;chat.updated_at=message.created_at;}
      chat.hasMessages=true;
      if(S.active===chat.id){
        const [withReply]=await attachReplyPreviews([message],chat.id);
        if(!S.messages.some(x=>x.id===message.id)){S.messages.push(withReply);S.messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||a.id.localeCompare(b.id));renderMessages();}
        if(message.sender_id!==uid){markChatRead(chat.id,message.created_at);await markConversationRead(chat.id);}
      }else{
        if(message.sender_id!==uid)showMessageNotification(message,chat);
        await loadUnreadCounts();
      }
      S.chats.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));renderChats();
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"message_reads",filter:"user_id=eq."+uid},async()=>{
      await loadUnreadCounts();renderChats();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"group_avatars"},payload=>{
      const conversationId=payload.new?.conversation_id||payload.old?.conversation_id;
      const chat=S.chats.find(x=>x.id===conversationId);
      if(!chat||chat.kind!=="group")return;
      chat.avatar_data=payload.eventType==="DELETE"?null:(payload.new?.image_data||null);
      renderChats();
      if(S.active===conversationId)renderActive();
    })
    .subscribe();
}
function renderRequests(){
  const incoming=$("incoming-requests"),outgoing=$("outgoing-requests");
  incoming.replaceChildren();outgoing.replaceChildren();
  const ins=S.requests.filter(x=>x.recipient_id===S.user.id&&x.status==="pending");
  const outs=S.requests.filter(x=>x.sender_id===S.user.id&&x.status==="pending");
  $("requests-count").textContent=ins.length;
  $("requests-open").classList.toggle("has-requests",ins.length>0);
  if(!ins.length)incoming.append(el("p","muted tiny","No new requests."));
  if(!outs.length)outgoing.append(el("p","muted tiny","You have no pending sent requests."));
  ins.forEach(r=>incoming.append(requestRow(r,true)));
  outs.forEach(r=>outgoing.append(requestRow(r,false)));
}
function renderFriends(){
  const list=$("friends-list"),incoming=$("friend-incoming"),outgoing=$("friend-outgoing");
  if(!list||!incoming||!outgoing)return;
  list.replaceChildren();incoming.replaceChildren();outgoing.replaceChildren();
  const ins=S.friendRequests.filter(x=>x.recipient_id===S.user.id&&x.status==="pending");
  const outs=S.friendRequests.filter(x=>x.sender_id===S.user.id&&x.status==="pending");
  $("friends-count").textContent=S.friends.length;
  $("friends-open").classList.toggle("has-requests",ins.length>0);
  if(!S.friends.length)list.append(el("p","muted tiny","You have not added any friends yet."));
  S.friends.forEach(f=>{
    const p=S.profiles[f.friend_id]||{id:f.friend_id,display_name:"Gather member",username:"member"};
    const online=S.onlineFriends.has(f.friend_id),ready=S.friendPresenceReady.has(f.friend_id),unavailable=S.friendPresenceErrors.has(f.friend_id);
    const row=el("div","request-item");row.append(avatar(p.display_name,p.avatar_data));
    const dot=el("span","friend-online-dot"+(online?" online":""));dot.title=online?"Online":"Offline";dot.setAttribute("aria-label",online?"Online":"Offline");row.append(dot);
    const label=ready?(online?"Online":"Offline"):(unavailable?"Unavailable":"Checking…");
    const copy=el("div","request-copy");copy.append(el("strong","",p.display_name),el("small","","@"+p.username+" · "+label));row.append(copy);
    const actions=el("div","request-actions");
    const message=el("button","request-accept","Message"),remove=el("button","request-decline","Remove");
    message.type=remove.type="button";
    message.addEventListener("click",async()=>{ $("friends-modal").hidden=true;await directChat(p); });
    remove.addEventListener("click",()=>removeFriend(f.friend_id));
    actions.append(message,remove);row.append(actions);list.append(row);
  });
  if(!ins.length)incoming.append(el("p","muted tiny","No new friend requests."));
  if(!outs.length)outgoing.append(el("p","muted tiny","You have no pending sent requests."));
  ins.forEach(r=>incoming.append(friendRequestRow(r,true)));
  outs.forEach(r=>outgoing.append(friendRequestRow(r,false)));
}
function friendRequestRow(r,isIncoming){
  const peerId=isIncoming?r.sender_id:r.recipient_id,p=S.profiles[peerId]||{display_name:"Gather member",username:"member"};
  const row=el("div","request-item");row.append(avatar(p.display_name,p.avatar_data));
  const copy=el("div","request-copy");copy.append(el("strong","",p.display_name),el("small","","@"+p.username));row.append(copy);
  if(isIncoming){
    const actions=el("div","request-actions"),accept=el("button","request-accept","Accept"),decline=el("button","request-decline","Decline");
    accept.type=decline.type="button";
    accept.addEventListener("click",()=>respondToFriendRequest(r.id,true));
    decline.addEventListener("click",()=>respondToFriendRequest(r.id,false));
    actions.append(accept,decline);row.append(actions);
  }else row.append(el("span","request-pending","Pending"));
  return row;
}
function requestRow(r,isIncoming){
  const peerId=isIncoming?r.sender_id:r.recipient_id,p=S.profiles[peerId]||{display_name:"Gather member",username:"member"};
  const row=el("div","request-item");row.append(avatar(p.display_name,p.avatar_data));
  const copy=el("div","request-copy");copy.append(el("strong","",p.display_name),el("small","","@"+p.username));row.append(copy);
  if(isIncoming){
    const actions=el("div","request-actions"),accept=el("button","request-accept","Accept"),decline=el("button","request-decline","Decline");
    accept.type=decline.type="button";accept.addEventListener("click",()=>respondToRequest(r.id,true));decline.addEventListener("click",()=>respondToRequest(r.id,false));actions.append(accept,decline);row.append(actions);
  }else row.append(el("span","request-pending","Pending"));
  return row;
}
async function sendFriendRequest(p){
  const r=await db.rpc("send_friend_request",{p_recipient_id:p.id});
  if(r.error){status("people-status","Friend request could not be sent: "+r.error.message,"error");return;}
  await loadFriends();
  if(r.data?.status==="blocked")status("people-status","This member is unavailable for a friend request.","error");
  else if(r.data?.status==="incoming"){
    status("people-status","They already sent you a friend request. Accept it in Friends.","success");
    $("people-modal").hidden=true;$("friends-modal").hidden=false;
  }else if(r.data?.status==="friends")status("people-status","You are already friends.","success");
  else status("people-status","Friend request sent. You will be friends after they accept.","success");
  searchPeople();
}
async function respondToFriendRequest(id,accept){
  const r=await db.rpc("respond_to_friend_request",{p_request_id:id,p_accept:accept});
  if(r.error){toast("Friend request could not be updated: "+r.error.message);return;}
  if(r.data?.status==="blocked"){toast("This request cannot be accepted because one of you has blocked the other.");await loadFriends();return;}
  await loadFriends();
  if(accept&&r.data?.conversation_id){
    $("friends-modal").hidden=true;
    toast("You are friends now. Private messaging is open.");
    await loadChats();await openChat(r.data.conversation_id);
  }else toast("Friend request declined.");
}
async function removeFriend(friendId){
  if(!confirm("Remove this friend? Your existing private conversation will remain in your chat list."))return;
  const r=await db.rpc("remove_friend",{p_friend_id:friendId});
  if(r.error){toast("Friend could not be removed: "+r.error.message);return;}
  await loadFriends();renderChats();toast("Friend removed.");
}
async function openFriends(){
  $("friends-modal").hidden=false;
  await loadFriends();
}
async function respondToRequest(id,accept){
  const r=await db.rpc("respond_to_direct_chat_request",{p_request_id:id,p_accept:accept});
  if(r.error){toast("Request could not be updated: "+r.error.message);return;}
  if(r.data?.status==="blocked"){toast("This request cannot be accepted because private messaging is blocked.");await loadRequests();return;}
  if(accept&&r.data?.conversation_id){
    $("requests-modal").hidden=true;toast("Request accepted. You can now message each other.");await loadChats();await openChat(r.data.conversation_id);
  }else{toast("Request declined.");await loadRequests();}
}
function renderChatSection(kind,listId,countId,term,sourceChats=null){
  const list=$(listId);list.replaceChildren();
  const chats=(sourceChats||S.chats.filter(c=>c.kind===kind)).filter(c=>{
    const searchable=[chatTitle(c),chatSub(c),c.last?.body||""].join(" ").toLowerCase();
    return (!c.hasMessages||!!c.last)&&searchable.includes(term);
  });
  $(countId).textContent=chats.length;
  if(!chats.length){
    const empty=term
      ?(kind==="direct"?"No matching conversations.":"No matching group chats.")
      :(kind==="direct"?"No conversations in this tab yet.":"No group chats yet.");
    list.append(el("p","muted tiny section-empty",empty));return;
  }
  chats.forEach(c=>{
    const row=el("div","chat-row");
    const peer=c.members.find(m=>m.user_id!==S.user.id),peerProfile=peer&&S.profiles[peer.user_id];
    const avatarImage=c.kind==="group"?c.avatar_data:peerProfile?.avatar_data;
    const unreadCount=Number(S.unreadCounts[c.id]||0),unread=unreadCount>0||chatHasUnread(c);
    const b=el("button","chat-item"+(c.id===S.active?" active":"")+(unread?" has-unread":""));b.type="button";b.append(avatar(chatTitle(c),avatarImage));
    const copy=el("div","chat-copy");
    copy.append(el("strong","",chatTitle(c)));
    let preview=c.last?c.last.body:chatSub(c);
    if(c.last&&c.last.sender_id===S.user.id)preview="You: "+preview;
    else if(c.kind==="group"&&c.last)preview=(S.profiles[c.last.sender_id]?.display_name||"Member")+": "+preview;
    copy.append(el("span","",preview));
    if(unread){const badge=el("small","unread-count-badge",unreadCount>0?(unreadCount>99?"99+":String(unreadCount)):"New");badge.setAttribute("aria-label",unreadCount>0?unreadCount+" unread messages":"Unread message");copy.append(badge);}
    b.append(copy,el("small","chat-time",dateLabel(c.last?.created_at||c.updated_at)));
    b.addEventListener("click",()=>openChat(c.id));
    const del=el("button","conversation-delete","Delete");del.type="button";del.title="Move all messages in this conversation to Deleted messages";
    del.addEventListener("click",()=>deleteConversationMessages(c.id));
    row.append(b,del);list.append(row);
  });
}
function peerForChat(c){return c?.members.find(m=>m.user_id!==S.user.id)?.user_id||null;}
function renderBlockedUsers(term){
  const list=$("blocked-list");list.replaceChildren();
  const blocked=S.blockedUsers.filter(x=>{
    const p=S.profiles[x.blocked_id]||{};
    return ((p.display_name||"")+" "+(p.username||"")).toLowerCase().includes(term);
  });
  $("blocked-count").textContent=blocked.length;
  if(!blocked.length){list.append(el("p","muted tiny section-empty",term?"No matching blocked members.":"You have not blocked anyone."));return;}
  blocked.forEach(item=>{
    const p=S.profiles[item.blocked_id]||{display_name:"Gather member",username:"member"};
    const row=el("div","request-item");row.append(avatar(p.display_name,p.avatar_data));
    const copy=el("div","request-copy");copy.append(el("strong","",p.display_name),el("small","","@"+p.username));row.append(copy);
    const actions=el("div","request-actions");
    const history=S.chats.find(c=>c.kind==="direct"&&c.members.some(m=>m.user_id===item.blocked_id)&&c.members.some(m=>m.user_id===S.user.id));
    if(history){
      const open=el("button","request-decline","History");open.type="button";
      open.addEventListener("click",()=>openChat(history.id));actions.append(open);
    }
    const unblock=el("button","request-accept","Unblock");
    unblock.type="button";unblock.addEventListener("click",()=>unblockUser(item.blocked_id));
    actions.append(unblock);row.append(actions);list.append(row);
  });
}
function renderDeletedMessages(term){
  const list=$("deleted-list");list.replaceChildren();
  const items=S.deletedMessages.filter(x=>(x.body+" "+x.sender_name+" "+x.conversation_title).toLowerCase().includes(term));
  $("deleted-count").textContent=items.length;
  if(!items.length){list.append(el("p","muted tiny section-empty",term?"No matching deleted messages.":"No deleted messages. Messages you hide will appear here."));return;}
  items.forEach(item=>{
    const row=el("div","deleted-item");
    row.append(avatar(item.sender_name,S.profiles[item.sender_id]?.avatar_data));
    const copy=el("div","deleted-copy");
    copy.append(el("strong","",item.sender_name));
    copy.append(el("small","",item.conversation_title+" · "+dateLabel(item.created_at)));
    copy.append(el("p","deleted-preview",item.body));
    const restore=el("button","request-accept","Restore");restore.type="button";
    restore.addEventListener("click",()=>restoreMessage(item.message_id));
    row.append(copy,restore);list.append(row);
  });
}
function renderChats(){
  const term=$("filter").value.trim().toLowerCase();
  const standard=$("private-folder-panel"),blocked=$("blocked-panel"),deleted=$("deleted-panel");
  const isStandard=S.folder==="friends"||S.folder==="nonfriends";
  standard.hidden=!isStandard;blocked.hidden=S.folder!=="blocked";deleted.hidden=S.folder!=="deleted";
  document.querySelectorAll("[data-folder]").forEach(b=>{
    const active=b.dataset.folder===S.folder;
    b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active));
  });
  if(isStandard){
    $("private-chat-heading").textContent=S.folder==="friends"?"Friends":"Non-friends";
    const friends=new Set(S.friends.map(x=>x.friend_id)),blockedIds=new Set(S.blockedUsers.map(x=>x.blocked_id));
    const chats=S.chats.filter(c=>{
      if(c.kind!=="direct")return false;
      const peer=peerForChat(c);if(!peer||blockedIds.has(peer))return false;
      return S.folder==="friends"?friends.has(peer):!friends.has(peer);
    });
    renderChatSection("direct","private-chat-list","private-chat-count",term,chats);
  }else if(S.folder==="blocked")renderBlockedUsers(term);
  else renderDeletedMessages(term);
  renderChatSection("group","group-chat-list","group-chat-count",term);
}
async function loadBlocked(){
  if(!S.user)return false;
  const r=await db.from("user_blocks").select("blocked_id,created_at").eq("blocker_id",S.user.id).order("created_at",{ascending:false});
  if(r.error){console.error("Blocked members could not be loaded:",r.error.message);return false;}
  S.blockedUsers=r.data||[];
  const ids=S.blockedUsers.map(x=>x.blocked_id).filter(id=>!S.profiles[id]);
  if(ids.length){
    const p=await fetchProfileRecords(ids);
    if(p.error){console.error("Blocked member profiles could not be loaded:",p.error.message);return false;}
    p.data.forEach(x=>S.profiles[x.id]=x);
  }
  renderChats();return true;
}
async function loadDeletedMessages(){
  if(!S.user)return false;
  const markers=await db.from("user_deleted_messages").select("message_id,deleted_at").eq("user_id",S.user.id).order("deleted_at",{ascending:false}).limit(1000);
  if(markers.error){toast("Deleted messages could not be loaded: "+markers.error.message);return false;}
  const ids=(markers.data||[]).map(x=>x.message_id);
  S.deletedMessageIds=new Set(ids);
  if(!ids.length){S.deletedMessages=[];renderChats();return true;}
  const messages=await db.from("messages").select("id,conversation_id,sender_id,body,created_at").in("id",ids);
  if(messages.error){toast("Deleted messages could not be loaded: "+messages.error.message);return false;}
  const byId=new Map((messages.data||[]).map(x=>[x.id,x]));
  S.deletedMessages=(markers.data||[]).flatMap(marker=>{
    const m=byId.get(marker.message_id);if(!m)return [];
    const chat=S.chats.find(c=>c.id===m.conversation_id);
    return [{...m,message_id:m.id,deleted_at:marker.deleted_at,sender_name:m.sender_id===S.user.id?"You":(S.profiles[m.sender_id]?.display_name||"Member"),conversation_title:chat?chatTitle(chat):"Conversation"}];
  });
  renderChats();return true;
}
async function selectFolder(folder){
  if(!["friends","nonfriends","blocked","deleted"].includes(folder))return;
  S.folder=folder;renderChats();
  if(folder==="blocked")await loadBlocked();
  if(folder==="deleted")await loadDeletedMessages();
}
async function unblockUser(userId){
  const r=await db.from("user_blocks").delete().eq("blocker_id",S.user.id).eq("blocked_id",userId);
  if(r.error){toast("Could not unblock: "+r.error.message);return;}
  await loadBlocked();
  if(S.active){S.directStatus=null;await refreshDirectStatus();}
  toast("Member unblocked.");
}
function renderActive(){
  const c=S.chats.find(x=>x.id===S.active);$("empty").hidden=!!c;$("chat").hidden=!c;
  const peer=c?.members.find(m=>m.user_id!==S.user.id),peerProfile=peer&&S.profiles[peer.user_id];
  const avatarImage=c?.kind==="group"?c.avatar_data:peerProfile?.avatar_data;
  paintAvatar($("chat-avatar"),chatTitle(c||{kind:"direct",members:[]}),avatarImage);
  $("layout").classList.toggle("show-chat",!!c);
  $("layout").classList.toggle("show-home",!c);
  $("home-open").hidden=!c;
  $("leave-chat").hidden=!c||c.kind!=="group";
  if(!c)return;
  $("chat-title").textContent=chatTitle(c);$("chat-subtitle").textContent=chatSub(c);
  const me=c.members.find(x=>x.user_id===S.user.id);
  const canManageGroup=c.kind==="group"&&(me?.role==="owner"||me?.role==="moderator");
  $("add-people").hidden=!canManageGroup;
  $("edit-group-photo").hidden=!(c.kind==="group"&&me?.role==="owner");
  $("group-settings-open").hidden=c.kind!=="group";
  $("group-chat-actions").hidden=c.kind!=="group";
  renderDirectControls();renderChats();
}
function renderDirectControls(){
  const c=S.chats.find(x=>x.id===S.active),isDirect=c?.kind==="direct";
  $("block-user").hidden=!isDirect;
  $("select-messages").hidden=false;
  $("select-messages").textContent=S.selectingMessages?"Cancel":"Select";
  $("delete-selected").hidden=!S.selectingMessages||S.selectedMessageIds.size===0;
  $("delete-selected").textContent="Delete selected ("+S.selectedMessageIds.size+")";
  if(!isDirect){$("chat-notice").hidden=true;$("message").disabled=false;$("message").placeholder="Write a message…";$("send").disabled=false;return;}
  const d=S.directStatus,blocked=!d?.can_message;
  $("block-user").disabled=!d||!!d.error;
  $("block-user").textContent=d?.i_blocked?"Unblock":"Block";
  $("message").disabled=blocked;$("send").disabled=blocked;
  $("message").placeholder=blocked?"Private messaging unavailable":"Write a message…";
  $("chat-notice").hidden=!blocked;
  $("chat-notice").textContent=!d?"Checking private chat permissions…":d.error?"Could not verify chat permissions. Refresh the page and try again.":d.i_blocked?"You blocked this member. Unblock them to send private messages. Your previous messages remain visible.":"Private messaging is unavailable in this conversation. Your previous messages remain visible.";
}
async function refreshDirectStatus(){
  const c=S.chats.find(x=>x.id===S.active),peer=c?.members.find(m=>m.user_id!==S.user.id);
  if(!c||c.kind!=="direct"||!peer){S.directStatus=null;renderDirectControls();return;}
  const r=await db.rpc("get_direct_chat_status",{p_other_user_id:peer.user_id});
  S.directStatus=r.error?{i_blocked:false,can_message:false,error:r.error.message}:(r.data||{i_blocked:false,can_message:false,error:"No status returned"});
  renderDirectControls();
}
async function leaveGroupChat(conversationId){
  const chat=S.chats.find(c=>c.id===conversationId);
  if(!chat||chat.kind!=="group")return;
  const title=chatTitle(chat);
  if(!confirm("Leave \""+title+"\"? You will be removed from this group and will no longer receive its messages unless someone adds you again. The group and its messages will remain for other members."))return;
  const button=$("leave-chat");button.disabled=true;
  const result=await db.rpc("leave_group_chat",{p_conversation_id:conversationId});
  button.disabled=false;
  if(result.error){toast("Could not leave group: "+result.error.message);return;}
  if(result.data?.status!=="left"){toast("You could not leave this group. Please refresh and try again.");return;}
  if(S.active===conversationId){
    S.active=null;S.messages=[];S.directStatus=null;
    S.selectingMessages=false;S.selectedMessageIds.clear();
    renderActive();
  }
  await loadChats();
  toast("You left "+title+".");
}
async function toggleBlock(){
  const c=S.chats.find(x=>x.id===S.active),peer=c?.members.find(m=>m.user_id!==S.user.id);
  if(!peer||c.kind!=="direct"||!S.directStatus)return;
  const unblock=!!S.directStatus.i_blocked;
  if(!unblock&&!confirm("Block this member? They will not be able to send you private messages, and you will not be able to send them private messages. Your chat history will remain visible."))return;
  const r=unblock
    ?await db.from("user_blocks").delete().eq("blocker_id",S.user.id).eq("blocked_id",peer.user_id)
    :await db.from("user_blocks").insert({blocker_id:S.user.id,blocked_id:peer.user_id});
  if(r.error){toast((unblock?"Could not unblock: ":"Could not block: ")+r.error.message);return;}
  S.directStatus=null;await refreshDirectStatus();await loadRequests();await loadBlocked();toast(unblock?"Member unblocked.":"Member blocked.");
}
async function attachReplyPreviews(rows,conversationId){
  const messages=rows||[],ids=[...new Set(messages.map(m=>m.reply_to_id).filter(id=>id&&!S.deletedMessageIds.has(id)))];
  if(!ids.length)return messages;
  const result=await db.from("messages").select("id,sender_id,body").eq("conversation_id",conversationId).in("id",ids);
  if(result.error){console.warn("Reply previews could not be loaded:",result.error.message);return messages;}
  const byId=new Map((result.data||[]).map(m=>[m.id,m]));
  return messages.map(m=>({...m,reply_preview:m.reply_to_id?(S.deletedMessageIds.has(m.reply_to_id)?{body:"Message hidden"}:(byId.get(m.reply_to_id)||{body:"Original message unavailable"})):null}));
}
async function loadMessageReads(conversationId,messageIds){
  const ids=[...new Set((messageIds||[]).filter(Boolean))];if(!ids.length)return;
  const result=await db.from("message_reads").select("message_id,user_id,read_at").eq("conversation_id",conversationId).in("message_id",ids);
  if(result.error){console.warn("Message read receipts could not be loaded:",result.error.message);return;}
  (result.data||[]).forEach(receipt=>{
    const readers=S.messageReads[receipt.message_id]||(S.messageReads[receipt.message_id]=[]);
    if(!readers.some(x=>x.user_id===receipt.user_id))readers.push(receipt);
  });
}
async function markMessagesRead(conversationId,rows){
  const incoming=(rows||[]).filter(m=>m.sender_id!==S.user.id&&!S.deletedMessageIds.has(m.id));
  const entries=incoming.filter(m=>!(S.messageReads[m.id]||[]).some(r=>r.user_id===S.user.id))
    .map(m=>({message_id:m.id,conversation_id:conversationId,user_id:S.user.id}));
  if(!entries.length)return;
  const result=await db.from("message_reads").upsert(entries,{onConflict:"message_id,user_id",ignoreDuplicates:true});
  if(result.error){console.warn("Message read receipts could not be saved:",result.error.message);return;}
  entries.forEach(entry=>{
    const readers=S.messageReads[entry.message_id]||(S.messageReads[entry.message_id]=[]);
    if(!readers.some(x=>x.user_id===entry.user_id))readers.push({...entry,read_at:new Date().toISOString()});
  });
}
function subscribeMessageReads(conversationId){
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  S.readChannel=db.channel("read-receipts-"+conversationId)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"message_reads",filter:"conversation_id=eq."+conversationId},payload=>{
      const receipt=payload.new;if(!receipt?.message_id||!receipt.user_id)return;
      const readers=S.messageReads[receipt.message_id]||(S.messageReads[receipt.message_id]=[]);
      if(!readers.some(x=>x.user_id===receipt.user_id))readers.push(receipt);
      renderMessages();
    }).subscribe();
}
function renderTypingState(channel){
  if(S.presenceChannel!==channel)return;
  const state=channel.presenceState(),metas=Object.values(state).flatMap(p=>p.metas||[]);
  const activeByUser=new Map();
  metas.forEach(meta=>{
    if(!meta.typing||meta.user_id===S.user.id)return;
    const key=meta.user_id||meta.display_name||"someone";
    if(!activeByUser.has(key))activeByUser.set(key,meta.display_name||"Someone");
  });
  const names=[...activeByUser.values()].sort((a,b)=>a.localeCompare(b));
  const indicator=$("typing-indicator"),nameList=$("typing-names");
  if(!indicator||!nameList)return;
  indicator.hidden=!names.length;
  nameList.replaceChildren();
  names.forEach(name=>nameList.append(el("span","typing-name",name)));
}
async function subscribeChatPresence(conversationId){
  if(S.presenceChannel){db.removeChannel(S.presenceChannel);S.presenceChannel=null;}
  S.presenceReady=false;clearTimeout(S.typingTimer);
  try{await db.realtime.setAuth();}catch(e){console.warn("Private chat presence could not authenticate:",e.message);return;}
  const channel=db.channel("gather-chat:"+conversationId,{config:{private:true,presence:{key:S.user.id}}});
  S.presenceChannel=channel;
  channel.on("presence",{event:"sync"},()=>renderTypingState(channel));
  channel.subscribe(async state=>{
    if(S.presenceChannel!==channel)return;
    if(state==="SUBSCRIBED"){
      S.presenceReady=true;
      S.typingActive=false;
      await channel.track({user_id:S.user.id,display_name:S.profile?.display_name||"Member",typing:false});
    }
  });
}
async function setTyping(typing){
  const channel=S.presenceChannel;
  const next=!!typing;
  if(!channel||!S.presenceReady||S.typingActive===next)return;
  S.typingActive=next;
  try{
    await channel.track({user_id:S.user.id,display_name:S.profile?.display_name||"Member",typing:next});
  }catch(e){
    if(S.presenceChannel===channel)S.typingActive=!next;
    console.warn("Typing status could not be updated:",e.message);
  }
}
function handleTypingInput(){
  if(!S.active)return;
  clearTimeout(S.typingTimer);
  const hasText=!!$("message").value.trim();
  if(!hasText){setTyping(false);return;}
  setTyping(true);
  S.typingTimer=setTimeout(()=>setTyping(false),1800);
}
function stopChatPresence(){
  clearTimeout(S.typingTimer);
  if(S.presenceChannel){db.removeChannel(S.presenceChannel);S.presenceChannel=null;}
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  S.presenceReady=false;S.typingActive=false;
  const indicator=$("typing-indicator"),nameList=$("typing-names");
  if(indicator)indicator.hidden=true;
  if(nameList)nameList.replaceChildren();
}
function renderReplyComposer(){
  const box=$("reply-compose");box.hidden=!S.replyTo;
  if(!S.replyTo)return;
  const p=S.profiles[S.replyTo.sender_id];
  $("reply-compose-label").textContent="Replying to "+(S.replyTo.sender_id===S.user.id?"yourself":p?.display_name||"Member");
  $("reply-compose-text").textContent=S.replyTo.body;
}
function beginReply(message){
  if(S.selectingMessages)return;
  S.replyTo={id:message.id,sender_id:message.sender_id,body:message.body};
  renderReplyComposer();$("message").focus();
}
function cancelReply(){S.replyTo=null;renderReplyComposer();}
async function loadOlderMessages(){
  if(!S.active||!S.hasOlderMessages||S.loadingOlder||!S.messages.length)return;
  const conversationId=S.active,oldest=S.messages[0].created_at;S.loadingOlder=true;
  const result=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,reply_to_id").eq("conversation_id",conversationId).or("created_at.lt."+oldest+",and(created_at.eq."+oldest+",id.lt."+S.messages[0].id+")").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  S.loadingOlder=false;
  if(result.error){toast("Older messages could not be loaded: "+result.error.message);return;}
  if(S.active!==conversationId)return;
  const raw=result.data||[];S.hasOlderMessages=raw.length===300;
  const visible=raw.filter(m=>!S.deletedMessageIds.has(m.id));
  const withReplies=await attachReplyPreviews(visible,conversationId);
  const existing=new Set(S.messages.map(m=>m.id));
  S.messages=[...withReplies.filter(m=>!existing.has(m.id)).reverse(),...S.messages];
  await loadMessageReads(conversationId,withReplies.map(m=>m.id));
  await markMessagesRead(conversationId,withReplies);
  await loadUnreadCounts();renderChats();
  renderMessages(true);
}
async function openChat(id){
  stopChatPresence();
  S.active=id;S.selectingMessages=false;S.selectedMessageIds.clear();S.directStatus=null;
  S.messages=[];S.messageReads={};S.replyTo=null;S.hasOlderMessages=false;S.loadingOlder=false;renderReplyComposer();
  markChatRead(id,S.chats.find(c=>c.id===id)?.last?.created_at||null);
  $("layout").classList.remove("show-home");$("layout").classList.add("show-chat");renderActive();
  await refreshDirectStatus();await loadMessages(id);
  if(S.active!==id)return;
  subscribeMessageReads(id);await markConversationRead(id);await subscribeChatPresence(id);
}
async function loadMessages(id){
  const r=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,reply_to_id").eq("conversation_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  if(r.error){toast("Messages could not be loaded: "+r.error.message);return;}
  if(S.active!==id)return;
  const raw=r.data||[];S.hasOlderMessages=raw.length===300;
  S.messages=await attachReplyPreviews(raw.filter(m=>!S.deletedMessageIds.has(m.id)).reverse(),id);
  await loadMessageReads(id,S.messages.map(m=>m.id));
  await markMessagesRead(id,S.messages);
  markChatRead(id,S.messages[S.messages.length-1]?.created_at||null);
  renderMessages();
}
function renderMessages(preserveScroll=false){
  const list=$("messages"),previousHeight=list.scrollHeight,previousTop=list.scrollTop;list.replaceChildren();
  if(!S.messages.length){list.append(el("p","muted tiny","This is the beginning of the conversation. Say hello."));return;}
  S.messages.forEach((m,index)=>{
    const mine=m.sender_id===S.user.id,p=S.profiles[m.sender_id];
    const samePrevious=S.messages[index-1]?.sender_id===m.sender_id;
    const sameNext=S.messages[index+1]?.sender_id===m.sender_id;
    const grouping=samePrevious?(sameNext?" group-middle":" group-last"):(sameNext?" group-first":"");
    const row=el("div","message"+(mine?" mine":"")+grouping+(samePrevious?" group-continued":""));row.dataset.messageId=m.id;
    const bubble=el("div","bubble"),meta=el("div","meta");
    meta.append(el("strong","",mine?"You":(p?.display_name||"Member")),el("time","",new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})));bubble.append(meta);
    if(m.reply_to_id){
      const quote=el("div","reply-preview"),target=m.reply_preview;
      const quoteName=target?.sender_id?(target.sender_id===S.user.id?"You":(S.profiles[target.sender_id]?.display_name||"Member")):"Reply";
      quote.append(el("strong","",quoteName),el("span","",target?.body||"Original message unavailable."));bubble.append(quote);
    }
    bubble.append(el("div","body-text",m.body));
    if(!S.selectingMessages){
      const actions=el("div","message-actions"),reply=el("button","message-reply","Reply");reply.type="button";reply.addEventListener("click",()=>beginReply(m));actions.append(reply);bubble.append(actions);
    }
    if(mine){
      const activeChat=S.chats.find(chat=>chat.id===S.active);
      const memberIds=new Set((activeChat?.members||[]).map(member=>member.user_id).filter(id=>id!==S.user.id));
      const readers=[...new Map((S.messageReads[m.id]||[])
        .filter(receipt=>receipt.user_id!==S.user.id&&memberIds.has(receipt.user_id))
        .map(receipt=>[receipt.user_id,receipt])).values()];
      if(activeChat?.kind==="direct"){
        bubble.append(el("div","message-receipts"+(readers.length?" is-seen":" is-sent"),readers.length?"✓✓ Seen":"✓ Sent"));
      }else if(readers.length){
        const names=[...new Set(readers.map(receipt=>S.profiles[receipt.user_id]?.display_name||"Member"))];
        const receiptWrap=el("div","message-receipt-wrap");
        const seenButton=el("button","message-receipts message-receipts-button is-seen","✓✓ Seen · "+names.length);
        seenButton.type="button";
        seenButton.setAttribute("aria-expanded","false");
        seenButton.setAttribute("aria-label","Show the "+names.length+" group members who read this message");
        const readerList=el("div","message-readers-list");
        readerList.hidden=true;
        names.forEach(name=>readerList.append(el("span","message-reader-name",name)));
        seenButton.addEventListener("click",()=>{
          const expanded=seenButton.getAttribute("aria-expanded")==="true";
          seenButton.setAttribute("aria-expanded",String(!expanded));
          readerList.hidden=expanded;
        });
        receiptWrap.append(seenButton,readerList);
        bubble.append(receiptWrap);
      }else{
        bubble.append(el("div","message-receipts is-sent","✓ Sent"));
      }
    }
    if(S.selectingMessages){
      const pick=el("label","message-select"),check=el("input");check.type="checkbox";
      check.checked=S.selectedMessageIds.has(m.id);check.setAttribute("aria-label","Select this message");
      check.addEventListener("change",()=>{if(check.checked)S.selectedMessageIds.add(m.id);else S.selectedMessageIds.delete(m.id);renderMessages();renderActive();});
      pick.append(check,el("span","","Select message"));bubble.append(pick);
      row.classList.toggle("selected",S.selectedMessageIds.has(m.id));
    }
    row.append(bubble);list.append(row);
  });
  if(preserveScroll)list.scrollTop=previousTop+(list.scrollHeight-previousHeight);else list.scrollTop=list.scrollHeight;
}
async function deleteConversationMessages(conversationId){
  const conversation=S.chats.find(c=>c.id===conversationId);
  if(!conversation)return;
  if(!confirm("Move all messages in this conversation to Deleted messages for your account? Other members will still see them, and you can restore them one at a time."))return;
  const ids=[];
  let offset=0;
  while(true){
    const page=await db.from("messages").select("id").eq("conversation_id",conversationId).order("created_at",{ascending:true}).range(offset,offset+499);
    if(page.error){toast("Conversation messages could not be loaded: "+page.error.message);return;}
    const rows=page.data||[];
    ids.push(...rows.map(x=>x.id).filter(id=>!S.deletedMessageIds.has(id)));
    if(rows.length<500)break;
    offset+=500;
  }
  if(!ids.length){toast("There are no visible messages to delete in this conversation.");return;}
  const moved=[];
  for(let i=0;i<ids.length;i+=200){
    const batchIds=ids.slice(i,i+200);
    const batch=batchIds.map(message_id=>({user_id:S.user.id,message_id}));
    const inserted=await db.from("user_deleted_messages").insert(batch);
    if(inserted.error){
      moved.forEach(id=>S.deletedMessageIds.add(id));
      if(S.active===conversationId)S.messages=S.messages.filter(m=>!S.deletedMessageIds.has(m.id));
      renderMessages();
      await loadChats();
      if(S.folder==="deleted")await loadDeletedMessages();
      toast(moved.length+" messages moved before the remaining batch failed: "+inserted.error.message);
      return;
    }
    moved.push(...batchIds);
  }
  moved.forEach(id=>S.deletedMessageIds.add(id));
  if(S.active===conversationId)S.messages=S.messages.filter(m=>!S.deletedMessageIds.has(m.id));
  renderMessages();await loadChats();
  if(S.folder==="deleted")await loadDeletedMessages();
  toast(ids.length+" messages moved to Deleted messages. You can restore them there.");
}
async function deleteSelectedMessages(){
  const ids=[...S.selectedMessageIds].filter(id=>S.messages.some(m=>m.id===id));
  if(!ids.length){toast("Select at least one message first.");return;}
  if(!confirm("Move "+ids.length+" selected message"+(ids.length===1?"":"s")+" to Deleted messages? This only hides them from your view. Other members will still see them, and you can restore them later."))return;
  const entries=ids.map(message_id=>({user_id:S.user.id,message_id}));
  const result=await db.from("user_deleted_messages").insert(entries);
  if(result.error){toast("Selected messages could not be deleted: "+result.error.message);return;}
  ids.forEach(id=>S.deletedMessageIds.add(id));
  S.messages=S.messages.filter(m=>!S.deletedMessageIds.has(m.id));
  S.selectedMessageIds.clear();
  S.selectingMessages=false;
  renderMessages();
  renderActive();
  await loadChats();
  toast(ids.length+" message"+(ids.length===1?"":"s")+" moved to Deleted messages.");
}
async function deleteMessage(id){
  if(!confirm("Move this message to Deleted messages? It will disappear only from your view. Other members will still see it, and you can restore it later."))return;
  const r=await db.from("user_deleted_messages").insert({user_id:S.user.id,message_id:id});
  if(r.error){toast("Message could not be moved to Deleted messages: "+r.error.message);return;}
  S.deletedMessageIds.add(id);S.messages=S.messages.filter(x=>x.id!==id);
  renderMessages();await loadChats();
  if(S.folder==="deleted")await loadDeletedMessages();
  toast("Message moved to Deleted messages. You can restore it there.");
}
async function restoreMessage(messageId){
  const r=await db.from("user_deleted_messages").delete().eq("user_id",S.user.id).eq("message_id",messageId);
  if(r.error){toast("Message could not be restored: "+r.error.message);return;}
  S.deletedMessageIds.delete(messageId);
  await loadChats();await loadDeletedMessages();
  if(S.active){const active=S.chats.find(x=>x.id===S.active);if(active)await loadMessages(S.active);}
  toast("Message restored to your conversation.");
}
function openAboutBlank(){
  const target=window.open("about:blank","_blank");
  if(!target){
    toast("Your browser blocked the new tab. Allow pop-ups for Gather and try again.");
    return;
  }
  try{
    const doc=target.document;
    doc.title="Gather";
    doc.documentElement.style.cssText="width:100%;height:100%;margin:0;background:#171923;";
    const viewport=doc.createElement("meta");viewport.name="viewport";viewport.content="width=device-width,initial-scale=1,viewport-fit=cover";
    const theme=doc.createElement("meta");theme.name="theme-color";theme.content="#171923";
    const style=doc.createElement("style");style.textContent="html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#171923}iframe{display:block;width:100%;height:100%;border:0;background:#171923}";
    doc.head.replaceChildren(viewport,theme,style);
    const frame=doc.createElement("iframe");
    frame.title="Gather";
    frame.referrerPolicy="strict-origin-when-cross-origin";
    frame.src=window.location.href;
    doc.body.replaceChildren(frame);
  }catch(error){
    try{target.close();}catch(closeError){}
    toast("Your browser could not open Gather in a blank tab. Use the regular Gather page instead.");
    console.warn("Gather about:blank view could not be opened:",error);
  }
}
function openMessageSearch(){
  if(!S.active)return;
  S.searchConversationId=S.active;S.searchQuery="";S.searchOffset=0;S.searchHasMore=false;
  $("message-search-input").value="";$("message-search-results").replaceChildren(el("p","muted tiny","Search all messages in this conversation."));
  $("message-search-more").hidden=true;status("message-search-status","");$("message-search-modal").hidden=false;$("message-search-input").focus();
}
async function searchConversationMessages(reset=true){
  const query=$("message-search-input").value.trim();
  if(reset){S.searchQuery=query;S.searchOffset=0;S.searchHasMore=false;$("message-search-results").replaceChildren();}
  if(!query){$("message-search-results").replaceChildren(el("p","muted tiny","Enter a word or phrase to search the entire conversation."));$("message-search-more").hidden=true;return;}
  if(query!==S.searchQuery){S.searchQuery=query;S.searchOffset=0;$("message-search-results").replaceChildren();}
  status("message-search-status",S.searchOffset?"Loading more matches…":"Searching the conversation…");
  const conversationId=S.searchConversationId,from=S.searchOffset,to=from+99;
  const result=await db.from("messages").select("id,sender_id,body,created_at").eq("conversation_id",conversationId).ilike("body","%"+query+"%").order("created_at",{ascending:false}).order("id",{ascending:false}).range(from,to);
  if(result.error){status("message-search-status","Search failed: "+result.error.message,"error");return;}
  const rows=(result.data||[]).filter(m=>!S.deletedMessageIds.has(m.id));
  rows.forEach(m=>{
    const button=el("button","message-search-result");button.type="button";
    button.append(el("strong","",((S.profiles[m.sender_id]?.display_name)||"Member")+" · "+dateLabel(m.created_at)),el("span","",m.body));
    button.addEventListener("click",()=>openSearchResult(m));$("message-search-results").append(button);
  });
  S.searchOffset=to+1;S.searchHasMore=(result.data||[]).length===100;
  $("message-search-more").hidden=!S.searchHasMore;
  status("message-search-status",rows.length?("Found "+S.searchOffset+" matching messages"+(S.searchHasMore?" so far":".")):"No matching messages on this page.");
}
async function openSearchResult(message){
  const conversationId=S.searchConversationId;$("message-search-modal").hidden=true;
  if(S.active!==conversationId)await openChat(conversationId);
  const result=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,reply_to_id").eq("conversation_id",conversationId).lte("created_at",message.created_at).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  if(result.error){toast("That message could not be opened: "+result.error.message);return;}
  if(S.active!==conversationId)return;
  const raw=result.data||[];S.hasOlderMessages=raw.length===300;
  S.messages=await attachReplyPreviews(raw.filter(m=>!S.deletedMessageIds.has(m.id)).reverse(),conversationId);
  await loadMessageReads(conversationId,S.messages.map(m=>m.id));await markMessagesRead(conversationId,S.messages);renderMessages();
  setTimeout(()=>{
    const row=document.querySelector('[data-message-id="'+message.id+'"]');
    if(row){row.scrollIntoView({block:"center"});row.classList.add("search-highlight");setTimeout(()=>row.classList.remove("search-highlight"),2200);}
  },50);
}
async function sendMessage(e){
  e.preventDefault();const body=$("message").value.trim();if(!body||!S.active)return;
  const conversationId=S.active,activeChat=S.chats.find(x=>x.id===conversationId);
  if(activeChat?.kind==="direct"&&!S.directStatus?.can_message){toast("Private messaging is unavailable in this conversation.");return;}
  const reply=S.replyTo; $("send").disabled=true;
  const r=await db.from("messages").insert({conversation_id:conversationId,sender_id:S.user.id,body,reply_to_id:reply?.id||null}).select("id,conversation_id,sender_id,body,created_at,reply_to_id").single();
  $("send").disabled=false;if(r.error){toast("Message not sent: "+r.error.message);return;}
  $("message").value="";$("message").style.height="auto";cancelReply();setTyping(false);
  if(!S.messages.some(x=>x.id===r.data.id)){S.messages.push({...r.data,reply_preview:reply||null});renderMessages();}
  await loadChats();
}
async function openPeople(mode){
  S.picker=mode;S.selected=new Set();$("people-modal").hidden=false;$("people-search").value="";
  $("people-results").replaceChildren(el("p","muted tiny","Type at least 2 characters."));
  $("group-wrap").hidden=mode!=="group";$("group-title").value="";
  $("people-create").hidden=mode==="direct"||mode==="friend";$("people-create").textContent=mode==="group"?"Create group":"Add selected people";
  $("people-title").textContent=mode==="group"?"Create a group":mode==="add"?"Add people":mode==="friend"?"Find friends":"Start a conversation";
  $("people-desc").textContent=mode==="group"?"Name your group and choose who to invite.":mode==="friend"?"Send a friend request. They must accept before you become friends, and then private messaging opens automatically.":"Find someone by their Gather username.";
  status("people-status","");await loadRequests();if(mode==="friend")await loadFriends();$("people-search").focus();
}
async function searchPeople(){
  const term=$("people-search").value.trim().toLowerCase().replace(/[^a-z0-9_]/g,""),box=$("people-results");box.replaceChildren();
  if(term.length<2){box.append(el("p","muted tiny","Type at least 2 characters."));return;}
  box.append(el("p","muted tiny","Searching…"));
  const raw=await db.from("profiles").select("id,username,display_name").ilike("username","%"+term+"%").limit(15);box.replaceChildren();
  if(raw.error){box.append(el("p","muted tiny",raw.error.message));return;}
  const records=await fetchProfileRecords((raw.data||[]).map(p=>p.id));
  if(records.error){box.append(el("p","muted tiny",records.error.message));return;}
  let people=(records.data||[]).filter(p=>p.id!==S.user.id);
  if(S.picker==="add"){const c=S.chats.find(x=>x.id===S.active),ids=new Set((c?.members||[]).map(x=>x.user_id));people=people.filter(p=>!ids.has(p.id));}
  if(!people.length){box.append(el("p","muted tiny","No matching members found."));return;}
  people.forEach(p=>{
    const b=el("button","person");b.type="button";b.append(avatar(p.display_name,p.avatar_data));
    const copy=el("div","person-copy");copy.append(el("strong","",p.display_name));
    if(S.picker==="friend"){
      const isFriend=S.friends.some(x=>x.friend_id===p.id);
      const incoming=S.friendRequests.find(x=>x.sender_id===p.id&&x.recipient_id===S.user.id&&x.status==="pending");
      const outgoing=S.friendRequests.some(x=>x.sender_id===S.user.id&&x.recipient_id===p.id&&x.status==="pending");
      copy.append(el("small","",isFriend?"@"+p.username+" · Friends":incoming?"@"+p.username+" · Request received":outgoing?"@"+p.username+" · Request sent":"@"+p.username+" · Add friend"));
      b.append(copy);
      if(isFriend||outgoing){b.disabled=true;b.classList.add("person-disabled");}
      else if(incoming)b.addEventListener("click",()=>respondToFriendRequest(incoming.id,true));
      else b.addEventListener("click",()=>sendFriendRequest(p));
    }else{
      const sent=S.requests.some(x=>x.sender_id===S.user.id&&x.recipient_id===p.id&&x.status==="pending");
      copy.append(el("small","",sent?"@"+p.username+" · Request sent":"@"+p.username));b.append(copy);
      if(S.picker!=="direct")b.append(el("span","",S.selected.has(p.id)?"✓":"＋"));
      if(sent&&S.picker==="direct"){b.disabled=true;b.classList.add("person-disabled");}
      else b.addEventListener("click",()=>S.picker==="direct"?directChat(p):(S.selected.has(p.id)?S.selected.delete(p.id):S.selected.add(p.id),searchPeople(),status("people-status",S.selected.size+" selected.")));
    }
    box.append(b);
  });
}
async function directChat(p){
  const existing=S.chats.find(c=>c.kind==="direct"&&c.members.length===2&&c.members.some(m=>m.user_id===p.id)&&c.members.some(m=>m.user_id===S.user.id));
  if(existing){$("people-modal").hidden=true;await openChat(existing.id);return;}
  const r=await db.rpc("send_direct_chat_request",{p_recipient_id:p.id});
  if(r.error){status("people-status","Request could not be sent: "+r.error.message,"error");return;}
  if(r.data?.status==="existing"&&r.data.conversation_id){$("people-modal").hidden=true;await loadChats();await openChat(r.data.conversation_id);return;}
  if(r.data?.status==="blocked"){status("people-status","This member is not available for a new private chat request.","error");return;}
  $("people-modal").hidden=true;await loadRequests();
  if(r.data?.status==="incoming"){toast("They already sent you a request. Review it in Chat requests.");$("requests-modal").hidden=false;}
  else toast("Chat request sent. You can message each other after they accept.");
}
async function openRequests(){$("requests-modal").hidden=false;await loadRequests();}

async function createGroupOrAdd(){
  const ids=[...S.selected];if(!ids.length){status("people-status","Choose at least one person first.","error");return;}
  $("people-create").disabled=true;
  if(S.picker==="group"){
    const title=$("group-title").value.trim();if(!title){status("people-status","Enter a group name.","error");$("people-create").disabled=false;return;}
    if(ids.length<2){status("people-status","Choose at least two other people for a group chat.","error");$("people-create").disabled=false;return;}
    const created=await db.rpc("create_group_chat",{p_title:title,p_member_ids:ids});
    if(created.error)status("people-status",created.error.message,"error");
    else{$("people-modal").hidden=true;toast("Group created.");await loadChats();await openChat(created.data);}
  }else{
    const r=await db.from("conversation_members").insert(ids.map(user_id=>({conversation_id:S.active,user_id,role:"member"})));
    if(r.error)status("people-status",r.error.message,"error");else{$("people-modal").hidden=true;toast("People added.");await loadChats();}
  }
  $("people-create").disabled=false;
}
function openProfile(){
  if(!S.profile)return;
  $("profile-name").value=S.profile.display_name;$("profile-username").value=S.profile.username;
  $("current-password").value="";$("new-password").value="";$("confirm-password").value="";
  status("profile-status","");status("password-status","");
  S.pendingAvatarData=null;S.avatarChanged=false;
  paintAvatar($("profile-avatar-preview"),S.profile.display_name,S.profile.avatar_data);
  $("profile-avatar-file").value="";
  $("profile-modal").hidden=false;
}
function openGroupSettings(){
  const chat=S.chats.find(x=>x.id===S.active);
  if(!chat||chat.kind!=="group")return;
  const myRole=chat.members.find(x=>x.user_id===S.user.id)?.role;
  const owner=myRole==="owner",canManage=owner||myRole==="moderator";
  $("group-settings-title").value=chat.title||"";
  $("group-settings-description").value=chat.description||"";
  $("group-settings-title").disabled=!canManage;
  $("group-settings-description").disabled=!canManage;
  $("group-settings-save").hidden=!canManage;
  $("group-settings-note").textContent=owner
    ?"Owners can edit group details, manage members, assign moderators, and transfer ownership."
    :canManage
      ?"Moderators can edit group details, add people, and remove regular members. Only the owner can assign moderators or transfer ownership."
      :"You can view group details and members. Owners and moderators manage this group.";
  status("group-settings-status","");
  renderGroupSettingsMembers(chat,owner,canManage);
  $("group-settings-modal").hidden=false;
}
function renderGroupSettingsMembers(chat,owner,canManage){
  const list=$("group-settings-members");list.replaceChildren();
  chat.members.slice().sort((a,b)=>{
    const rank={owner:0,moderator:1,member:2};
    return (rank[a.role]??3)-(rank[b.role]??3)||(S.profiles[a.user_id]?.display_name||"").localeCompare(S.profiles[b.user_id]?.display_name||"");
  }).forEach(member=>{
    const profile=S.profiles[member.user_id]||{display_name:"Gather member",username:"member"};
    const roleLabel=member.role==="owner"?"Owner":member.role==="moderator"?"Moderator":"Member";
    const row=el("div","group-member-row");row.append(avatar(profile.display_name,profile.avatar_data));
    const details=el("div","group-member-copy");details.append(el("strong","",profile.display_name),el("small","", "@"+profile.username+" · "+roleLabel));
    row.append(details);
    if(canManage&&member.user_id!==S.user.id&&member.role!=="owner"&&(owner||member.role==="member")){
      const actions=el("div","group-member-actions");
      if(owner){
        const roleButton=el("button","outline",member.role==="moderator"?"Demote":"Make moderator");
        roleButton.type="button";
        roleButton.addEventListener("click",()=>setGroupMemberRole(member.user_id,member.role==="moderator"?"member":"moderator"));
        const promote=el("button","outline","Make owner");promote.type="button";promote.addEventListener("click",()=>transferGroupOwnership(member.user_id));
        actions.append(roleButton,promote);
      }
      const remove=el("button","outline group-remove","Remove");remove.type="button";remove.addEventListener("click",()=>removeGroupMember(member.user_id));
      actions.append(remove);row.append(actions);
    }
    list.append(row);
  });
  if(!chat.members.length)list.append(el("p","muted tiny","No members found."));
}
async function setGroupMemberRole(userId,role){
  const chat=S.chats.find(x=>x.id===S.active);
  if(!chat||chat.kind!=="group")return;
  const result=await db.rpc("set_group_member_role",{p_conversation_id:chat.id,p_user_id:userId,p_role:role});
  if(result.error){toast("Member role could not be changed: "+result.error.message);return;}
  await loadChats();openGroupSettings();
  toast(role==="moderator"?"Moderator added.":"Moderator role removed.");
}
async function saveGroupSettings(){
  const chat=S.chats.find(x=>x.id===S.active);
  if(!chat||chat.kind!=="group")return;
  const title=$("group-settings-title").value.trim(),description=$("group-settings-description").value.trim();
  if(!title||title.length>60){status("group-settings-status","Group names must be between 1 and 60 characters.","error");return;}
  if(description.length>280){status("group-settings-status","Descriptions must be 280 characters or fewer.","error");return;}
  const button=$("group-settings-save");button.disabled=true;
  const result=await db.rpc("update_group_settings",{p_conversation_id:chat.id,p_title:title,p_description:description||null});
  button.disabled=false;
  if(result.error){status("group-settings-status","Settings could not be saved: "+result.error.message,"error");return;}
  chat.title=title;chat.description=description||null;
  $("group-settings-modal").hidden=true;renderActive();renderChats();toast("Group settings updated.");
}
async function removeGroupMember(userId){
  const chat=S.chats.find(x=>x.id===S.active),profile=S.profiles[userId];
  if(!chat||!confirm("Remove "+(profile?.display_name||"this member")+" from "+chatTitle(chat)+"? They will no longer receive new messages in this group."))return;
  const result=await db.rpc("remove_group_member",{p_conversation_id:chat.id,p_user_id:userId});
  if(result.error){toast("Member could not be removed: "+result.error.message);return;}
  await loadChats();openGroupSettings();toast("Member removed from the group.");
}
async function transferGroupOwnership(userId){
  const chat=S.chats.find(x=>x.id===S.active),profile=S.profiles[userId];
  if(!chat||!confirm("Make "+(profile?.display_name||"this member")+" the new owner of "+chatTitle(chat)+"? You will become a regular member."))return;
  const result=await db.rpc("transfer_group_ownership",{p_conversation_id:chat.id,p_user_id:userId});
  if(result.error){toast("Ownership could not be transferred: "+result.error.message);return;}
  await loadChats();openGroupSettings();toast("Group ownership transferred.");
}
function openGroupPhoto(){
  const chat=S.chats.find(x=>x.id===S.active);
  const me=chat?.members.find(x=>x.user_id===S.user.id);
  if(!chat||chat.kind!=="group"||me?.role!=="owner"){toast("Only the group owner can change this photo.");return;}
  S.groupAvatarConversationId=chat.id;S.pendingGroupAvatarData=chat.avatar_data||null;S.groupAvatarChanged=false;
  paintAvatar($("group-avatar-preview"),chatTitle(chat),chat.avatar_data||null);
  $("group-avatar-file").value="";$("group-avatar-remove").hidden=!chat.avatar_data;
  $("group-avatar-save").hidden=true;status("group-avatar-status","");
  $("group-photo-modal").hidden=false;
}
async function handleGroupAvatarFile(){
  const file=$("group-avatar-file").files?.[0];if(!file)return;
  try{
    status("group-avatar-status","Preparing group photo…");
    S.pendingGroupAvatarData=await fileToAvatarData(file);S.groupAvatarChanged=true;
    const chat=S.chats.find(x=>x.id===S.groupAvatarConversationId);
    paintAvatar($("group-avatar-preview"),chatTitle(chat||{kind:"group",title:"Group"}),S.pendingGroupAvatarData);
    $("group-avatar-remove").hidden=false;$("group-avatar-save").hidden=false;
    status("group-avatar-status","Photo ready. Save to share it with the group.","success");
  }catch(e){
    $("group-avatar-file").value="";S.pendingGroupAvatarData=null;S.groupAvatarChanged=false;
    const chat=S.chats.find(x=>x.id===S.groupAvatarConversationId);
    paintAvatar($("group-avatar-preview"),chatTitle(chat||{kind:"group",title:"Group"}),chat?.avatar_data||null);
    $("group-avatar-save").hidden=true;
    status("group-avatar-status",e.message||"Group photo could not be prepared.","error");
  }
}
function removeGroupAvatar(){
  const chat=S.chats.find(x=>x.id===S.groupAvatarConversationId);
  S.pendingGroupAvatarData=null;S.groupAvatarChanged=true;
  paintAvatar($("group-avatar-preview"),chatTitle(chat||{kind:"group",title:"Group"}),null);
  $("group-avatar-remove").hidden=true;$("group-avatar-save").hidden=false;
  status("group-avatar-status","The group photo will be removed when you save.","success");
}
async function saveGroupAvatar(){
  const conversationId=S.groupAvatarConversationId;
  const chat=S.chats.find(x=>x.id===conversationId);
  const me=chat?.members.find(x=>x.user_id===S.user.id);
  if(!chat||chat.kind!=="group"||me?.role!=="owner"){status("group-avatar-status","Only the group owner can change this photo.","error");return;}
  if(!S.groupAvatarChanged)return;
  const button=$("group-avatar-save");button.disabled=true;
  const result=S.pendingGroupAvatarData
    ?await db.from("group_avatars").upsert({conversation_id:conversationId,image_data:S.pendingGroupAvatarData,updated_at:new Date().toISOString()},{onConflict:"conversation_id"})
    :await db.from("group_avatars").delete().eq("conversation_id",conversationId);
  button.disabled=false;
  if(result.error){status("group-avatar-status","Group photo could not be saved: "+result.error.message,"error");return;}
  chat.avatar_data=S.pendingGroupAvatarData||null;
  S.pendingGroupAvatarData=null;S.groupAvatarChanged=false;S.groupAvatarConversationId=null;
  $("group-photo-modal").hidden=true;renderChats();renderActive();toast("Group photo updated.");
}
async function fileToAvatarData(file){
  if(!file)return null;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Choose a JPG, PNG, or WebP image.");
  if(file.size>20*1024*1024)throw new Error("Choose an image no larger than 20 MB.");
  const objectUrl=window.URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{
      const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("That image couldn't be opened."));img.src=objectUrl;
    });
    const side=256,canvas=document.createElement("canvas");canvas.width=side;canvas.height=side;
    const context=canvas.getContext("2d");if(!context)throw new Error("This browser couldn't prepare the image.");
    const crop=Math.min(image.naturalWidth,image.naturalHeight);
    context.drawImage(image,(image.naturalWidth-crop)/2,(image.naturalHeight-crop)/2,crop,crop,0,0,side,side);
    let data=canvas.toDataURL("image/jpeg",0.82);
    if(data.length>500000)data=canvas.toDataURL("image/jpeg",0.68);
    if(data.length>500000)throw new Error("That picture is still too large. Try a simpler image.");
    return data;
  }finally{window.URL.revokeObjectURL(objectUrl);}
}
async function handleAvatarFile(){
  const file=$("profile-avatar-file").files?.[0];if(!file)return;
  try{
    status("profile-status","Preparing your picture…");
    S.pendingAvatarData=await fileToAvatarData(file);S.avatarChanged=true;
    paintAvatar($("profile-avatar-preview"),S.profile.display_name,S.pendingAvatarData);
    status("profile-status","Picture ready. Press Save changes to apply it.","success");
  }catch(e){
    $("profile-avatar-file").value="";S.pendingAvatarData=null;S.avatarChanged=false;
    paintAvatar($("profile-avatar-preview"),S.profile.display_name,S.profile.avatar_data);
    status("profile-status",e.message||"Picture couldn't be prepared.","error");
  }
}
async function saveProfile(e){
  e.preventDefault();
  const display_name=$("profile-name").value.trim(),username=$("profile-username").value.trim().toLowerCase();
  if(!display_name||!/^[a-z0-9_]{3,24}$/.test(username)){status("profile-status","Check the name and username format.","error");return;}
  const save=$("profile-save");save.disabled=true;
  const r=await db.from("profiles").update({display_name,username}).eq("id",S.user.id).select("*").single();
  if(r.error){save.disabled=false;status("profile-status",r.error.message,"error");return;}
  S.profile={...r.data,avatar_data:S.profile.avatar_data||null};
  if(S.avatarChanged){
    const picture=S.pendingAvatarData
      ?await db.from("profile_avatars").upsert({user_id:S.user.id,image_data:S.pendingAvatarData,updated_at:new Date().toISOString()},{onConflict:"user_id"})
      :await db.from("profile_avatars").delete().eq("user_id",S.user.id);
    if(picture.error){
      save.disabled=false;S.profiles[S.user.id]=S.profile;
      status("profile-status","Your name was saved, but the picture was not: "+picture.error.message,"error");return;
    }
    S.profile.avatar_data=S.pendingAvatarData||null;
  }
  S.profiles[S.user.id]=S.profile;
  $("user-name").textContent=S.profile.display_name;syncOwnAvatar();
  S.pendingAvatarData=null;S.avatarChanged=false;$("profile-modal").hidden=true;save.disabled=false;
  await loadChats();if(S.active)await loadMessages(S.active);toast("Profile updated.");
}
function strongPasswordError(password){
  if(password.length<12)return "Use at least 12 characters.";
  if(!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password))
    return "Include uppercase and lowercase letters, a number, and a symbol.";
  return "";
}
async function changePassword(e){
  e.preventDefault();
  const current=$("current-password").value,newPassword=$("new-password").value,confirmPassword=$("confirm-password").value;
  const weak=strongPasswordError(newPassword);
  if(weak){status("password-status",weak,"error");return;}
  if(newPassword!==confirmPassword){status("password-status","The new passwords don't match.","error");return;}
  if(newPassword===current){status("password-status","Choose a different password from your current one.","error");return;}
  const button=$("password-save");button.disabled=true;status("password-status","Checking your current password…");
  const check=await db.auth.signInWithPassword({email:S.user.email,password:current});
  if(check.error){button.disabled=false;status("password-status","Current password wasn't accepted. Please try again.","error");return;}
  const update=await db.auth.updateUser({password:newPassword});
  button.disabled=false;
  if(update.error){status("password-status","Password wasn't changed: "+update.error.message,"error");return;}
  $("current-password").value="";$("new-password").value="";$("confirm-password").value="";
  status("password-status","Password updated successfully.","success");
}
function closeModals(){ $("people-modal").hidden=true;$("profile-modal").hidden=true;$("requests-modal").hidden=true;$("friends-modal").hidden=true;$("settings-modal").hidden=true;$("group-photo-modal").hidden=true;$("group-settings-modal").hidden=true;$("message-search-modal").hidden=true;$("chat-actions-modal").hidden=true; }
function goHome(){
  closeModals();stopChatPresence();S.active=null;S.messages=[];S.messageReads={};S.replyTo=null;S.hasOlderMessages=false;S.selectingMessages=false;S.selectedMessageIds.clear();S.directStatus=null;renderReplyComposer();
  $("layout").classList.remove("show-chat");$("layout").classList.add("show-home");renderChats();renderActive();
}
function wire(){
  document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>authMode(b.dataset.mode)));
  $("forgot-password").addEventListener("click",requestPasswordReset);
  $("recovery-password-form").addEventListener("submit",completePasswordRecovery);
  $("recovery-cancel").addEventListener("click",async()=>{const result=await db.auth.signOut();if(result.error)status("recovery-password-status",result.error.message,"error");else $("password-recovery-modal").hidden=true;});
  $("auth-form").addEventListener("submit",async e=>{
    e.preventDefault();const email=$("email").value.trim(),password=$("password").value,isNew=S.mode==="signup";$("auth-submit").disabled=true;status("auth-status",isNew?"Creating account…":"Signing in…");
    const weak=isNew?strongPasswordError(password):"";
    if(weak){status("auth-status",weak+" Use a unique password you don't use on other sites.","error");$("auth-submit").disabled=false;return;}
    const r=isNew?await db.auth.signUp({email,password,options:{data:{display_name:$("name").value.trim()},emailRedirectTo:location.origin}}):await db.auth.signInWithPassword({email,password});
    if(r.error)status("auth-status",r.error.message,"error");
    else if(isNew&&!r.data.session)status("auth-status","Account created. Check your email for the confirmation link, then sign in here.","success");
    else {status("auth-status","Signed in. Loading chats…","success");if(r.data.session?.user)await signedIn(r.data.session.user);}
    $("auth-submit").disabled=false;
  });
  $("new-private-chat").addEventListener("click",()=>openPeople("direct"));$("new-group-chat").addEventListener("click",()=>openPeople("group"));
  $("retry-load-chats").addEventListener("click",()=>{if(S.user&&!S.loading)signedIn(S.user,true);});
  $("empty-private").addEventListener("click",()=>openPeople("direct"));$("empty-group").addEventListener("click",()=>openPeople("group"));
  $("chat-actions-open").addEventListener("click",()=>{$("chat-actions-modal").hidden=false;});
  ["add-people","edit-group-photo","group-settings-open","search-messages-open","leave-chat","block-user","select-messages","delete-selected"].forEach(id=>$(id).addEventListener("click",()=>{$("chat-actions-modal").hidden=true;}));
  $("add-people").addEventListener("click",()=>openPeople("add"));$("edit-group-photo").addEventListener("click",openGroupPhoto);$("group-settings-open").addEventListener("click",openGroupSettings);$("group-settings-save").addEventListener("click",saveGroupSettings);$("group-avatar-file").addEventListener("change",handleGroupAvatarFile);$("group-avatar-remove").addEventListener("click",removeGroupAvatar);$("group-avatar-save").addEventListener("click",saveGroupAvatar);$("leave-chat").addEventListener("click",()=>{if(S.active)leaveGroupChat(S.active);});$("requests-open").addEventListener("click",openRequests);$("friends-open").addEventListener("click",openFriends);$("friends-find").addEventListener("click",()=>{$("friends-modal").hidden=true;openPeople("friend");});$("block-user").addEventListener("click",toggleBlock);
  $("people-search").addEventListener("input",()=>{clearTimeout(S.timer);S.timer=setTimeout(searchPeople,220);});$("people-create").addEventListener("click",createGroupOrAdd);
  $("home-open").addEventListener("click",goHome);
  $("settings-open").addEventListener("click",openSettings);
  document.querySelectorAll("[data-accent]").forEach(b=>b.addEventListener("click",()=>setAccent(b.dataset.accent)));
  document.querySelectorAll("[data-font-size]").forEach(b=>b.addEventListener("click",()=>setFontSize(b.dataset.fontSize)));
  document.querySelectorAll("[data-notification-mode]").forEach(b=>b.addEventListener("click",()=>setMessageNotificationMode(b.dataset.notificationMode)));
  $("share-online-status").addEventListener("change",e=>setShareOnlineStatus(e.target.checked));
  $("home-friends-open").addEventListener("click",openFriends);$("home-requests-open").addEventListener("click",openRequests);$("open-about-blank").addEventListener("click",openAboutBlank);
  $("filter").addEventListener("input",renderChats);document.querySelectorAll("[data-folder]").forEach(b=>b.addEventListener("click",()=>selectFolder(b.dataset.folder)));$("profile-open").addEventListener("click",openProfile);$("profile-form").addEventListener("submit",saveProfile);
  $("profile-avatar-file").addEventListener("change",handleAvatarFile);
  $("avatar-remove").addEventListener("click",()=>{
    S.pendingAvatarData=null;S.avatarChanged=true;
    paintAvatar($("profile-avatar-preview"),S.profile.display_name,null);
    status("profile-status","The picture will be removed when you save changes.","success");
  });
  $("password-form").addEventListener("submit",changePassword);
  $("send-form").addEventListener("submit",sendMessage);
  $("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";handleTypingInput();});
  $("messages").addEventListener("scroll",()=>{if($("messages").scrollTop<80)loadOlderMessages();});
  $("cancel-reply").addEventListener("click",cancelReply);
  $("search-messages-open").addEventListener("click",openMessageSearch);
  $("message-search-input").addEventListener("input",()=>{clearTimeout(S.searchTimer);S.searchTimer=setTimeout(()=>searchConversationMessages(true),250);});
  $("message-search-more").addEventListener("click",()=>searchConversationMessages(false));
  $("message").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();$("send-form").requestSubmit();}});
  $("back").addEventListener("click",goHome);
  $("select-messages").addEventListener("click",()=>{
    S.selectingMessages=!S.selectingMessages;
    S.selectedMessageIds.clear();
    renderMessages();
    renderActive();
  });
  $("delete-selected").addEventListener("click",deleteSelectedMessages);
  $("signout").addEventListener("click",async()=>{const r=await db.auth.signOut();if(r.error)toast(r.error.message);else closeModals();});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",closeModals));
  ["people-modal","profile-modal","requests-modal","friends-modal","settings-modal","group-photo-modal","group-settings-modal","message-search-modal","chat-actions-modal"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))closeModals();}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModals();});
}
async function boot(){
  if(!window.supabase?.createClient){status("auth-status","The chat library did not load. Refresh and try again.","error");return;}
  wire();
  loadUIPreferences(DEFAULT_PREFERENCES);
  db.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{
    if(event==="PASSWORD_RECOVERY"&&session?.user){signedIn(session.user);openPasswordRecovery();}
    else if(session?.user)signedIn(session.user);
    else if(event==="SIGNED_OUT")showAuth();
  },0);});
  const session=await db.auth.getSession();if(session.error){status("auth-status",session.error.message,"error");return;}
  if(session.data.session?.user)await signedIn(session.data.session.user);else showAuth();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
