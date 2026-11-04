(() => {
"use strict";
const URL = "https://xrwldphmeafiakittcof.supabase.co";
const KEY = "sb_publishable_5Gws8f_CODwrHigG2U6Veg_bTRrBoeA";
const $ = (id) => document.getElementById(id);
const db = window.supabase?.createClient ? window.supabase.createClient(URL, KEY) : null;
const ACCENTS = {
  lavender:{accent:"#b6a9ff",strong:"#9583ef",ink:"#211d35",soft:"#302d47",border:"#b6a9ff55"},
  blue:{accent:"#9bcfff",strong:"#589be0",ink:"#142b43",soft:"#243b58",border:"#9bcfff55"},
  mint:{accent:"#9be2c4",strong:"#55b993",ink:"#153b31",soft:"#24483d",border:"#9be2c455"},
  rose:{accent:"#ffb6ca",strong:"#e8799d",ink:"#411f30",soft:"#472b3a",border:"#ffb6ca55"},
  amber:{accent:"#ffd48c",strong:"#efa94c",ink:"#432f13",soft:"#4a381f",border:"#ffd48c55"},
  teal:{accent:"#9be2e4",strong:"#50b9be",ink:"#14373a",soft:"#234649",border:"#9be2e455"}
};
const FONT_SCALES = {small:"0.9",normal:"1",large:"1.15"};
const MESSAGE_REACTION_EMOJIS = ["👍","❤️","😂","🔥","😢","🎉"];
const MESSAGE_RENDER_LIMIT = 100;
const DEFAULT_PREFERENCES = {accent:"lavender",fontSize:"normal",theme:"dark",messageNotificationMode:"temporary",groupUnreadMessages:false,shareOnlineStatus:true,quietHoursEnabled:false,quietHoursStart:"22:00",quietHoursEnd:"08:00"};
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
    if(!value||typeof value!="object"||id.length>80)return;
    appearance[id]={accent:ACCENTS[value.accent]?value.accent:"default",background:Object.hasOwn(CHAT_BACKGROUNDS,value.background)?value.background:"default"};
  });
  return {pinned,muted,drafts,appearance};
}
const S = { user:null, profile:null, profiles:{}, modalBackTargets:{}, approvedUserIds:new Set(), ownApprovalRequests:[], chatSettings:{...DEFAULT_CHAT_SETTINGS}, draftSaveTimer:null, selectingConversations:false, selectedConversationIds:new Set(), folder:"friends", active:null, messages:[], messageReads:{}, readChannel:null, messageReactions:{}, pinnedMessages:[], messagePolls:{}, pendingReactionKeys:new Set(), openReactionPickerMessageId:null, openMessageMenuId:null, selectingMessages:false, selectedMessageIds:new Set(), directStatus:null, activeAnnouncementId:null, announcements:[], notificationView:"all", notificationTimers:{}, unreadCounts:{}, unreadCountsLoaded:false, sharedSearchQuery:"", lastReadAt:{}, chatSettingsSaveTimer:null, loadError:null, loading:null, unreadTargetMessageId:null, unreadTargetLoaded:false, suppressReadDividerUpdates:false, unreadDividerMessageId:null, unreadDividerArmed:false, unreadDividerTimer:null, searchConversationId:null, searchQuery:"", searchOffset:0, searchHasMore:false, searchTimer:null, replyTo:null, typingChannel:null, typingReady:false, typingUsers:new Map(), typingRemoteTimer:null, typingStopTimer:null, typingSent:false, typingLastSentAt:0, homeSearchQuery:"", homeSearchMessages:[], homeSearchProfiles:[], homeSearchErrors:{messages:"",profiles:""}, homeSearchLoading:false, homeSearchRequestId:0, homeSearchTimer:null, homeSearchTab:"messages", hasOlderMessages:false, loadingOlder:false, messageRestriction:null, messageRestrictionLoaded:false, messageRestrictionError:"", messageRestrictionChannel:null, messageRestrictionTimer:null, requestChannel:null, notificationChannel:null, channel:null, pollChannel:null, pollVotes:null, userDeletedMessages:new Set(), pendingUndoSend:null, undoSendTimer:null, undoCountdownInterval:null, pendingImageUrl:null, pendingImageFile:null, pendingAvatarData:null, avatarChanged:false, publicProfileId:null, reportTargetUserId:null, reportTargetMessageId:null, feedbackThreadList:null, feedbackThreads:[], feedbackAdminView:false, activeFeedbackThreadId:null, feedbackMessages:[], feedbackProfiles:{}, selected:null, picker:null, admin:{modalStack:[],section:"overview",users:[],page:0,hasMore:false,selectedUserId:null,loading:false,summary:{},activity:[],approvalPending:[],approvalApproved:[]}, preferences:{...DEFAULT_PREFERENCES}, searchTarget:null, searchMessageQuery:"", friendPresenceChannels:new Map(), onlineStatuses:{}, ownPresenceChannel:null, lastSeenHeartbeatTimer:null, presenceDisplayTimer:null, favoriteFriendIds:new Set(), friends:[], friendRequests:[], blockedUsers:[], deletedMessages:[], deletedMessageIds:new Set(), favoriteFriendIds:new Set(), profile:null, profileFilters:{}, pendingGroupAvatarData:null, groupAvatarChanged:false, groupAvatarConversationId:null, messageNotificationMode:"temporary"};

