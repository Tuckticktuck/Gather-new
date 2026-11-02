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
const MESSAGE_REACTION_EMOJIS = ["👍","❤️","😂","😮","😢","🎉"];
const DEFAULT_PREFERENCES = {accent:"lavender",fontSize:"normal",theme:"dark",messageNotificationMode:"temporary",groupUnreadMessages:false,shareOnlineStatus:true};
const DEFAULT_CHAT_SETTINGS = {pinned:[],muted:{},drafts:{},appearance:{}};
const CHAT_BACKGROUNDS = {default:null,slate:"#202a37",forest:"#1d302b",plum:"#302438",sand:"#40382d"};
function normalizeChatSettings(raw){
  const pinned=[...new Set((Array.isArray(raw?.pinned)?raw.pinned:[]).filter(x=>typeof x==="string"&&x.length<=80))].slice(0,100);
  const muted={};
  if(raw?.muted&&typeof raw.muted==="object"&&!Array.isArray(raw.muted))Object.entries(raw.muted).forEach(([id,value])=>{if(value===true&&id.length<=80)muted[id]=true;});
  const drafts={};
  if(raw?.drafts&&typeof raw.drafts==="object"&&!Array.isArray(raw.drafts))Object.entries(raw.drafts).slice(-50).forEach(([id,value])=>{if(typeof value==="string"&&value.length&&id.length<=80)drafts[id]=value.slice(0,4000);});
  const appearance={};
  if(raw?.appearance&&typeof raw.appearance==="object"&&!Array.isArray(raw.appearance))Object.entries(raw.appearance).forEach(([id,value])=>{
    if(!value||typeof value!=="object"||id.length>80)return;
    appearance[id]={accent:ACCENTS[value.accent]?value.accent:"default",background:Object.hasOwn(CHAT_BACKGROUNDS,value.background)?value.background:"default"};
  });
  return {pinned,muted,drafts,appearance};
}
const S = { user:null, profile:null, profiles:{}, chatSettings:{...DEFAULT_CHAT_SETTINGS}, draftSaveTimer:null, selectingConversations:false, selectedConversationIds:new Set(), unreadTargetMessageId:null, unreadTargetLoaded:false, unreadDividerMessageId:null, unreadDividerTimer:null, unreadDividerArmed:false, suppressReadDividerUpdates:false, announcements:[], activeAnnouncementId:null, announcementInView:null, announcementChannel:null, feedbackThreads:[], feedbackMessages:[], feedbackProfiles:{}, activeFeedbackThreadId:null, feedbackAdminView:false, notifications:[], notificationChannel:null, notificationView:"all", publicProfileId:null, reportTargetUserId:null, reportTargetMessageId:null, chats:[], requests:[], friendRequests:[], friends:[], blockedUsers:[], deletedMessages:[], deletedMessageIds:new Set(), selectingMessages:false, selectedMessageIds:new Set(), folder:"friends", lastReadAt:{}, preferences:{...DEFAULT_PREFERENCES}, notificationTimers:{}, unreadCounts:{}, unreadCountsLoaded:false, totalUnreadCount:0, passwordRecovery:false, pendingAvatarData:null, avatarChanged:false, pendingImageFile:null, pendingImageUrl:null, pendingGroupAvatarData:null, groupAvatarChanged:false, groupAvatarConversationId:null, requestChannel:null, readChannel:null, messageReads:{}, messageReactions:{}, pendingReactionKeys:new Set(), openReactionPickerMessageId:null, openMessageMenuId:null, hasOlderMessages:false, loadingOlder:false, replyTo:null, messagePolls:{}, pinnedMessages:[], savedMessageIds:new Set(), pollChannel:null, forwardMessage:null, searchConversationId:null, searchQuery:"", searchOffset:0, searchHasMore:false, directStatus:null, active:null, messages:[], channel:null, mode:"signin", picker:"direct", selected:new Set(), loading:null, loadError:null, timer:null, friendPresenceChannels:new Map(), ownPresenceChannel:null, lastSeenHeartbeatTimer:null, presenceDisplayTimer:null, onlineStatuses:{}, typingChannel:null, typingReady:false, typingSent:false, typingLastSentAt:0, typingStopTimer:null, typingRemoteTimer:null, typingUsers:new Map() };

function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
function status(id, text, kind) { const n=$(id); n.textContent=text||""; n.className="status"+(kind?" "+kind:""); }
function isFeedbackAdmin(user){return !!user&&!user.is_anonymous&&String(user.email||"").trim().toLowerCase()==="landoncordeiro237@gmail.com";}
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
    theme:saved?.theme==="light"?"light":"dark",
    messageNotificationMode:saved?.messageNotificationMode==="persistent"?"persistent":"temporary",
    groupUnreadMessages:saved?.groupUnreadMessages===true,
    shareOnlineStatus:saved?.shareOnlineStatus!==false
  };
  applyUIPreferences();
}
async function loadChatSettings(userId=S.user?.id){
  if(!userId)return false;
  const result=await db.from("user_chat_preferences").select("settings").eq("user_id",userId).maybeSingle();
  if(S.user?.id!==userId)return false;
  if(result.error){
    console.warn("Private chat preferences could not be loaded:",result.error.message);
    S.chatSettings=normalizeChatSettings(DEFAULT_CHAT_SETTINGS);
    toast("Your private chat preferences couldn't be loaded. You can still use Gather, but changes may not be saved.");
    return false;
  }
  S.chatSettings=normalizeChatSettings(result.data?.settings||DEFAULT_CHAT_SETTINGS);
  mergeLocalChatDraftOverrides(userId);
  return true;
}
function mergeLocalChatDraftOverrides(userId=S.user?.id){
  if(!userId)return;
  let changed=false;
  try{
    const overrides=JSON.parse(localStorage.getItem("gather_chat_drafts_"+userId)||"{}");
    Object.entries(overrides).forEach(([id,value])=>{
      if(typeof value!=="string")return;
      if(value){if(S.chatSettings.drafts[id]!==value.slice(0,4000)){S.chatSettings.drafts[id]=value.slice(0,4000);changed=true;}}
      else if(S.chatSettings.drafts[id]){delete S.chatSettings.drafts[id];changed=true;}
    });
  }catch(error){}
  if(changed)saveChatSettings();
}
function clearSyncedLocalDraftOverrides(userId,savedSettings){
  try{
    const key="gather_chat_drafts_"+userId,overrides=JSON.parse(localStorage.getItem(key)||"{}");
    Object.entries(overrides).forEach(([id,value])=>{
      if((savedSettings.drafts[id]||"")===value)delete overrides[id];
    });
    if(Object.keys(overrides).length)localStorage.setItem(key,JSON.stringify(overrides));
    else localStorage.removeItem(key);
  }catch(error){}
}
function applyUIPreferences(){
  const accent=ACCENTS[S.preferences.accent]||ACCENTS.lavender;
  const root=document.documentElement;
  const isLight=S.preferences.theme==="light";
  root.dataset.theme=isLight?"light":"dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",isLight?"#f3f5fa":"#171923");
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
  if(isLight){
    root.style.setProperty("--accent-soft",`color-mix(in srgb,${accent.accent} 9%,white)`);
    root.style.setProperty("--accent-text",`color-mix(in srgb,${accent.strong} 72%,#28283a)`);
    root.style.setProperty("--accent-badge",`color-mix(in srgb,${accent.accent} 16%,white)`);
    root.style.setProperty("--accent-surface",`color-mix(in srgb,${accent.accent} 8%,white)`);
    root.style.setProperty("--accent-hover",`color-mix(in srgb,${accent.accent} 13%,white)`);
    root.style.setProperty("--accent-outline-soft",`color-mix(in srgb,${accent.accent} 23%,transparent)`);
    root.style.setProperty("--accent-outline",`color-mix(in srgb,${accent.accent} 42%,transparent)`);
    root.style.setProperty("--accent-deep","#f3f5fa");
    root.style.setProperty("--accent-panel","#ffffff");
    root.style.setProperty("--accent-panel-raised","#f7f8fc");
    root.style.setProperty("--accent-input","#ffffff");
    root.style.setProperty("--accent-chat",`color-mix(in srgb,${accent.accent} 7%,#f7f8fc)`);
    root.style.setProperty("--accent-chat-border","#dfe2eb");
    root.style.setProperty("--accent-muted","#72778a");
    root.style.setProperty("--accent-contrast","#34364a");
  }
  document.querySelectorAll("[data-theme-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.themeMode===S.preferences.theme)));
  root.style.setProperty("--font-scale",FONT_SCALES[S.preferences.fontSize]||"1");
  document.querySelectorAll("[data-accent]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.accent===S.preferences.accent)));
  document.querySelectorAll("[data-font-size]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.fontSize===S.preferences.fontSize)));
  document.querySelectorAll("[data-notification-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.notificationMode===S.preferences.messageNotificationMode)));
  const groupUnreadControl=$("group-unread-messages");
  if(groupUnreadControl)groupUnreadControl.checked=S.preferences.groupUnreadMessages===true;
  const shareStatusControl=$("share-online-status");
  if(shareStatusControl)shareStatusControl.checked=S.preferences.shareOnlineStatus!==false;
  if(S.active)applyChatAppearance(S.active);
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
      await syncOwnPresence();
      $("settings-note").textContent="Couldn't save settings. Please try again.";
      toast("Appearance settings were not saved: "+result.error.message);
      return;
    }
    S.profile.preferences=result.data.preferences;
    await syncOwnPresence();
    $("settings-note").textContent="Saved to your account. Your settings follow you across devices.";
  },180);
}
function saveChatSettings(){
  if(!S.user)return;
  const userId=S.user.id,snapshot=normalizeChatSettings(S.chatSettings);
  clearTimeout(S.chatSettingsSaveTimer);
  S.chatSettingsSaveTimer=setTimeout(async()=>{
    if(S.user?.id!==userId)return;
    const result=await db.from("user_chat_preferences")
      .upsert({user_id:userId,settings:snapshot,updated_at:new Date().toISOString()},{onConflict:"user_id"})
      .select("settings").single();
    if(S.user?.id!==userId)return;
    if(result.error){
      console.warn("Private chat preferences could not be saved:",result.error.message);
      toast("Your private chat preferences couldn't be saved. Please try again.");
      return;
    }
    clearSyncedLocalDraftOverrides(userId,snapshot);
  },220);
}
function chatSettingsFor(id=S.active){
  return id?{pinned:S.chatSettings.pinned.includes(id),muted:S.chatSettings.muted[id]===true,appearance:S.chatSettings.appearance[id]||{accent:"default",background:"default"},draft:S.chatSettings.drafts[id]||""}:{pinned:false,muted:false,appearance:{accent:"default",background:"default"},draft:""};
}
function togglePinnedConversation(id=S.active){
  if(!id)return;
  const index=S.chatSettings.pinned.indexOf(id);
  if(index>=0)S.chatSettings.pinned.splice(index,1);
  else{
    if(S.chatSettings.pinned.length>=100){toast("You can pin up to 100 conversations.");return;}
    S.chatSettings.pinned.unshift(id);
  }
  saveChatSettings();renderChats();renderActive();renderChatOptions();
}
function toggleMutedConversation(id=S.active){
  if(!id)return;
  if(S.chatSettings.muted[id])delete S.chatSettings.muted[id];
  else S.chatSettings.muted[id]=true;
  if(S.chatSettings.muted[id]){
    $("message-notifications").querySelectorAll("[data-conversation-id]").forEach(card=>{
      if(card.dataset.conversationId===id)dismissMessageNotification(card.dataset.notificationId);
    });
  }
  saveChatSettings();renderChats();renderChatOptions();renderNotifications();renderNotificationBadge();
  toast(S.chatSettings.muted[id]?"Conversation muted.":"Conversation unmuted.");
}
function applyChatAppearance(id=S.active){
  const chat=$("chat"),messages=$("messages");
  if(!chat||!messages)return;
  const appearance=S.chatSettings.appearance[id]||{accent:"default",background:"default"};
  const accent=ACCENTS[appearance.accent]||ACCENTS[S.preferences.accent]||ACCENTS.lavender;
  const background=CHAT_BACKGROUNDS[appearance.background]||null;
  const custom=appearance.accent!=="default"||!!background;
  chat.classList.toggle("chat-appearance-custom",custom);
  if(custom){
    chat.style.setProperty("--conversation-accent",accent.accent);
    chat.style.setProperty("--conversation-accent-ink",accent.ink);
    chat.style.setProperty("--conversation-accent-soft",accent.soft);
    chat.style.setProperty("--conversation-accent-border",accent.border);
    chat.style.setProperty("--conversation-background",background||(S.preferences.theme==="light"?"#f5f6fa":"#171923"));
  }else{
    ["--conversation-accent","--conversation-accent-ink","--conversation-accent-soft","--conversation-accent-border","--conversation-background"].forEach(key=>chat.style.removeProperty(key));
  }
}
function renderChatOptions(){
  const settings=chatSettingsFor();
  $("toggle-chat-pin").textContent=settings.pinned?"Unpin conversation":"Pin conversation";
  $("toggle-chat-mute").textContent=settings.muted?"Unmute notifications":"Mute notifications";
  $("chat-appearance-accent").value=settings.appearance.accent;
  $("chat-appearance-background").value=settings.appearance.background;
}
function updateChatAppearance(){
  const id=S.active;if(!id)return;
  S.chatSettings.appearance[id]={
    accent:$("chat-appearance-accent").value,
    background:$("chat-appearance-background").value
  };
  applyChatAppearance(id);saveChatSettings();
}
function saveLocalChatDraftOverride(id,value){
  if(!S.user||!id)return;
  try{
    const key="gather_chat_drafts_"+S.user.id;
    const overrides=JSON.parse(localStorage.getItem(key)||"{}");
    overrides[id]=String(value||"").slice(0,4000);
    localStorage.setItem(key,JSON.stringify(overrides));
  }catch(error){}
}
function saveActiveChatDraft(){
  const id=S.active;if(!id)return;
  const value=$("message").value.slice(0,4000);
  if(value){delete S.chatSettings.drafts[id];S.chatSettings.drafts[id]=value;}
  else delete S.chatSettings.drafts[id];
  saveLocalChatDraftOverride(id,value);
  clearTimeout(S.draftSaveTimer);
  S.draftSaveTimer=setTimeout(saveChatSettings,450);
}
function restoreChatDraft(id){
  if(S.user){
    try{
      const local=JSON.parse(localStorage.getItem("gather_chat_drafts_"+S.user.id)||"{}");
      if(Object.hasOwn(local,id)){
        if(typeof local[id]==="string"&&local[id])S.chatSettings.drafts[id]=local[id].slice(0,4000);
        else delete S.chatSettings.drafts[id];
        clearTimeout(S.draftSaveTimer);S.draftSaveTimer=setTimeout(saveChatSettings,250);
      }
    }catch(error){}
  }
  $("message").value=S.chatSettings.drafts[id]||"";
  $("message").style.height="auto";
  $("message").style.height=Math.min($("message").scrollHeight,120)+"px";
}
function clearUnreadDividerState(){
  clearTimeout(S.unreadDividerTimer);S.unreadDividerTimer=null;
  S.unreadDividerMessageId=null;S.unreadDividerArmed=false;
}
async function loadOldestUnreadTarget(id=S.active){
  if(!id||S.active!==id)return false;
  const result=await db.rpc("get_oldest_unread_message",{p_conversation_id:id});
  if(S.active!==id)return false;
  if(result.error){
    console.warn("The oldest unread message could not be located:",result.error.message);
    S.unreadTargetMessageId=S.messages.find(message=>message.sender_id!==S.user?.id&&!(S.messageReads[message.id]||[]).some(receipt=>receipt.user_id===S.user.id))?.id||null;
  }else{
    S.unreadTargetMessageId=result.data?.[0]?.message_id||null;
  }
  S.unreadTargetLoaded=true;
  updateUnreadDivider(id);
  if(S.messages.length)renderMessages(true);
  return true;
}
function updateUnreadDivider(id=S.active){
  if(!id||S.active!==id||!S.unreadTargetLoaded)return;
  const next=S.unreadTargetMessageId&&S.messages.some(message=>message.id===S.unreadTargetMessageId)
    ?S.unreadTargetMessageId:null;
  if(next!==S.unreadDividerMessageId){
    clearTimeout(S.unreadDividerTimer);S.unreadDividerTimer=null;S.unreadDividerArmed=false;
    S.unreadDividerMessageId=next;
  }
}
function checkUnreadDividerVisibility(){
  if(!S.active||!S.unreadDividerMessageId||S.unreadDividerArmed)return;
  const list=$("messages"),divider=list?.querySelector(".new-messages-divider");
  if(!divider)return;
  const target=divider.getBoundingClientRect(),viewport=list.getBoundingClientRect();
  if(target.bottom<viewport.top||target.top>viewport.bottom)return;
  const chatId=S.active,messageId=S.unreadDividerMessageId;
  S.unreadDividerArmed=true;
  S.unreadDividerTimer=null;
  void dismissUnreadDivider(chatId,messageId);
}
async function dismissUnreadDivider(chatId,messageId){
  if(S.active!==chatId||S.unreadDividerMessageId!==messageId)return;
  S.suppressReadDividerUpdates=true;
  const result=await db.rpc("mark_conversation_read",{p_conversation_id:chatId});
  if(S.active!==chatId){S.suppressReadDividerUpdates=false;return;}
  S.suppressReadDividerUpdates=false;
  if(result.error){
    console.warn("Unread messages could not be marked as read:",result.error.message);
    S.unreadDividerArmed=false;
    toast("The unread messages could not be marked as read. Please try again.");
    return;
  }
  clearUnreadDividerState();
  S.unreadTargetMessageId=null;S.unreadTargetLoaded=true;
  await loadMessageReads(chatId,S.messages.map(message=>message.id));
  if(S.active!==chatId)return;
  const lastIncoming=[...S.messages].reverse().find(message=>message.sender_id!==S.user.id);
  if(lastIncoming)markChatRead(chatId,lastIncoming.created_at);
  await loadUnreadCounts();
  if(!Number(S.unreadCounts[chatId]||0))await markConversationNotificationsRead(chatId);
  renderMessages(true);renderChats();
}
function setTheme(theme){
  if(theme!=="light"&&theme!=="dark")return;
  S.preferences.theme=theme;saveUIPreferences();
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
function setGroupUnreadMessages(enabled){
  S.preferences.groupUnreadMessages=!!enabled;
  saveUIPreferences();
  renderNotifications();
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
  const profiles=await db.from("profiles").select("id,username,display_name,bio,pronouns,banner_style").in("id",unique);
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
async function markConversationNotificationsRead(chatId){
  if(!S.user||!chatId)return false;
  const at=new Date().toISOString();
  const result=await db.from("notifications").update({read_at:at})
    .eq("recipient_id",S.user.id).eq("conversation_id",chatId).eq("kind","message").is("read_at",null);
  if(result.error){console.warn("Notifications for the open conversation could not be marked read:",result.error.message);return false;}
  S.notifications.forEach(item=>{if(item.kind==="message"&&item.conversation_id===chatId&&!item.read_at)item.read_at=at;});
  renderNotifications();
  return true;
}
async function markConversationRead(chatId){
  if(!S.user||!chatId)return false;
  const result=await db.rpc("mark_conversation_read",{p_conversation_id:chatId});
  if(result.error){console.warn("Conversation read status could not be saved:",result.error.message);return false;}
  await markConversationNotificationsRead(chatId);
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
  saveActiveChatDraft();clearUnreadDividerState();
  closeTypingChannel();
  stopOnlinePresence();
  clearPendingMessageImage();clearMessageNotifications();
  $("password-recovery-modal").hidden=true;S.passwordRecovery=false;
  if(S.channel){db.removeChannel(S.channel);S.channel=null;}
  if(S.requestChannel){db.removeChannel(S.requestChannel);S.requestChannel=null;}
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  if(S.pollChannel){db.removeChannel(S.pollChannel);S.pollChannel=null;}
  if(S.notificationChannel){db.removeChannel(S.notificationChannel);S.notificationChannel=null;}
  if(S.announcementChannel){db.removeChannel(S.announcementChannel);S.announcementChannel=null;}
  S.announcements=[];renderHomeAnnouncement();
  clearTimeout(S.draftSaveTimer);S.draftSaveTimer=null;
  clearTimeout(S.chatSettingsSaveTimer);S.chatSettingsSaveTimer=null;S.chatSettings=normalizeChatSettings(DEFAULT_CHAT_SETTINGS);
  S.selectingConversations=false;S.selectedConversationIds.clear();renderConversationSelectionControls();
  S.unreadTargetMessageId=null;S.unreadTargetLoaded=false;S.suppressReadDividerUpdates=false;
  S.user=null;S.profile=null;S.messageReactions={};S.messagePolls={};S.pinnedMessages=[];S.savedMessageIds=new Set();S.forwardMessage=null;S.pendingReactionKeys.clear();S.openReactionPickerMessageId=null;S.openMessageMenuId=null;S.notifications=[];S.feedbackAdminView=false;$("feedback-admin-open").hidden=true;$("feedback-admin-settings-section").hidden=true;S.profiles={};S.chats=[];S.messages=[];S.messageReads={};S.replyTo=null;S.hasOlderMessages=false;S.requests=[];S.friendRequests=[];S.friends=[];S.blockedUsers=[];S.deletedMessages=[];S.deletedMessageIds=new Set();S.lastReadAt={};S.folder="friends";S.directStatus=null;S.active=null;S.messages=[];S.loadError=null;S.avatarChanged=false;S.pendingAvatarData=null;loadUIPreferences(DEFAULT_PREFERENCES);
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
  S.loading=user.id;S.user=user;S.loadError=null;$("feedback-admin-open").hidden=!isFeedbackAdmin(user);$("feedback-admin-settings-section").hidden=!isFeedbackAdmin(user);showApp();setChatLoadStatus("Loading your chats…");
  try{
    S.profile=await ensureProfile(user);
    if(S.user?.id!==user.id)return;
    loadReadState();
    loadUIPreferences(S.profile.preferences||DEFAULT_PREFERENCES);
    await loadChatSettings(user.id);
    if(S.user?.id!==user.id)return;
    const ownPicture=await db.from("profile_avatars").select("image_data").eq("user_id",user.id).maybeSingle();
    S.profile.avatar_data=ownPicture.error?null:(ownPicture.data?.image_data||null);
    S.profiles[user.id]=S.profile;
    $("user-name").textContent=S.profile.display_name;
    syncOwnAvatar();
    subscribeRequests();
    const loaded=await loadChats();
    if(!loaded)throw new Error(S.loadError||"Please check your connection and try again.");
    subscribeMessages();
    await loadNotifications();subscribeNotifications();
    await loadAnnouncements();subscribeAnnouncements();
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
  return p?"@"+p.username:"Private conversation";
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
    db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,attachment_path,forwarded_from_id").in("conversation_id",ids).order("created_at",{ascending:false}).limit(1000),
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
  await refreshFriendLastSeen();
  syncFriendPresenceChannels();
  ensurePresenceDisplayTimer();
  await syncOwnPresence();
  renderFriends();renderChats();
  return true;
}

function formatLastSeen(value){
  if(!value)return "";
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
  if(seconds<60)return "just now";
  if(seconds<3600)return Math.floor(seconds/60)+"m ago";
  if(seconds<86400)return Math.floor(seconds/3600)+"h ago";
  if(seconds<604800)return Math.floor(seconds/86400)+"d ago";
  return new Date(value).toLocaleDateString([],{month:"short",day:"numeric"});
}
function friendPresenceSummary(userId){
  if(!userId||!S.friends.some(friend=>friend.friend_id===userId))return null;
  const state=S.onlineStatuses[userId];
  if(!state||state.statusUnavailable)return {text:"Status unavailable",online:false};
  if(state.online)return {text:"Online now",online:true};
  if(state.lastSeenAt)return {text:"Last active "+formatLastSeen(state.lastSeenAt),online:false};
  return {text:"Status unavailable",online:false};
}
function appendFriendPresenceLabel(container,userId){
  const presence=friendPresenceSummary(userId);
  if(!presence)return;
  container.append(el("small","presence-label"+(presence.online?" is-online":""),presence.text));
}
function renderPublicProfilePresence(){
  const label=$("member-profile-presence");
  if(!label)return;
  const presence=friendPresenceSummary(S.publicProfileId);
  label.hidden=!presence;
  label.textContent=presence?.text||"";
  label.classList.toggle("is-online",!!presence?.online);
}
function renderPresenceUI(){
  if(!S.user)return;
  renderFriends();renderChats();renderActive();renderPublicProfilePresence();
}
function ensurePresenceDisplayTimer(){
  if(S.presenceDisplayTimer)return;
  S.presenceDisplayTimer=setInterval(renderPresenceUI,30000);
}
async function refreshFriendLastSeen(userId=null){
  if(!S.user)return false;
  const ids=userId?[userId]:S.friends.map(friend=>friend.friend_id);
  if(!ids.length)return true;
  const uid=S.user.id;
  const result=await db.from("friend_presence").select("user_id,last_seen_at").in("user_id",ids);
  if(S.user?.id!==uid)return false;
  if(result.error){console.warn("Friend last-seen data could not be loaded:",result.error.message);return false;}
  const next={...S.onlineStatuses};
  ids.forEach(id=>next[id]={...(next[id]||{}),online:!!next[id]?.online,lastSeenAt:null,statusUnavailable:true});
  (result.data||[]).forEach(row=>{
    next[row.user_id]={...(next[row.user_id]||{}),lastSeenAt:row.last_seen_at,statusUnavailable:false};
  });
  S.onlineStatuses=next;
  renderPresenceUI();
  return true;
}
function handleFriendPresenceSync(friendId,channel){
  if(!S.user||!S.friends.some(friend=>friend.friend_id===friendId))return;
  const state=channel.presenceState()||{};
  const presences=Object.values(state).flat();
  const online=presences.length>0;
  S.onlineStatuses[friendId]={...(S.onlineStatuses[friendId]||{}),online,statusUnavailable:false};
  if(!online)refreshFriendLastSeen(friendId);
  else renderPresenceUI();
}
function syncFriendPresenceChannels(){
  if(!S.user)return;
  const friendIds=new Set(S.friends.map(friend=>friend.friend_id));
  for(const [friendId,channel] of [...S.friendPresenceChannels.entries()]){
    if(friendIds.has(friendId))continue;
    S.friendPresenceChannels.delete(friendId);
    delete S.onlineStatuses[friendId];
    db.removeChannel(channel);
  }
  for(const friendId of friendIds){
    if(S.friendPresenceChannels.has(friendId))continue;
    const channel=db.channel("gather-presence:"+friendId,{config:{private:true}});
    channel.on("presence",{event:"sync"},()=>handleFriendPresenceSync(friendId,channel));
    channel.subscribe((status,error)=>{
      if(status==="SUBSCRIBED")handleFriendPresenceSync(friendId,channel);
      else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
        console.warn("Friend online status subscription failed:",error||status);
        S.onlineStatuses[friendId]={...(S.onlineStatuses[friendId]||{}),online:false,statusUnavailable:true};
        renderPresenceUI();
      }
    });
    S.friendPresenceChannels.set(friendId,channel);
  }
}
async function recordLastSeen(userId=S.user?.id){
  if(!userId||S.user?.id!==userId||S.preferences.shareOnlineStatus===false)return false;
  const result=await db.from("friend_presence").upsert(
    {user_id:userId,last_seen_at:new Date().toISOString()},
    {onConflict:"user_id"}
  );
  if(result.error){console.warn("Last-seen heartbeat could not be saved:",result.error.message);return false;}
  return true;
}
async function syncOwnPresence(){
  const uid=S.user?.id;
  if(!uid)return;
  if(S.preferences.shareOnlineStatus===false){
    if(S.lastSeenHeartbeatTimer){clearInterval(S.lastSeenHeartbeatTimer);S.lastSeenHeartbeatTimer=null;}
    const old=S.ownPresenceChannel;S.ownPresenceChannel=null;
    if(old){
      try{await old.untrack();}catch(error){console.warn("Presence untrack did not complete:",error);}
      await db.removeChannel(old);
    }
    return;
  }
  if(S.ownPresenceChannel)return;
  const channel=db.channel("gather-presence:"+uid,{config:{private:true}});
  S.ownPresenceChannel=channel;
  channel.subscribe(async status=>{
    if(status!=="SUBSCRIBED"||S.user?.id!==uid||S.preferences.shareOnlineStatus===false||S.ownPresenceChannel!==channel)return;
    try{
      const result=await channel.track({user_id:uid,online_at:new Date().toISOString()});
      if(result!=="ok")console.warn("Gather online presence could not be published:",result);
      await recordLastSeen(uid);
      if(S.lastSeenHeartbeatTimer)clearInterval(S.lastSeenHeartbeatTimer);
      S.lastSeenHeartbeatTimer=setInterval(()=>recordLastSeen(uid),60000);
    }catch(error){console.warn("Gather online presence could not be started:",error);}
  });
}
async function stopOnlinePresence(){
  if(S.lastSeenHeartbeatTimer){clearInterval(S.lastSeenHeartbeatTimer);S.lastSeenHeartbeatTimer=null;}
  if(S.presenceDisplayTimer){clearInterval(S.presenceDisplayTimer);S.presenceDisplayTimer=null;}
  const own=S.ownPresenceChannel;S.ownPresenceChannel=null;
  if(own){
    try{await own.untrack();}catch(error){}
    await db.removeChannel(own);
  }
  for(const channel of S.friendPresenceChannels.values())await db.removeChannel(channel);
  S.friendPresenceChannels.clear();S.onlineStatuses={};
}

function subscribeRequests(){
  if(S.requestChannel){db.removeChannel(S.requestChannel);S.requestChannel=null;}
  if(!S.user)return;
  const uid=S.user.id;
  S.requestChannel=db.channel("requests-"+uid)
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles",filter:"id=eq."+uid},payload=>{
      const next=payload.new?.preferences;if(!next)return;
      const changed=next.accent!==S.preferences.accent||next.fontSize!==S.preferences.fontSize||next.messageNotificationMode!==S.preferences.messageNotificationMode||next.shareOnlineStatus!==S.preferences.shareOnlineStatus;
      if(changed){S.profile.preferences=next;loadUIPreferences(next);syncOwnPresence();}
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
  if(!message||!chat||!S.user||message.sender_id===S.user.id||S.active===chat.id||S.chatSettings.muted[chat.id])return;
  const container=$("message-notifications");
  if(!container||$("message-notification-"+message.id))return;
  const card=el("article","message-notification");
  card.id="message-notification-"+message.id;
  card.dataset.notificationId=message.id;
  card.dataset.conversationId=chat.id;
  const open=el("button","message-notification-open");
  open.type="button";
  open.setAttribute("aria-label","Open conversation "+chatTitle(chat));
  const heading=el("span","message-notification-heading");
  heading.append(el("strong","",chatTitle(chat)));
  const sender=S.profiles[message.sender_id]?.display_name||"A group member";
  heading.append(el("small","",chat.kind==="group"?sender+" sent a message":"New message"));
  const preview=el("span","message-notification-preview",message.body||(message.attachment_path?"Sent an image":"Sent a message"));
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



function renderAnnouncementText(target,value){
  if(!target)return;
  target.replaceChildren();
  const source=String(value??"");
  const boldPattern=/\*\*([\s\S]+?)\*\*/g;
  let cursor=0,match;
  while((match=boldPattern.exec(source))){
    if(match.index>cursor)target.append(document.createTextNode(source.slice(cursor,match.index)));
    const strong=document.createElement("strong");
    strong.textContent=match[1];
    target.append(strong);
    cursor=boldPattern.lastIndex;
  }
  if(cursor<source.length)target.append(document.createTextNode(source.slice(cursor)));
}
function announcementDateLabel(item){
  return "Gather Admin · "+dateLabel(item.created_at)+(item.edited_at?" · Edited":"");
}
function renderHomeAnnouncement(){
  const card=$("home-announcement-card");
  if(!card)return;
  const latest=S.announcements[0];
  card.hidden=!latest;
  if(!latest)return;
  $("home-announcement-title").textContent=latest.title;
  renderAnnouncementText($("home-announcement-preview"),latest.body);
  $("home-announcement-date").textContent=announcementDateLabel(latest);
}
function renderAnnouncementsPage(){
  const list=$("announcements-history-list");
  if(!list)return;
  list.replaceChildren();
  if(!S.announcements.length){
    list.append(el("p","muted tiny","There are no admin announcements yet. New official updates will appear here."));
    return;
  }
  S.announcements.forEach(item=>{
    const card=el("button","announcement-history-item");
    card.type="button";
    const mark=el("span","announcement-history-mark","◎");
    const copy=el("span","announcement-history-copy");
    const bodyPreview=el("small","");
    renderAnnouncementText(bodyPreview,item.body);
    copy.append(
      el("strong","",item.title),
      bodyPreview,
      el("time","",announcementDateLabel(item))
    );
    const arrow=el("span","announcement-history-arrow","›");
    card.append(mark,copy,arrow);
    card.addEventListener("click",()=>openAnnouncement(item.id));
    list.append(card);
  });
}
async function loadAnnouncements(){
  if(!S.user)return false;
  const result=await db.from("admin_announcements")
    .select("id,title,body,created_at,edited_at")
    .order("created_at",{ascending:false})
    .limit(100);
  if(result.error){
    console.warn("Admin announcements could not be loaded:",result.error.message);
    $("home-announcement-card").hidden=true;
    $("announcements-history-list").replaceChildren(el("p","status error","Announcements could not be loaded. Please try again."));
    return false;
  }
  S.announcements=result.data||[];
  renderHomeAnnouncement();
  renderAnnouncementsPage();
  return true;
}
function openAnnouncementsPage(){
  $("announcements-page-modal").hidden=false;
  renderAnnouncementsPage();
  loadAnnouncements();
}
function subscribeAnnouncements(){
  if(S.announcementChannel){db.removeChannel(S.announcementChannel);S.announcementChannel=null;}
  if(!S.user)return;
  const uid=S.user.id;
  S.announcementChannel=db.channel("admin-announcements-"+uid)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"admin_announcements"},async payload=>{
      if(!S.user||S.user.id!==uid)return;
      await loadAnnouncements();
      if(payload.new?.id&&$("announcements-page-modal").hidden){
        toast("A new official announcement from Gather Admin is available.");
      }
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"admin_announcements"},async payload=>{
      if(!S.user||S.user.id!==uid)return;
      await loadAnnouncements();
      if(payload.new?.id&&S.activeAnnouncementId===payload.new.id&&!$("announcement-view-modal").hidden){
        await openAnnouncement(payload.new.id);
      }
    }).subscribe();
}

function openAnnouncementComposer(){
  if(!isFeedbackAdmin(S.user)){toast("Only the Gather administrator can send announcements.");return;}
  S.activeAnnouncementId=null;
  $("announcement-compose-title").textContent="Send an announcement";
  $("announcement-compose-description").textContent="This message goes to everyone on Gather. Recipients see “Gather Admin” as the sender; your account name and profile are not shown.";
  $("announcement-publish").textContent="Send to everyone";
  $("announcement-title").value="";$("announcement-body").value="";
  status("announcement-compose-status","");
  $("announcement-compose-modal").hidden=false;$("announcement-title").focus();
}
function openAnnouncementEditor(id){
  if(!isFeedbackAdmin(S.user)){toast("Only the Gather administrator can edit announcements.");return;}
  const item=S.announcementInView?.id===id?S.announcementInView:S.announcements.find(a=>a.id===id);
  if(!item){toast("This announcement could not be loaded. Open it again and retry.");return;}
  S.activeAnnouncementId=id;
  $("announcement-compose-title").textContent="Edit announcement";
  $("announcement-compose-description").textContent="Update this official Gather Admin message. The original publication date stays the same, and members will see that it was edited.";
  $("announcement-publish").textContent="Save changes";
  $("announcement-title").value=item.title||"";
  $("announcement-body").value=item.body||"";
  status("announcement-compose-status","");
  $("announcement-compose-modal").hidden=false;$("announcement-title").focus();
}
async function publishAnnouncement(event){
  event.preventDefault();
  if(!isFeedbackAdmin(S.user)){status("announcement-compose-status","Only the Gather administrator can publish or edit announcements.","error");return;}
  const title=$("announcement-title").value.trim(),body=$("announcement-body").value.trim();
  if(!title||title.length>100||!body||body.length>2000){status("announcement-compose-status","Add a title and a message between 1 and 2,000 characters.","error");return;}
  const editingId=S.activeAnnouncementId;
  const confirmation=editingId
    ?"Save these changes to the official announcement? Its original publication date will stay the same."
    :"Send this official announcement to everyone on Gather? It will appear as “Gather Admin” without showing your account identity.";
  if(!confirm(confirmation))return;
  const button=$("announcement-publish");button.disabled=true;
  status("announcement-compose-status",editingId?"Saving announcement changes…":"Sending to all Gather members…");
  const result=editingId
    ?await db.from("admin_announcements").update({title,body,edited_at:new Date().toISOString()}).eq("id",editingId).select("id").maybeSingle()
    :await db.from("admin_announcements").insert({title,body}).select("id").single();
  button.disabled=false;
  if(result.error){status("announcement-compose-status",(editingId?"Announcement could not be updated: ":"Announcement could not be sent: ")+result.error.message,"error");return;}
  if(!result.data?.id){status("announcement-compose-status","The announcement was not changed. Please verify your admin access and try again.","error");return;}
  $("announcement-compose-modal").hidden=true;
  if(editingId){
    toast("Official announcement updated.");
    await loadAnnouncements();
    await openAnnouncement(editingId);
  }else{
    toast("Official announcement sent to Gather members.");
    await loadNotifications();await loadAnnouncements();await openAnnouncement(result.data.id);
  }
}
async function openAnnouncement(id){
  if(!id||!S.user)return;
  S.activeAnnouncementId=id;
  $("announcement-view-title").textContent="Loading announcement…";
  $("announcement-view-body").textContent="";$("announcement-view-date").textContent="";
  $("announcement-edit-open").hidden=!isFeedbackAdmin(S.user);
  $("announcement-view-modal").hidden=false;
  const result=await db.from("admin_announcements").select("id,title,body,created_at,edited_at").eq("id",id).maybeSingle();
  if(result.error||!result.data){$("announcement-view-title").textContent="Announcement unavailable";$("announcement-view-body").textContent="This announcement could not be loaded.";return;}
  S.announcementInView=result.data;
  $("announcement-view-title").textContent=result.data.title;
  renderAnnouncementText($("announcement-view-body"),result.data.body);
  $("announcement-view-date").textContent="Published "+dateLabel(result.data.created_at)+(result.data.edited_at?" · Edited "+dateLabel(result.data.edited_at):"");
}

function notificationItemsForCenter(){
  return S.notifications.filter(item=>
    !(item.kind==="message"&&item.conversation_id&&item.conversation_id===S.active)&&
    !(item.kind==="message"&&item.conversation_id&&S.chatSettings.muted[item.conversation_id])
  );
}
function notificationItemsForView(view=S.notificationView){
  const items=notificationItemsForCenter();
  if(view==="admin")return items.filter(item=>item.kind==="announcement");
  if(view==="messages")return items.filter(item=>item.kind==="message");
  if(view==="other")return items.filter(item=>item.kind!=="announcement"&&item.kind!=="message");
  return items;
}
function notificationUnreadCount(){
  return notificationItemsForCenter().filter(item=>!item.read_at).length;
}
function renderNotificationBadge(){
  const badge=$("notification-badge");if(!badge)return;
  const count=notificationUnreadCount();badge.textContent=count>99?"99+":String(count);badge.hidden=count===0;
  $("notifications-mark-all").disabled=count===0;
}
function notificationKindLabel(kind){
  return ({message:"New message",friend_request:"Friend request",chat_request:"Chat request",feedback_reply:"Feedback update",report:"Safety report",announcement:"Official admin announcement"})[kind]||"Gather update";
}
function notificationDisplayItems(items){
  if(!S.preferences.groupUnreadMessages)return items.map(item=>({notification:item,items:[item]}));
  const groups=new Map(),display=[];
  items.forEach(item=>{
    if(item.kind!=="message"||item.read_at||!item.actor_id||!item.conversation_id){
      display.push({notification:item,items:[item]});
      return;
    }
    const key=item.conversation_id+":"+item.actor_id;
    let group=groups.get(key);
    if(!group){
      group={notification:item,items:[]};
      groups.set(key,group);
      display.push(group);
    }
    group.items.push(item);
  });
  return display;
}
function setNotificationView(view){
  if(!["all","admin","messages","other"].includes(view))return;
  S.notificationView=view;
  renderNotifications();
}
function renderNotifications(){
  const list=$("notifications-list");
  if(!list)return;
  list.replaceChildren();
  const sectionItems=notificationItemsForView();
  if(!sectionItems.length){
    const emptyText={
      all:"You're all caught up. New messages and requests will appear here.",
      admin:"There are no Gather Admin announcements in your notifications yet.",
      messages:"No recent message notifications. Messages in the conversation you're currently viewing stay out of this list.",
      other:"There are no other updates right now."
    };
    list.append(el("p","muted tiny",emptyText[S.notificationView]||emptyText.all));
  }else{
    notificationDisplayItems(sectionItems).forEach(entry=>{
      const item=entry.notification,items=entry.items;
      const unread=items.some(notification=>!notification.read_at);
      const card=el("button","notification-center-item"+(unread?" unread":""));
      card.type="button";
      const icon=el("span","notification-center-icon",item.kind==="announcement"?"◎":item.kind==="message"?"✉":item.kind==="friend_request"?"＋":item.kind==="chat_request"?"↗":item.kind==="report"?"⚑":"•");
      const copy=el("span","notification-center-copy");
      const senderName=S.profiles[item.actor_id]?.display_name||item.title||"New messages";
      const title=item.kind==="announcement"?"Gather Admin":item.kind==="message"&&items.length>1?senderName:(item.title||notificationKindLabel(item.kind));
      const baseDescription=item.kind==="announcement"?"Official announcement · "+(item.body||"Open to read the full message."):(item.body||notificationKindLabel(item.kind));
      const description=item.kind==="message"&&items.length>1?items.length+" unread messages · "+baseDescription:baseDescription;
      copy.append(el("strong","",title),el("small","",description),el("time","",dateLabel(item.created_at)));
      card.append(icon,copy);
      if(unread)card.append(el("span","notification-unread-dot",""));
      card.addEventListener("click",()=>openNotification(entry));
      list.append(card);
    });
  }
  const unread=sectionItems.filter(item=>!item.read_at).length;
  $("notifications-summary").textContent=unread+" unread · "+sectionItems.length+" updates";
  document.querySelectorAll("[data-notification-view]").forEach(button=>{
    const active=button.dataset.notificationView===S.notificationView;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  renderNotificationBadge();
}
async function loadNotifications(){
  if(!S.user)return false;
  const result=await db.from("notifications").select("id,recipient_id,actor_id,kind,title,body,conversation_id,message_id,feedback_thread_id,announcement_id,created_at,read_at").eq("recipient_id",S.user.id).order("created_at",{ascending:false}).limit(80);
  if(result.error){console.warn("Notifications could not be loaded:",result.error.message);return false;}
  S.notifications=result.data||[];renderNotifications();return true;
}
function subscribeNotifications(){
  if(S.notificationChannel){db.removeChannel(S.notificationChannel);S.notificationChannel=null;}
  if(!S.user)return;
  const uid=S.user.id;
  S.notificationChannel=db.channel("notifications-"+uid)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"recipient_id=eq."+uid},async payload=>{
      if(payload.new?.recipient_id!==S.user?.id)return;
      const activeConversationMessage=payload.new?.kind==="message"&&payload.new.conversation_id===S.active;
      if(activeConversationMessage){
        const at=new Date().toISOString();
        const updated=await db.from("notifications").update({read_at:at}).eq("id",payload.new.id).eq("recipient_id",uid);
        if(updated.error)console.warn("Active-chat notification could not be marked read:",updated.error.message);
      }
      await loadNotifications();
      const item=S.notifications.find(x=>x.id===payload.new.id);
      const mutedMessage=item?.kind==="message"&&item.conversation_id&&S.chatSettings.muted[item.conversation_id];
      if(item&&!activeConversationMessage&&!mutedMessage&&$("notifications-modal")?.hidden)toast(item.title||"You have a new Gather notification.");
    }).subscribe();
}
async function markNotificationRead(id){
  const at=new Date().toISOString();
  const result=await db.from("notifications").update({read_at:at}).eq("id",id).eq("recipient_id",S.user.id);
  if(result.error){console.warn("Notification could not be marked read:",result.error.message);return false;}
  const item=S.notifications.find(x=>x.id===id);if(item)item.read_at=at;
  renderNotifications();return true;
}
async function markAllNotificationsRead(){
  if(!S.user)return;
  const button=$("notifications-mark-all");button.disabled=true;
  const result=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",S.user.id).is("read_at",null);
  if(result.error){toast("Notifications could not be marked read: "+result.error.message);button.disabled=false;return;}
  S.notifications.forEach(item=>{if(!item.read_at)item.read_at=new Date().toISOString();});
  renderNotifications();toast("All notifications marked as read.");
}
function openNotifications(){
  $("notifications-modal").hidden=false;
  renderNotifications();
  loadNotifications();
}
async function markNotificationGroupRead(items){
  const unread=(items||[]).filter(item=>item?.id&&!item.read_at);
  if(!unread.length)return true;
  const ids=unread.map(item=>item.id),at=new Date().toISOString();
  const result=await db.from("notifications").update({read_at:at}).eq("recipient_id",S.user.id).in("id",ids);
  if(result.error){console.warn("Grouped message notifications could not be marked read:",result.error.message);return false;}
  S.notifications.forEach(item=>{if(ids.includes(item.id))item.read_at=at;});
  renderNotifications();
  return true;
}
async function openNotification(entry){
  const items=entry?.items||[entry];
  const item=entry?.notification||items[0];
  if(!item)return;
  if(items.length>1)await markNotificationGroupRead(items);
  else await markNotificationRead(item.id);
  $("notifications-modal").hidden=true;
  if(item.kind==="message"){
    if(item.conversation_id&&S.chats.some(chat=>chat.id===item.conversation_id))await openChat(item.conversation_id);
    else toast("That conversation is no longer available.");
  }else if(item.kind==="friend_request")await openFriends();
  else if(item.kind==="chat_request")await openRequests();
  else if(item.kind==="feedback_reply")await openFeedback(isFeedbackAdmin(S.user));
  else if(item.kind==="report"&&isFeedbackAdmin(S.user))await openReportsAdmin();
  else if(item.kind==="announcement"&&item.announcement_id)await openAnnouncement(item.announcement_id);
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
        if(!S.messages.some(x=>x.id===message.id)){S.messages.push(withReply);S.messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||a.id.localeCompare(b.id));S.messageReactions[message.id]=[];renderMessages();}
        if(message.sender_id!==uid){
          await markMessagesRead(chat.id,[message]);
          if(!S.unreadDividerMessageId)markChatRead(chat.id,message.created_at);
          await loadUnreadCounts();renderChats();
        }
      }else{
        if(message.sender_id!==uid)showMessageNotification(message,chat);
        await loadUnreadCounts();
      }
      S.chats.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));renderChats();
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages"},payload=>{
      const updated=payload.new;if(!updated?.id)return;
      const index=S.messages.findIndex(message=>message.id===updated.id);
      if(index>=0){S.messages[index]={...S.messages[index],...updated};renderMessages(true);}
      const chat=S.chats.find(item=>item.id===updated.conversation_id);
      if(chat?.last?.id===updated.id)chat.last={...chat.last,...updated};
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},payload=>{
      const record=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!record?.message_id||record.conversation_id!==S.active)return;
      updateMessageReactionCache(record,payload.eventType==="DELETE");
      renderMessages(true);
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
    const row=el("div","request-item");row.append(avatar(p.display_name,p.avatar_data));
    const copy=el("div","request-copy");copy.append(el("strong","",p.display_name),el("small","","@"+p.username));appendFriendPresenceLabel(copy,f.friend_id);row.append(copy);
    const actions=el("div","request-actions");
    const profile=el("button","outline friend-profile-button","Profile"),message=el("button","request-accept","Message"),remove=el("button","request-decline","Remove");
    profile.type=message.type=remove.type="button";
    profile.addEventListener("click",()=>openPublicProfile(f.friend_id));
    message.addEventListener("click",async()=>{ $("friends-modal").hidden=true;await directChat(p); });
    remove.addEventListener("click",()=>removeFriend(f.friend_id));
    actions.append(profile,message,remove);row.append(actions);list.append(row);
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
async function openConversationMemberProfile(userId){
  if(!userId)return;
  if(await canViewMemberProfile(userId))await openPublicProfile(userId);
  else toast("This member is not currently available for private messaging.");
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
    const profileShortcut=!S.selectingConversations&&c.kind==="direct"&&!!peer?.user_id;
    const avatarImage=c.kind==="group"?c.avatar_data:peerProfile?.avatar_data;
    const avatarNode=profileShortcut?el("button","avatar chat-peer-profile-target"):avatar(chatTitle(c),avatarImage);
    if(profileShortcut){
      avatarNode.type="button";
      avatarNode.title="View "+chatTitle(c)+"'s profile";
      avatarNode.setAttribute("aria-label","View "+chatTitle(c)+"'s profile");
      paintAvatar(avatarNode,chatTitle(c),avatarImage);
      avatarNode.addEventListener("click",event=>{
        event.stopPropagation();
        void openConversationMemberProfile(peer.user_id);
      });
    }
    const unreadCount=Number(S.unreadCounts[c.id]||0),unread=unreadCount>0||chatHasUnread(c);
    const chatButton=el("div","chat-item"+(c.id===S.active?" active":"")+(unread?" has-unread":""));
    chatButton.setAttribute("role","group");chatButton.setAttribute("aria-label","Conversation row for "+chatTitle(c));chatButton.tabIndex=0;
    chatButton.append(avatarNode);
    const copy=el("div","chat-copy");
    const name=profileShortcut?el("button","chat-peer-profile-name",chatTitle(c)):el("strong","",chatTitle(c));
    if(profileShortcut){
      name.type="button";
      name.setAttribute("aria-label","View "+chatTitle(c)+"'s profile");
      name.title="View profile";
      name.addEventListener("click",event=>{
        event.stopPropagation();
        void openConversationMemberProfile(peer.user_id);
      });
    }
    copy.append(name);
    let preview=c.last?(c.last.body||(c.last.attachment_path?"Sent an image":"")):chatSub(c);
    if(c.last&&c.last.sender_id===S.user.id)preview="You: "+preview;
    else if(c.kind==="group"&&c.last)preview=(S.profiles[c.last.sender_id]?.display_name||"Member")+": "+preview;
    copy.append(el("span","",preview));
    if(c.kind==="direct")appendFriendPresenceLabel(copy,peer?.user_id);
    if(S.chatSettings.muted[c.id])copy.append(el("small","chat-muted-label","Muted"));
    if(unread){const badge=el("small","unread-count-badge",unreadCount>0?(unreadCount>99?"99+":String(unreadCount)):"New");badge.setAttribute("aria-label",unreadCount>0?unreadCount+" unread messages":"Unread message");copy.append(badge);}
    chatButton.append(copy,el("small","chat-time",dateLabel(c.last?.created_at||c.updated_at)));
    const activate=()=>{
      if(S.selectingConversations){toggleConversationSelection(c.id);return;}
      openChat(c.id);
    };
    chatButton.addEventListener("click",activate);
    chatButton.addEventListener("keydown",event=>{
      if(event.target!==chatButton||(event.key!=="Enter"&&event.key!==" "))return;
      event.preventDefault();activate();
    });
    row.classList.toggle("conversation-row-selecting",S.selectingConversations);
    const selector=el("label","conversation-select-control");
    selector.hidden=!S.selectingConversations;
    const checkbox=el("input");
    checkbox.type="checkbox";checkbox.checked=S.selectedConversationIds.has(c.id);
    checkbox.setAttribute("aria-label","Select "+chatTitle(c));
    checkbox.addEventListener("click",event=>event.stopPropagation());
    checkbox.addEventListener("change",()=>toggleConversationSelection(c.id,checkbox.checked));
    selector.append(checkbox);
    row.append(selector,chatButton);
    list.append(row);
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
  const items=S.deletedMessages.filter(x=>((x.body||(x.attachment_path?"Image attachment":""))+" "+x.sender_name+" "+x.conversation_title).toLowerCase().includes(term));
  $("deleted-count").textContent=items.length;
  if(!items.length){list.append(el("p","muted tiny section-empty",term?"No matching deleted messages.":"No deleted messages. Messages you hide will appear here."));return;}
  items.forEach(item=>{
    const row=el("div","deleted-item");
    row.append(avatar(item.sender_name,S.profiles[item.sender_id]?.avatar_data));
    const copy=el("div","deleted-copy");
    copy.append(el("strong","",item.sender_name));
    copy.append(el("small","",item.conversation_title+" · "+dateLabel(item.created_at)));
    copy.append(el("p","deleted-preview",item.body||(item.attachment_path?"Image attachment":"")));
    const restore=el("button","request-accept","Restore");restore.type="button";
    restore.addEventListener("click",()=>restoreMessage(item.message_id));
    row.append(copy,restore);list.append(row);
  });
}
function toggleConversationSelectionMode(){
  S.selectingConversations=!S.selectingConversations;
  if(!S.selectingConversations)S.selectedConversationIds.clear();
  renderChats();renderConversationSelectionControls();
}
function toggleConversationSelection(conversationId,selected=null){
  if(!S.selectingConversations||!S.chats.some(chat=>chat.id===conversationId))return;
  const shouldSelect=selected===null?!S.selectedConversationIds.has(conversationId):!!selected;
  if(shouldSelect)S.selectedConversationIds.add(conversationId);
  else S.selectedConversationIds.delete(conversationId);
  renderChats();renderConversationSelectionControls();
}
function renderConversationSelectionControls(){
  const button=$("toggle-conversation-select"),actions=$("conversation-selection-actions");
  const count=$("conversation-selection-count"),remove=$("delete-selected-conversations"),pin=$("pin-selected-conversations");
  if(!button||!actions||!count||!remove||!pin)return;
  button.textContent=S.selectingConversations?"Cancel selection":"Select conversations";
  button.setAttribute("aria-pressed",String(S.selectingConversations));
  actions.hidden=!S.selectingConversations;
  const selected=[...S.selectedConversationIds].filter(id=>S.chats.some(chat=>chat.id===id));
  const total=selected.length,allPinned=total>0&&selected.every(id=>S.chatSettings.pinned.includes(id));
  count.textContent=total+" selected";
  remove.disabled=total===0;
  remove.textContent="Delete selected ("+total+")";
  pin.disabled=total===0;
  pin.textContent=(allPinned?"Unpin selected (":"Pin selected (")+total+")";
}
function toggleSelectedConversationPins(){
  if(!S.user||!S.selectingConversations||!S.selectedConversationIds.size)return;
  const selected=[...S.selectedConversationIds].filter(id=>S.chats.some(chat=>chat.id===id));
  if(!selected.length)return;
  const selectedSet=new Set(selected);
  const allPinned=selected.every(id=>S.chatSettings.pinned.includes(id));
  if(allPinned){
    S.chatSettings.pinned=S.chatSettings.pinned.filter(id=>!selectedSet.has(id));
    saveChatSettings();renderChats();renderConversationSelectionControls();
    toast(selected.length+" "+(selected.length===1?"conversation unpinned.":"conversations unpinned."));
    return;
  }
  const existing=new Set(S.chatSettings.pinned);
  const additions=selected.filter(id=>!existing.has(id));
  if(S.chatSettings.pinned.length+additions.length>100){
    toast("You can pin up to 100 conversations. Unpin some conversations first.");
    return;
  }
  S.chatSettings.pinned=[...additions,...S.chatSettings.pinned];
  saveChatSettings();renderChats();renderConversationSelectionControls();
  toast(selected.length+" "+(selected.length===1?"conversation pinned.":"conversations pinned."));
}
async function deleteSelectedConversations(){
  if(!S.user||!S.selectingConversations||!S.selectedConversationIds.size)return;
  const conversations=[...S.selectedConversationIds].filter(id=>S.chats.some(chat=>chat.id===id));
  if(!conversations.length){S.selectedConversationIds.clear();renderChats();renderConversationSelectionControls();return;}
  const count=conversations.length;
  if(!confirm("Move all messages from "+count+" selected "+(count===1?"conversation":"conversations")+" to Deleted messages for your account? Other members will still see them, and you can restore the messages later."))return;
  const button=$("delete-selected-conversations");
  button.disabled=true;button.textContent="Deleting…";
  const ids=[];
  for(let offset=0;;offset+=500){
    const page=await db.from("messages")
      .select("id")
      .in("conversation_id",conversations)
      .order("created_at",{ascending:true})
      .order("id",{ascending:true})
      .range(offset,offset+499);
    if(page.error){
      button.disabled=false;renderConversationSelectionControls();
      toast("Selected conversations could not be loaded: "+page.error.message);
      return;
    }
    const rows=page.data||[];
    ids.push(...rows.map(row=>row.id).filter(id=>!S.deletedMessageIds.has(id)));
    if(rows.length<500)break;
  }
  if(!ids.length){
    S.selectingConversations=false;S.selectedConversationIds.clear();
    renderChats();renderConversationSelectionControls();
    toast("The selected conversations have no messages left to move.");
    return;
  }
  const moved=[];
  for(let offset=0;offset<ids.length;offset+=200){
    const batch=ids.slice(offset,offset+200);
    const entries=batch.map(message_id=>({user_id:S.user.id,message_id}));
    const result=await db.from("user_deleted_messages")
      .upsert(entries,{onConflict:"user_id,message_id",ignoreDuplicates:true});
    if(result.error){
      moved.forEach(id=>S.deletedMessageIds.add(id));
      if(S.active&&conversations.includes(S.active))S.messages=S.messages.filter(message=>!S.deletedMessageIds.has(message.id));
      S.selectingConversations=false;S.selectedConversationIds.clear();
      await loadChats();
      if(S.folder==="deleted")await loadDeletedMessages();
      renderConversationSelectionControls();
      toast(moved.length+" messages were moved before deletion stopped: "+result.error.message);
      return;
    }
    moved.push(...batch);
  }
  moved.forEach(id=>S.deletedMessageIds.add(id));
  if(S.active&&conversations.includes(S.active))S.messages=S.messages.filter(message=>!S.deletedMessageIds.has(message.id));
  S.selectingConversations=false;S.selectedConversationIds.clear();
  await loadChats();
  if(S.folder==="deleted")await loadDeletedMessages();
  renderChats();renderConversationSelectionControls();
  toast(moved.length+" messages from "+count+" "+(count===1?"conversation":"conversations")+" moved to Deleted messages. You can restore them there.");
}
function renderChats(){
  const term=$("filter").value.trim().toLowerCase();
  const standard=$("private-folder-panel"),blocked=$("blocked-panel"),deleted=$("deleted-panel");
  const isStandard=S.folder==="friends"||S.folder==="nonfriends";
  const pinnedIds=new Set(S.chatSettings.pinned);
  const pinnedChats=S.chatSettings.pinned.map(id=>S.chats.find(chat=>chat.id===id)).filter(Boolean);
  $("pinned-chat-section").hidden=!pinnedChats.length;
  renderChatSection("direct","pinned-chat-list","pinned-chat-count",term,pinnedChats);
  standard.hidden=!isStandard;blocked.hidden=S.folder!=="blocked";deleted.hidden=S.folder!=="deleted";
  document.querySelectorAll("[data-folder]").forEach(b=>{
    const active=b.dataset.folder===S.folder;
    b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active));
  });
  if(isStandard){
    $("private-chat-heading").textContent=S.folder==="friends"?"Friends":"Non-friends";
    const friends=new Set(S.friends.map(x=>x.friend_id)),blockedIds=new Set(S.blockedUsers.map(x=>x.blocked_id));
    const chats=S.chats.filter(c=>{
      if(c.kind!=="direct"||pinnedIds.has(c.id))return false;
      const peer=peerForChat(c);if(!peer||blockedIds.has(peer))return false;
      return S.folder==="friends"?friends.has(peer):!friends.has(peer);
    });
    renderChatSection("direct","private-chat-list","private-chat-count",term,chats);
  }else if(S.folder==="blocked")renderBlockedUsers(term);
  else renderDeletedMessages(term);
  renderChatSection("group","group-chat-list","group-chat-count",term,S.chats.filter(chat=>chat.kind==="group"&&!pinnedIds.has(chat.id)));
  renderConversationSelectionControls();
  renderInChatSidebar();
}
function renderInChatSidebar(){
  const pinnedSection=$("in-chat-pinned-section");
  const pinnedList=$("in-chat-pinned-list");
  const allList=$("in-chat-conversation-list");
  const pinnedCount=$("in-chat-pinned-count");
  const allCount=$("in-chat-conversation-count");
  if(!pinnedSection||!pinnedList||!allList||!pinnedCount||!allCount)return;
  const term=($("in-chat-filter")?.value||"").trim().toLowerCase();
  const matches=S.chats.filter(chat=>{
    const searchable=[chatTitle(chat),chatSub(chat),chat.last?.body||""].join(" ").toLowerCase();
    return (!chat.hasMessages||!!chat.last)&&searchable.includes(term);
  });
  const pinnedSet=new Set(S.chatSettings.pinned);
  const sortRecent=(a,b)=>{
    const aTime=new Date(a.last?.created_at||a.updated_at||0).getTime();
    const bTime=new Date(b.last?.created_at||b.updated_at||0).getTime();
    return bTime-aTime;
  };
  const pinned=matches.filter(chat=>pinnedSet.has(chat.id)).sort(sortRecent);
  const regular=matches.filter(chat=>!pinnedSet.has(chat.id)).sort(sortRecent);
  pinnedSection.hidden=!pinned.length;
  pinnedCount.textContent=String(pinned.length);
  allCount.textContent=String(regular.length);
  if(pinned.length)renderChatSection("direct","in-chat-pinned-list","in-chat-pinned-count","",pinned);
  else pinnedList.replaceChildren();
  if(regular.length)renderChatSection("direct","in-chat-conversation-list","in-chat-conversation-count","",regular);
  else{
    allList.replaceChildren();
    allList.append(el("p","muted tiny in-chat-empty",term?"No matching conversations.":"No other conversations yet."));
  }
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
  const messages=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,attachment_path,forwarded_from_id").in("id",ids);
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
  const c=S.chats.find(x=>x.id===S.active);
  $("layout").classList.toggle("direct-chat",c?.kind==="direct");
  $("empty").hidden=!!c;$("chat").hidden=!c;
  $("layout").classList.toggle("in-chat-mode",!!c);
  $("sidebar-home-content").hidden=!!c;
  $("in-chat-sidebar").hidden=!c;
  $("sidebar-title").textContent=c?"Conversations":"Messages";

  const peer=c?.members.find(m=>m.user_id!==S.user.id),peerProfile=peer&&S.profiles[peer.user_id];
  const avatarImage=c?.kind==="group"?c.avatar_data:peerProfile?.avatar_data;
  paintAvatar($("chat-avatar"),chatTitle(c||{kind:"direct",members:[]}),avatarImage);
  $("layout").classList.toggle("show-chat",!!c);
  $("layout").classList.toggle("show-home",!c);
  $("home-open").hidden=!c;
  $("leave-chat").hidden=!c||c.kind!=="group";
  if(!c){
    $("chat-title").hidden=true;
    $("chat-presence-status").hidden=true;
    $("chat-typing-indicator").hidden=true;
    return;
  }
  $("chat-title").textContent=chatTitle(c);$("chat-subtitle").textContent=chatSub(c);
  const peerUserId=c.kind==="direct"?peerForChat(c):null;
  const presence=friendPresenceSummary(peerUserId);
  const presenceNode=$("chat-presence-status");
  presenceNode.hidden=!presence;
  presenceNode.textContent=presence?.text||"";
  presenceNode.classList.toggle("is-online",!!presence?.online);
  renderTypingIndicator();
  const me=c.members.find(x=>x.user_id===S.user.id);
  const canManageGroup=c.kind==="group"&&(me?.role==="owner"||me?.role==="moderator");
  $("chat-title").hidden=c.kind!=="direct";
  $("add-people").hidden=!canManageGroup;
  $("edit-group-photo").hidden=!(c.kind==="group"&&me?.role==="owner");
  $("group-settings-open").hidden=c.kind!=="group";
  $("group-chat-actions").hidden=c.kind!=="group";
  renderDirectControls();renderChats();
}
function renderDirectControls(){
  const c=S.chats.find(x=>x.id===S.active),isDirect=c?.kind==="direct";
  applyChatAppearance(S.active);
  $("block-user").hidden=!isDirect;
  $("select-messages").hidden=false;
  $("select-messages").textContent=S.selectingMessages?"Cancel":"Select";
  $("delete-selected").hidden=!S.selectingMessages||S.selectedMessageIds.size===0;
  $("delete-selected").textContent="Delete selected ("+S.selectedMessageIds.size+")";
  if(!isDirect){$("chat-notice").hidden=true;$("message").disabled=false;$("message").placeholder="Write a message…";$("send").disabled=false;return;}
  const d=S.directStatus,blocked=!d?.can_message;
  $("chat-title").hidden=!d?.can_message;
  $("block-user").disabled=!d||!!d.error;
  $("block-user").textContent=d?.i_blocked?"Unblock":"Block";
  $("message").disabled=blocked;$("send").disabled=blocked;
  $("message").placeholder=blocked?"Private messaging unavailable":"Write a message…";
  $("chat-notice").hidden=!blocked;
  $("chat-notice").textContent=!d?"Checking private chat permissions…":d.error?"Could not verify chat permissions. Refresh the page and try again.":d.i_blocked?"You blocked this member. Unblock them to send private messages. Your previous messages remain visible.":"Private messaging is unavailable in this conversation. Your previous messages remain visible.";
}
async function refreshDirectStatus(conversationId=S.active){
  if(!conversationId||S.active!==conversationId)return;
  const c=S.chats.find(x=>x.id===conversationId),peer=c?.members.find(m=>m.user_id!==S.user.id);
  if(!c||c.kind!=="direct"||!peer){if(S.active!==conversationId)return;S.directStatus=null;renderDirectControls();return;}
  const r=await db.rpc("get_direct_chat_status",{p_other_user_id:peer.user_id});
  if(S.active!==conversationId)return;
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
    S.active=null;S.messages=[];S.messageReactions={};S.pendingReactionKeys.clear();S.openReactionPickerMessageId=null;S.openMessageMenuId=null;S.directStatus=null;
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
  let messages=rows||[];
  if(!messages.length)return messages;
  const ids=[...new Set(messages.map(m=>m.reply_to_id).filter(id=>id&&!S.deletedMessageIds.has(id)))];
  if(ids.length){
    const result=await db.from("messages").select("id,sender_id,body,attachment_path").eq("conversation_id",conversationId).in("id",ids);
    if(result.error)console.warn("Reply previews could not be loaded:",result.error.message);
    const byId=new Map((result.data||[]).map(m=>[m.id,m]));
    messages=messages.map(m=>({...m,reply_preview:m.reply_to_id?(S.deletedMessageIds.has(m.reply_to_id)?{body:"Message hidden"}:(byId.get(m.reply_to_id)||{body:"Original message unavailable"})):null}));
  }else{
    messages=messages.map(m=>({...m,reply_preview:null}));
  }
  const paths=[...new Set(messages.map(m=>m.attachment_path).filter(Boolean))];
  if(paths.length){
    const result=await db.storage.from("gather-message-images").createSignedUrls(paths,3600);
    if(result.error)console.warn("Message images could not be opened:",result.error.message);
    const byPath=new Map((result.data||[]).filter(x=>x.signedUrl).map(x=>[x.path,x.signedUrl]));
    messages=messages.map(m=>({...m,image_url:m.attachment_path?(byPath.get(m.attachment_path)||null):null}));
  }
  return messages;
}
async function loadMessageReads(conversationId,messageIds){
  const ids=[...new Set((messageIds||[]).filter(Boolean))];if(!ids.length)return;
  if(S.active!==conversationId)return;
  const result=await db.from("message_reads").select("message_id,user_id,read_at").eq("conversation_id",conversationId).in("message_id",ids);
  if(S.active!==conversationId)return;
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
  if(!entries.length)return true;
  const result=await db.from("message_reads").upsert(entries,{onConflict:"message_id,user_id",ignoreDuplicates:true});
  if(result.error){console.warn("Message read receipts could not be saved:",result.error.message);return false;}
  entries.forEach(entry=>{
    const readers=S.messageReads[entry.message_id]||(S.messageReads[entry.message_id]=[]);
    if(!readers.some(x=>x.user_id===entry.user_id))readers.push({...entry,read_at:new Date().toISOString()});
  });
  return true;
}
function subscribeMessageReads(conversationId){
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  S.readChannel=db.channel("read-receipts-"+conversationId)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"message_reads",filter:"conversation_id=eq."+conversationId},async payload=>{
      const receipt=payload.new;if(!receipt?.message_id||!receipt.user_id)return;
      const readers=S.messageReads[receipt.message_id]||(S.messageReads[receipt.message_id]=[]);
      if(!readers.some(x=>x.user_id===receipt.user_id))readers.push(receipt);
      if(receipt.user_id===S.user.id&&!S.suppressReadDividerUpdates)await loadOldestUnreadTarget(conversationId);
      renderMessages();
    }).subscribe();
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
  const result=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,reply_to_id,attachment_path,forwarded_from_id").eq("conversation_id",conversationId).or("created_at.lt."+oldest+",and(created_at.eq."+oldest+",id.lt."+S.messages[0].id+")").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  S.loadingOlder=false;
  if(result.error){toast("Older messages could not be loaded: "+result.error.message);return;}
  if(S.active!==conversationId)return;
  const raw=result.data||[];S.hasOlderMessages=raw.length===300;
  const visible=raw.filter(m=>!S.deletedMessageIds.has(m.id));
  const withReplies=await attachReplyPreviews(visible,conversationId);
  const existing=new Set(S.messages.map(m=>m.id));
  S.messages=[...withReplies.filter(m=>!existing.has(m.id)).reverse(),...S.messages];
  await loadMessagePolls(conversationId,withReplies.map(m=>m.id));
  await loadMessageReactions(conversationId,withReplies.map(m=>m.id),true);
  await loadMessageReads(conversationId,withReplies.map(m=>m.id));
  if(S.active!==conversationId)return;
  updateUnreadDivider(conversationId);
  await loadUnreadCounts();renderChats();
  renderMessages(true);
}