function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
function appendFormattedMessageText(parent,value){
  const source=String(value??"");
  const pattern=/\*\*([\s\S]+?)\*\*|#([\s\S]+?)#/g;
  let last=0,match;
  while((match=pattern.exec(source))){
    if(match.index>last)parent.append(document.createTextNode(source.slice(last,match.index)));
    const formatted=document.createElement(match[1]!==undefined?"strong":"em");
    appendFormattedMessageText(formatted,match[1]??match[2]);
    parent.append(formatted);
    last=pattern.lastIndex;
  }
  if(last<source.length)parent.append(document.createTextNode(source.slice(last)));
}
function status(id, text, kind) { const n=$(id); n.textContent=text||""; n.className="status"+(kind?" "+kind:""); }
function isFeedbackAdmin(user){return !!user&&!user.is_anonymous&&user.app_metadata?.gather_role==="admin";}
function syncAdminModeButton(){
  const button=$("admin-mode-open");
  if(button)button.hidden=!isFeedbackAdmin(S.user);
}
function toast(text) { $("toast").textContent=text; $("toast").classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>$("toast").classList.remove("show"),3000); }
function setChatLoadStatus(message,retry=false){
  const box=$("chat-load-status");if(!box)return;
  box.hidden=!message;box.classList.toggle("error",retry);
  $("chat-load-message").textContent=message||"";$("retry-load-chats").hidden=!retry;
}
function loadUIPreferences(saved){
  const validTime=value=>typeof value==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  S.preferences={
    accent:ACCENTS[saved?.accent]?saved.accent:DEFAULT_PREFERENCES.accent,
    fontSize:FONT_SCALES[saved?.fontSize]?saved.fontSize:DEFAULT_PREFERENCES.fontSize,
    theme:saved?.theme==="light"?"light":"dark",
    messageNotificationMode:saved?.messageNotificationMode==="persistent"?"persistent":"temporary",
    groupUnreadMessages:saved?.groupUnreadMessages===true,
    shareOnlineStatus:saved?.shareOnlineStatus!==false,
    quietHoursEnabled:saved?.quietHoursEnabled===true,
    quietHoursStart:validTime(saved?.quietHoursStart)?saved.quietHoursStart:DEFAULT_PREFERENCES.quietHoursStart,
    quietHoursEnd:validTime(saved?.quietHoursEnd)?saved.quietHoursEnd:DEFAULT_PREFERENCES.quietHoursEnd
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
      if(typeof value!="string")return;
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
  const quietHoursControl=$("quiet-hours-enabled");
  if(quietHoursControl)quietHoursControl.checked=S.preferences.quietHoursEnabled===true;
  const quietHoursStart=$("quiet-hours-start"),quietHoursEnd=$("quiet-hours-end");
  if(quietHoursStart)quietHoursStart.value=S.preferences.quietHoursStart;
  if(quietHoursEnd)quietHoursEnd.value=S.preferences.quietHoursEnd;
  const quietHoursTimes=$("quiet-hours-times");
  if(quietHoursTimes)quietHoursTimes.hidden=!S.preferences.quietHoursEnabled;
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
      const draftStatus=$("draft-save-status");
      if(draftStatus&&S.active&&snapshot.drafts[S.active]===$("message").value&&$("message").value)draftStatus.textContent="Draft saved on this device; account sync failed.";
      toast("Your private chat preferences couldn't be saved. Please try again.");
      return;
    }
    clearSyncedLocalDraftOverrides(userId,snapshot);
    const draftStatus=$("draft-save-status");
    if(draftStatus&&S.active&&snapshot.drafts[S.active]===$("message").value&&$("message").value)draftStatus.textContent="Draft synced to your account.";
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
  const custom=appearance.accent!="default"||!!background;
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
  const draftStatus=$("draft-save-status");
  if(draftStatus)draftStatus.textContent=value?"Draft saved on this device · syncing…":"";
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
  const draftStatus=$("draft-save-status");
  if(draftStatus)draftStatus.textContent=$("message").value?"Draft restored":"";
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
  applyUIPreferences();renderAccountApprovalSettings();$("settings-modal").hidden=false;
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
function appendApprovedBadge(parent,userId,context){
  if(!parent||!userId||!S.approvedUserIds.has(userId))return;
  if(context!=="profile"&&context!=="new-chat-picker")return;
  const badge=el("span","approved-account-badge","✓ Approved");
  badge.title="Gather approved account";
  badge.setAttribute("aria-label","Gather approved account");
  parent.append(badge);
}
async function loadApprovedUserIds(){
  if(!S.user)return false;
  const result=await db.from("approved_accounts").select("user_id");
  if(result.error){console.warn("Approved account badges could not be loaded:",result.error.message);return false;}
  S.approvedUserIds=new Set((result.data||[]).map(item=>item.user_id));
  return true;
}
function refreshApprovedBadgeUI(){
  if(!S.user)return;
  const ownName=$("user-name");
  if(S.profile&&ownName)ownName.textContent=S.profile.display_name;
  if(S.active)renderActive();else renderChats();
  renderFriends();
  if(S.active)renderMessages(true);
  if(S.publicProfileId){
    const publicName=$("member-profile-name");
    publicName.querySelector(".approved-account-badge")?.remove();
    appendApprovedBadge(publicName,S.publicProfileId,"profile");
  }
  if(!$("people-modal").hidden&&$("people-search").value.trim().length>=2)void searchPeople();
  if(!$("requests-modal").hidden)renderRequests();
}
async function loadOwnApprovalRequests(){
  if(!S.user)return false;
  const userId=S.user.id;
  const result=await db.from("account_approval_requests")
    .select("id,status,message,created_at,reviewed_at,review_note")
    .eq("user_id",userId)
    .order("created_at",{ascending:false})
    .limit(20);
  if(S.user?.id!==userId)return false;
  if(result.error){console.warn("Your account approval status could not be loaded:",result.error.message);return false;}
  S.ownApprovalRequests=result.data||[];
  renderAccountApprovalSettings();
  return true;
}
function renderAccountApprovalSettings(){
  const section=$("account-approval-settings-section");
  if(section)section.hidden=isFeedbackAdmin(S.user);
  if(isFeedbackAdmin(S.user))return;
  const statusNode=$("account-approval-status"),noteLabel=$("account-approval-message-label"),note=$("account-approval-message"),button=$("account-approval-submit");
  if(!statusNode||!button)return;
  const latest=S.ownApprovalRequests[0]||null,approved=!!S.user&&S.approvedUserIds.has(S.user.id);
  noteLabel.hidden=approved;
  if(approved){
    statusNode.className="account-approval-status approved";
    statusNode.textContent="Your account is approved. The Approved badge appears when someone looks you up to start a private message or group chat, or views your profile.";
    button.hidden=true;
  }else if(latest?.status==="pending"){
    statusNode.className="account-approval-status pending";
    statusNode.textContent="Your account is pending administrator review. You can use Gather normally while the review is in progress.";
    button.hidden=true;noteLabel.hidden=true;
  }else if(latest?.status==="declined"){
    statusNode.className="account-approval-status declined";
    statusNode.textContent="Your previous request was not approved. "+(latest.review_note||"You can submit a new request when you're ready.");
    button.hidden=false;button.textContent="Request approval again";noteLabel.hidden=false;
  }else if(latest?.status==="revoked"){
    statusNode.className="account-approval-status declined";
    statusNode.textContent="Your approved status was removed. You may submit a new request for review.";
    button.hidden=false;button.textContent="Request approval again";noteLabel.hidden=false;
  }else{
    statusNode.className="account-approval-status";
    statusNode.textContent="Your account is currently a regular Gather account. Approved status appears when members look you up to start a private message or group chat, or view your profile.";
    button.hidden=false;button.textContent="Request approved status";noteLabel.hidden=false;
  }
  if(noteLabel.hidden&&note)note.value="";
  button.disabled=!!S.approvalSubmitting;
}
async function submitAccountApprovalRequest(){
  if(!S.user||S.approvedUserIds.has(S.user.id))return;
  const button=$("account-approval-submit"),message=$("account-approval-message").value.trim();
  if(message.length>500){toast("Your application note must be 500 characters or fewer.");return;}
  button.disabled=true;S.approvalSubmitting=true;
  const result=await db.from("account_approval_requests").insert({user_id:S.user.id,message}).select("id,status,created_at").single();
  S.approvalSubmitting=false;button.disabled=false;
  if(result.error){
    if(result.error.code==="23505")toast("You already have a pending approval request.");
    else toast("Your approval request could not be submitted: "+result.error.message);
    await loadOwnApprovalRequests();return;
  }
  $("account-approval-message").value="";
  await loadOwnApprovalRequests();
  toast("Your approved-account request was sent for review.");
}
async function fetchProfileRecords(ids){
  const unique=[...new Set((ids||[]).filter(Boolean))];
  if(!unique.length)return {data:[],error:null};
  const profiles=await db.from("profiles").select("id,username,display_name,bio,pronouns,banner_style,status_message,profile_highlights").in("id",unique);
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
async function markActiveConversationUnread(){
  const conversationId=S.active;
  if(!S.user||!conversationId)return;
  const result=await db.rpc("mark_conversation_unread",{p_conversation_id:conversationId});
  if(result.error){toast("This conversation could not be marked unread: "+result.error.message);return;}
  if(result.data!==true){toast("There are no incoming messages in this conversation to mark unread.");return;}
  $("chat-actions-modal").hidden=true;
  await loadUnreadCounts();
  goHome();
  toast("Conversation marked as unread.");
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
  if(S.messageRestrictionChannel){db.removeChannel(S.messageRestrictionChannel);S.messageRestrictionChannel=null;}
  if(S.messageRestrictionTimer){clearInterval(S.messageRestrictionTimer);S.messageRestrictionTimer=null;}
  S.messageRestriction=null;S.messageRestrictionLoaded=false;S.messageRestrictionError="";
  renderMessageRestrictionNotice();
  if(S.undoSendTimer){clearTimeout(S.undoSendTimer);S.undoSendTimer=null;}
  S.pendingUndoSend=null;renderUndoSend();
  S.favoriteFriendIds=new Set();
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  if(S.pollChannel){db.removeChannel(S.pollChannel);S.pollChannel=null;}
  if(S.notificationChannel){db.removeChannel(S.notificationChannel);S.notificationChannel=null;}
  if(S.announcementChannel){db.removeChannel(S.announcementChannel);S.announcementChannel=null;}
  S.announcements=[];renderHomeAnnouncement();
  clearTimeout(S.draftSaveTimer);S.draftSaveTimer=null;
  clearTimeout(S.chatSettingsSaveTimer);S.chatSettingsSaveTimer=null;S.chatSettings=normalizeChatSettings(DEFAULT_CHAT_SETTINGS);
  S.selectingConversations=false;S.selectedConversationIds.clear();renderConversationSelectionControls();
  S.unreadTargetMessageId=null;S.unreadTargetLoaded=false;S.suppressReadDividerUpdates=false;
  if(S.homeSearchTimer){clearTimeout(S.homeSearchTimer);S.homeSearchTimer=null;}S.user=null;S.profile=null;S.homeSearchQuery="";S.homeSearchMessages=[];S.homeSearchProfiles=[];S.homeSearchRequestId=0;S.homeSearchErrors={messages:"",profiles:""};
  setChatLoadStatus("");$("auth").hidden=false;$("app").hidden=true;
}
function showApp(){ $("auth").hidden=true;$("app").hidden=false; }
function authMode(mode){
  S.mode=mode; const signUp=mode==="signup";
  document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("name-wrap").hidden=!signUp;$("name").required=signUp;
  $("auth-title").textContent=signUp?"Make yourself at home.":"Welcome back.";
  $("auth-subtitle").textContent=signUp?"Create an account to start talking.":"Sign in to see your conversations.";
  $("auth-password-hint").textContent=signUp?"New passwords must be 12+ characters with uppercase and lowercase letters, a number, and a symbol.":"Sign in with your existing password. New Gather accounts must use strong passwords.";
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
function activeMessageRestriction(){
  const restriction=S.messageRestriction;
  return restriction&&Number.isFinite(Date.parse(restriction.expires_at))&&Date.parse(restriction.expires_at)>Date.now()?restriction:null;
}
function formatRestrictionRemaining(milliseconds){
  let seconds=Math.max(0,Math.ceil(milliseconds/1000));
  const days=Math.floor(seconds/86400);seconds%=86400;
  const hours=Math.floor(seconds/3600);seconds%=3600;
  const minutes=Math.floor(seconds/60);seconds%=60;
  const parts=[];
  if(days)parts.push(days+"d");
  if(hours)parts.push(hours+"h");
  if(minutes)parts.push(minutes+"m");
  if(seconds||!parts.length)parts.push(seconds+"s");
  return parts.slice(0,2).join(" ");
}
function renderMessageRestrictionNotice(){
  const bannerIds=["home-message-restriction","chat-message-restriction"];
  const restriction=activeMessageRestriction();
  bannerIds.forEach(id=>{
    const banner=$(id);if(!banner)return;
    if(!S.user){banner.hidden=true;return;}
    banner.hidden=!!S.messageRestrictionLoaded&&!restriction;
    const title=banner.querySelector(".message-restriction-title");
    const detail=banner.querySelector(".message-restriction-detail");
    const retry=banner.querySelector(".message-restriction-retry");
    if(!S.messageRestrictionLoaded){
      if(title)title.textContent="Checking messaging permissions";
      if(detail)detail.textContent=S.messageRestrictionError||"Gather is checking whether your account can send messages.";
      if(retry)retry.hidden=!S.messageRestrictionError;
    }else if(restriction){
      const remaining=formatRestrictionRemaining(Date.parse(restriction.expires_at)-Date.now());
      if(title)title.textContent="Messaging temporarily restricted";
      if(detail)detail.textContent="You can send messages again in "+remaining+" ( "+new Date(restriction.expires_at).toLocaleString()+"). "+restriction.notice;
      if(retry)retry.hidden=true;
    }
  });
}
function syncMessageRestrictionTimer(){
  if(S.messageRestrictionTimer){clearInterval(S.messageRestrictionTimer);S.messageRestrictionTimer=null;}
  if(!activeMessageRestriction())return;
  S.messageRestrictionTimer=setInterval(()=>{
    if(!activeMessageRestriction()){
      S.messageRestriction=null;
      clearInterval(S.messageRestrictionTimer);S.messageRestrictionTimer=null;
      renderMessageRestrictionNotice();
      renderDirectControls();
      return;
    }
    renderMessageRestrictionNotice();
  },1000);
}
async function loadMessageRestriction(userId=S.user?.id){
  if(!userId)return false;
  const result=await db.from("message_restrictions")
    .select("user_id,expires_at,notice,created_at,created_by")
    .eq("user_id",userId)
    .maybeSingle();
  if(S.user?.id!==userId)return false;
  if(result.error){
    S.messageRestrictionLoaded=false;
    S.messageRestrictionError="Messaging permissions could not be verified. Sending is disabled until this check succeeds.";
    renderMessageRestrictionNotice();renderDirectControls();
    console.warn("Messaging restriction could not be checked:",result.error.message);
    return false;
  }
  S.messageRestrictionLoaded=true;
  S.messageRestrictionError="";
  S.messageRestriction=result.data&&Date.parse(result.data.expires_at)>Date.now()?result.data:null;
  syncMessageRestrictionTimer();
  renderMessageRestrictionNotice();renderDirectControls();
  return true;
}
function subscribeMessageRestriction(userId=S.user?.id){
  if(S.messageRestrictionChannel){db.removeChannel(S.messageRestrictionChannel);S.messageRestrictionChannel=null;}
  if(!userId)return;
  const channel=db.channel("message-restrictions-"+userId)
    .on("postgres_changes",{event:"*",schema:"public",table:"message_restrictions"},payload=>{
      if(S.user?.id!==userId)return;
      const row=payload.new?.user_id===userId?payload.new:payload.old?.user_id===userId?payload.old:null;
      if(!row)return;
      if(payload.eventType==="DELETE")S.messageRestriction=null;
      else if(payload.new?.user_id===userId){
        S.messageRestriction=Date.parse(payload.new.expires_at)>Date.now()?payload.new:null;
      }
      S.messageRestrictionLoaded=true;S.messageRestrictionError="";
      syncMessageRestrictionTimer();
      renderMessageRestrictionNotice();renderDirectControls();
      if(S.admin.selectedUserId===userId){
        const member=S.admin.users.find(item=>item.id===userId);
        if(member){member.message_restriction=S.messageRestriction;renderAdminAccountDetail();}
      }
    })
    .subscribe((status,error)=>{
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
        console.warn("Messaging restriction live updates are unavailable:",error||status);
        void loadMessageRestriction(userId);
      }
    });
  S.messageRestrictionChannel=channel;
}
async function signedIn(user,retry=false){
  if(!user||S.loading===user.id)return;
  if(!retry&&S.user&&S.user.id===user.id&&S.profile)return;
  S.loading=user.id;S.user=user;S.loadError=null;syncAdminModeButton();$("feedback-admin-open").hidden=!isFeedbackAdmin(user);$("feedback-admin-settings-section").hidden=!isFeedbackAdmin(user);showApp();
  try{
    S.profile=await ensureProfile(user);
    if(S.user?.id!==user.id)return;
    await loadMessageRestriction(user.id);
    if(S.user?.id!==user.id)return;
    subscribeMessageRestriction(user.id);
    await Promise.all([loadApprovedUserIds(),loadOwnApprovalRequests()]);
    if(S.user?.id!==user.id)return;
    renderAccountApprovalSettings();
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
  const other=c.members.find(m=>m.user_id!==S.user.id);
  if(c.admin_initiated&&other?.user_id===c.created_by)return "Gather Admin";
  return other&&S.profiles[other.user_id]?S.profiles[other.user_id].display_name:"Direct message";
}
function chatSub(c){
  if(c.kind==="group"){const names=c.members.map(m=>S.profiles[m.user_id]?.display_name||"Member");return c.members.length+" members"+(c.description?" · "+c.description:" · "+names.slice(0,3).join(", ")+ (c.members.length>3?" + more":""));}
  const other=c.members.find(m=>m.user_id!==S.user.id),p=other&&S.profiles[other.user_id];
  return p?"@"+p.username:"Private conversation";
}
async function loadChats(){
  if(!S.user)return false;
  S.loadError=null;
  const hidden=await db.from("user_deleted_messages").select("message_id").eq("user_id",S.user.id);
  if(hidden.error){S.loadError="Deleted-message settings could not be loaded: "+hidden.error.message;toast(S.loadError);return false;}
  S.deletedMessageIds=new Set((hidden.data||[]).map(x=>x.message_id));
  const m=await db.from("conversation_members").select("conversation_id,role,conversations!inner(id,kind,title,description,updated_at,created_by,admin_initiated)").eq("user_id",S.user.id);
  if(m.error){S.loadError="Chats could not be loaded: "+m.error.message;toast(S.loadError);return false;}
  const rows=m.data||[],ids=[...new Set(rows.map(x=>x.conversation_id))];
  if(!ids.length){S.chats=[];S.profiles={};await loadUnreadCounts();renderChats();renderActive();return await loadRequests();}
  const [members,msgs,groupPics]=await Promise.all([
    db.from("conversation_members").select("conversation_id,user_id,role").in("conversation_id",ids),
    db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,attachment_path,forwarded_from_id,is_admin_message").in("conversation_id",ids).order("created_at",{ascending:false}).limit(200),
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
  S.chats=rows.map(x=>({...x.conversations,avatar_data:groupAvatarByChat[x.conversation_id]||null,members:byChat[x.conversation_id]||[],last:last[x.conversation_id]||null,hasMessages:!!hasMessages[x.conversation_id]})).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
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
  const r=await db.from("conversation_requests").select("id,sender_id,recipient_id,status,created_at").or("sender_id.eq."+S.user.id+",recipient_id.eq."+S.user.id).order("created_at",{ascending:false}).limit(200);
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
  const uid=S.user.id;
  const [friendsResult,requestsResult,favoritesResult]=await Promise.all([
    db.from("friendships").select("friend_id,created_at").eq("user_id",uid).order("created_at",{ascending:false}),
    db.from("friend_requests").select("id,sender_id,recipient_id,status,created_at").or("sender_id.eq."+uid+",recipient_id.eq."+uid).order("created_at",{ascending:false}).limit(80),
    db.from("favorite_friends").select("friend_id").eq("user_id",uid)
  ]);
  if(S.user?.id!==uid)return false;
  if(friendsResult.error||requestsResult.error){
    const reason=friendsResult.error?.message||requestsResult.error?.message||"Unknown database error";
    console.error("Gather friends could not be loaded:",reason);
    $("friends-error").textContent="Friends could not be loaded. "+reason;
    return false;
  }
  if(favoritesResult.error){
    console.warn("Favorite friends could not be loaded:",favoritesResult.error.message);
    S.favoriteFriendIds=new Set();
  }else S.favoriteFriendIds=new Set((favoritesResult.data||[]).map(x=>x.friend_id));
  S.friends=friendsResult.data||[];
  S.friendRequests=requestsResult.data||[];
  const ids=[...new Set([
    ...S.friends.map(x=>x.friend_id),
    ...S.friendRequests.flatMap(x=>[x.sender_id,x.recipient_id].filter(id=>id!==uid))
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
function renderMessages(preserveScroll=false){
  document.querySelectorAll(".message-action-menu[data-floating-menu='true']").forEach(menu=>menu.remove());
  const list=$("messages");
  if(!list)return;
  const previousHeight=list.scrollHeight,previousTop=list.scrollTop;
  list.replaceChildren();
  list.setAttribute("aria-busy","false");
  const activeChat=S.chats.find(chat=>chat.id===S.active);
  const showSenderNames=activeChat?.kind==="group";
  const latestOwnMessageId=[...S.messages].reverse().find(message=>message.sender_id===S.user.id)?.id||null;
  const pinnedBanner=renderPinnedMessageBanner();if(pinnedBanner)list.append(pinnedBanner);
  const visibleMessages=S.messages.slice(-MESSAGE_RENDER_LIMIT);
  if(!visibleMessages.length){
    list.append(el("p","muted tiny","This is the beginning of the conversation. Say hello."));
    return;
  }
  visibleMessages.forEach((m,index)=>{
    const mine=m.sender_id===S.user.id,p=S.profiles[m.sender_id];
    const samePrevious=visibleMessages[index-1]?.sender_id===m.sender_id;
    const sameNext=visibleMessages[index+1]?.sender_id===m.sender_id;
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
    if(m.is_admin_message)meta.append(el("small","message-admin-label","Gather Admin"));
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
      if(mine&&m.body&&!m.is_admin_message&&S.messageRestrictionLoaded&&!activeMessageRestriction())addAction("Edit",()=>editOwnMessage(m));
      if(mine&&m._undoExpiresAt>Date.now())addAction("Undo send",()=>undoSendMessage(m));
      addAction("Copy message",()=>copyMessage(m));
      if(S.messageRestrictionLoaded&&!activeMessageRestriction())addAction("Forward message",()=>openForwardMessage(m));
      addAction(S.pinnedMessages.some(x=>x.message_id===m.id)?"Unpin message":"Pin message",()=>togglePinnedMessage(m));
      addAction(S.savedMessageIds.has(m.id)?"Remove saved message":"Save message",()=>toggleSavedMessage(m));
      if(!mine&&m.sender_id)addAction("Report",()=>openReport(m.sender_id,m.id));
      menuWrap.append(trigger,menu);
      meta.append(menuWrap);
      if(!menu.hidden){
        menu.dataset.floatingMenu="true";
        menu._anchorTrigger=trigger;
        document.body.append(menu);
        requestAnimationFrame(()=>positionMessageActionMenu(menu,trigger));
      }
    }
    bubble.append(meta);
    if(m.reply_to_id){
      const quote=el("div","reply-preview"),target=m.reply_preview;
      const quoteName=target?.is_admin_message?"Gather Admin":(target?.sender_id?(target.sender_id===S.user.id?"You":(S.profiles[target.sender_id]?.display_name||"Member")):"Reply");
      if(showSenderNames)quote.append(el("strong","",quoteName));
      const quoteText=el("span");
      if(target?.body)appendFormattedMessageText(quoteText,target.body);
      else quoteText.textContent=target?.attachment_path?"Sent an image":"Original message unavailable.";
      quote.append(quoteText);
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
    if(m.body&&!S.messagePolls[m.id]){
      const bodyText=el("div","body-text");
      appendFormattedMessageText(bodyText,m.body);
      bubble.append(bodyText);
    }
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

return true;
})();