function renderTypingIndicator(){
  const node=$("chat-typing-indicator");
  if(!node)return;
  const chat=S.chats.find(item=>item.id===S.active);
  const users=[...S.typingUsers.keys()].filter(id=>id!==S.user?.id);
  if(!chat||!users.length){node.hidden=true;node.textContent="";return;}
  if(chat.kind==="direct")node.textContent="Typing…";
  else if(users.length===1)node.textContent=(S.profiles[users[0]]?.display_name||"A group member")+" is typing…";
  else node.textContent=users.length+" people are typing…";
  node.hidden=false;
}
function sendTypingSignal(isTyping){
  const channel=S.typingChannel,userId=S.user?.id;
  if(!channel||!S.typingReady||!userId)return;
  channel.send({type:"broadcast",event:"typing",payload:{user_id:userId,typing:!!isTyping}})
    .then(status=>{if(status!=="ok")console.warn("Typing indicator update was not delivered:",status);})
    .catch(error=>console.warn("Typing indicator update failed:",error));
}
function stopTyping(sendStop=true){
  if(S.typingStopTimer){clearTimeout(S.typingStopTimer);S.typingStopTimer=null;}
  if(S.typingSent&&sendStop)sendTypingSignal(false);
  S.typingSent=false;S.typingLastSentAt=0;
}
function updateLocalTyping(){
  const field=$("message");
  if(!field||!S.typingChannel||!S.typingReady)return;
  if(!field.value.trim()){stopTyping(true);return;}
  const now=Date.now();
  if(!S.typingSent||now-S.typingLastSentAt>=2500){
    S.typingSent=true;S.typingLastSentAt=now;sendTypingSignal(true);
  }
  if(S.typingStopTimer)clearTimeout(S.typingStopTimer);
  S.typingStopTimer=setTimeout(()=>stopTyping(true),1800);
}
function handleTypingBroadcast(chatId,payload){
  if(S.active!==chatId||!payload?.user_id||payload.user_id===S.user?.id)return;
  if(payload.typing)S.typingUsers.set(payload.user_id,Date.now());
  else S.typingUsers.delete(payload.user_id);
  renderTypingIndicator();
  if(S.typingRemoteTimer)clearTimeout(S.typingRemoteTimer);
  if(S.typingUsers.size){
    S.typingRemoteTimer=setTimeout(()=>{
      const cutoff=Date.now()-6500;
      for(const [userId,lastUpdate] of S.typingUsers.entries())if(lastUpdate<cutoff)S.typingUsers.delete(userId);
      renderTypingIndicator();
      if(S.typingUsers.size){
        S.typingRemoteTimer=setTimeout(()=>{
          const latestCutoff=Date.now()-6500;
          for(const [userId,lastUpdate] of S.typingUsers.entries())if(lastUpdate<latestCutoff)S.typingUsers.delete(userId);
          renderTypingIndicator();
        },6500);
      }
    },6500);
  }
}
function closeTypingChannel(){
  stopTyping(true);
  const channel=S.typingChannel;S.typingChannel=null;S.typingReady=false;S.typingSent=false;S.typingLastSentAt=0;
  if(S.typingRemoteTimer){clearTimeout(S.typingRemoteTimer);S.typingRemoteTimer=null;}
  S.typingUsers.clear();renderTypingIndicator();
  if(channel)db.removeChannel(channel);
}
function subscribeTyping(conversationId){
  const chat=S.chats.find(item=>item.id===conversationId);
  if(!chat||!S.user)return;
  const channel=db.channel("gather-chat:"+conversationId,{config:{private:true,broadcast:{ack:false,self:false}}});
  S.typingChannel=channel;S.typingReady=false;
  channel.on("broadcast",{event:"typing"},event=>handleTypingBroadcast(conversationId,event.payload));
  channel.subscribe((status,error)=>{
    if(S.active!==conversationId||S.typingChannel!==channel)return;
    if(status==="SUBSCRIBED"){
      S.typingReady=true;
      updateLocalTyping();
    }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
      console.warn("Typing indicator connection failed:",error||status);
    }
  });
}

async function openChat(id){
  closeConversationDrawer();
  saveActiveChatDraft();
  clearUnreadDividerState();
  closeTypingChannel();
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  if(S.pollChannel){db.removeChannel(S.pollChannel);S.pollChannel=null;}
  clearPendingMessageImage();
  S.active=id;S.unreadTargetMessageId=null;S.unreadTargetLoaded=false;restoreChatDraft(id);S.selectingMessages=false;S.selectedMessageIds.clear();S.directStatus=null;
  S.messages=[];S.messageReads={};S.messageReactions={};S.messagePolls={};S.pinnedMessages=[];S.forwardMessage=null;S.pendingReactionKeys.clear();S.openReactionPickerMessageId=null;S.openMessageMenuId=null;S.replyTo=null;S.hasOlderMessages=false;S.loadingOlder=false;renderReplyComposer();
  $("messages").replaceChildren(el("p","muted messages-loading","Loading messages…"));
  $("layout").classList.remove("show-home");$("layout").classList.add("show-chat");renderActive();
  subscribeTyping(id);
  await Promise.all([refreshDirectStatus(id),loadMessages(id),loadOldestUnreadTarget(id)]);
  if(S.active!==id)return;
  subscribeMessageReads(id);subscribePollVotes(id);await loadUnreadCounts();renderChats();
}
async function loadMessages(id){
  const r=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,reply_to_id,attachment_path,forwarded_from_id").eq("conversation_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  if(S.active!==id)return;
  if(r.error){$("messages").replaceChildren(el("p","status error","Messages could not be loaded. Please try again."));toast("Messages could not be loaded: "+r.error.message);return;}
  const raw=r.data||[];S.hasOlderMessages=raw.length===300;
  const loadedMessages=await attachReplyPreviews(raw.filter(m=>!S.deletedMessageIds.has(m.id)).reverse(),id);
  if(S.active!==id)return;
  S.messages=loadedMessages;
  if(S.active!==id)return;
  renderMessages();
  await Promise.all([
    loadMessagePolls(id,S.messages.map(m=>m.id)),
    loadPinnedMessages(id),
    loadSavedMessageIds(),
    loadMessageReactions(id,S.messages.map(m=>m.id)),
    loadMessageReads(id,S.messages.map(m=>m.id))
  ]);
  if(S.active!==id)return;
  updateUnreadDivider(id);
  renderMessages(true);
}

function updateMessageReactionCache(record,removed=false){
  if(!record?.message_id||record.conversation_id!==S.active)return;
  const rows=S.messageReactions[record.message_id]||(S.messageReactions[record.message_id]=[]);
  if(removed){
    S.messageReactions[record.message_id]=rows.filter(item=>item.id!==record.id);
    return;
  }
  if(!rows.some(item=>item.id===record.id))rows.push(record);
}
async function loadMessageReactions(conversationId,messageIds,merge=false){
  const ids=[...new Set((messageIds||[]).filter(Boolean))];
  if(!S.user||S.active!==conversationId||!ids.length)return false;
  const collected=[];
  for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100);
    for(let offset=0;;offset+=1000){
      const result=await db.from("message_reactions")
        .select("id,message_id,conversation_id,user_id,emoji,created_at")
        .eq("conversation_id",conversationId).in("message_id",batch)
        .order("created_at",{ascending:true}).range(offset,offset+999);
      if(S.active!==conversationId)return false;
      if(result.error){console.warn("Message reactions could not be loaded:",result.error.message);return false;}
      collected.push(...(result.data||[]));
      if((result.data||[]).length<1000)break;
    }
  }
  const next={...S.messageReactions};
  ids.forEach(id=>{if(!next[id])next[id]=[];});
  collected.forEach(record=>{
    const rows=next[record.message_id]||(next[record.message_id]=[]);
    if(!rows.some(item=>item.id===record.id))rows.push(record);
  });
  S.messageReactions=next;
  return true;
}
function renderMessageReactionArea(message){
  const reactions=S.messageReactions[message.id]||[];
  const pickerOpen=!S.selectingMessages&&S.openReactionPickerMessageId===message.id;
  if(!reactions.length&&!pickerOpen)return null;
  const area=el("div","message-reaction-area");
  if(reactions.length){
    const groups=new Map();
    reactions.forEach(reaction=>{
      const group=groups.get(reaction.emoji)||{emoji:reaction.emoji,count:0,mine:false};
      group.count++;
      if(reaction.user_id===S.user?.id)group.mine=true;
      groups.set(reaction.emoji,group);
    });
    const badges=el("div","message-reactions");
    groups.forEach(group=>{
      const badge=el(S.selectingMessages?"span":"button","message-reaction"+(group.mine?" is-mine":""),
        group.emoji+" "+group.count);
      if(!S.selectingMessages){
        badge.type="button";
        badge.setAttribute("aria-label",group.emoji+" reaction, "+group.count+" total"+(group.mine?", including yours":""));
        badge.setAttribute("aria-pressed",String(group.mine));
        badge.addEventListener("click",event=>{
          event.stopPropagation();
          toggleMessageReaction(message.id,group.emoji);
        });
      }
      badges.append(badge);
    });
    area.append(badges);
  }
  if(pickerOpen){
    const picker=el("div","message-reaction-picker");
    picker.setAttribute("role","group");
    picker.setAttribute("aria-label","Choose a reaction");
    MESSAGE_REACTION_EMOJIS.forEach(emoji=>{
      const option=el("button","message-reaction-option",emoji);
      option.type="button";
      option.setAttribute("aria-label","React with "+emoji);
      option.addEventListener("click",event=>{
        event.stopPropagation();
        toggleMessageReaction(message.id,emoji);
      });
      picker.append(option);
    });
    area.append(picker);
  }
  return area;
}
async function toggleMessageReaction(messageId,emoji){
  const conversationId=S.active,message=S.messages.find(item=>item.id===messageId);
  if(!S.user||!conversationId||!message||S.selectingMessages||!MESSAGE_REACTION_EMOJIS.includes(emoji))return;
  const key=messageId+":"+emoji;
  if(S.pendingReactionKeys.has(key))return;
  S.pendingReactionKeys.add(key);
  const existing=(S.messageReactions[messageId]||[]).find(item=>item.user_id===S.user.id&&item.emoji===emoji);
  const result=existing
    ?await db.from("message_reactions").delete().eq("id",existing.id).eq("user_id",S.user.id)
    :await db.from("message_reactions").insert({message_id:messageId,conversation_id:conversationId,user_id:S.user.id,emoji})
      .select("id,message_id,conversation_id,user_id,emoji,created_at").single();
  S.pendingReactionKeys.delete(key);
  S.openReactionPickerMessageId=null;
  if(result.error){
    toast("Reaction could not be saved: "+result.error.message);
    renderMessages(true);return;
  }
  if(existing)updateMessageReactionCache(existing,true);
  else if(result.data)updateMessageReactionCache(result.data,false);
  
  
  renderMessages(true);
}


function messagePreviewText(m){return m?.body||(m?.attachment_path?"Photo":"Message");}
async function loadMessagePolls(cid,ids){
  ids=[...new Set((ids||[]).filter(Boolean))];if(!S.user||S.active!==cid||!ids.length)return;
  const p=await db.from("message_polls").select("id,message_id,conversation_id,created_by,question,created_at").eq("conversation_id",cid).in("message_id",ids);
  if(p.error){console.warn("Polls failed to load:",p.error.message);return;}
  if(S.active!==cid)return;
  const next={...S.messagePolls};ids.forEach(id=>delete next[id]);const polls=p.data||[];
  if(polls.length){
    const pids=polls.map(x=>x.id);
    const [o,v]=await Promise.all([
      db.from("message_poll_options").select("id,poll_id,conversation_id,label,position").eq("conversation_id",cid).in("poll_id",pids).order("position"),
      db.from("message_poll_votes").select("poll_id,option_id,user_id,created_at").eq("conversation_id",cid).in("poll_id",pids)
    ]);
    if(o.error||v.error){console.warn("Poll data failed:",o.error?.message||v.error?.message);return;}
    if(S.active!==cid)return;
    polls.forEach(x=>next[x.message_id]={...x,options:(o.data||[]).filter(y=>y.poll_id===x.id),votes:(v.data||[]).filter(y=>y.poll_id===x.id)});
  }S.messagePolls=next;
}
async function loadPinnedMessages(cid){
  if(!S.user||S.active!==cid)return;
  const r=await db.from("message_pins").select("conversation_id,message_id,pinned_by,created_at").eq("conversation_id",cid).order("created_at",{ascending:false});
  if(r.error){console.warn("Pins failed:",r.error.message);return;}
  if(S.active!==cid)return;
  const pins=r.data||[],ids=pins.map(x=>x.message_id),m=ids.length?await db.from("messages").select("id,body,attachment_path").in("id",ids):{data:[]};
  if(S.active!==cid)return;
  const map=new Map((m.data||[]).map(x=>[x.id,x]));S.pinnedMessages=pins.map(x=>({...x,message:map.get(x.message_id)||null}));
}
async function loadSavedMessageIds(){
  if(!S.user)return;const r=await db.from("saved_messages").select("message_id").eq("user_id",S.user.id).limit(1000);
  if(r.error){console.warn("Saved items failed:",r.error.message);return;}S.savedMessageIds=new Set((r.data||[]).map(x=>x.message_id));
}
function subscribePollVotes(cid){
  if(S.pollChannel)db.removeChannel(S.pollChannel);if(!S.user)return;
  S.pollChannel=db.channel("poll-votes-"+cid).on("postgres_changes",{event:"*",schema:"public",table:"message_poll_votes",filter:"conversation_id=eq."+cid},async()=>{
    if(S.active===cid){await loadMessagePolls(cid,S.messages.map(x=>x.id));renderMessages(true);}
  }).subscribe();
}
async function voteInPoll(mid,oid){
  const p=S.messagePolls[mid];if(!p||!S.user)return;const mine=p.votes.find(x=>x.user_id===S.user.id);
  if(mine?.option_id===oid){const r=await db.from("message_poll_votes").delete().eq("poll_id",p.id).eq("user_id",S.user.id);if(r.error){toast(r.error.message);return;}}
  else{
    if(mine){const d=await db.from("message_poll_votes").delete().eq("poll_id",p.id).eq("user_id",S.user.id);if(d.error){toast(d.error.message);return;}}
    const r=await db.from("message_poll_votes").insert({poll_id:p.id,option_id:oid,conversation_id:S.active,user_id:S.user.id});if(r.error){toast(r.error.message);return;}
  }
  await loadMessagePolls(S.active,[mid]);renderMessages(true);
}
function renderPollCard(m,p){
  if(!p)return null;const card=el("section","message-poll-card"),head=el("div","message-poll-heading");
  head.append(el("strong","","Poll"),el("small","",p.votes.length+" vote"+(p.votes.length===1?"":"s")));
  card.append(head,el("p","message-poll-question",p.question));
  const mine=p.votes.find(x=>x.user_id===S.user?.id),total=p.votes.length,choices=el("div","message-poll-options");
  p.options.forEach(o=>{
    const count=p.votes.filter(x=>x.option_id===o.id).length,b=el("button","message-poll-option"+(mine?.option_id===o.id?" is-voted":""));b.type="button";
    b.setAttribute("aria-pressed",String(mine?.option_id===o.id));
    const top=el("span","message-poll-option-top");top.append(el("span","",o.label),el("strong","",String(count)));
    const track=el("span","message-poll-track"),fill=el("span","message-poll-fill");fill.style.width=(total?Math.round(count/total*100):0)+"%";track.append(fill);
    b.append(top,track);b.addEventListener("click",()=>voteInPoll(m.id,o.id));choices.append(b);
  });
  card.append(choices,el("small","message-poll-footer",mine?"Your vote is recorded · Tap another option to change it":"Choose one option to vote"));return card;
}
async function togglePinnedMessage(m){
  const exists=S.pinnedMessages.some(x=>x.message_id===m.id);
  const r=exists?await db.from("message_pins").delete().eq("conversation_id",S.active).eq("message_id",m.id):await db.from("message_pins").insert({conversation_id:S.active,message_id:m.id,pinned_by:S.user.id});
  if(r.error){toast("Pin update failed: "+r.error.message);return;}await loadPinnedMessages(S.active);renderMessages(true);toast(exists?"Message unpinned.":"Message pinned.");
}
function renderPinnedMessageBanner(){
  if(!S.pinnedMessages.length)return null;const pin=S.pinnedMessages[0],b=el("button","pinned-message-banner");b.type="button";
  const copy=el("span","pinned-message-copy");copy.append(el("strong","","Pinned message"+(S.pinnedMessages.length>1?" · "+S.pinnedMessages.length+" pinned":"")),el("small","",messagePreviewText(pin.message)));
  b.append(el("span","pinned-message-mark","⌖"),copy,el("span","pinned-message-arrow","›"));b.addEventListener("click",()=>jumpToPinnedMessage(pin.message_id));return b;
}
async function jumpToPinnedMessage(id){
  const cid=S.active;while(S.active===cid&&!S.messages.some(x=>x.id===id)&&S.hasOlderMessages)await loadOlderMessages();
  const row=document.querySelector('[data-message-id="'+id+'"]');if(row){row.scrollIntoView({block:"center",behavior:"smooth"});row.classList.add("search-highlight");setTimeout(()=>row.classList.remove("search-highlight"),2400);}else toast("Pinned message could not be loaded.");
}
async function toggleSavedMessage(m){
  const saved=S.savedMessageIds.has(m.id),r=saved?await db.from("saved_messages").delete().eq("user_id",S.user.id).eq("message_id",m.id):await db.from("saved_messages").insert({user_id:S.user.id,message_id:m.id,conversation_id:m.conversation_id||S.active});
  if(r.error){toast(r.error.message);return;}if(saved)S.savedMessageIds.delete(m.id);else S.savedMessageIds.add(m.id);
  renderMessages(true);if(!$("saved-messages-modal").hidden)await renderSavedMessages();toast(saved?"Removed from saved messages.":"Message saved.");
}
async function copyMessage(m){
  const value=m.body||(m.attachment_path?"Photo":"Message");
  try{await navigator.clipboard.writeText(value);toast("Message copied.");}
  catch(e){const t=el("textarea");t.value=value;t.style.position="fixed";document.body.append(t);t.select();const ok=document.execCommand("copy");t.remove();toast(ok?"Message copied.":"Could not copy this message.");}
}
function openForwardMessage(m){S.forwardMessage=m;$("forward-message-modal").hidden=false;renderForwardDestinations();}
function renderForwardDestinations(){
  const list=$("forward-message-list");list.replaceChildren();const chats=S.chats.filter(x=>x.id!==S.active);
  if(!chats.length){list.append(el("p","muted tiny","Start another conversation before forwarding a message."));return;}
  chats.forEach(c=>{const b=el("button","forward-message-choice");b.type="button";b.dataset.destination=c.id;b.append(el("strong","",chatTitle(c)),el("small","",c.kind==="group"?"Group chat":"Private chat"));b.addEventListener("click",()=>forwardMessageToConversation(c.id));list.append(b);});
}
async function duplicateStoredAttachment(bucket,path,cid){
  const d=await db.storage.from(bucket).download(path);if(d.error)throw new Error(d.error.message);
  const ext=(path.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8)||"bin",key=crypto.randomUUID?crypto.randomUUID():Date.now().toString(36);
  const target=cid+"/"+S.user.id+"_"+key+"."+ext,put=await db.storage.from(bucket).upload(target,d.data,{contentType:d.data.type||"application/octet-stream",cacheControl:"3600",upsert:false});
  if(put.error)throw new Error(put.error.message);return target;
}
async function forwardMessageToConversation(cid){
  const m=S.forwardMessage,c=S.chats.find(x=>x.id===cid);if(!m||!c||!S.user)return;
  if(c.kind==="direct"){
    const s=await db.rpc("get_direct_chat_status",{p_other_user_id:peerForChat(c)});
    if(s.error||!s.data?.can_message){toast("Private messaging is unavailable in that conversation.");return;}
  }
  const b=$("forward-message-list").querySelector('[data-destination="'+cid+'"]');if(b)b.disabled=true;
  let image=null,messageId=null;
  try{
    if(m.attachment_path)image=await duplicateStoredAttachment("gather-message-images",m.attachment_path,cid);
    const sent=await db.from("messages").insert({
      conversation_id:cid,sender_id:S.user.id,body:m.body||"",attachment_path:image,forwarded_from_id:m.id
    }).select("id").single();
    if(sent.error)throw new Error(sent.error.message);
    messageId=sent.data.id;
    const sourcePoll=S.messagePolls[m.id];
    if(sourcePoll){
      const poll=await db.from("message_polls").insert({
        message_id:messageId,conversation_id:cid,created_by:S.user.id,question:sourcePoll.question
      }).select("id").single();
      if(poll.error)throw new Error("The message was forwarded, but its poll could not be copied: "+poll.error.message);
      const options=await db.from("message_poll_options").insert(
        sourcePoll.options.map(option=>({poll_id:poll.data.id,conversation_id:cid,label:option.label,position:option.position}))
      );
      if(options.error)throw new Error("The message was forwarded, but its poll choices could not be copied: "+options.error.message);
    }
    $("forward-message-modal").hidden=true;S.forwardMessage=null;await loadChats();toast("Message forwarded.");
  }catch(e){
    if(messageId){const rollback=await db.from("messages").delete().eq("id",messageId);if(rollback.error)console.warn("Forward rollback failed:",rollback.error.message);}
    if(image){const cleanup=await db.storage.from("gather-message-images").remove([image]);if(cleanup.error)console.warn("Forwarded image cleanup failed:",cleanup.error.message);}
    if(b)b.disabled=false;toast("Forward failed: "+e.message);
  }
}
async function renderSavedMessages(){
  const list=$("saved-message-list");list.replaceChildren(el("p","muted tiny","Loading saved messages…"));
  const marks=await db.from("saved_messages").select("message_id,conversation_id,created_at").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(500);
  if(marks.error){list.replaceChildren(el("p","status error",marks.error.message));return;}
  const rows=(marks.data||[]).filter(x=>!S.deletedMessageIds.has(x.message_id));if(!rows.length){list.replaceChildren(el("p","muted tiny","You have not saved any messages yet."));return;}
  S.savedMessageIds=new Set((marks.data||[]).map(x=>x.message_id));
  const r=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,attachment_path").in("id",rows.map(x=>x.message_id));
  if(r.error){list.replaceChildren(el("p","status error",r.error.message));return;}
  const enriched=[];for(const cid of [...new Set((r.data||[]).map(x=>x.conversation_id))])enriched.push(...await attachReplyPreviews((r.data||[]).filter(x=>x.conversation_id===cid),cid));
  const map=new Map(enriched.map(x=>[x.id,x]));list.replaceChildren();
  rows.forEach(mark=>{const m=map.get(mark.message_id);if(!m)return;const card=el("article","saved-message-card"),open=el("button","saved-message-open");open.type="button";
    const chat=S.chats.find(x=>x.id===m.conversation_id),name=m.sender_id===S.user.id?"You":(S.profiles[m.sender_id]?.display_name||"Member");
    open.append(el("strong","",chat?chatTitle(chat):"Conversation"),el("small","",name+" · "+dateLabel(m.created_at)),el("span","",messagePreviewText(m)));open.addEventListener("click",()=>openSavedMessage(m));
    const remove=el("button","saved-message-remove","Remove");remove.type="button";remove.addEventListener("click",()=>removeSavedMessage(m.id));card.append(open,remove);list.append(card);
  });
}
async function openSavedMessages(){$("chat-actions-modal").hidden=true;$("saved-messages-modal").hidden=false;await renderSavedMessages();}
async function removeSavedMessage(id){const r=await db.from("saved_messages").delete().eq("user_id",S.user.id).eq("message_id",id);if(r.error){toast(r.error.message);return;}S.savedMessageIds.delete(id);await renderSavedMessages();renderMessages(true);}
async function openSavedMessage(m){
  $("saved-messages-modal").hidden=true;await openChat(m.conversation_id);let row=document.querySelector('[data-message-id="'+m.id+'"]');
  while(!row&&S.hasOlderMessages){await loadOlderMessages();row=document.querySelector('[data-message-id="'+m.id+'"]');}
  if(row)row.scrollIntoView({block:"center",behavior:"smooth"});else toast("Saved message could not be loaded.");
}
function openPollComposer(){
  closeComposerMoreMenu();if(!S.active){toast("Open a conversation first.");return;}const c=S.chats.find(x=>x.id===S.active);
  if(c?.kind==="direct"&&!S.directStatus?.can_message){toast("Private messaging is unavailable.");return;}
  $("poll-question").value="";$("poll-options-inputs").replaceChildren();addPollOptionInput();addPollOptionInput();status("poll-status","");$("poll-create-modal").hidden=false;
}
function addPollOptionInput(){
  const box=$("poll-options-inputs");if(box.children.length>=6){toast("Polls can have up to six options.");return;}
  const n=box.children.length+1,row=el("label","poll-option-entry"),name=el("span","","Option "+n),input=el("input","poll-option-value");
  input.maxLength=80;input.required=true;input.placeholder="Choice "+n;row.append(name,input);
  if(n>2){const remove=el("button","poll-option-remove","×");remove.type="button";remove.addEventListener("click",()=>{row.remove();[...box.children].forEach((r,i)=>{r.querySelector("span").textContent="Option "+(i+1);r.querySelector("input").placeholder="Choice "+(i+1);});});row.append(remove);}
  box.append(row);
}
async function submitPoll(e){
  e.preventDefault();const cid=S.active,c=S.chats.find(x=>x.id===cid),question=$("poll-question").value.trim(),opts=[...$("poll-options-inputs").querySelectorAll("input")].map(x=>x.value.trim()).filter(Boolean);
  if(!cid||!question||question.length>200||opts.length<2||opts.length>6){status("poll-status","Enter a question and at least two options.","error");return;}
  if(new Set(opts.map(x=>x.toLowerCase())).size!==opts.length){status("poll-status","Poll choices must be different.","error");return;}
  if(c?.kind==="direct"&&!S.directStatus?.can_message){status("poll-status","Private messaging is unavailable.","error");return;}
  const b=$("poll-submit");b.disabled=true;status("poll-status","Creating poll…");
  const m=await db.from("messages").insert({conversation_id:cid,sender_id:S.user.id,body:question,attachment_path:null}).select("id").single();
  if(m.error){b.disabled=false;status("poll-status",m.error.message,"error");return;}
  const p=await db.from("message_polls").insert({message_id:m.data.id,conversation_id:cid,created_by:S.user.id,question}).select("id").single();
  if(p.error){await db.from("messages").delete().eq("id",m.data.id);b.disabled=false;status("poll-status",p.error.message,"error");return;}
  const o=await db.from("message_poll_options").insert(opts.map((label,position)=>({poll_id:p.data.id,conversation_id:cid,label,position})));
  if(o.error){await db.from("messages").delete().eq("id",m.data.id);b.disabled=false;status("poll-status",o.error.message,"error");return;}
  $("poll-create-modal").hidden=true;b.disabled=false;await loadMessages(cid);await loadChats();toast("Poll created.");
}
function renderMessages(preserveScroll=false){
  const list=$("messages"),previousHeight=list.scrollHeight,previousTop=list.scrollTop;list.replaceChildren();
  const activeChat=S.chats.find(chat=>chat.id===S.active);
  const showSenderNames=activeChat?.kind==="group";
  const latestOwnMessageId=[...S.messages].reverse().find(message=>message.sender_id===S.user.id)?.id||null;
  const pinnedBanner=renderPinnedMessageBanner();if(pinnedBanner)list.append(pinnedBanner);
  if(!S.messages.length){
    list.append(el("p","muted tiny","This is the beginning of the conversation. Say hello."));
    return;
  }
  S.messages.forEach((m,index)=>{
    const mine=m.sender_id===S.user.id,p=S.profiles[m.sender_id];
    const samePrevious=S.messages[index-1]?.sender_id===m.sender_id;
    const sameNext=S.messages[index+1]?.sender_id===m.sender_id;
    const grouping=samePrevious?(sameNext?" group-middle":" group-last"):(sameNext?" group-first":"");
    if(S.unreadDividerMessageId===m.id)list.append(el("div","new-messages-divider","New messages"));
    const row=el("div","message"+(mine?" mine":"")+grouping+(samePrevious?" group-continued":""));
    row.dataset.messageId=m.id;
    const bubble=el("div","bubble"),meta=el("div","meta");
    if(showSenderNames){
      if(!samePrevious){
        if(mine)meta.append(el("strong","","You"));
        else {
          const author=el("button","message-profile-link",p?.display_name||"Member");
          author.type="button";
          author.addEventListener("click",()=>openPublicProfile(m.sender_id));
          meta.append(author);
        }
      }else meta.classList.add("meta-continued");
    }
    meta.append(el("time","",new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})));
    if(m.forwarded_from_id)meta.append(el("small","message-forwarded-label","Forwarded"));
    if(m.edited_at)meta.append(el("small","message-edited-label","edited"));
    if(!S.selectingMessages){
      const menuWrap=el("div","message-menu-wrap");
      const trigger=el("button","message-action-trigger","⋯");
      trigger.type="button";
      trigger.setAttribute("aria-label","Message actions");
      trigger.setAttribute("aria-haspopup","menu");
      trigger.setAttribute("aria-expanded",String(S.openMessageMenuId===m.id));
      trigger.addEventListener("click",event=>{
        event.stopPropagation();
        S.openReactionPickerMessageId=null;
        S.openReactionPickerMessageId=null;
        S.openMessageMenuId=S.openMessageMenuId===m.id?null:m.id;
        renderMessages(true);
      });
      const menu=el("div","message-action-menu");
      menu.hidden=S.openMessageMenuId!==m.id;
      menu.setAttribute("role","menu");
      const addAction=(label,handler)=>{
        const action=el("button","",label);
        action.type="button";
        action.setAttribute("role","menuitem");
        action.addEventListener("click",event=>{
          event.stopPropagation();
          S.openMessageMenuId=null;
          renderMessages(true);
          handler();
        });
        menu.append(action);
      };
      addAction("Reply",()=>beginReply(m));
      addAction(S.openReactionPickerMessageId===m.id?"Close reaction picker":"React",()=>{S.openReactionPickerMessageId=S.openReactionPickerMessageId===m.id?null:m.id;renderMessages(true);});
      if(mine&&m.body)addAction("Edit",()=>editOwnMessage(m));
      addAction("Copy message",()=>copyMessage(m));
      addAction("Forward message",()=>openForwardMessage(m));
      addAction(S.pinnedMessages.some(x=>x.message_id===m.id)?"Unpin message":"Pin message",()=>togglePinnedMessage(m));
      addAction(S.savedMessageIds.has(m.id)?"Remove saved message":"Save message",()=>toggleSavedMessage(m));
      if(!mine&&m.sender_id)addAction("Report",()=>openReport(m.sender_id,m.id));
      menuWrap.append(trigger,menu);
      meta.append(menuWrap);
    }
    bubble.append(meta);
    if(m.reply_to_id){
      const quote=el("div","reply-preview"),target=m.reply_preview;
      const quoteName=target?.sender_id?(target.sender_id===S.user.id?"You":(S.profiles[target.sender_id]?.display_name||"Member")):"Reply";
      if(showSenderNames)quote.append(el("strong","",quoteName));
      quote.append(el("span","",target?.body||(target?.attachment_path?"Sent an image":"Original message unavailable.")));
      bubble.append(quote);
    }
    if(m.attachment_path){
      if(m.image_url){
        const link=el("a","message-image-link");
        link.href=m.image_url;link.target="_blank";link.rel="noopener noreferrer";
        link.setAttribute("aria-label","Open image in a new tab");
        const image=el("img","message-image");
        image.src=m.image_url;image.alt="Image sent by "+(p?.display_name||"a Gather member");
        image.loading="lazy";image.decoding="async";
        link.append(image);bubble.append(link);
      }else bubble.append(el("p","message-image-unavailable","Image unavailable"));
    }
    if(m.body&&!S.messagePolls[m.id])bubble.append(el("div","body-text",m.body));
    const pollArea=renderPollCard(m,S.messagePolls[m.id]);if(pollArea)bubble.append(pollArea);
    const reactionArea=renderMessageReactionArea(m);
    if(reactionArea)bubble.append(reactionArea);
    if(mine&&m.id===latestOwnMessageId){
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
      const pick=el("label","message-select"),check=el("input");
      check.type="checkbox";
      check.checked=S.selectedMessageIds.has(m.id);
      check.setAttribute("aria-label","Select this message");
      check.addEventListener("change",()=>{
        if(check.checked)S.selectedMessageIds.add(m.id);
        else S.selectedMessageIds.delete(m.id);
        renderMessages();renderActive();
      });
      pick.append(check,el("span","","Select message"));
      bubble.append(pick);
      row.classList.toggle("selected",S.selectedMessageIds.has(m.id));
    }
    row.append(bubble);list.append(row);
  });
  if(preserveScroll)list.scrollTop=previousTop+(list.scrollHeight-previousHeight);
  else list.scrollTop=list.scrollHeight;
  checkUnreadDividerVisibility();
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
  const result=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,reply_to_id,attachment_path").eq("conversation_id",conversationId).lte("created_at",message.created_at).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  if(result.error){toast("That message could not be opened: "+result.error.message);return;}
  if(S.active!==conversationId)return;
  const raw=result.data||[];S.hasOlderMessages=raw.length===300;
  S.messages=await attachReplyPreviews(raw.filter(m=>!S.deletedMessageIds.has(m.id)).reverse(),conversationId);
  await loadMessageReactions(conversationId,S.messages.map(m=>m.id),true);
  await loadMessageReads(conversationId,S.messages.map(m=>m.id));await markMessagesRead(conversationId,S.messages);renderMessages();
  setTimeout(()=>{
    const row=document.querySelector('[data-message-id="'+message.id+'"]');
    if(row){row.scrollIntoView({block:"center"});row.classList.add("search-highlight");setTimeout(()=>row.classList.remove("search-highlight"),2200);}
  },50);
}
function clearPendingMessageImage(){
  if(S.pendingImageUrl){window.URL.revokeObjectURL(S.pendingImageUrl);S.pendingImageUrl=null;}
  S.pendingImageFile=null;
  const input=$("message-image-file");if(input)input.value="";
  const preview=$("message-image-preview");if(preview){preview.hidden=true;preview.replaceChildren();}
}
function handleMessageImageFile(){
  const input=$("message-image-file"),file=input.files?.[0];if(!file)return;
  const allowed=["image/jpeg","image/png","image/webp","image/gif"];
  if(!allowed.includes(file.type)){clearPendingMessageImage();toast("Choose a JPG, PNG, WebP, or GIF image.");return;}
  if(file.size>50*1024*1024){clearPendingMessageImage();toast("Choose an image smaller than 50 MB.");return;}
  if(S.pendingImageUrl)window.URL.revokeObjectURL(S.pendingImageUrl);
  S.pendingImageFile=file;S.pendingImageUrl=window.URL.createObjectURL(file);
  const preview=$("message-image-preview");preview.replaceChildren();
  const image=el("img","message-image-thumb");image.src=S.pendingImageUrl;image.alt="Selected image preview";
  const details=el("div","message-image-details");details.append(el("strong","","Image ready to send"),el("small","",file.name),el("small","message-image-progress","Ready to send"));
  const remove=el("button","message-image-remove","×");remove.type="button";remove.addEventListener("click",clearPendingMessageImage);
  preview.append(image,details,remove);preview.hidden=false;
}
function imageFileExtension(file){
  return {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif"}[file.type]||null;
}
async function uploadMessageImage(file,path){
  if(!window.tus?.Upload)throw new Error("The large-image upload service did not load. Refresh Gather and try again.");
  const sessionResult=await db.auth.getSession();
  const token=sessionResult.data?.session?.access_token;
  if(sessionResult.error||!token)throw new Error("Your Gather session expired. Please sign in again.");
  const endpoint=URL.replace(".supabase.co",".storage.supabase.co")+"/storage/v1/upload/resumable";
  await new Promise((resolve,reject)=>{
    const upload=new window.tus.Upload(file,{
      endpoint,
      retryDelays:[0,3000,5000,10000,20000],
      headers:{authorization:"Bearer "+token},
      metadata:{
        bucketName:"gather-message-images",
        objectName:path,
        contentType:file.type,
        cacheControl:"3600"
      },
      uploadDataDuringCreation:true,
      removeFingerprintOnSuccess:true,
      chunkSize:6*1024*1024,
      onError:error=>reject(error),
      onProgress:(uploaded,total)=>{
        const label=$("message-image-preview")?.querySelector(".message-image-progress");
        if(label){
          const percent=total?Math.min(100,Math.floor(uploaded/total*100)):0;
          label.textContent="Uploading image · "+percent+"%";
        }
      },
      onSuccess:()=>resolve()
    });
    upload.start();
  });
}
async function sendMessage(e){
  e.preventDefault();
  const body=$("message").value.trim(),file=S.pendingImageFile;
  if((!body&&!file)||!S.active)return;
  const conversationId=S.active,activeChat=S.chats.find(x=>x.id===conversationId);
  if(activeChat?.kind==="direct"&&!S.directStatus?.can_message){toast("Private messaging is unavailable in this conversation.");return;}
  const reply=S.replyTo;const send=$("send");send.disabled=true;
  let attachmentPath=null;
  if(file){
    const extension=imageFileExtension(file);
    if(!extension||file.size>50*1024*1024){send.disabled=false;toast("That image is not supported or is larger than 50 MB.");return;}
    const unique=window.crypto?.randomUUID?window.crypto.randomUUID():(Date.now().toString(36)+"_"+Math.random().toString(36).slice(2));
    attachmentPath=conversationId+"/"+S.user.id+"_"+unique+"."+extension;
    try{await uploadMessageImage(file,attachmentPath);}
    catch(error){send.disabled=false;toast("Image upload failed: "+(error?.message||"Please try again."));return;}
  }
  const r=await db.from("messages").insert({conversation_id:conversationId,sender_id:S.user.id,body,attachment_path:attachmentPath,reply_to_id:reply?.id||null}).select("id,conversation_id,sender_id,body,created_at,edited_at,reply_to_id,attachment_path").single();
  if(r.error){
    if(attachmentPath){const cleanup=await db.storage.from("gather-message-images").remove([attachmentPath]);if(cleanup.error)console.warn("Unused image cleanup failed:",cleanup.error.message);}
    send.disabled=false;toast("Message not sent: "+r.error.message);return;
  }
  stopTyping(true);
  $("message").value="";$("message").style.height="auto";delete S.chatSettings.drafts[conversationId];saveLocalChatDraftOverride(conversationId,"");clearTimeout(S.draftSaveTimer);saveChatSettings();clearPendingMessageImage();cancelReply();
  const [withReply]=await attachReplyPreviews([r.data],conversationId);
  if(!S.messages.some(x=>x.id===r.data.id)){S.messages.push({...withReply,reply_preview:reply||null});S.messageReactions[r.data.id]=[];renderMessages();}
  if(S.active===conversationId&&activeChat){
    activeChat.last=r.data;activeChat.updated_at=r.data.created_at;activeChat.hasMessages=true;
    S.chats.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
    renderChats();
  }
  send.disabled=false;
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


async function canViewMemberProfile(userId){
  if(!userId||!S.user)return false;
  if(userId===S.user.id)return true;
  const shared=S.chats.filter(chat=>chat.members.some(member=>member.user_id===userId));
  if(shared.some(chat=>chat.kind==="group"))return true;
  const isFriend=S.friends.some(friend=>friend.friend_id===userId);
  const direct=shared.find(chat=>chat.kind==="direct");
  if(!direct&&!isFriend)return false;
  const result=await db.rpc("get_direct_chat_status",{p_other_user_id:userId});
  return !result.error&&!!result.data?.can_message;
}

function profileBannerClass(style){
  return "banner-"+(["violet","blue","mint","rose","amber","teal"].includes(style)?style:"violet");
}
async function openPublicProfile(userId){
  if(!userId||!S.user)return;
  if(userId===S.user.id){openProfile();return;}
  if(!await canViewMemberProfile(userId)){toast("You can view profiles of members you can message or share a group chat with.");return;}
  $("member-profile-modal").hidden=false;
  $("member-profile-name").textContent="Loading profile…";
  $("member-profile-username").textContent="";
  $("member-profile-pronouns").textContent="";
  $("member-profile-bio").textContent="";
  $("member-profile-mutuals").textContent="";
  S.publicProfileId=null;
  const presenceLabel=$("member-profile-presence");
  presenceLabel.textContent="";presenceLabel.hidden=true;presenceLabel.classList.remove("is-online");
  const existing=S.profiles[userId];
  const result=await db.from("profiles").select("id,username,display_name,bio,pronouns,banner_style").eq("id",userId).maybeSingle();
  if(result.error||!result.data){$("member-profile-name").textContent="Profile unavailable";return;}
  const profile={...result.data,avatar_data:existing?.avatar_data||null};
  const picture=await db.from("profile_avatars").select("image_data").eq("user_id",userId).maybeSingle();
  profile.avatar_data=picture.error?null:(picture.data?.image_data||null);
  S.profiles[userId]=profile;S.publicProfileId=userId;
  renderPublicProfilePresence();
  $("member-profile-name").textContent=profile.display_name;
  $("member-profile-username").textContent="@"+profile.username;
  $("member-profile-pronouns").textContent=profile.pronouns||"";
  $("member-profile-pronouns").hidden=!profile.pronouns;
  $("member-profile-bio").textContent=profile.bio||"No bio added yet.";
  $("member-profile-banner").className="member-profile-banner "+profileBannerClass(profile.banner_style);
  paintAvatar($("member-profile-avatar"),profile.display_name,profile.avatar_data);
  $("member-profile-report").hidden=false;
  const mutual=await db.rpc("get_mutual_friend_count",{p_user_id:userId});
  $("member-profile-mutuals").textContent=mutual.error?"":Number(mutual.data||0)+" mutual friend"+(Number(mutual.data)===1?"":"s");
}
function openReport(userId,messageId=null){
  if(!userId||userId===S.user?.id)return;
  S.reportTargetUserId=userId;S.reportTargetMessageId=messageId;
  $("report-title").textContent=messageId?"Report message":"Report account";
  $("report-description").textContent=messageId
    ?"Tell us why this message should be reviewed. Reports are private."
    :"Tell us why this account should be reviewed. Reports are private.";
  $("report-reason").value="harassment";$("report-details").value="";
  $("report-status").textContent="";$("report-modal").hidden=false;
}
async function submitReport(event){
  event.preventDefault();
  if(!S.reportTargetUserId||!S.user)return;
  const button=$("report-submit");button.disabled=true;
  status("report-status","Submitting private report…");
  const result=await db.from("reports").insert({
    reporter_id:S.user.id,target_user_id:S.reportTargetUserId,message_id:S.reportTargetMessageId,
    reason:$("report-reason").value,details:$("report-details").value.trim()
  });
  button.disabled=false;
  if(result.error){status("report-status","Report could not be submitted: "+result.error.message,"error");return;}
  $("report-modal").hidden=true;toast("Your report was submitted privately for review.");
  S.reportTargetUserId=null;S.reportTargetMessageId=null;
}
async function editOwnMessage(message){
  if(!message||message.sender_id!==S.user?.id||!message.body)return;
  const next=prompt("Edit your message:",message.body);
  if(next===null)return;
  const body=next.trim();
  if(!body||body.length>4000){toast("Messages must contain 1–4,000 characters.");return;}
  if(body===message.body)return;
  const result=await db.from("messages").update({body,edited_at:new Date().toISOString()}).eq("id",message.id).eq("sender_id",S.user.id).select("id,body,edited_at").maybeSingle();
  if(result.error||!result.data){toast("Message could not be edited: "+(result.error?.message||"Permission denied."));return;}
  Object.assign(message,result.data);renderMessages(true);toast("Message updated.");
}
async function openReportsAdmin(){
  if(!isFeedbackAdmin(S.user)){toast("Only the administrator can review reports.");return;}
  $("reports-admin-modal").hidden=false;
  const list=$("reports-admin-list");list.replaceChildren(el("p","muted tiny","Loading reports…"));
  const result=await db.from("reports").select("id,reporter_id,target_user_id,message_id,reason,details,status,created_at").order("created_at",{ascending:false}).limit(100);
  list.replaceChildren();
  if(result.error){list.append(el("p","status error","Reports could not be loaded: "+result.error.message));return;}
  if(!result.data?.length){list.append(el("p","muted tiny","There are no reports to review."));return;}
  const profilesResult=await fetchProfileRecords([...new Set(result.data.flatMap(report=>[report.reporter_id,report.target_user_id]))]);
  const reportProfiles=new Map((profilesResult.data||[]).map(profile=>[profile.id,profile]));
  for(const report of result.data){
    const card=el("article","admin-report-card");
    const heading=el("div","admin-report-heading");
    heading.append(el("strong","",report.reason.replaceAll("_"," ")),el("small","",dateLabel(report.created_at)));
    const text=el("p","admin-report-details",report.details||(report.message_id?"A message was reported.":"An account was reported."));
    const reporter=reportProfiles.get(report.reporter_id),target=reportProfiles.get(report.target_user_id);
    const meta=el("small","muted", "From: "+(reporter?.display_name||"Member")+" (@"+(reporter?.username||"unknown")+") · About: "+(target?.display_name||"Member")+" (@"+(target?.username||"unknown")+")");
    const select=el("select","admin-report-status");["new","reviewing","resolved"].forEach(value=>{const option=el("option","",value==="new"?"New":value==="reviewing"?"Reviewing":"Resolved");option.value=value;select.append(option);});select.value=report.status;
    select.addEventListener("change",async()=>{select.disabled=true;const update=await db.from("reports").update({status:select.value}).eq("id",report.id);select.disabled=false;if(update.error)toast("Report status could not be updated.");else toast("Report status updated.");});
    card.append(heading,text,meta,select);list.append(card);
  }
}
async function signOutOtherSessions(){
  const button=$("signout-other-sessions");button.disabled=true;
  $("session-security-status").textContent="Signing out other devices…";
  const result=await db.auth.signOut({scope:"others"});
  button.disabled=false;
  if(result.error){$("session-security-status").textContent="Other sessions could not be signed out: "+result.error.message;return;}
  $("session-security-status").textContent="Other sessions have been revoked. Their existing access tokens may remain valid until they expire; this device stays signed in.";
}
async function requestAccountDeletion(){
  const ok=confirm("Send a private request to Gather support to delete your account? This will not sign you out or delete anything automatically.");
  if(!ok)return;
  const button=$("request-account-deletion");button.disabled=true;
  const result=await db.rpc("create_feedback_thread",{
    p_subject:"Account deletion request",
    p_message:"I am requesting help with deleting my Gather account. Please reply with the next steps."
  });
  button.disabled=false;
  if(result.error){toast("Account deletion request could not be sent: "+result.error.message);return;}
  $("settings-modal").hidden=true;
  await openFeedback(false);
  await selectFeedbackThread(result.data);
  toast("Your account deletion request was sent privately to Gather support.");
}

function openProfile(){
  if(!S.profile)return;
  $("profile-name").value=S.profile.display_name;$("profile-username").value=S.profile.username;
  $("profile-bio").value=S.profile.bio||"";$("profile-pronouns").value=S.profile.pronouns||"";$("profile-banner-style").value=S.profile.banner_style||"violet";
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
    const details=el("div","group-member-copy");
    const profileLink=el("button","group-member-profile",profile.display_name);profileLink.type="button";
    profileLink.addEventListener("click",()=>openPublicProfile(member.user_id));
    details.append(profileLink,el("small","", "@"+profile.username+" · "+roleLabel));
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
  const bio=$("profile-bio").value.trim(),pronouns=$("profile-pronouns").value.trim(),banner_style=$("profile-banner-style").value;
  if(!display_name||!/^[a-z0-9_]{3,24}$/.test(username)){status("profile-status","Check the name and username format.","error");return;}
  const save=$("profile-save");save.disabled=true;
  const r=await db.from("profiles").update({display_name,username,bio,pronouns,banner_style}).eq("id",S.user.id).select("*").single();
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

function feedbackStatusLabel(value){
  return value==="in_progress"?"In progress":value==="resolved"?"Resolved":"New";
}
function renderFeedbackThreads(){
  const list=$("feedback-thread-list");list.replaceChildren();
  if(!S.feedbackThreads.length){
    list.append(el("p","muted tiny",S.feedbackAdminView?"No feedback has been submitted yet.":"You haven't sent any feedback yet."));
    return;
  }
  S.feedbackThreads.forEach(thread=>{
    const button=el("button","feedback-thread-card"+(thread.id===S.activeFeedbackThreadId?" active":""));
    button.type="button";
    const subject=el("strong","",thread.subject);
    const statusLine=el("span","feedback-thread-meta",feedbackStatusLabel(thread.status)+" · "+dateLabel(thread.created_at));
    if(S.feedbackAdminView){
      const profile=S.feedbackProfiles[thread.user_id];
      button.append(subject,el("small","feedback-thread-member",profile?.display_name||"Gather member"),statusLine);
    }else button.append(subject,statusLine);
    button.addEventListener("click",()=>selectFeedbackThread(thread.id));
    list.append(button);
  });
}
async function loadFeedbackThreads(){
  const result=await db.from("feedback_threads").select("id,user_id,subject,status,created_at").order("created_at",{ascending:false});
  if(result.error){$("feedback-thread-list").replaceChildren(el("p","status error","Feedback couldn't be loaded: "+result.error.message));return false;}
  S.feedbackThreads=result.data||[];
  S.feedbackProfiles={};
  if(S.feedbackAdminView&&S.feedbackThreads.length){
    const profiles=await fetchProfileRecords(S.feedbackThreads.map(thread=>thread.user_id));
    if(!profiles.error)(profiles.data||[]).forEach(profile=>S.feedbackProfiles[profile.id]=profile);
  }
  renderFeedbackThreads();
  return true;
}
function showFeedbackNewForm(){
  if(S.feedbackAdminView){toast("The admin inbox is for replying to member requests.");return;}
  S.activeFeedbackThreadId=null;S.feedbackMessages=[];
  $("feedback-detail").hidden=true;$("feedback-empty").hidden=true;
  $("feedback-new-form").hidden=false;
  $("feedback-subject").value="";$("feedback-new-message").value="";
  $("feedback-new-status").textContent="";
  $("feedback-subject").focus();
  renderFeedbackThreads();
}
async function openFeedback(adminView=false){
  if(!S.user)return;
  if(adminView&&!isFeedbackAdmin(S.user)){toast("This inbox is only available to the feedback administrator.");return;}
  S.feedbackAdminView=!!adminView;
  S.activeFeedbackThreadId=null;S.feedbackMessages=[];
  $("feedback-request-actions").hidden=true;$("feedback-edit-form").hidden=true;
  $("feedback-message-list").hidden=false;$("feedback-reply-form").hidden=false;
  $("feedback-modal-title").textContent=S.feedbackAdminView?"Admin inbox":"Your feedback";
  $("feedback-modal-eyebrow").textContent=S.feedbackAdminView?"GATHER ADMIN":"FEEDBACK AND SUPPORT";
  $("feedback-modal-description").textContent=S.feedbackAdminView?"Review private requests from Gather members, reply, and update each thread’s status. Replies appear as Gather Admin, not your personal username.":"Send feedback or ask for help. Replies to your feedback stay private to your account.";
  $("feedback-new").hidden=S.feedbackAdminView;
  $("feedback-new-form").hidden=true;$("feedback-detail").hidden=true;$("feedback-empty").hidden=false;
  $("feedback-admin-identity").hidden=!S.feedbackAdminView;
  $("feedback-modal").classList.toggle("feedback-admin-mode",S.feedbackAdminView);
  $("feedback-reply").placeholder=S.feedbackAdminView?"Reply as Gather Admin…":"Write a reply…";
  $("feedback-reply-submit").textContent=S.feedbackAdminView?"Reply as Gather Admin":"Send reply";
  $("feedback-modal").hidden=false;
  $("feedback-empty").textContent=S.feedbackAdminView?"Select a feedback thread to read and respond.":"Choose a feedback thread or start a new one.";
  await loadFeedbackThreads();
}
async function selectFeedbackThread(threadId){
  const thread=S.feedbackThreads.find(item=>item.id===threadId);
  if(!thread)return;
  S.activeFeedbackThreadId=threadId;
  $("feedback-new-form").hidden=true;$("feedback-empty").hidden=true;$("feedback-detail").hidden=false;
  $("feedback-request-actions").hidden=S.feedbackAdminView;
  $("feedback-edit-form").hidden=true;$("feedback-message-list").hidden=false;$("feedback-reply-form").hidden=false;
  $("feedback-thread-subject").textContent=thread.subject;
  const profile=S.feedbackProfiles[thread.user_id];
  $("feedback-thread-owner").textContent=S.feedbackAdminView
    ?("From "+(profile?.display_name||"Gather member")+" · "+dateLabel(thread.created_at))
    :("Submitted "+dateLabel(thread.created_at));
  $("feedback-status-label").textContent="Status: "+feedbackStatusLabel(thread.status);
  $("feedback-status-select").value=thread.status;
  $("feedback-status-select").hidden=!S.feedbackAdminView;
  $("feedback-status-label").hidden=S.feedbackAdminView;
  $("feedback-reply-status").textContent="";
  $("feedback-reply").value="";
  renderFeedbackThreads();
  const result=await db.from("feedback_messages").select("id,thread_id,sender_id,body,created_at").eq("thread_id",threadId).order("created_at",{ascending:true});
  if(result.error){$("feedback-message-list").replaceChildren(el("p","status error","Messages couldn't be loaded: "+result.error.message));return;}
  S.feedbackMessages=result.data||[];
  renderFeedbackMessages();
}
function renderFeedbackMessages(){
  const list=$("feedback-message-list");list.replaceChildren();
  if(!S.feedbackMessages.length){list.append(el("p","muted tiny","No messages in this thread yet."));return;}
  const thread=S.feedbackThreads.find(item=>item.id===S.activeFeedbackThreadId);
  S.feedbackMessages.forEach(message=>{
    const mine=message.sender_id===S.user?.id;
    const bubble=el("article","feedback-message"+(mine?" mine":""));
    const sender=mine?(S.feedbackAdminView?"Gather Admin":"You"):(S.feedbackAdminView?(S.feedbackProfiles[thread?.user_id]?.display_name||"Gather member"):"Gather Admin");
    bubble.append(el("div","feedback-message-meta",sender+" · "+dateLabel(message.created_at)),el("p","feedback-message-body",message.body));
    list.append(bubble);
  });
  list.scrollTop=list.scrollHeight;
}
async function createFeedbackThread(event){
  event.preventDefault();
  if(S.feedbackAdminView){toast("The admin inbox is for replying to member requests.");return;}
  const subject=$("feedback-subject").value.trim(),body=$("feedback-new-message").value.trim();
  if(subject.length<3||subject.length>100){$("feedback-new-status").textContent="Use a subject between 3 and 100 characters.";return;}
  if(!body||body.length>4000){$("feedback-new-status").textContent="Write a message between 1 and 4,000 characters.";return;}
  const button=$("feedback-create-submit");button.disabled=true;
  $("feedback-new-status").textContent="Sending feedback…";
  const result=await db.rpc("create_feedback_thread",{p_subject:subject,p_message:body});
  button.disabled=false;
  if(result.error){$("feedback-new-status").textContent="Feedback could not be sent: "+result.error.message;return;}
  $("feedback-subject").value="";$("feedback-new-message").value="";
  $("feedback-new-status").textContent="";
  await loadFeedbackThreads();
  await selectFeedbackThread(result.data);
  toast("Feedback sent.");
}
function startFeedbackEdit(){
  if(S.feedbackAdminView||!S.user||!S.activeFeedbackThreadId)return;
  const thread=S.feedbackThreads.find(item=>item.id===S.activeFeedbackThreadId);
  const original=S.feedbackMessages.find(message=>message.sender_id===thread?.user_id);
  if(!thread||!original){toast("The original feedback message could not be found.");return;}
  $("feedback-edit-subject").value=thread.subject;
  $("feedback-edit-message").value=original.body;
  $("feedback-edit-status").textContent="";
  $("feedback-request-actions").hidden=true;
  $("feedback-message-list").hidden=true;
  $("feedback-reply-form").hidden=true;
  $("feedback-edit-form").hidden=false;
  $("feedback-edit-subject").focus();
}
function cancelFeedbackEdit(){
  $("feedback-edit-form").hidden=true;
  $("feedback-request-actions").hidden=S.feedbackAdminView;
  $("feedback-message-list").hidden=false;
  $("feedback-reply-form").hidden=false;
}
async function saveFeedbackEdit(event){
  event.preventDefault();
  if(S.feedbackAdminView||!S.user||!S.activeFeedbackThreadId)return;
  const subject=$("feedback-edit-subject").value.trim();
  const message=$("feedback-edit-message").value.trim();
  if(subject.length<3||subject.length>100){
    $("feedback-edit-status").textContent="Use a subject between 3 and 100 characters.";
    return;
  }
  if(!message||message.length>4000){
    $("feedback-edit-status").textContent="Write a message between 1 and 4,000 characters.";
    return;
  }
  const threadId=S.activeFeedbackThreadId;
  const button=$("feedback-edit-save");button.disabled=true;
  $("feedback-edit-status").textContent="Saving your changes…";
  const result=await db.rpc("edit_own_feedback_request",{
    p_thread_id:threadId,p_subject:subject,p_message:message
  });
  button.disabled=false;
  if(result.error){
    $("feedback-edit-status").textContent="Your feedback could not be updated: "+result.error.message;
    return;
  }
  $("feedback-edit-form").hidden=true;
  await loadFeedbackThreads();
  await selectFeedbackThread(threadId);
  toast("Your feedback was updated.");
}
async function deleteFeedbackRequest(){
  if(S.feedbackAdminView||!S.user||!S.activeFeedbackThreadId)return;
  const thread=S.feedbackThreads.find(item=>item.id===S.activeFeedbackThreadId);
  if(!thread||thread.user_id!==S.user.id){toast("You can only delete your own feedback.");return;}
  const confirmed=confirm("Delete this feedback request and its entire conversation, including Gather Admin replies? This cannot be undone.");
  if(!confirmed)return;
  const threadId=S.activeFeedbackThreadId;
  const button=$("feedback-delete-request");button.disabled=true;
  const result=await db.rpc("delete_own_feedback_request",{p_thread_id:threadId});
  button.disabled=false;
  if(result.error){toast("Your feedback could not be deleted: "+result.error.message);return;}
  S.activeFeedbackThreadId=null;S.feedbackMessages=[];
  $("feedback-detail").hidden=true;
  $("feedback-request-actions").hidden=true;
  $("feedback-edit-form").hidden=true;
  $("feedback-empty").hidden=false;
  $("feedback-empty").textContent="Your feedback request was deleted. You can start a new one any time.";
  await loadFeedbackThreads();
  toast("Your feedback request and its replies were deleted.");
}
async function sendFeedbackReply(event){
  event.preventDefault();
  if(S.feedbackAdminView&&!isFeedbackAdmin(S.user)){toast("Only the Gather administrator can reply from the admin inbox.");return;}
  const body=$("feedback-reply").value.trim(),threadId=S.activeFeedbackThreadId;
  if(!threadId||!body||body.length>4000){$("feedback-reply-status").textContent="Write a message between 1 and 4,000 characters.";return;}
  const button=$("feedback-reply-submit");button.disabled=true;
  $("feedback-reply-status").textContent="Sending reply…";
  const result=await db.from("feedback_messages").insert({thread_id:threadId,sender_id:S.user.id,body});
  button.disabled=false;
  if(result.error){$("feedback-reply-status").textContent="Reply could not be sent: "+result.error.message;return;}
  $("feedback-reply").value="";$("feedback-reply-status").textContent="";
  await selectFeedbackThread(threadId);
  toast("Reply sent.");
}
async function updateFeedbackStatus(){
  if(!S.feedbackAdminView||!isFeedbackAdmin(S.user)||!S.activeFeedbackThreadId)return;
  const nextStatus=$("feedback-status-select").value;
  const button=$("feedback-status-select");button.disabled=true;
  const result=await db.from("feedback_threads").update({status:nextStatus}).eq("id",S.activeFeedbackThreadId).select("id,user_id,subject,status,created_at").maybeSingle();
  button.disabled=false;
  if(result.error||!result.data){toast("Feedback status could not be updated.");return;}
  const index=S.feedbackThreads.findIndex(thread=>thread.id===result.data.id);
  if(index>=0)S.feedbackThreads[index]=result.data;
  $("feedback-status-label").textContent="Status: "+feedbackStatusLabel(nextStatus);
  renderFeedbackThreads();
  toast("Feedback status updated.");
}

function closeModals(){ $("announcement-compose-modal").hidden=true;$("announcement-view-modal").hidden=true;$("announcements-page-modal").hidden=true;$("notifications-modal").hidden=true;$("member-profile-modal").hidden=true;$("report-modal").hidden=true;$("reports-admin-modal").hidden=true;$("people-modal").hidden=true;$("profile-modal").hidden=true;$("requests-modal").hidden=true;$("friends-modal").hidden=true;$("settings-modal").hidden=true;$("group-photo-modal").hidden=true;$("group-settings-modal").hidden=true;$("message-search-modal").hidden=true;$("poll-create-modal").hidden=true;$("forward-message-modal").hidden=true;$("saved-messages-modal").hidden=true;$("chat-actions-modal").hidden=true;$("feedback-modal").hidden=true; }
function goHome(){
  closeConversationDrawer();
  saveActiveChatDraft();clearUnreadDividerState();
  closeTypingChannel();
  clearPendingMessageImage();closeModals();S.active=null;S.messages=[];S.messageReads={};S.messageReactions={};S.messagePolls={};S.pinnedMessages=[];S.forwardMessage=null;S.pendingReactionKeys.clear();S.openReactionPickerMessageId=null;S.replyTo=null;S.hasOlderMessages=false;S.selectingMessages=false;S.selectedMessageIds.clear();S.directStatus=null;renderReplyComposer();
  $("layout").classList.remove("show-chat");$("layout").classList.add("show-home");renderChats();renderActive();
}
function setConversationDrawer(open){
  const layout=$("layout"),backdrop=$("conversation-drawer-backdrop"),toggle=$("conversation-drawer-toggle");
  if(!layout||!backdrop||!toggle)return;
  const isOpen=!!open;
  layout.classList.toggle("conversation-drawer-open",isOpen);
  backdrop.hidden=!isOpen;
  toggle.setAttribute("aria-expanded",String(isOpen));
  toggle.setAttribute("aria-label",isOpen?"Close conversations":"Open conversations");
}
function closeConversationDrawer(){setConversationDrawer(false);}
function closeComposerMoreMenu(){
  const menu=$("composer-more-menu"),trigger=$("composer-more-trigger");
  if(menu)menu.hidden=true;
  if(trigger)trigger.setAttribute("aria-expanded","false");
}
function toggleComposerMoreMenu(){
  const menu=$("composer-more-menu"),trigger=$("composer-more-trigger");
  if(!menu||!trigger)return;
  const opening=menu.hidden;
  menu.hidden=!opening;
  trigger.setAttribute("aria-expanded",String(opening));
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
  $("chat-actions-open").addEventListener("click",()=>{renderChatOptions();$("chat-actions-modal").hidden=false;});
  $("toggle-chat-pin").addEventListener("click",()=>togglePinnedConversation());
  $("toggle-chat-mute").addEventListener("click",()=>toggleMutedConversation());
  $("chat-appearance-accent").addEventListener("change",updateChatAppearance);
  $("chat-appearance-background").addEventListener("change",updateChatAppearance);
  ["add-people","edit-group-photo","group-settings-open","search-messages-open","saved-messages-open","leave-chat","block-user","select-messages","delete-selected"].forEach(id=>$(id).addEventListener("click",()=>{$("chat-actions-modal").hidden=true;}));
  $("add-people").addEventListener("click",()=>openPeople("add"));$("edit-group-photo").addEventListener("click",openGroupPhoto);$("group-settings-open").addEventListener("click",openGroupSettings);$("group-settings-save").addEventListener("click",saveGroupSettings);$("group-avatar-file").addEventListener("change",handleGroupAvatarFile);$("group-avatar-remove").addEventListener("click",removeGroupAvatar);$("group-avatar-save").addEventListener("click",saveGroupAvatar);$("leave-chat").addEventListener("click",()=>{if(S.active)leaveGroupChat(S.active);});$("requests-open").addEventListener("click",openRequests);$("friends-open").addEventListener("click",openFriends);$("friends-find").addEventListener("click",()=>{$("friends-modal").hidden=true;openPeople("friend");});$("block-user").addEventListener("click",toggleBlock);
  $("people-search").addEventListener("input",()=>{clearTimeout(S.timer);S.timer=setTimeout(searchPeople,220);});$("people-create").addEventListener("click",createGroupOrAdd);
  $("home-open").addEventListener("click",goHome);
  $("chat-title").addEventListener("click",()=>{const chat=S.chats.find(item=>item.id===S.active);if(chat?.kind==="direct")openPublicProfile(peerForChat(chat));});
  $("settings-open").addEventListener("click",openSettings);
  $("notifications-open").addEventListener("click",openNotifications);
  $("announcement-send-open").addEventListener("click",()=>{$("settings-modal").hidden=true;openAnnouncementComposer();});
  $("announcement-compose-form").addEventListener("submit",publishAnnouncement);
  $("announcement-edit-open").addEventListener("click",()=>openAnnouncementEditor(S.activeAnnouncementId));
  $("home-announcement-open").addEventListener("click",()=>{const latest=S.announcements[0];if(latest)openAnnouncement(latest.id);});
  $("home-announcements-all").addEventListener("click",openAnnouncementsPage);
  $("notifications-mark-all").addEventListener("click",markAllNotificationsRead);
  $("notifications-admin-open").addEventListener("click",()=>{$("notifications-modal").hidden=true;openAnnouncementsPage();});
  $("notifications-recent-open").addEventListener("click",()=>setNotificationView("messages"));
  document.querySelectorAll("[data-notification-view]").forEach(button=>button.addEventListener("click",()=>setNotificationView(button.dataset.notificationView)));
  $("report-form").addEventListener("submit",submitReport);
  $("member-profile-report").addEventListener("click",()=>{const userId=S.publicProfileId;$("member-profile-modal").hidden=true;openReport(userId);});
  $("reports-admin-open").addEventListener("click",()=>{$("settings-modal").hidden=true;openReportsAdmin();});
  $("signout-other-sessions").addEventListener("click",signOutOtherSessions);
  $("request-account-deletion").addEventListener("click",requestAccountDeletion);
  $("feedback-open").addEventListener("click",()=>openFeedback(false));
  $("feedback-admin-open").addEventListener("click",()=>{$("settings-modal").hidden=true;openFeedback(true);});
  $("feedback-new").addEventListener("click",showFeedbackNewForm);
  $("feedback-refresh").addEventListener("click",async()=>{const keep=S.activeFeedbackThreadId;await loadFeedbackThreads();if(keep&&S.feedbackThreads.some(thread=>thread.id===keep))await selectFeedbackThread(keep);});
  $("feedback-new-form").addEventListener("submit",createFeedbackThread);
  $("feedback-edit-open").addEventListener("click",startFeedbackEdit);
  $("feedback-delete-request").addEventListener("click",deleteFeedbackRequest);
  $("feedback-edit-form").addEventListener("submit",saveFeedbackEdit);
  $("feedback-edit-cancel").addEventListener("click",cancelFeedbackEdit);
  $("feedback-reply-form").addEventListener("submit",sendFeedbackReply);
  $("feedback-status-select").addEventListener("change",updateFeedbackStatus);
  document.querySelectorAll("[data-theme-mode]").forEach(b=>b.addEventListener("click",()=>setTheme(b.dataset.themeMode)));
  document.querySelectorAll("[data-accent]").forEach(b=>b.addEventListener("click",()=>setAccent(b.dataset.accent)));
  document.querySelectorAll("[data-font-size]").forEach(b=>b.addEventListener("click",()=>setFontSize(b.dataset.fontSize)));
  document.querySelectorAll("[data-notification-mode]").forEach(b=>b.addEventListener("click",()=>setMessageNotificationMode(b.dataset.notificationMode)));
  $("home-friends-open").addEventListener("click",openFriends);$("home-requests-open").addEventListener("click",openRequests);$("open-about-blank").addEventListener("click",openAboutBlank);
  $("toggle-conversation-select").addEventListener("click",toggleConversationSelectionMode);
  $("delete-selected-conversations").addEventListener("click",deleteSelectedConversations);$("pin-selected-conversations").addEventListener("click",toggleSelectedConversationPins);
  $("filter").addEventListener("input",renderChats);
  $("in-chat-filter").addEventListener("input",renderInChatSidebar);
  $("conversation-drawer-toggle").addEventListener("click",()=>setConversationDrawer(!$("layout").classList.contains("conversation-drawer-open")));
  $("conversation-drawer-backdrop").addEventListener("click",closeConversationDrawer);
document.querySelectorAll("[data-folder]").forEach(b=>b.addEventListener("click",()=>selectFolder(b.dataset.folder)));$("profile-open").addEventListener("click",openProfile);$("profile-form").addEventListener("submit",saveProfile);
  $("profile-avatar-file").addEventListener("change",handleAvatarFile);
  $("avatar-remove").addEventListener("click",()=>{
    S.pendingAvatarData=null;S.avatarChanged=true;
    paintAvatar($("profile-avatar-preview"),S.profile.display_name,null);
    status("profile-status","The picture will be removed when you save changes.","success");
  });
  $("password-form").addEventListener("submit",changePassword);
  $("send-form").addEventListener("submit",sendMessage);$("message-image-file").addEventListener("change",handleMessageImageFile);$("composer-more-trigger").addEventListener("click",event=>{event.stopPropagation();toggleComposerMoreMenu();});$("composer-more-menu").addEventListener("click",event=>event.stopPropagation());$("message-create-poll").addEventListener("click",openPollComposer);$("poll-form").addEventListener("submit",submitPoll);$("poll-add-option").addEventListener("click",addPollOptionInput);$("poll-cancel").addEventListener("click",()=>$("poll-create-modal").hidden=true);$("saved-messages-open").addEventListener("click",openSavedMessages);document.addEventListener("click",event=>{const wrap=$("composer-more-wrap");if(wrap&&!wrap.contains(event.target))closeComposerMoreMenu();if(S.openReactionPickerMessageId&&!event.target.closest(".message-reaction-area")){S.openReactionPickerMessageId=null;if(S.active)renderMessages(true);}});
  $("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";updateLocalTyping();saveActiveChatDraft();});
  $("message").addEventListener("blur",()=>stopTyping(true));
  $("share-online-status").addEventListener("change",event=>{
    S.preferences.shareOnlineStatus=!!event.target.checked;
    saveUIPreferences();
  });
  $("group-unread-messages").addEventListener("change",event=>setGroupUnreadMessages(event.target.checked));
  document.addEventListener("visibilitychange",()=>{if(document.hidden)stopTyping(true);});
  $("messages").addEventListener("scroll",()=>{if($("messages").scrollTop<80)loadOlderMessages();checkUnreadDividerVisibility();},{passive:true});
  $("cancel-reply").addEventListener("click",cancelReply);
  $("search-messages-open").addEventListener("click",openMessageSearch);
  $("message-search-input").addEventListener("input",()=>{clearTimeout(S.searchTimer);S.searchTimer=setTimeout(()=>searchConversationMessages(true),250);});
  $("message-search-more").addEventListener("click",()=>searchConversationMessages(false));
  $("message").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();$("send-form").requestSubmit();}});
  $("back").addEventListener("click",goHome);
  $("select-messages").addEventListener("click",()=>{
    S.selectingMessages=!S.selectingMessages;
    S.selectedMessageIds.clear();
    if(S.selectingMessages){S.openMessageMenuId=null;S.openReactionPickerMessageId=null;}
    renderMessages();
    renderActive();
  });
  $("delete-selected").addEventListener("click",deleteSelectedMessages);
  $("signout").addEventListener("click",async()=>{const r=await db.auth.signOut();if(r.error)toast(r.error.message);else closeModals();});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",closeModals));
  ["announcement-compose-modal","announcement-view-modal","announcements-page-modal","notifications-modal","member-profile-modal","report-modal","reports-admin-modal","people-modal","profile-modal","requests-modal","friends-modal","settings-modal","group-photo-modal","group-settings-modal","message-search-modal","poll-create-modal","forward-message-modal","saved-messages-modal","chat-actions-modal","feedback-modal"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))closeModals();}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeComposerMoreMenu();closeModals();}});
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
