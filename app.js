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
const DEFAULT_PREFERENCES = {accent:"lavender",fontSize:"normal",theme:"dark",messageNotificationMode:"temporary",notificationSound:"off",directMessageRequests:"everyone",groupUnreadMessages:false,shareOnlineStatus:true,quietHoursEnabled:false,quietHoursStart:"22:00",quietHoursEnd:"07:00"};
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
const S = { user:null, profile:null, profiles:{}, modalBackTargets:{}, approvedUserIds:new Set(), ownApprovalRequests:[], chatSettings:{...DEFAULT_CHAT_SETTINGS}, draftSaveTimer:null, selectingConversations:false, selectedConversationIds:new Set(), unreadTargetMessageId:null, unreadTargetLoaded:false, unreadDividerMessageId:null, unreadDividerTimer:null, unreadDividerArmed:false, suppressReadDividerUpdates:false, announcements:[], activeAnnouncementId:null, announcementInView:null, announcementChannel:null, feedbackThreads:[], feedbackMessages:[], feedbackProfiles:{}, activeFeedbackThreadId:null, feedbackAdminView:false, notifications:[], notificationChannel:null, notificationView:"all", publicProfileId:null, reportTargetUserId:null, reportTargetMessageId:null, chats:[], requests:[], friendRequests:[], friends:[], favoriteFriendIds:new Set(), archivedConversationIds:new Set(), blockedUsers:[], deletedMessages:[], deletedMessageIds:new Set(), deletedConversationId:null, selectingMessages:false, selectedMessageIds:new Set(), folder:"friends", lastReadAt:{}, preferences:{...DEFAULT_PREFERENCES}, notificationTimers:{}, unreadCounts:{}, unreadCountsLoaded:false, totalUnreadCount:0, passwordRecovery:false, pendingAvatarData:null, avatarChanged:false, pendingImageFile:null, pendingImageUrl:null, pendingUndoSend:null, undoSendTimer:null, undoCountdownInterval:null, pendingGroupAvatarData:null, groupAvatarChanged:false, groupAvatarConversationId:null, requestChannel:null, readChannel:null, messageReads:{}, messageReactions:{}, pendingReactionKeys:new Set(), openReactionPickerMessageId:null, openMessageMenuId:null, hasOlderMessages:false, loadingOlder:false, replyTo:null, messagePolls:{}, pinnedMessages:[], savedMessageIds:new Set(), pollChannel:null, forwardMessage:null, searchConversationId:null, searchQuery:"", searchOffset:0, searchHasMore:false, homeSearchQuery:"", homeSearchTab:"messages", homeSearchMessages:[], homeSearchProfiles:[], homeSearchLoading:false, homeSearchErrors:{messages:"",profiles:""}, homeSearchTimer:null, homeSearchRequestId:0, directStatus:null, directStatusCache:new Map(), directStatusChecks:new Map(), groupMessageStatus:null, ageStatus:null, ageChangeStatus:null, ageRequestChannel:null, messageRestriction:null, messageRestrictionLoaded:false, messageRestrictionError:"", messageRestrictionChannel:null, messageRestrictionTimer:null, active:null, messages:[], initialChatScrollLockId:null, channel:null, mode:"signin", picker:"direct", selected:new Set(), loading:null, loadError:null, timer:null, friendPresenceChannels:new Map(), friendPresenceRetryTimers:new Map(), friendPresenceRetryAttempts:new Map(), ownPresenceChannel:null, ownPresenceRetryTimer:null, ownPresenceRetryAttempt:0, lastSeenHeartbeatTimer:null, presenceDisplayTimer:null, onlineStatuses:{}, typingChannel:null, typingReady:false, typingSent:false, typingLastSentAt:0, typingStopTimer:null, typingRemoteTimer:null, typingUsers:new Map(), admin:{users:[],page:0,hasMore:false,selectedUserId:null,section:"overview",loading:false,summary:null,activity:[],intergroupRequests:[],ageChangeRequests:[],modalStack:[],approvalPending:[],approvalApproved:[]} };

function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
function appendSafeText(parent,value){
  const source=String(value??"");
  const pattern=/https?:\/\/[^\s<>"']+/gi;
  let last=0,match;
  while((match=pattern.exec(source))){
    let raw=match[0],urlText=raw;
    while(/[.,!?;:)]$/.test(urlText))urlText=urlText.slice(0,-1);
    if(match.index>last)parent.append(document.createTextNode(source.slice(last,match.index)));
    let safeUrl=null;
    try{
      const parsed=new URL(urlText);
      if(parsed.protocol==="http:"||parsed.protocol==="https:")safeUrl=parsed.href;
    }catch(error){}
    if(!safeUrl){parent.append(document.createTextNode(raw));last=match.index+raw.length;continue;}
    const link=el("a","message-link",urlText);
    link.href=safeUrl;link.target="_blank";link.rel="noopener noreferrer nofollow";
    link.addEventListener("click",event=>{
      event.preventDefault();
      let host;
      try{host=new URL(safeUrl).hostname;}catch(error){return;}
      if(confirm("You're opening an external website ("+host+"). Only continue if you trust this link.")){
        window.open(safeUrl,"_blank","noopener,noreferrer");
      }
    });
    parent.append(link);
    if(urlText.length<raw.length)parent.append(document.createTextNode(raw.slice(urlText.length)));
    last=match.index+raw.length;
  }
  if(last<source.length)parent.append(document.createTextNode(source.slice(last)));
}
function appendFormattedMessageText(parent,value){
  const source=String(value??"");
  const pattern=/\*\*([\s\S]+?)\*\*|#([\s\S]+?)#/g;
  let last=0,match;
  while((match=pattern.exec(source))){
    if(match.index>last)appendSafeText(parent,source.slice(last,match.index));
    const formatted=document.createElement(match[1]!==undefined?"strong":"em");
    appendFormattedMessageText(formatted,match[1]??match[2]);
    parent.append(formatted);
    last=pattern.lastIndex;
  }
  if(last<source.length)appendSafeText(parent,source.slice(last));
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
    notificationSound:["off","soft","chime"].includes(saved?.notificationSound)?saved.notificationSound:"off",
    directMessageRequests:saved?.directMessageRequests==="friends_only"?"friends_only":"everyone",
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
  root.style.colorScheme=isLight?"light":"dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",isLight?"#f3f5fa":"#000000");
  // Match the browser-tab icon to the member's saved theme and accent.
  const faviconBg=isLight?"#f3f5fa":"#090b11";
  const faviconInk=isLight?"#263044":"#f6f3ff";
  const faviconSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${faviconBg}"/><circle cx="32" cy="32" r="22" fill="${accent.accent}" opacity=".18"/><circle cx="32" cy="32" r="19" fill="none" stroke="${accent.accent}" stroke-width="4"/><circle cx="32" cy="32" r="12.5" fill="none" stroke="${faviconInk}" stroke-width="3"/><circle cx="32" cy="32" r="5.5" fill="${accent.strong}"/></svg>`;
  // Recolor every in-page Gather brand mark, not just the browser favicon.
  const brandMarkSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${accent.accent}"/><circle cx="32" cy="32" r="22" fill="${accent.strong}" opacity=".2"/><circle cx="32" cy="32" r="19" fill="none" stroke="${faviconInk}" stroke-width="3.4"/><circle cx="32" cy="32" r="12.5" fill="none" stroke="${faviconInk}" stroke-width="2.8"/><circle cx="32" cy="32" r="5.5" fill="none" stroke="${faviconInk}" stroke-width="2.4"/></svg>`;
  const brandMarkUrl="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(brandMarkSvg);
  document.querySelectorAll(".brand-icon img,.announcement-admin-mark.brand-mark img,.home-announcement-mark.brand-mark img").forEach(img=>{img.src=brandMarkUrl;});
  let faviconLink=document.querySelector('link[rel="icon"]');
  if(!faviconLink){faviconLink=document.createElement("link");faviconLink.rel="icon";faviconLink.type="image/svg+xml";document.head.append(faviconLink);}
  faviconLink.href="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(faviconSvg);
  root.style.setProperty("--accent",accent.accent);
  root.style.setProperty("--brand-mark-border",`color-mix(in srgb,${accent.accent} 72%,white)`);
  root.style.setProperty("--brand-mark-shadow",`color-mix(in srgb,${accent.accent} 25%,transparent)`);
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
  // A deeper shade of the selected accent gives the top bar a distinct, coordinated highlight.
  root.style.setProperty("--accent-topbar",`color-mix(in srgb,${accent.accent} 46%,#090b11)`);
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
  const soundSelect=$("notification-sound-mode");if(soundSelect)soundSelect.value=S.preferences.notificationSound;
  const requestModeSelect=$("direct-message-requests-mode");if(requestModeSelect)requestModeSelect.value=S.preferences.directMessageRequests;
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
  const custom=appearance.accent!=="default"||!!background;
  chat.classList.toggle("chat-appearance-custom",custom);
  if(custom){
    chat.style.setProperty("--conversation-accent",accent.accent);
    chat.style.setProperty("--conversation-accent-ink",accent.ink);
    chat.style.setProperty("--conversation-accent-soft",accent.soft);
    chat.style.setProperty("--conversation-accent-border",accent.border);
    chat.style.setProperty("--conversation-background",background||(S.preferences.theme==="light"?"#f5f6fa":"#000000"));
  }else{
    ["--conversation-accent","--conversation-accent-ink","--conversation-accent-soft","--conversation-accent-border","--conversation-background"].forEach(key=>chat.style.removeProperty(key));
  }
}
function renderChatOptions(){
  const settings=chatSettingsFor();
  $("toggle-chat-pin").textContent=settings.pinned?"Unpin conversation":"Pin conversation";
  $("toggle-chat-mute").textContent=settings.muted?"Unmute notifications":"Mute notifications";
  $("archive-conversation").textContent=S.archivedConversationIds?.has(S.active)?"Unarchive conversation":"Archive conversation";
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
  const profileById=new Map((profiles.data||[]).map(profile=>[profile.id,profile]));
  const missing=unique.filter(userId=>!profileById.has(userId));
  if(missing.length){
    // RLS intentionally hides full profiles for accounts that aren't age-eligible.
    // Conversation members may still identify one another by display name/username only.
    const sharedNames=await db.rpc("get_shared_conversation_names",{p_user_ids:missing});
    if(sharedNames.error){
      console.warn("Shared-conversation member names could not be loaded:",sharedNames.error.message);
    }else{
      (sharedNames.data||[]).forEach(profile=>{
        if(!profileById.has(profile.id))profileById.set(profile.id,profile);
      });
    }
  }
  const records=[...profileById.values()].map(profile=>({...profile,avatar_data:null}));
  const pictures=await db.from("profile_avatars").select("user_id,image_data").in("user_id",unique);
  if(pictures.error){
    console.warn("Gather profile pictures could not be loaded:",pictures.error.message);
  }else{
    const byUser=new Map((pictures.data||[]).map(x=>[x.user_id,x.image_data]));
    records.forEach(profile=>profile.avatar_data=byUser.get(profile.id)||null);
  }
  return {data:records,error:null};
}
function syncOwnAvatar(){
  if(!S.profile)return;
  paintAvatar($("user-initial"),S.profile.display_name,S.profile.avatar_data);
  paintAvatar($("profile-avatar-preview"),S.profile.display_name,S.profile.avatar_data);
}
function dateLabel(s){
  if(!s)return "";
  const date=new Date(s);
  if(Number.isNaN(date.getTime()))return "";

  const now=new Date();
  const todayUtc=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const dateUtc=Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
  const dayDifference=Math.round((todayUtc-dateUtc)/86400000);

  if(dayDifference===0){
    return date.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  }
  if(dayDifference===1)return "Yesterday";
  if(dayDifference>1&&dayDifference<7)return dayDifference+" days ago";
  if(dayDifference>=7){
    const weeks=Math.floor(dayDifference/7);
    return weeks+" week"+(weeks===1?"":"s")+" ago";
  }
  if(dayDifference===-1)return "Tomorrow";
  if(dayDifference< -1)return "In "+Math.abs(dayDifference)+" days";
  return date.toLocaleDateString([],{month:"short",day:"numeric"});
}
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
  const requestingUserId=S.user.id;
  try{
    const result=await db.rpc("mark_conversation_read",{p_conversation_id:chatId});
    if(result.error){
      console.warn("Conversation read status could not be saved:",result.error.message);
      if(wasActive&&S.active===chatId)toast("Messages could not be marked as seen. Please try again.");
      return false;
    }
    if(S.user?.id!==requestingUserId)return false;
    if(S.active===chatId){
      clearUnreadDividerState();
      S.unreadTargetMessageId=null;
      S.unreadTargetLoaded=true;
      const lastIncoming=[...S.messages].reverse().find(message=>message.sender_id!==S.user.id);
      if(lastIncoming)markChatRead(chatId,lastIncoming.created_at);
      await loadMessageReads(chatId,S.messages.map(message=>message.id));
      if(S.active!==chatId)return true;
      renderMessages(true);
    }
    await markConversationNotificationsRead(chatId);
    if(S.user?.id!==requestingUserId)return false;
    await loadUnreadCounts();
    if(S.active===chatId)renderMessages(true);
    renderChats();
    return true;
  }catch(error){
    console.warn("Conversation read status could not be saved:",error?.message||error);
    if(S.active===chatId)toast("Messages could not be marked as seen. Please try again.");
    return false;
  }
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
  window.GatherGames?.shutdown();
  window.GatherTag?.shutdown();
  window.GatherUno?.shutdown();
  window.GatherLudo?.shutdown();
  saveActiveChatDraft();clearUnreadDividerState();
  closeTypingChannel();
  stopOnlinePresence();
  clearPendingMessageImage();clearMessageNotifications();
  $("password-recovery-modal").hidden=true;S.passwordRecovery=false;
  if(S.channel){db.removeChannel(S.channel);S.channel=null;}
  if(S.requestChannel){db.removeChannel(S.requestChannel);S.requestChannel=null;}
  if(S.messageRestrictionChannel){db.removeChannel(S.messageRestrictionChannel);S.messageRestrictionChannel=null;}
  if(S.ageRequestChannel){db.removeChannel(S.ageRequestChannel);S.ageRequestChannel=null;}
  if(S.messageRestrictionTimer){clearInterval(S.messageRestrictionTimer);S.messageRestrictionTimer=null;}
  S.ageStatus=null;$("age-verification-modal").hidden=true;
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
  if(S.homeSearchTimer){clearTimeout(S.homeSearchTimer);S.homeSearchTimer=null;}S.user=null;S.profile=null;S.homeSearchQuery="";S.homeSearchMessages=[];S.homeSearchProfiles=[];S.homeSearchRequestId++;S.homeSearchLoading=false;S.modalBackTargets={};syncAdminModeButton();S.admin={users:[],page:0,hasMore:false,selectedUserId:null,section:"overview",loading:false,summary:null,activity:[]};S.messageReactions={};S.messagePolls={};S.pinnedMessages=[];S.savedMessageIds=new Set();S.forwardMessage=null;S.pendingReactionKeys.clear();S.openReactionPickerMessageId=null;S.openMessageMenuId=null;S.notifications=[];S.feedbackAdminView=false;$("feedback-admin-open").hidden=true;$("feedback-admin-settings-section").hidden=true;S.profiles={};S.chats=[];S.messages=[];S.messageReads={};S.replyTo=null;S.hasOlderMessages=false;S.requests=[];S.friendRequests=[];S.friends=[];S.blockedUsers=[];S.deletedMessages=[];S.deletedMessageIds=new Set();S.lastReadAt={};S.folder="friends";S.archivedConversationIds=new Set();S.directStatus=null;S.directStatusCache.clear();S.active=null;S.messages=[];S.loadError=null;S.avatarChanged=false;S.pendingAvatarData=null;loadUIPreferences(DEFAULT_PREFERENCES);
  setChatLoadStatus("");$("auth").hidden=false;$("app").hidden=true;
}
function runScreenTransition(update){
  if(typeof update!=="function")return;
  const main=document.querySelector(".main");
  const reduceMotion=!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let updateApplied=false;
  const applyUpdate=()=>{
    if(updateApplied)return;
    updateApplied=true;
    update();
  };
  if(!reduceMotion&&typeof document.startViewTransition==="function"){
    try{
      document.startViewTransition(applyUpdate);
      return;
    }catch(error){
      // Use the fallback if the browser cannot start a view transition.
      if(updateApplied)return;
    }
  }
  applyUpdate();
  if(reduceMotion||!main)return;
  main.classList.remove("gather-screen-enter");
  void main.offsetWidth;
  main.classList.add("gather-screen-enter");
  clearTimeout(main._gatherScreenTimer);
  main._gatherScreenTimer=setTimeout(()=>main.classList.remove("gather-screen-enter"),320);
}
function showApp(){
  runScreenTransition(()=>{
    $("auth").hidden=true;
    $("app").hidden=false;
  });
}
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
function showAgeVerificationGate(ageStatus){
  S.ageStatus=ageStatus||null;
  const modal=$("age-verification-modal"),form=$("age-verification-form"),date=$("age-birth-date"),submit=$("age-verification-submit"),statusNode=$("age-verification-status"),note=$("age-verification-note");
  modal.hidden=false;statusNode.textContent="";
  const profileLink=$("age-verification-open-profile");if(profileLink)profileLink.hidden=!S.profile;
  if(ageStatus?.verified&&ageStatus?.eligible===false){
    note.textContent="This account is outside Gather's supported age range of 12–18. Messaging is unavailable on this account.";
    form.hidden=true;
  }else{
    note.textContent="Enter your date of birth to confirm you're between 12 and 18. This is a self-declared age check, not independent identity verification. Gather stores the birth date privately; other members and admins see only your age group.";
    form.hidden=false;date.value="";submit.disabled=false;
  }
}
async function loadMyAgeStatus(){
  const result=await db.rpc("get_my_age_status");
  if(result.error)throw result.error;
  S.ageStatus=result.data||null;
  return S.ageStatus;
}
async function loadMyAgeChangeStatus(){
  const result=await db.rpc("get_my_age_change_status");
  if(result.error)throw result.error;
  S.ageChangeStatus=result.data||{};
  return S.ageChangeStatus;
}
function renderProfileAgeSection(){
  const section=$("profile-age-section"),summary=$("profile-age-summary"),form=$("profile-age-form");
  const date=$("profile-age-birth-date"),button=$("profile-age-submit");
  if(!section||!summary||!form||!date||!button)return;
  section.hidden=false;
  // Admins complete the same private date-of-birth check and age-group assignment as members.
  const age=S.ageStatus||{},request=S.ageChangeStatus||{};
  const verified=age.verified===true&&age.eligible===true;
  const pending=request.status==="pending";
  const today=new Date();
  date.max=today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
  date.value="";
  if(verified){
    summary.textContent="Current age group: "+(age.age_group||"Confirmed")+". Your exact date of birth stays private. A correction is reviewed by Gather Admin before it changes your age group.";
    form.hidden=false;date.disabled=pending;button.disabled=pending;
    button.textContent=pending?"Correction awaiting review":"Request age correction";
    if(pending)status("profile-age-status","Your age correction to "+(request.proposed_age_group||"the requested group")+" is pending Admin review.","pending");
    else if(request.status==="declined")status("profile-age-status","Your last age correction request was declined. You may submit a new correction if needed.","error");
    else if(request.status==="approved")status("profile-age-status","Your latest age correction was approved on "+dateLabel(request.reviewed_at)+".","success");
    else status("profile-age-status","Age confirmed. You can request a correction below.","");
  }else if(age.verified===true&&age.eligible===false){
    summary.textContent="This account is outside Gather’s supported age range of 12–18. Age changes require help from Gather Admin.";
    form.hidden=true;status("profile-age-status","Contact Gather Admin for an age-record review.","error");
  }else{
    summary.textContent="Add your date of birth to finish setting up your existing account. Gather uses it to assign the 12–14 or 15–18 group. Your date of birth is kept private.";
    form.hidden=false;date.disabled=false;button.disabled=false;button.textContent="Confirm age";
    status("profile-age-status","This is a self-declared age check, not independent identity verification.","");
  }
}
async function refreshProfileAgeSettings(){
  try{
    await loadMyAgeStatus();
    await loadMyAgeChangeStatus();
    renderProfileAgeSection();
  }catch(error){
    status("profile-age-status","Age information could not be loaded. Please close Profile and try again.","error");
  }
}
async function submitProfileAgeForm(event){
  event.preventDefault();
  const birthDate=$("profile-age-birth-date").value;
  if(!birthDate){status("profile-age-status","Enter your date of birth.","error");return;}
  const button=$("profile-age-submit");button.disabled=true;
  const changing=S.ageStatus?.verified===true&&S.ageStatus?.eligible===true;
  status("profile-age-status",changing?"Submitting age correction for review…":"Confirming your age…");
  const result=changing
    ?await db.rpc("request_my_age_change",{p_new_birth_date:birthDate})
    :await db.rpc("confirm_my_age",{p_birth_date:birthDate});
  button.disabled=false;
  if(result.error){status("profile-age-status",result.error.message,"error");return;}
  if(changing){
    await loadMyAgeChangeStatus();
    renderProfileAgeSection();
    toast("Your age correction was submitted for Gather Admin review.");
    return;
  }
  S.ageStatus=result.data||null;
  if(!S.ageStatus?.eligible){
    renderProfileAgeSection();
    status("profile-age-status","This account is not eligible to use Gather.","error");
    return;
  }
  $("profile-modal").hidden=true;
  $("age-verification-modal").hidden=true;
  toast("Age confirmed. Your age group is "+S.ageStatus.age_group+".");
  const user=S.user;if(user)await signedIn(user,true);
}
function openProfileFromAgeGate(){
  if(!S.profile)return;
  openProfile();
  $("profile-modal").style.zIndex="21";
}

async function submitAgeVerification(event){
  event.preventDefault();
  const birthDate=$("age-birth-date").value;
  if(!birthDate){status("age-verification-status","Enter your date of birth.","error");return;}
  const button=$("age-verification-submit");button.disabled=true;
  status("age-verification-status","Confirming your age…");
  const result=await db.rpc("confirm_my_age",{p_birth_date:birthDate});
  button.disabled=false;
  if(result.error){status("age-verification-status",result.error.message,"error");return;}
  S.ageStatus=result.data||null;
  if(!S.ageStatus?.eligible){showAgeVerificationGate(S.ageStatus);status("age-verification-status","This account is not eligible to use Gather.","error");return;}
  $("age-verification-modal").hidden=true;
  toast("Age confirmed. Your age group is "+S.ageStatus.age_group+".");
  const user=S.user;if(user)await signedIn(user,true);
}
function subscribeIntergroupRequests(){
  if(S.ageRequestChannel){db.removeChannel(S.ageRequestChannel);S.ageRequestChannel=null;}
  if(!S.user)return;
  const uid=S.user.id;
  S.ageRequestChannel=db.channel("intergroup-requests-"+uid)
    .on("postgres_changes",{event:"*",schema:"public",table:"intergroup_message_requests"},payload=>{
      if(S.user?.id!==uid)return;
      const row=payload.new||payload.old;
      const admin=isFeedbackAdmin(S.user);
      if(!row||(!admin&&row.requester_id!==uid&&row.target_user_id!==uid))return;
      if(admin){
        if(payload.eventType==="INSERT"){
          toast("A new intergroup messaging request is awaiting Admin review.");
          if(S.admin.section==="age-access")void loadAdminIntergroupRequests();
        }else if(S.admin.section==="age-access")void loadAdminIntergroupRequests();
        return;
      }
      if(payload.eventType==="INSERT"&&row.target_user_id===uid)toast("A member requested intergroup messaging. Gather Admin will review it.");
      else if(payload.eventType==="UPDATE"&&row.status==="approved"){
        toast(row.requester_id===uid
          ?"Gather Admin approved your request. You can now send a regular chat request to this member."
          :"Gather Admin approved intergroup messaging for a member. You may receive a chat request.");
      }else if(payload.eventType==="UPDATE"&&row.status==="declined"&&row.requester_id===uid)toast("Your intergroup messaging request was declined.");
      else if(payload.eventType==="UPDATE"&&row.status==="revoked")toast("An intergroup messaging permission was revoked.");
      if(!admin&&payload.eventType==="UPDATE"&&["approved","revoked","declined"].includes(row.status)&&S.active){
        const activeChat=S.chats.find(item=>item.id===S.active);
        const includesRequester=activeChat?.members.some(member=>member.user_id===row.requester_id);
        const includesTarget=activeChat?.members.some(member=>member.user_id===row.target_user_id);
        if(includesRequester&&includesTarget)void refreshDirectStatus(S.active);
      }
    }).subscribe();
}
async function signedIn(user,retry=false){
  if(!user||S.loading===user.id)return;
  if(!retry&&S.user&&S.user.id===user.id&&S.profile)return;
  S.loading=user.id;S.user=user;S.loadError=null;syncAdminModeButton();$("feedback-admin-open").hidden=!isFeedbackAdmin(user);$("feedback-admin-settings-section").hidden=!isFeedbackAdmin(user);showApp();setChatLoadStatus("Loading your chats…");
  try{
    S.profile=await ensureProfile(user);
    if(S.user?.id!==user.id)return;
    const ageStatus=await loadMyAgeStatus();
    if(!ageStatus?.verified||ageStatus?.eligible===false){showAgeVerificationGate(ageStatus);return;}
    $("age-verification-modal").hidden=true;
    subscribeIntergroupRequests();
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
    window.GatherGames?.init({db,user:()=>S.user,chats:()=>S.chats,activeChatId:()=>S.active,profiles:()=>S.profiles,toast,onGamesUpdated:()=>{renderNotificationBadge();if(S.notificationView==="games"||S.notificationView==="all")renderNotifications();}});
    window.GatherTag?.init({db,user:()=>S.user,chats:()=>S.chats,profiles:()=>S.profiles,toast});
    window.GatherUno?.init({db,user:()=>S.user,chats:()=>S.chats,profiles:()=>S.profiles,toast});
    window.GatherLudo?.init({db,user:()=>S.user,chats:()=>S.chats,profiles:()=>S.profiles,toast});
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
  if(c.kind==="group")return c.title?.trim()||"Group chat";
  const other=c.members.find(m=>m.user_id!==S.user.id);
  const profile=other&&S.profiles[other.user_id];
  const displayName=profile?.display_name?.trim();
  const username=profile?.username?.trim();
  return displayName||(username?"@"+username:"Gather member");
}
function chatSub(c){
  if(c.kind==="group"){
    const names=c.members.map(member=>{
      const profile=S.profiles[member.user_id];
      return profile?.display_name?.trim()||(profile?.username?.trim()?"@"+profile.username.trim():"Member");
    });
    return c.members.length+" members"+(c.description?" · "+c.description:" · "+names.slice(0,3).join(", "));
  }
  const other=c.members.find(m=>m.user_id!==S.user.id),profile=other&&S.profiles[other.user_id];
  return profile?.username?.trim()?"@"+profile.username.trim():profile?.display_name?.trim()||"Private conversation";
}
async function loadChats(){
  if(!S.user)return false;
  S.loadError=null;
  const hidden=await db.from("user_deleted_messages").select("message_id").eq("user_id",S.user.id);
  if(hidden.error){S.loadError="Deleted-message settings could not be loaded: "+hidden.error.message;toast(S.loadError);return false;}
  S.deletedMessageIds=new Set((hidden.data||[]).map(x=>x.message_id));
  const archived=await db.from("user_archived_conversations").select("conversation_id").eq("user_id",S.user.id);
  if(archived.error){console.warn("Archived conversations could not be loaded:",archived.error.message);S.archivedConversationIds=new Set();}
  else S.archivedConversationIds=new Set((archived.data||[]).map(x=>x.conversation_id));
  const m=await db.from("conversation_members").select("conversation_id,role,conversations!inner(id,kind,title,description,updated_at,created_by,admin_initiated,slow_mode_seconds,guidelines)").eq("user_id",S.user.id);
  if(m.error){S.loadError="Chats could not be loaded: "+m.error.message;toast(S.loadError);return false;}
  const rows=m.data||[],ids=[...new Set(rows.map(x=>x.conversation_id))];
  if(!ids.length){S.chats=[];S.profiles={};await loadUnreadCounts();renderChats();renderActive();return await loadRequests();}
  const [members,msgs,groupPics]=await Promise.all([
    db.from("conversation_members").select("conversation_id,user_id,role").in("conversation_id",ids),
    db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,attachment_path,forwarded_from_id,is_admin_message").in("conversation_id",ids).order("created_at",{ascending:false}).limit(1000),
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


async function toggleFavoriteFriend(friendId){
  if(!S.user||!S.friends.some(friend=>friend.friend_id===friendId))return;
  const isFavorite=S.favoriteFriendIds.has(friendId);
  const result=isFavorite
    ?await db.from("favorite_friends").delete().eq("user_id",S.user.id).eq("friend_id",friendId)
    :await db.from("favorite_friends").insert({user_id:S.user.id,friend_id:friendId});
  if(result.error){toast("Favorite could not be updated: "+result.error.message);return;}
  if(isFavorite)S.favoriteFriendIds.delete(friendId);else S.favoriteFriendIds.add(friendId);
  renderFriends();renderChats();
  toast(isFavorite?"Friend removed from favorites.":"Friend added to favorites.");
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
  S.presenceDisplayTimer=setInterval(()=>{
    renderPresenceUI();
    // Heartbeat fallback keeps status accurate if a Realtime presence event is missed.
    void refreshFriendLastSeen();
  },30000);
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
    const lastSeenTime=new Date(row.last_seen_at).getTime();
    const recentHeartbeat=Number.isFinite(lastSeenTime)&&Date.now()-lastSeenTime<=90000;
    next[row.user_id]={
      ...(next[row.user_id]||{}),
      online:!!next[row.user_id]?.online||recentHeartbeat,
      lastSeenAt:row.last_seen_at,
      statusUnavailable:false
    };
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
function scheduleFriendPresenceRetry(friendId){
  if(!S.user||!S.friends.some(friend=>friend.friend_id===friendId))return;
  if(!(S.friendPresenceRetryTimers instanceof Map))S.friendPresenceRetryTimers=new Map();
  if(S.friendPresenceRetryTimers.has(friendId))return;
  const attempts=S.friendPresenceRetryAttempts.get(friendId)||0;
  const delay=Math.min(30000,1500*Math.pow(2,Math.min(attempts,4)));
  S.friendPresenceRetryAttempts.set(friendId,attempts+1);
  const timer=setTimeout(()=>{
    S.friendPresenceRetryTimers.delete(friendId);
    if(!S.user||!S.friends.some(friend=>friend.friend_id===friendId))return;
    if(!S.friendPresenceChannels.has(friendId))syncFriendPresenceChannels();
  },delay);
  S.friendPresenceRetryTimers.set(friendId,timer);
}
function clearFriendPresenceRetry(friendId){
  const timer=S.friendPresenceRetryTimers?.get(friendId);
  if(timer)clearTimeout(timer);
  S.friendPresenceRetryTimers?.delete(friendId);
  S.friendPresenceRetryAttempts?.delete(friendId);
}
function syncFriendPresenceChannels(){
  if(!S.user)return;
  const friendIds=new Set(S.friends.map(friend=>friend.friend_id));
  for(const [friendId,channel] of [...S.friendPresenceChannels.entries()]){
    if(friendIds.has(friendId))continue;
    S.friendPresenceChannels.delete(friendId);
    clearFriendPresenceRetry(friendId);
    delete S.onlineStatuses[friendId];
    void db.removeChannel(channel);
  }
  for(const friendId of friendIds){
    if(S.friendPresenceChannels.has(friendId))continue;
    const channel=db.channel("gather-presence:"+friendId,{config:{private:true}});
    channel.on("presence",{event:"sync"},()=>handleFriendPresenceSync(friendId,channel));
    channel.subscribe((status,error)=>{
      if(status==="SUBSCRIBED"){
        if(S.friendPresenceChannels.get(friendId)!==channel)return;
        clearFriendPresenceRetry(friendId);
        handleFriendPresenceSync(friendId,channel);
      }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){
        if(S.friendPresenceChannels.get(friendId)!==channel)return;
        console.warn("Friend online status subscription failed; retrying:",error||status);
        S.friendPresenceChannels.delete(friendId);
        S.onlineStatuses[friendId]={...(S.onlineStatuses[friendId]||{}),online:false,statusUnavailable:true};
        renderPresenceUI();
        void db.removeChannel(channel);
        scheduleFriendPresenceRetry(friendId);
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
function scheduleOwnPresenceRetry(){
  if(!S.user||S.preferences.shareOnlineStatus===false||S.ownPresenceRetryTimer)return;
  const attempts=S.ownPresenceRetryAttempt||0;
  const delay=Math.min(30000,1500*Math.pow(2,Math.min(attempts,4)));
  S.ownPresenceRetryAttempt=attempts+1;
  S.ownPresenceRetryTimer=setTimeout(()=>{
    S.ownPresenceRetryTimer=null;
    if(S.user&&S.preferences.shareOnlineStatus!==false&&!S.ownPresenceChannel)void syncOwnPresence();
  },delay);
}
async function syncOwnPresence(){
  const uid=S.user?.id;
  if(!uid)return;
  if(S.preferences.shareOnlineStatus===false){
    if(S.ownPresenceRetryTimer){clearTimeout(S.ownPresenceRetryTimer);S.ownPresenceRetryTimer=null;}
    S.ownPresenceRetryAttempt=0;
    if(S.lastSeenHeartbeatTimer){clearInterval(S.lastSeenHeartbeatTimer);S.lastSeenHeartbeatTimer=null;}
    const old=S.ownPresenceChannel;S.ownPresenceChannel=null;
    if(old){
      try{await old.untrack();}catch(error){console.warn("Presence untrack did not complete:",error);}
      await db.removeChannel(old);
    }
    return;
  }
  if(S.ownPresenceChannel)return;
  if(S.ownPresenceRetryTimer){clearTimeout(S.ownPresenceRetryTimer);S.ownPresenceRetryTimer=null;}
  const channel=db.channel("gather-presence:"+uid,{config:{private:true}});
  S.ownPresenceChannel=channel;
  const handleOwnChannelFailure=(status,error)=>{
    if(S.ownPresenceChannel!==channel)return;
    console.warn("Gather online presence connection failed; retrying:",error||status);
    S.ownPresenceChannel=null;
    if(S.lastSeenHeartbeatTimer){clearInterval(S.lastSeenHeartbeatTimer);S.lastSeenHeartbeatTimer=null;}
    void db.removeChannel(channel);
    scheduleOwnPresenceRetry();
  };
  channel.subscribe(async(status,error)=>{
    if(S.user?.id!==uid||S.preferences.shareOnlineStatus===false||S.ownPresenceChannel!==channel)return;
    if(status==="SUBSCRIBED"){
      try{
        const result=await channel.track({user_id:uid,online_at:new Date().toISOString()});
        if(result!=="ok")throw new Error("Presence track returned "+String(result));
        S.ownPresenceRetryAttempt=0;
        await recordLastSeen(uid);
        if(S.lastSeenHeartbeatTimer)clearInterval(S.lastSeenHeartbeatTimer);
        S.lastSeenHeartbeatTimer=setInterval(()=>recordLastSeen(uid),60000);
      }catch(trackError){
        handleOwnChannelFailure("TRACK_ERROR",trackError);
      }
    }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){
      handleOwnChannelFailure(status,error);
    }
  });
}
async function stopOnlinePresence(){
  if(S.lastSeenHeartbeatTimer){clearInterval(S.lastSeenHeartbeatTimer);S.lastSeenHeartbeatTimer=null;}
  if(S.presenceDisplayTimer){clearInterval(S.presenceDisplayTimer);S.presenceDisplayTimer=null;}
  if(S.ownPresenceRetryTimer){clearTimeout(S.ownPresenceRetryTimer);S.ownPresenceRetryTimer=null;}
  S.ownPresenceRetryAttempt=0;
  const own=S.ownPresenceChannel;S.ownPresenceChannel=null;
  if(own){
    try{await own.untrack();}catch(error){}
    await db.removeChannel(own);
  }
  for(const timer of S.friendPresenceRetryTimers.values())clearTimeout(timer);
  S.friendPresenceRetryTimers.clear();S.friendPresenceRetryAttempts.clear();
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
  const container=$("message-notifications");
  if(card){
    if(card.classList.contains("is-dismissing"))return;
    card.classList.add("is-dismissing");
    let removed=false;
    const finishRemoval=()=>{
      if(removed)return;
      removed=true;
      card.removeEventListener("transitionend",finishOnFade);
      card.remove();
      if(container)container.hidden=container.childElementCount===0;
    };
    const finishOnFade=event=>{
      if(event.target!==card||event.propertyName!=="opacity")return;
      finishRemoval();
    };
    card.addEventListener("transitionend",finishOnFade);
    setTimeout(finishRemoval,540);
    return;
  }
  if(container)container.hidden=container.childElementCount===0;
}
function clearMessageNotifications(){
  Object.values(S.notificationTimers||{}).forEach(timer=>clearTimeout(timer));
  S.notificationTimers={};
  const container=$("message-notifications");
  if(container){container.replaceChildren();container.hidden=true;}
}
function isWithinQuietHours(now=new Date()){
  if(!S.preferences.quietHoursEnabled)return false;
  const toMinutes=value=>{
    const [hours,minutes]=String(value||"").split(":").map(Number);
    return Number.isFinite(hours)&&Number.isFinite(minutes)?hours*60+minutes:null;
  };
  const start=toMinutes(S.preferences.quietHoursStart),end=toMinutes(S.preferences.quietHoursEnd);
  if(start===null||end===null||start===end)return false;
  const current=now.getHours()*60+now.getMinutes();
  return start<end?(current>=start&&current<end):(current>=start||current<end);
}
function playNotificationSound(){
  const mode=S.preferences.notificationSound;
  if(mode==="off")return;
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return;
    const context=new AudioCtx();
    const frequencies=mode==="chime"?[660,880]:[520];
    const now=context.currentTime;
    frequencies.forEach((frequency,index)=>{
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type="sine";oscillator.frequency.setValueAtTime(frequency,now+index*.12);
      gain.gain.setValueAtTime(.0001,now+index*.12);
      gain.gain.exponentialRampToValueAtTime(.045,now+index*.12+.02);
      gain.gain.exponentialRampToValueAtTime(.0001,now+index*.12+.15);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.start(now+index*.12);oscillator.stop(now+index*.12+.17);
    });
    setTimeout(()=>{try{context.close();}catch(error){}},650);
  }catch(error){/* Browser audio can be unavailable until the user interacts with the page. */}
}
function showMessageNotification(message,chat){
  if(!message||!chat||!S.user||message.sender_id===S.user.id||S.active===chat.id||S.chatSettings.muted[chat.id]||isWithinQuietHours())return;
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
  playNotificationSound();
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
  const announcements=[],pageSize=500;
  for(let from=0;;from+=pageSize){
    const result=await db.from("admin_announcements")
      .select("id,title,body,created_at,edited_at")
      .order("created_at",{ascending:false})
      .order("id",{ascending:true})
      .range(from,from+pageSize-1);
    if(result.error){
      console.warn("Admin announcements could not be loaded:",result.error.message);
      $("home-announcement-card").hidden=true;
      $("announcements-history-list").replaceChildren(el("p","status error","Announcements could not be loaded. Please try again."));
      return false;
    }
    const page=result.data||[];
    announcements.push(...page);
    if(page.length<pageSize)break;
  }
  S.announcements=announcements;
  renderHomeAnnouncement();
  renderAnnouncementsPage();
  if(S.notificationView==="admin")renderNotifications();
  return true;
}
function openAnnouncementsPage(){
  showAdminChildModal("announcements-page-modal");
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
  showAdminChildModal("announcement-compose-modal");$("announcement-title").focus();
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
  showAdminChildModal("announcement-compose-modal");$("announcement-title").focus();
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
  dismissAdminChildModal("announcement-compose-modal");
  if(editingId){
    toast("Official announcement updated.");
    await loadAnnouncements();
    await openAnnouncement(editingId);
  }else{
    toast("Official announcement sent to Gather members.");
    await loadNotifications();await loadAnnouncements();
    if($("admin-mode-modal").hidden!==false||S.admin.section!=="announcements"){
      await openAnnouncement(result.data.id);
    }
  }
}
async function openAnnouncement(id){
  if(!id||!S.user)return;
  S.activeAnnouncementId=id;
  $("announcement-view-title").textContent="Loading announcement…";
  $("announcement-view-body").textContent="";$("announcement-view-date").textContent="";
  $("announcement-edit-open").hidden=!isFeedbackAdmin(S.user);
  showAdminChildModal("announcement-view-modal");
  const result=await db.from("admin_announcements").select("id,title,body,created_at,edited_at").eq("id",id).maybeSingle();
  if(result.error||!result.data){$("announcement-view-title").textContent="Announcement unavailable";$("announcement-view-body").textContent="This announcement could not be loaded.";return;}
  S.announcementInView=result.data;
  $("announcement-view-title").textContent=result.data.title;
  renderAnnouncementText($("announcement-view-body"),result.data.body);
  $("announcement-view-date").textContent="Published "+dateLabel(result.data.created_at)+(result.data.edited_at?" · Edited "+dateLabel(result.data.edited_at):"");
}

function notificationItemsForCenter(){
  return S.notifications.filter(item=>
    item.kind!=="uno_invite"&&
    item.kind!=="uno_rematch"&&
    !(item.kind==="message"&&item.conversation_id&&item.conversation_id===S.active)&&
    !(item.kind==="message"&&item.conversation_id&&S.chatSettings.muted[item.conversation_id])
  );
}
function notificationItemsForView(view=S.notificationView){
  const items=notificationItemsForCenter();
  if(view==="admin"){
    const linked=new Map();
    S.notifications.filter(item=>item.kind==="announcement"&&item.announcement_id).forEach(item=>{
      const group=linked.get(item.announcement_id)||[];
      group.push(item);
      linked.set(item.announcement_id,group);
    });
    return (S.announcements||[]).map(announcement=>{
      const related=linked.get(announcement.id)||[];
      const unread=related.some(item=>!item.read_at);
      return {
        id:"announcement:"+announcement.id,
        kind:"announcement",
        announcement_id:announcement.id,
        announcement_history:true,
        title:announcement.title,
        body:announcement.body,
        created_at:announcement.created_at,
        read_at:unread?null:(related.find(item=>item.read_at)?.read_at||"history")
      };
    });
  }
  if(view==="games")return [];
  if(view==="messages")return items.filter(item=>item.kind==="message");
  if(view==="other")return items.filter(item=>item.kind!=="announcement"&&item.kind!=="message");
  return items;
}
function notificationUnreadCount(){
  const notificationUnread=notificationItemsForCenter().filter(item=>!item.read_at).length;
  const gameInvites=window.GatherGames?.getPendingInvitations?.().length||0;
  const unoRematches=new Set(S.notifications.filter(item=>item.kind==="uno_rematch"&&!item.read_at).map(item=>item.body)).size;
  const unoInvites=S.notifications.filter(item=>item.kind==="uno_invite"&&!item.read_at).length;
  return notificationUnread+gameInvites+unoRematches+unoInvites;
}
function renderNotificationBadge(){
  const badge=$("notification-badge");if(!badge)return;
  const count=notificationUnreadCount();badge.textContent=count>99?"99+":String(count);badge.hidden=count===0;
  const regularUnread=notificationItemsForCenter().filter(item=>!item.read_at).length;
  $("notifications-mark-all").disabled=regularUnread===0||S.notificationView==="games";
}
function notificationKindLabel(kind){
  return ({message:"New message",friend_request:"Friend request",chat_request:"Chat request",feedback_reply:"Feedback update",report:"Safety report",announcement:"Official admin announcement",uno_invite:"UNO lobby invitation",uno_rematch:"UNO rematch request",uno_rematch_result:"UNO rematch update"})[kind]||"Gather update";
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
  if(!["all","admin","messages","games","other"].includes(view))return;
  S.notificationView=view;
  renderNotifications();
}
function renderGameNotificationCards(list){
  list.append(el("h3","notification-section-heading","Live games"));
  const liveClassic=window.GatherGames?.getLiveGames?.()||[];
  liveClassic.forEach(game=>{
    const card=el("article","notification-center-item notification-game-item");
    const icon=el("span","notification-center-icon","🎮");
    const copy=el("span","notification-center-copy");
    const names={chess:"Chess",checkers:"Checkers",tic_tac_toe:"Tic-Tac-Toe",connect_four:"Connect Four",battleship:"Battleship"};
    const opponentId=game.player_one_id===S.user?.id?game.player_two_id:game.player_one_id;
    const opponent=S.profiles[opponentId]?.display_name||S.profiles[opponentId]?.username||"Your opponent";
    copy.append(el("strong","",names[game.game_type]||"Game"),el("small","", "In progress · "+opponent),el("time","",dateLabel(game.updated_at||game.created_at)));
    card.append(icon,copy);
    const actions=el("span","notification-game-actions");
    const open=el("button","primary","Open");open.type="button";open.addEventListener("click",()=>{$("notifications-modal").hidden=true;window.GatherGames?.openInvitation?.(game.id);});
    actions.append(open);card.append(actions);list.append(card);
  });
  const liveUno=window.GatherUno?.getLiveGames?.()||[];
  liveUno.forEach(game=>{
    const card=el("article","notification-center-item notification-game-item");
    const icon=el("span","notification-center-icon","UNO");
    const copy=el("span","notification-center-copy");
    copy.append(el("strong","","UNO"),el("small","","In progress · "+(game.settings?.title||"UNO match")),el("time","",dateLabel(game.updated_at||game.created_at)));
    card.append(icon,copy);
    const actions=el("span","notification-game-actions");
    const open=el("button","primary","Open");open.type="button";open.addEventListener("click",()=>{$("notifications-modal").hidden=true;window.GatherUno?.openGame?.(game.id);});
    actions.append(open);card.append(actions);list.append(card);
  });
  const unoInvites=window.GatherUno?.getInvitations?.()||[];
  unoInvites.forEach(game=>{
    const card=el("article","notification-center-item notification-game-item unread");
    const icon=el("span","notification-center-icon","UNO");
    const copy=el("span","notification-center-copy");
    const sender=S.profiles[game.created_by]?.display_name||S.profiles[game.created_by]?.username||"A Gather member";
    copy.append(el("strong","","UNO lobby invitation"),el("small","",sender+" invited you to an UNO lobby."),el("time","",dateLabel(game.created_at)));
    card.append(icon,copy);
    const actions=el("span","notification-game-actions");
    const join=el("button","primary","Join");join.type="button";
    join.addEventListener("click",async()=>{join.disabled=true;$("notifications-modal").hidden=true;await window.GatherUno?.openInvitation?.(game.id);await loadNotifications();});
    actions.append(join);card.append(actions);list.append(card);
  });
  const invitations=window.GatherGames?.getPendingInvitations?.()||[];
  invitations.forEach(game=>{
    const card=el("article","notification-center-item notification-game-item unread");
    const icon=el("span","notification-center-icon","🎮");
    const copy=el("span","notification-center-copy");
    const gameNames={chess:"Chess",checkers:"Checkers",tic_tac_toe:"Tic-Tac-Toe",connect_four:"Connect Four",battleship:"Battleship"};
    const opponent=S.profiles[game.player_one_id]?.display_name||S.profiles[game.player_one_id]?.username||"A Gather member";
    copy.append(el("strong","",gameNames[game.game_type]||"Game invitation"),el("small","",opponent+" invited you to play."),el("time","",dateLabel(game.created_at)));
    card.append(icon,copy);
    const actions=el("span","notification-game-actions");
    const view=el("button","outline","View");view.type="button";view.addEventListener("click",()=>{$("notifications-modal").hidden=true;window.GatherGames?.openInvitation?.(game.id);});
    const accept=el("button","primary","Accept");accept.type="button";accept.addEventListener("click",async()=>{$("notifications-modal").hidden=true;await window.GatherGames?.respondToInvitation?.(game.id,true);renderNotifications();});
    const decline=el("button","outline","Decline");decline.type="button";decline.addEventListener("click",async()=>{decline.disabled=true;await window.GatherGames?.respondToInvitation?.(game.id,false);renderNotifications();});
    actions.append(view,accept,decline);card.append(actions);list.append(card);
  });
  if(unoInvites.length||invitations.length||rematchOffers.size)list.append(el("h3","notification-section-heading","Invitations"));
  const rematchOffers=new Map();
  S.notifications.filter(item=>item.kind==="uno_rematch"&&!item.read_at).forEach(item=>{if(item.body)rematchOffers.set(item.body,item);});
  rematchOffers.forEach((item,offerId)=>{
    const card=el("article","notification-center-item notification-game-item unread");
    const icon=el("span","notification-center-icon","🃏");
    const copy=el("span","notification-center-copy");
    const sender=S.profiles[item.actor_id]?.display_name||S.profiles[item.actor_id]?.username||"A Gather player";
    copy.append(el("strong","","UNO rematch request"),el("small","",sender+" wants another round. Would you like to play again?"),el("time","",dateLabel(item.created_at)));
    card.append(icon,copy);
    const actions=el("span","notification-game-actions");
    const accept=el("button","primary","Accept");accept.type="button";
    const decline=el("button","outline","Decline");decline.type="button";
    accept.addEventListener("click",async()=>{accept.disabled=true;decline.disabled=true;await window.GatherUno?.respondToRematch?.(offerId,true);await loadNotifications();});
    decline.addEventListener("click",async()=>{decline.disabled=true;accept.disabled=true;await window.GatherUno?.respondToRematch?.(offerId,false);await loadNotifications();});
    actions.append(accept,decline);card.append(actions);list.append(card);
  });
  return liveClassic.length+liveUno.length+unoInvites.length+invitations.length+rematchOffers.size;
}
function renderNotifications(){
  const list=$("notifications-list");
  if(!list)return;
  list.replaceChildren();
  const sectionItems=notificationItemsForView();
  const gameView=S.notificationView==="games";
  const gameCount=(gameView||S.notificationView==="all")?renderGameNotificationCards(list):0;
  if(gameView&&!gameCount){
    list.append(el("p","muted tiny","No incoming game invitations. New invitations will appear here automatically."));
  }else if(!sectionItems.length&&!gameCount){
    const emptyText={
      all:"You're all caught up. New messages and requests will appear here.",
      admin:"There are no Gather Admin announcements in your notifications yet.",
      messages:"No recent message notifications. Messages in the conversation you're currently viewing stay out of this list.",
      other:"There are no other updates right now.",
      games:"No live games or invitations right now. Your active matches and new invitations will appear here."
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
      const title=item.kind==="announcement"?(item.announcement_history?(item.title||"Gather Admin"):"Gather Admin"):item.kind==="message"&&items.length>1?senderName:(item.title||notificationKindLabel(item.kind));
      const baseDescription=item.kind==="announcement"?"Official announcement · "+(item.body||"Open to read the full message."):(item.body||notificationKindLabel(item.kind));
      const description=item.kind==="message"&&items.length>1?items.length+" unread messages · "+baseDescription:baseDescription;
      copy.append(el("strong","",title),el("small","",description),el("time","",dateLabel(item.created_at)));
      card.append(icon,copy);
      if(unread)card.append(el("span","notification-unread-dot",""));
      card.addEventListener("click",async()=>{
        if(item.announcement_history){
          await markAnnouncementNotificationsRead(item.announcement_id);
          setModalBackTarget("announcement-view-modal","notifications-modal");
          $("notifications-modal").hidden=true;
          await openAnnouncement(item.announcement_id);
        }else{
          await openNotification(entry);
        }
      });
      list.append(card);
    });
  }
  const unread=sectionItems.filter(item=>!item.read_at).length;
  $("notifications-summary").textContent=gameView?gameCount+" awaiting response":(unread+gameCount)+" unread · "+(sectionItems.length+gameCount)+" updates";
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
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"notifications",filter:"recipient_id=eq."+uid},async()=>{await loadNotifications();})
    .subscribe();
}
async function markNotificationRead(id){
  const at=new Date().toISOString();
  const result=await db.from("notifications").update({read_at:at}).eq("id",id).eq("recipient_id",S.user.id);
  if(result.error){console.warn("Notification could not be marked read:",result.error.message);return false;}
  const item=S.notifications.find(x=>x.id===id);if(item)item.read_at=at;
  renderNotifications();return true;
}
async function markAnnouncementNotificationsRead(announcementId){
  if(!S.user||!announcementId)return true;
  const at=new Date().toISOString();
  const result=await db.from("notifications").update({read_at:at})
    .eq("recipient_id",S.user.id)
    .eq("kind","announcement")
    .eq("announcement_id",announcementId)
    .is("read_at",null);
  if(result.error){
    console.warn("Announcement notifications could not be marked read:",result.error.message);
    return false;
  }
  S.notifications.forEach(item=>{
    if(item.kind==="announcement"&&item.announcement_id===announcementId&&!item.read_at)item.read_at=at;
  });
  renderNotifications();
  return true;
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
  const notificationReturnTargets={
    friend_request:"friends-modal",
    chat_request:"requests-modal",
    feedback_reply:"feedback-modal",
    announcement:"announcement-view-modal"
  };
  if(item.kind==="report"&&isFeedbackAdmin(S.user))setModalBackTarget("reports-admin-modal","notifications-modal");
  else if(notificationReturnTargets[item.kind])setModalBackTarget(notificationReturnTargets[item.kind],"notifications-modal");
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
      if(message.sender_id!==uid&&S.archivedConversationIds.has(chat.id)){
        const restored=await db.from("user_archived_conversations").delete().eq("user_id",uid).eq("conversation_id",chat.id);
        if(!restored.error){S.archivedConversationIds.delete(chat.id);toast("A new message moved an archived conversation back to your inbox.");}
      }
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
  const orderedFriends=[...S.friends].sort((a,b)=>Number(S.favoriteFriendIds.has(b.friend_id))-Number(S.favoriteFriendIds.has(a.friend_id)));
  orderedFriends.forEach(f=>{
    const isFavorite=S.favoriteFriendIds.has(f.friend_id);
    const p=S.profiles[f.friend_id]||{id:f.friend_id,display_name:"Gather member",username:"member"};
    const row=el("div","request-item friend-list-item"+(isFavorite?" is-favorite-friend":""));
    row.tabIndex=0;row.setAttribute("role","group");
    row.setAttribute("aria-label",p.display_name+". Swipe left or press Enter to "+(isFavorite?"remove from":"add to")+" favorites.");
    const picture=avatar(p.display_name,p.avatar_data);picture.classList.add("friend-list-avatar");row.append(picture);
    const copy=el("div","request-copy friend-list-copy");
    const name=el("strong","friend-list-name",p.display_name);
    copy.append(name,el("small","friend-list-username","@"+(p.username||"member")));
    appendFriendPresenceLabel(copy,f.friend_id);

    row.append(copy);
    const actions=el("div","request-actions friend-list-actions");
    const profile=el("button","outline friend-profile-button","Profile");
    const message=el("button","request-accept friend-icon-button friend-message-button");
    const messageGlyph=el("span","friend-message-icon");messageGlyph.setAttribute("aria-hidden","true");message.append(messageGlyph);
    const remove=el("button","request-decline friend-icon-button friend-remove-button","×");
    profile.type=message.type=remove.type="button";
    message.setAttribute("aria-label","Message "+p.display_name);message.title="Message";
    remove.setAttribute("aria-label","Remove "+p.display_name+" as a friend");remove.title="Remove friend";
    profile.addEventListener("click",()=>openPublicProfile(f.friend_id));
    message.addEventListener("click",async()=>{$("friends-modal").hidden=true;await directChat(p);});
    remove.addEventListener("click",()=>removeFriend(f.friend_id));
    actions.append(profile,message,remove);row.append(actions);
    let swipeStart=null,suppressClick=false;
    const toggleFromSwipe=()=>{
      suppressClick=true;row.classList.add("swipe-favorite-complete");
      void toggleFavoriteFriend(f.friend_id);
      window.setTimeout(()=>{suppressClick=false;row.classList.remove("swipe-favorite-complete");},500);
    };
    row.addEventListener("pointerdown",event=>{
      if(event.pointerType==="mouse"&&event.button!==0)return;
      if(event.target.closest("button,a,input,select,textarea"))return;
      swipeStart={x:event.clientX,y:event.clientY,pointerId:event.pointerId};
    });
    row.addEventListener("pointerup",event=>{
      if(!swipeStart||event.pointerId!==swipeStart.pointerId)return;
      const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
      swipeStart=null;
      if(dx < -48 && Math.abs(dx)>Math.abs(dy)*1.2)toggleFromSwipe();
    });
    row.addEventListener("pointercancel",()=>{swipeStart=null;});
    row.addEventListener("click",event=>{
      if(suppressClick){event.preventDefault();event.stopPropagation();}
    },true);
    row.addEventListener("keydown",event=>{
      if(event.target!==row)return;
      if(event.key==="Enter"||event.key===" "){event.preventDefault();toggleFromSwipe();}
    });
    list.append(row);
  });
  if(!ins.length)incoming.append(el("p","muted tiny","No new friend requests."));
  if(!outs.length)outgoing.append(el("p","muted tiny","You have no pending sent requests."));
  ins.forEach(r=>incoming.append(friendRequestRow(r,true)));
  outs.forEach(r=>outgoing.append(friendRequestRow(r,false)));
}
function friendRequestRow(r,isIncoming){
  const peerId=isIncoming?r.sender_id:r.recipient_id,p=S.profiles[peerId]||{display_name:"Gather member",username:"member"};
  const row=el("div","request-item");row.append(avatar(p.display_name,p.avatar_data));
  const copy=el("div","request-copy"),name=el("strong","",p.display_name);copy.append(name,el("small","","@"+p.username));row.append(copy);
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
  const copy=el("div","request-copy"),name=el("strong","",p.display_name);copy.append(name,el("small","","@"+p.username));row.append(copy);
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
  if(accept){
    if(r.data?.conversation_id){
      $("friends-modal").hidden=true;
      toast("You are friends now. Private messaging is open.");
      await loadChats();await openChat(r.data.conversation_id);
    }else toast("Friend request accepted. Messaging across age groups still requires Gather Admin approval.");
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
  if(r.data?.status==="intergroup_approval_required"){toast("Gather Admin approval is required before this cross-group chat can open.");await loadRequests();return;}
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
  const list=$(listId);
  const existingChatIds=new Set([...list.querySelectorAll(".chat-row[data-conversation-id]")].map(row=>row.dataset.conversationId));
  list.replaceChildren();
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
    row.dataset.conversationId=String(c.id);
    if(!existingChatIds.has(String(c.id)))row.classList.add("gather-list-enter");
    const peer=c.members.find(m=>m.user_id!==S.user.id),peerProfile=peer&&S.profiles[peer.user_id];
    const isGatherAdminPeer=!!c.admin_initiated&&peer?.user_id===c.created_by;
    const profileShortcut=!S.selectingConversations&&c.kind==="direct"&&!!peer?.user_id&&!isGatherAdminPeer;
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
    else if(c.kind==="group"&&c.last){const senderProfile=S.profiles[c.last.sender_id];preview=(senderProfile?.display_name?.trim()||(senderProfile?.username?.trim()?"@"+senderProfile.username.trim():"Member"))+": "+preview;}
    copy.append(el("span","",preview));
    if(S.chatSettings.drafts[c.id])copy.append(el("small","chat-draft-label","Draft saved"));
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
function getAdminConversationPeerIds(chats=S.chats){
  return new Set(chats
    .filter(chat=>chat.kind==="direct"&&chat.admin_initiated)
    .map(peerForChat)
    .filter(Boolean));
}
function isRegularChatDuplicatedByAdmin(chat,adminPeers=getAdminConversationPeerIds()){
  return !!chat&&chat.kind==="direct"&&!chat.admin_initiated&&adminPeers.has(peerForChat(chat));
}
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
function openDeletedConversation(conversationId){
  if(!conversationId)return;
  S.deletedConversationId=String(conversationId);
  renderChats();
}
function backToDeletedConversations(){
  S.deletedConversationId=null;
  renderChats();
}
function renderDeletedMessages(term){
  const list=$("deleted-list");if(!list)return;
  list.replaceChildren();
  const query=String(term||"").trim().toLowerCase();
  const items=S.deletedMessages
    .filter(x=>((x.body||(x.attachment_path?"Image attachment":""))+" "+x.sender_name+" "+x.conversation_title).toLowerCase().includes(query))
    .sort((a,b)=>new Date(b.deleted_at||b.created_at).getTime()-new Date(a.deleted_at||a.created_at).getTime());
  $("deleted-count").textContent=String(items.length);
  if(!items.length){
    S.deletedConversationId=null;
    list.append(el("p","muted tiny section-empty",query?"No matching deleted messages.":"No deleted messages. Messages you hide will appear here."));
    return;
  }
  const conversations=new Map();
  items.forEach(item=>{
    const key=String(item.conversation_id||item.conversation_title||"conversation");
    if(!conversations.has(key))conversations.set(key,{id:key,title:item.conversation_title||"Conversation",items:[]});
    conversations.get(key).items.push(item);
  });
  if(S.deletedConversationId){
    const group=conversations.get(String(S.deletedConversationId));
    if(group){
      const screen=el("section","deleted-chat-screen");
      const toolbar=el("header","deleted-chat-toolbar");
      const back=el("button","outline deleted-chat-back","← Back to deleted messages");
      back.type="button";back.addEventListener("click",backToDeletedConversations);
      const heading=el("div","deleted-chat-heading");
      heading.append(el("strong","",group.title),el("small","muted",group.items.length+" deleted "+(group.items.length===1?"message":"messages")));
      toolbar.append(back,heading);screen.append(toolbar);
      const messages=el("div","deleted-chat-message-list");
      group.items.forEach(item=>{
        const mine=item.sender_name==="You";
        const row=el("button","deleted-message-bubble"+(mine?" mine":""));
        row.type="button";row.setAttribute("aria-label","Restore deleted message from "+item.sender_name);
        row.append(avatar(item.sender_name,S.profiles[item.sender_id]?.avatar_data));
        const copy=el("span","deleted-message-copy");
        const meta=el("span","deleted-message-meta");
        meta.append(el("strong","",item.sender_name),el("small","",dateLabel(item.created_at)));
        const body=el("span","deleted-message-body",item.body||(item.attachment_path?"Image attachment":"Deleted message"));
        const deletedAt=item.deleted_at?dateLabel(item.deleted_at):"";
        const hint=el("span","deleted-message-hint",deletedAt?"Deleted "+deletedAt+" · Tap to restore":"Tap to restore");
        copy.append(meta,body,hint);row.append(copy);
        row.addEventListener("click",async()=>{
          if(row.disabled)return;
          row.disabled=true;hint.textContent="Restoring…";
          const restored=await restoreMessage(item.message_id);
          if(!restored){row.disabled=false;hint.textContent=deletedAt?"Deleted "+deletedAt+" · Tap to restore":"Tap to restore";}
        });
        messages.append(row);
      });
      screen.append(messages);list.append(screen);
      return;
    }
    S.deletedConversationId=null;
  }
  const picker=el("div","deleted-conversation-picker");
  conversations.forEach(group=>{
    const latest=group.items[0];
    const card=el("button","deleted-conversation-card");card.type="button";
    const copy=el("span","deleted-conversation-card-copy");
    copy.append(el("strong","",group.title));
    copy.append(el("small","",latest?.body||(latest?.attachment_path?"Image attachment":"Deleted message")));
    card.append(copy,el("span","deleted-conversation-card-count",String(group.items.length)),el("span","deleted-conversation-card-arrow","›"));
    card.addEventListener("click",()=>openDeletedConversation(group.id));
    picker.append(card);
  });
  list.append(picker);
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
function setHomeSearchTab(tab){
  if(!["messages","profiles"].includes(tab))return;
  S.homeSearchTab=tab;renderHomeSearchResults();
}
function renderHomeSearchResults(){
  const query=S.homeSearchQuery;
  const messagesTab=$("home-search-tab-messages"),profilesTab=$("home-search-tab-profiles");
  const messagesPanel=$("home-search-messages-panel"),profilesPanel=$("home-search-profiles-panel");
  const messagesCount=$("home-search-messages-count"),profilesCount=$("home-search-profiles-count");
  if(!messagesTab||!profilesTab||!messagesPanel||!profilesPanel)return;
  messagesCount.textContent=String(S.homeSearchMessages.length);profilesCount.textContent=String(S.homeSearchProfiles.length);
  const showMessages=S.homeSearchTab==="messages";
  messagesTab.classList.toggle("active",showMessages);messagesTab.setAttribute("aria-selected",String(showMessages));
  profilesTab.classList.toggle("active",!showMessages);profilesTab.setAttribute("aria-selected",String(!showMessages));
  messagesPanel.hidden=!showMessages;profilesPanel.hidden=showMessages;
  const messageList=$("home-search-messages-list"),profileList=$("home-search-profiles-list");
  if(!query||query.length<2){
    const note="Type at least 2 characters to search.";
    messageList.replaceChildren(el("p","muted tiny home-search-empty",note));profileList.replaceChildren(el("p","muted tiny home-search-empty",note));return;
  }
  messageList.replaceChildren();
  if(S.homeSearchLoading&&!S.homeSearchMessages.length)messageList.append(el("p","muted tiny home-search-empty","Searching messages..."));
  else if(S.homeSearchErrors.messages)messageList.append(el("p","status error home-search-empty","Messages could not be searched: "+S.homeSearchErrors.messages));
  else if(!S.homeSearchMessages.length)messageList.append(el("p","muted tiny home-search-empty","No matching messages found."));
  S.homeSearchMessages.forEach(message=>{
    const button=el("button","message-search-result home-search-message-result gather-list-enter");button.type="button";
    const chat=S.chats.find(item=>item.id===message.conversation_id);
    const sender=S.profiles[message.sender_id]?.display_name||"Gather member";
    const title=[chat?chatTitle(chat):"Conversation",sender,dateLabel(message.created_at)].join(" · ");
    button.append(el("strong","",title),el("span","",message.body||""));
    button.addEventListener("click",()=>openSearchResult(message));messageList.append(button);
  });
  profileList.replaceChildren();
  if(S.homeSearchLoading&&!S.homeSearchProfiles.length)profileList.append(el("p","muted tiny home-search-empty","Searching profiles..."));
  else if(S.homeSearchErrors.profiles)profileList.append(el("p","status error home-search-empty","Profiles could not be searched: "+S.homeSearchErrors.profiles));
  else if(!S.homeSearchProfiles.length)profileList.append(el("p","muted tiny home-search-empty","No matching profiles found."));
  S.homeSearchProfiles.forEach(profile=>{
    const row=el("article","home-search-profile-result gather-list-enter");row.append(avatar(profile.display_name,profile.avatar_data));
    const copy=el("div","home-search-profile-copy");
    copy.append(el("strong","",profile.display_name),el("small","muted","@"+profile.username));appendApprovedBadge(copy,profile.id,"profile");row.append(copy);
    const isSelf=profile.id===S.user?.id;
    const isFriend=S.friends.some(friend=>friend.friend_id===profile.id);
    const sharedChat=S.chats.some(chat=>chat.members.some(member=>member.user_id===profile.id));
    const incoming=S.friendRequests.find(request=>request.sender_id===profile.id&&request.recipient_id===S.user?.id&&request.status==="pending");
    const outgoing=S.friendRequests.some(request=>request.sender_id===S.user?.id&&request.recipient_id===profile.id&&request.status==="pending");
    const label=isSelf?"Your profile":incoming?"Accept request":outgoing?"Request sent":(isFriend||sharedChat)?"View profile":"Add friend";
    const action=el("button","secondary-action home-search-profile-action",label);action.type="button";action.disabled=outgoing;
    if(isSelf)action.addEventListener("click",openProfile);
    else if(incoming)action.addEventListener("click",()=>respondToFriendRequest(incoming.id,true));
    else if(isFriend||sharedChat)action.addEventListener("click",()=>openPublicProfile(profile.id));
    else if(!outgoing)action.addEventListener("click",()=>addFriendFromHomeSearch(profile,action));
    row.append(action);profileList.append(row);
  });
}
function handleHomeSearchInput(){
  const query=$("filter").value.trim().slice(0,120);
  if(S.homeSearchTimer){clearTimeout(S.homeSearchTimer);S.homeSearchTimer=null;}
  const requestId=++S.homeSearchRequestId;
  S.homeSearchQuery=query;S.homeSearchMessages=[];S.homeSearchProfiles=[];S.homeSearchErrors={messages:"",profiles:""};
  S.homeSearchLoading=query.length>=2;renderChats();
  if(query.length<2){S.homeSearchLoading=false;renderHomeSearchResults();return;}
  renderHomeSearchResults();S.homeSearchTimer=setTimeout(()=>performHomeSearch(query,requestId),240);
}
async function performHomeSearch(query,requestId){
  if(requestId!==S.homeSearchRequestId||!S.user)return;
  const pattern="%"+query+"%";
  const conversationIds=[...new Set(S.chats.map(chat=>chat.id))];
  const messageSearch=conversationIds.length?db.from("messages").select("id,conversation_id,sender_id,body,created_at").in("conversation_id",conversationIds).ilike("body",pattern).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(50):Promise.resolve({data:[],error:null});
  const [messageResult,usernameResult,displayResult]=await Promise.all([
    messageSearch,db.from("profiles").select("id,username,display_name").ilike("username",pattern).limit(25),
    db.from("profiles").select("id,username,display_name").ilike("display_name",pattern).limit(25)
  ]);
  if(requestId!==S.homeSearchRequestId||$("filter").value.trim().slice(0,120)!==query)return;
  if(messageResult.error)S.homeSearchErrors.messages=messageResult.error.message;
  else S.homeSearchMessages=(messageResult.data||[]).filter(message=>!S.deletedMessageIds.has(message.id));
  if(usernameResult.error||displayResult.error)S.homeSearchErrors.profiles=(usernameResult.error||displayResult.error).message;
  else{
    const unique=new Map();[...(usernameResult.data||[]),...(displayResult.data||[])].forEach(profile=>unique.set(profile.id,profile));
    const records=await fetchProfileRecords([...unique.keys()]);
    if(requestId!==S.homeSearchRequestId||$("filter").value.trim().slice(0,120)!==query)return;
    if(records.error)S.homeSearchErrors.profiles=records.error.message;
    else S.homeSearchProfiles=(records.data||[]).sort((a,b)=>a.display_name.localeCompare(b.display_name)).slice(0,30);
  }
  if(requestId!==S.homeSearchRequestId)return;
  S.homeSearchLoading=false;S.homeSearchTimer=null;renderHomeSearchResults();
}
async function addFriendFromHomeSearch(profile,button){
  if(!S.user||!profile?.id)return;button.disabled=true;
  const result=await db.rpc("send_friend_request",{p_recipient_id:profile.id});button.disabled=false;
  if(result.error){toast("Friend request could not be sent: "+result.error.message);return;}
  await loadFriends();
  if(result.data?.status==="blocked")toast("This member is unavailable for a friend request.");
  else if(result.data?.status==="incoming"){toast("They already sent you a friend request. You can accept it in Friends.");$("friends-modal").hidden=false;}
  else if(result.data?.status==="friends")toast("You are already friends.");else toast("Friend request sent.");
}
function renderChats(){
  const rawTerm=$("filter").value.trim();
  const term=rawTerm.toLowerCase();
  const searching=!!rawTerm;
  $("home-search-results").hidden=!searching;$("home-browse-content").hidden=searching;
  if(searching){renderHomeSearchResults();return;}
  const standard=$("private-folder-panel"),blocked=$("blocked-panel"),deleted=$("deleted-panel"),archivedPanel=$("archived-panel");
  const isStandard=S.folder==="friends"||S.folder==="nonfriends";
  const isArchived=S.folder==="archived";
  const pinnedIds=new Set(S.chatSettings.pinned);
  const isArchivedChat=chat=>S.archivedConversationIds instanceof Set&&S.archivedConversationIds.has(chat.id);
  const adminPeerIds=getAdminConversationPeerIds();
  const pinnedChats=S.chatSettings.pinned.map(id=>S.chats.find(chat=>chat.id===id)).filter(chat=>chat&&!isArchivedChat(chat)&&!isRegularChatDuplicatedByAdmin(chat,adminPeerIds));
  $("pinned-chat-section").hidden=!pinnedChats.length||isArchived;
  renderChatSection("direct","pinned-chat-list","pinned-chat-count",term,pinnedChats);
  standard.hidden=!isStandard;blocked.hidden=S.folder!=="blocked";deleted.hidden=S.folder!=="deleted";
  archivedPanel.hidden=!isArchived;$("all-groups-section").hidden=isArchived;
  document.querySelectorAll("[data-folder]").forEach(b=>{
    const active=b.dataset.folder===S.folder;
    b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active));
  });
  if(isStandard){
    $("private-chat-heading").textContent=S.folder==="friends"?"Friends":"Non-friends";
    const friends=new Set(S.friends.map(x=>x.friend_id)),blockedIds=new Set(S.blockedUsers.map(x=>x.blocked_id));
    const chats=S.chats.filter(c=>{
      if(c.kind!=="direct"||pinnedIds.has(c.id)||isArchivedChat(c))return false;
      const peer=peerForChat(c);if(!peer||blockedIds.has(peer))return false;
      return S.folder==="friends"?friends.has(peer):!friends.has(peer);
    });
    if(S.folder==="friends")chats.sort((a,b)=>Number(S.favoriteFriendIds.has(peerForChat(b)))-Number(S.favoriteFriendIds.has(peerForChat(a))));
    renderChatSection("direct","private-chat-list","private-chat-count",term,chats);
  }else if(S.folder==="blocked")renderBlockedUsers(term);
  else if(S.folder==="deleted")renderDeletedMessages(term);
  else if(isArchived){
    const archived=S.chats.filter(chat=>isArchivedChat(chat));
    renderChatSection("direct","archived-direct-list","archived-direct-count",term,archived.filter(chat=>chat.kind==="direct"));
    renderChatSection("group","archived-group-list","archived-group-count",term,archived.filter(chat=>chat.kind==="group"));
  }
  renderChatSection("group","group-chat-list","group-chat-count",term,S.chats.filter(chat=>chat.kind==="group"&&!pinnedIds.has(chat.id)&&!isArchivedChat(chat)));
  renderConversationSelectionControls();renderInChatSidebar();
}
function renderInChatSidebar(){
  const pinnedSection=$("in-chat-pinned-section");
  const pinnedList=$("in-chat-pinned-list");
  const allList=$("in-chat-conversation-list");
  const pinnedCount=$("in-chat-pinned-count");
  const allCount=$("in-chat-conversation-count");
  if(!pinnedSection||!pinnedList||!allList||!pinnedCount||!allCount)return;
  const term=($("in-chat-filter")?.value||"").trim().toLowerCase();
  const adminPeerIds=getAdminConversationPeerIds();
  const matches=S.chats.filter(chat=>{
    if(chat.id!==S.active&&isRegularChatDuplicatedByAdmin(chat,adminPeerIds))return false;
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
  const regular=matches.filter(chat=>!pinnedSet.has(chat.id)).sort((a,b)=>Number(S.favoriteFriendIds.has(peerForChat(b)))-Number(S.favoriteFriendIds.has(peerForChat(a)))||sortRecent(a,b));
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
  const messages=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,attachment_path,forwarded_from_id,is_admin_message").in("id",ids);
  if(messages.error){toast("Deleted messages could not be loaded: "+messages.error.message);return false;}
  const byId=new Map((messages.data||[]).map(x=>[x.id,x]));
  S.deletedMessages=(markers.data||[]).flatMap(marker=>{
    const m=byId.get(marker.message_id);if(!m)return [];
    const chat=S.chats.find(c=>c.id===m.conversation_id);
    return [{...m,message_id:m.id,deleted_at:marker.deleted_at,sender_name:m.is_admin_message?"Gather Admin":(m.sender_id===S.user.id?"You":(S.profiles[m.sender_id]?.display_name||"Member")),conversation_title:chat?chatTitle(chat):"Conversation"}];
  });
  renderChats();return true;
}
async function toggleArchiveConversation(){
  const chat=S.chats.find(item=>item.id===S.active),id=chat?.id;
  if(!id||!S.user)return;
  const isArchived=S.archivedConversationIds.has(id);
  const result=isArchived
    ?await db.from("user_archived_conversations").delete().eq("user_id",S.user.id).eq("conversation_id",id)
    :await db.from("user_archived_conversations").insert({user_id:S.user.id,conversation_id:id});
  if(result.error){toast("Conversation could not be "+(isArchived?"restored":"archived")+": "+result.error.message);return;}
  if(isArchived)S.archivedConversationIds.delete(id);else S.archivedConversationIds.add(id);
  $("chat-actions-modal").hidden=true;
  if(!isArchived)goHome();else renderChats();
  toast(isArchived?"Conversation restored to your inbox.":"Conversation archived.");
}
async function selectFolder(folder){
  if(!["friends","nonfriends","blocked","deleted","archived"].includes(folder))return;
  if(folder!=="deleted")S.deletedConversationId=null;
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
  window.GatherGames?.setActiveChat(c||null);
  const gamesOpen=!!$("games-workspace")&&!$("games-workspace").hidden&&!c;
  const switcher=$("workspace-switcher");if(switcher)switcher.hidden=!!c||(!gamesOpen&&$("empty")?.hidden);
  $("message-create-poll").hidden=c?.kind!=="group";
  renderUndoSend();
  $("layout").classList.toggle("direct-chat",c?.kind==="direct");
  $("empty").hidden=!!c||gamesOpen;if(c&&$("games-workspace"))$("games-workspace").hidden=true;$("chat").hidden=!c;
  $("layout").classList.toggle("in-chat-mode",!!c);
  $("sidebar-home-content").hidden=!!c;
  $("in-chat-sidebar").hidden=!c;
  $("sidebar-title").textContent=c?"Conversations":"Messages";

  const peer=c?.members.find(m=>m.user_id!==S.user.id),peerProfile=peer&&S.profiles[peer.user_id];
  const avatarImage=c?.kind==="group"?c.avatar_data:peerProfile?.avatar_data;
  paintAvatar($("chat-avatar"),chatTitle(c||{kind:"direct",members:[]}),avatarImage);
  $("layout").classList.toggle("show-chat",!!c);
  $("layout").classList.toggle("show-home",!c&&!gamesOpen);
  $("layout").classList.toggle("show-games",gamesOpen);
  $("home-open").hidden=!c;
  $("leave-chat").hidden=!c||c.kind!=="group";
  if(!c){
    $("chat-title").hidden=true;
    $("chat-presence-status").hidden=true;
    $("chat-typing-indicator").hidden=true;
    return;
  }
  const peerUserId=c.kind==="direct"?peerForChat(c):null;
  $("chat-title").textContent=chatTitle(c);
  $("chat-subtitle").textContent=chatSub(c);
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
  const restrictionPending=!S.messageRestrictionLoaded;
  const messageRestricted=!!activeMessageRestriction();
  const sendingDisabled=restrictionPending||messageRestricted;
  applyChatAppearance(S.active);
  $("block-user").hidden=!isDirect;
  $("select-messages").hidden=false;
  $("select-messages").textContent=S.selectingMessages?"Cancel":"Select";
  $("delete-selected").hidden=!S.selectingMessages||S.selectedMessageIds.size===0;
  $("delete-selected").textContent="Delete selected ("+S.selectedMessageIds.size+")";
  if(!isDirect){
    const groupCheckPending=c?.kind==="group"&&!S.groupMessageStatus;
    const groupBlocked=c?.kind==="group"&&!!S.groupMessageStatus&&!S.groupMessageStatus.can_message;
    const disabled=sendingDisabled||groupCheckPending||groupBlocked;
    $("message").disabled=disabled;
    $("message").placeholder=restrictionPending?"Checking messaging permissions…":messageRestricted?"Messaging temporarily restricted":groupCheckPending?"Checking group messaging access…":groupBlocked?"Group messaging unavailable":"Write a message…";
    $("send").disabled=disabled;
    $("message-image-file").disabled=disabled;
    $("composer-more-trigger").disabled=disabled;
    $("chat-notice").hidden=!groupBlocked;
    $("chat-notice").textContent=groupBlocked
      ?(S.groupMessageStatus.age_restricted
        ?"This group includes members from another age group. Gather Admin must approve each cross-group member pair before messages can be sent."
        :"Messaging is unavailable because a member has blocked someone in this group.")
      :"";
    return;
  }
  const d=S.directStatus,ageApprovalNeeded=!!d?.is_intergroup&&!d?.intergroup_permission,blocked=!d?.can_message;
  $("chat-title").hidden=!d?.can_message;
  $("block-user").disabled=!d||!!d.error;
  $("block-user").textContent=d?.i_blocked?"Unblock":"Block";
  $("message").disabled=blocked||sendingDisabled;$("send").disabled=blocked||sendingDisabled;
  $("message-image-file").disabled=blocked||sendingDisabled;
  $("composer-more-trigger").disabled=blocked||sendingDisabled;
  $("message").placeholder=restrictionPending?"Checking messaging permissions…":messageRestricted?"Messaging temporarily restricted":!d?"Checking private chat permissions…":blocked?"Private messaging unavailable":"Write a message…";
  const notice=$("chat-notice");
  notice.hidden=!blocked;
  notice.classList.toggle("checking",!d);
  notice.classList.toggle("verification-error",!!d?.error);
  const noticeText=!d
    ?"Checking private chat permissions…"
    :d.error
      ?"Could not verify chat permissions. Check your connection and try again."
      :d.i_blocked
        ?"You blocked this member. Unblock them to send private messages. Your previous messages remain visible."
        :ageApprovalNeeded
          ?"This member is in the "+d.other_age_group+" age group. Cross-group messaging requires Gather Admin approval. You can request approval from New private message."
          :"Private messaging is unavailable in this conversation. Your previous messages remain visible.";
  notice.replaceChildren(document.createTextNode(noticeText));
  if(d?.error){
    const retry=el("button","chat-permission-retry","Try again");
    retry.type="button";
    retry.addEventListener("click",()=>{
      const id=S.active;
      if(!id)return;
      S.directStatus=null;
      renderDirectControls();
      void refreshDirectStatus(id);
    });
    notice.append(document.createTextNode(" "),retry);
  }
}
async function runPermissionRpc(name,params){
  const controller=typeof AbortController==="function"?new AbortController():null;
  let timer;
  const timeout=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{
      controller?.abort();
      const error=new Error("The permission check timed out. Please try again.");
      error.permissionTimeout=true;
      reject(error);
    },8000);
  });
  try{
    let request=db.rpc(name,params);
    if(controller&&typeof request?.abortSignal==="function")request=request.abortSignal(controller.signal);
    return await Promise.race([request,timeout]);
  }finally{
    clearTimeout(timer);
  }
}
async function refreshDirectStatus(conversationId=S.active){
  if(!conversationId||S.active!==conversationId)return false;
  if(!(S.directStatusChecks instanceof Map))S.directStatusChecks=new Map();
  const requestKey=(S.user?.id||"")+"|"+conversationId;
  const inFlight=S.directStatusChecks.get(requestKey);
  if(inFlight)return inFlight;
  const c=S.chats.find(x=>x.id===conversationId);
  if(!c){
    if(S.active===conversationId){S.directStatus=null;S.groupMessageStatus=null;renderDirectControls();}
    return false;
  }
  const isGroup=c.kind==="group";
  const peer=isGroup?null:c.members.find(m=>m.user_id!==S.user?.id);
  if(!isGroup&&!peer){
    if(S.active===conversationId){S.directStatus=null;S.groupMessageStatus=null;renderDirectControls();}
    return false;
  }
  const requestingUserId=S.user?.id;
  let task;
  task=(async()=>{
    try{
      const result=await runPermissionRpc(
        isGroup?"get_conversation_message_status":"get_direct_chat_status",
        isGroup?{p_conversation_id:conversationId}:{p_other_user_id:peer.user_id}
      );
      if(S.user?.id!==requestingUserId)return false;
      if(result.error)throw result.error;
      const status=result.data;
      if(!status||typeof status.can_message!=="boolean")throw new Error("No permission status was returned.");
      if(isGroup){
        if(S.active!==conversationId)return false;
        S.groupMessageStatus=status;
        S.directStatus=null;
      }else{
        if(S.directStatusCache instanceof Map){
          S.directStatusCache.set(conversationId,{userId:requestingUserId,status,checkedAt:Date.now()});
        }
        if(S.active!==conversationId)return true;
        S.directStatus=status;
        S.groupMessageStatus=null;
      }
      renderDirectControls();
      return true;
    }catch(error){
      if(S.user?.id===requestingUserId&&S.active===conversationId){
        const message=error?.permissionTimeout
          ?"Permission check timed out."
          :(error?.message||"Permission check failed.");
        if(isGroup){
          S.groupMessageStatus={can_message:false,age_restricted:false,blocked_pair:false,error:message};
        }else{
          S.directStatus={i_blocked:false,can_message:false,error:message};
          if(S.directStatusCache instanceof Map)S.directStatusCache.delete(conversationId);
        }
        renderDirectControls();
      }
      return false;
    }finally{
      if(S.directStatusChecks.get(requestKey)===task)S.directStatusChecks.delete(requestKey);
    }
  })();
  S.directStatusChecks.set(requestKey,task);
  return task;
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
    const result=await db.from("messages").select("id,sender_id,body,attachment_path,is_admin_message").eq("conversation_id",conversationId).in("id",ids);
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
      if(receipt.user_id===S.user.id&&!S.suppressReadDividerUpdates){S.unreadTargetMessageId=null;S.unreadTargetLoaded=true;}
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
  const result=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,reply_to_id,attachment_path,forwarded_from_id,is_admin_message").eq("conversation_id",conversationId).or("created_at.lt."+oldest+",and(created_at.eq."+oldest+",id.lt."+S.messages[0].id+")").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
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
  if(!chat||!users.length){node.hidden=true;node.replaceChildren();return;}
  const label=chat.kind==="direct"?"Typing…":users.length===1?(S.profiles[users[0]]?.display_name||"A group member")+" is typing…":users.length+" people are typing…";
  const copy=el("span","typing-indicator-copy",label);
  const dots=el("span","typing-indicator-dots");dots.setAttribute("aria-hidden","true");
  for(let i=0;i<3;i++)dots.append(el("span",""));
  node.replaceChildren(copy,dots);node.hidden=false;
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

function renderMessageSkeletons(){
  const list=$("messages");if(!list)return;
  list.replaceChildren();list.classList.add("is-opening-conversation");list.setAttribute("aria-busy","true");
  const widths=["58%","72%","46%","66%","52%"];
  widths.forEach((width,index)=>{
    const row=el("div","message-skeleton-row"+(index%2?" is-mine":""));
    const bubble=el("div","message-skeleton-bubble");bubble.style.width=width;
    bubble.append(el("span","message-skeleton-line"),el("span","message-skeleton-line short"));
    row.append(bubble);list.append(row);
  });
}
async function openChat(id){
  const cachedPermission=S.directStatusCache instanceof Map?S.directStatusCache.get(id):null;
  const cacheAge=cachedPermission?.userId===S.user?.id?Date.now()-cachedPermission.checkedAt:Infinity;
  const cachedStatus=cacheAge<120000?cachedPermission.status:null;
  const permissionCheckIsFresh=!!cachedStatus&&cacheAge<15000;
  closeConversationDrawer();
  saveActiveChatDraft();
  clearUnreadDividerState();
  closeTypingChannel();
  if(S.readChannel){db.removeChannel(S.readChannel);S.readChannel=null;}
  if(S.pollChannel){db.removeChannel(S.pollChannel);S.pollChannel=null;}
  clearPendingMessageImage();
  // Conversation entry is an immediate state change, not a full-screen transition.
  // Avoids expensive Safari view-transition snapshots and stacked entrance animations.
  S.active=id;S.initialChatScrollLockId=id;S.unreadTargetMessageId=null;S.unreadTargetLoaded=true;restoreChatDraft(id);S.selectingMessages=false;S.selectedMessageIds.clear();S.directStatus=cachedStatus;S.groupMessageStatus=null;
  S.messages=[];S.messageReads={};S.messageReactions={};S.messagePolls={};S.pinnedMessages=[];S.forwardMessage=null;S.pendingReactionKeys.clear();S.openReactionPickerMessageId=null;S.openMessageMenuId=null;S.replyTo=null;S.hasOlderMessages=false;S.loadingOlder=false;renderReplyComposer();
  renderMessageSkeletons();
  $("layout").classList.remove("show-home");$("layout").classList.add("show-chat");renderActive();
  // Permission checks run in the background and never hold up the conversation view.
  if(!permissionCheckIsFresh)void refreshDirectStatus(id);
  subscribeTyping(id);
  await loadMessages(id);
  if(S.active!==id)return;
  // Opening the conversation marks its existing incoming messages as seen.
  // Do not wait for the read update before displaying the conversation.
  void markConversationRead(id);
  subscribeMessageReads(id);subscribePollVotes(id);await loadUnreadCounts();renderChats();
}
async function loadMessages(id){
  const r=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,reply_to_id,attachment_path,forwarded_from_id,is_admin_message").eq("conversation_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  if(S.active!==id)return;
  if(r.error){$("messages").replaceChildren(el("p","status error","Messages could not be loaded. Please try again."));$("messages").setAttribute("aria-busy","false");toast("Messages could not be loaded: "+r.error.message);return;}
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
  scrollMessagesToLatest(id);
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
  const row=document.querySelector('[data-message-id="'+id+'"]');if(row){releaseInitialChatScrollLock();row.scrollIntoView({block:"center",behavior:"smooth"});row.classList.add("search-highlight");setTimeout(()=>row.classList.remove("search-highlight"),2400);}else toast("Pinned message could not be loaded.");
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
  const list=$("forward-message-list");list.replaceChildren();const forwardingPoll=!!S.messagePolls[S.forwardMessage?.id];const chats=S.chats.filter(x=>x.id!==S.active&&(!forwardingPoll||x.kind==="group"));
  if(!chats.length){list.append(el("p","muted tiny",forwardingPoll?"Polls can only be forwarded to group chats.":"Start another conversation before forwarding a message."));return;}
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
  const sourcePoll=S.messagePolls[m.id];
  if(sourcePoll&&c.kind!=="group"){toast("Polls can only be forwarded to group chats.");return;}
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
  if(row){releaseInitialChatScrollLock();row.scrollIntoView({block:"center",behavior:"smooth"});}else toast("Saved message could not be loaded.");
}
function openPollComposer(){
  closeComposerMoreMenu();if(!S.active){toast("Open a group chat first.");return;}const c=S.chats.find(x=>x.id===S.active);
  if(c?.kind!=="group"){toast("Polls are available in group chats only.");return;}
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
  if(!cid||c?.kind!=="group"){status("poll-status","Polls are available in group chats only.","error");return;}
  if(!question||question.length>200||opts.length<2||opts.length>6){status("poll-status","Enter a question and at least two options.","error");return;}
  if(new Set(opts.map(x=>x.toLowerCase())).size!==opts.length){status("poll-status","Poll choices must be different.","error");return;}
  const b=$("poll-submit");b.disabled=true;status("poll-status","Creating poll…");
  const m=await db.from("messages").insert({conversation_id:cid,sender_id:S.user.id,body:question,attachment_path:null}).select("id").single();
  if(m.error){b.disabled=false;status("poll-status",m.error.message,"error");return;}
  const p=await db.from("message_polls").insert({message_id:m.data.id,conversation_id:cid,created_by:S.user.id,question}).select("id").single();
  if(p.error){await db.from("messages").delete().eq("id",m.data.id);b.disabled=false;status("poll-status",p.error.message,"error");return;}
  const o=await db.from("message_poll_options").insert(opts.map((label,position)=>({poll_id:p.data.id,conversation_id:cid,label,position})));
  if(o.error){await db.from("messages").delete().eq("id",m.data.id);b.disabled=false;status("poll-status",o.error.message,"error");return;}
  $("poll-create-modal").hidden=true;b.disabled=false;await loadMessages(cid);await loadChats();toast("Poll created.");
}
function positionMessageActionMenu(menu,trigger){
  if(!menu||!trigger||!menu.isConnected||!trigger.isConnected)return;
  const viewport=window.visualViewport;
  const viewportWidth=viewport?.width||document.documentElement.clientWidth||window.innerWidth;
  const viewportHeight=viewport?.height||window.innerHeight;
  const offsetLeft=viewport?.offsetLeft||0;
  const offsetTop=viewport?.offsetTop||0;
  const margin=10,gap=7;
  menu.style.position="fixed";
  menu.style.right="auto";
  menu.style.bottom="auto";
  menu.style.left=margin+"px";
  menu.style.top=margin+"px";
  menu.style.width="max-content";
  menu.style.maxWidth=Math.max(0,viewportWidth-margin*2)+"px";
  menu.style.maxHeight=Math.max(60,viewportHeight-margin*2)+"px";
  menu.style.overflowY="auto";
  menu.style.visibility="hidden";
  const menuRect=menu.getBoundingClientRect();
  const anchor=trigger.getBoundingClientRect();
  const maxWidth=Math.max(0,viewportWidth-margin*2);
  const menuWidth=Math.min(menuRect.width,maxWidth);
  const rightAlignedLeft=anchor.right-menuWidth;
  const leftAlignedLeft=anchor.left;
  let left=rightAlignedLeft;
  if(left<offsetLeft+margin&&leftAlignedLeft+menuWidth<=offsetLeft+viewportWidth-margin){
    left=leftAlignedLeft;
  }
  left=Math.max(offsetLeft+margin,Math.min(left,offsetLeft+viewportWidth-margin-menuWidth));
  const topLimit=offsetTop+margin;
  const bottomLimit=offsetTop+viewportHeight-margin;
  const belowSpace=Math.max(0,bottomLimit-(anchor.bottom+gap));
  const aboveSpace=Math.max(0,(anchor.top-gap)-topLimit);
  const openBelow=belowSpace>=menuRect.height||belowSpace>=aboveSpace;
  const availableSpace=openBelow?belowSpace:aboveSpace;
  menu.style.maxHeight=Math.max(60,Math.min(viewportHeight-margin*2,availableSpace))+"px";
  const finalHeight=menu.getBoundingClientRect().height;
  let top=openBelow?anchor.bottom+gap:anchor.top-gap-finalHeight;
  top=Math.max(topLimit,Math.min(top,bottomLimit-finalHeight));
  menu.style.left=left+"px";
  menu.style.top=top+"px";
  menu.style.visibility="";
}
function repositionFloatingMessageActionMenu(){
  const menu=document.querySelector(".message-action-menu[data-floating-menu='true']");
  if(menu?._anchorTrigger)positionMessageActionMenu(menu,menu._anchorTrigger);
}
function scrollMessagesToLatest(conversationId=S.active){
  if(!conversationId||S.active!==conversationId||S.initialChatScrollLockId!==conversationId)return;
  const list=$("messages");
  const scroll=()=>{
    if(S.active!==conversationId||S.initialChatScrollLockId!==conversationId)return;
    list.scrollTop=list.scrollHeight;
  };
  scroll();
  requestAnimationFrame(()=>{
    scroll();
    requestAnimationFrame(scroll);
  });
}
function releaseInitialChatScrollLock(){
  S.initialChatScrollLockId=null;
}
function renderMessages(preserveScroll=false){
  document.querySelectorAll(".message-action-menu[data-floating-menu='true']").forEach(menu=>{
    menu.classList.add("is-dismissing");
    const removeMenu=()=>menu.remove();
    menu.addEventListener("transitionend",removeMenu,{once:true});
    setTimeout(removeMenu,190);
  });
  const list=$("messages"),previousHeight=list.scrollHeight,previousTop=list.scrollTop;
  const suppressEntryAnimation=list.classList.contains("is-opening-conversation");
  list.classList.remove("is-opening-conversation");
  const existingMessageIds=new Set([...list.querySelectorAll(".message[data-message-id]")].map(row=>row.dataset.messageId));
  list.replaceChildren();list.setAttribute("aria-busy","false");
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
    if(!suppressEntryAnimation&&!existingMessageIds.has(String(m.id)))row.classList.add("gather-message-enter");
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
      if(m.edited_at)addAction("View edit history",()=>openMessageEditHistory(m));
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
        link.href=m.image_url;link.setAttribute("aria-label","View image");
        link.addEventListener("click",event=>{event.preventDefault();openImageViewer(m.image_url,"Image shared in "+chatTitle(activeChat||{kind:"direct",members:[]}));});
        const image=el("img","message-image");
        image.src=m.image_url;image.alt="Image sent by "+(p?.display_name||"a Gather member");
        image.loading="lazy";image.decoding="async";
        image.addEventListener("load",()=>scrollMessagesToLatest(S.active),{once:true});
        link.append(image);bubble.append(link);
        if(image.complete)queueMicrotask(()=>scrollMessagesToLatest(S.active));
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
  if(S.initialChatScrollLockId===S.active){
    // Keep the view anchored to the latest message while message content
    // (especially lazy-loaded images) is still changing its scroll height.
    scrollMessagesToLatest(S.active);
  }else if(preserveScroll){
    list.scrollTop=previousTop+(list.scrollHeight-previousHeight);
  }else{
    list.scrollTop=list.scrollHeight;
  }
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
  if(r.error){toast("Message could not be restored: "+r.error.message);return false;}
  S.deletedMessageIds.delete(messageId);
  await loadChats();await loadDeletedMessages();
  if(S.active){const active=S.chats.find(x=>x.id===S.active);if(active)await loadMessages(S.active);}
  toast("Message restored to your conversation.");
  return true;
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
    doc.documentElement.style.cssText="width:100%;height:100%;margin:0;background:#000000;";
    const viewport=doc.createElement("meta");viewport.name="viewport";viewport.content="width=device-width,initial-scale=1,viewport-fit=cover";
    const theme=doc.createElement("meta");theme.name="theme-color";theme.content="#000000";
    const style=doc.createElement("style");style.textContent="html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000000}iframe{display:block;width:100%;height:100%;border:0;background:#000000}";
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
function openMessageSearch(scope="conversation"){
  const conversationId=scope==="all"?null:S.active;
  if(!conversationId&&!S.chats.length){toast("Create or open a conversation before searching messages.");return;}
  S.searchConversationId=conversationId;S.searchQuery="";S.searchOffset=0;S.searchHasMore=false;
  $("message-search-title").textContent=conversationId?"Search messages":"Search all conversations";
  $("message-search-label").textContent=conversationId?"Search this conversation":"Search all conversations";
  $("message-search-input").placeholder=conversationId?"Find a word or phrase":"Find a word or phrase in any chat";
  $("message-search-input").value="";
  $("message-search-sender").replaceChildren(new Option("Anyone",""));
  const scopeIds=conversationId?[conversationId]:S.chats.map(chat=>chat.id);
  const scopeMembers=[...new Set(S.chats.filter(chat=>scopeIds.includes(chat.id)).flatMap(chat=>chat.members.map(member=>member.user_id)))];
  scopeMembers.forEach(userId=>{const profile=S.profiles[userId];$("message-search-sender").add(new Option(userId===S.user.id?"You":profile?.display_name||"Member",userId));});
  $("message-search-from").value="";$("message-search-to").value="";
  $("message-search-results").replaceChildren(el("p","muted tiny",conversationId?"Search all messages in this conversation.":"Search messages across your Gather conversations."));
  $("message-search-more").hidden=true;status("message-search-status","");$("message-search-modal").hidden=false;$("message-search-input").focus();
}
async function searchConversationMessages(reset=true){
  const query=$("message-search-input").value.trim().slice(0,120);
  if(reset){S.searchQuery=query;S.searchOffset=0;S.searchHasMore=false;$("message-search-results").replaceChildren();}
  if(!query){$("message-search-results").replaceChildren(el("p","muted tiny","Enter a word or phrase to search messages."));$("message-search-more").hidden=true;return;}
  if(query!==S.searchQuery){S.searchQuery=query;S.searchOffset=0;$("message-search-results").replaceChildren();}
  const conversationId=S.searchConversationId,from=S.searchOffset,to=from+99;
  if(!conversationId&&!S.chats.length){$("message-search-results").replaceChildren(el("p","muted tiny","You do not have any conversations to search yet."));$("message-search-more").hidden=true;return;}
  status("message-search-status",S.searchOffset?"Loading more matches…":"Searching "+(conversationId?"this conversation":"all conversations")+"…");
  let request=db.from("messages").select("id,conversation_id,sender_id,body,created_at");
  if(conversationId)request=request.eq("conversation_id",conversationId);
  else request=request.in("conversation_id",S.chats.map(chat=>chat.id));
  const senderId=$("message-search-sender").value,fromDate=$("message-search-from").value,toDate=$("message-search-to").value;
  if(senderId)request=request.eq("sender_id",senderId);
  if(fromDate){const startDate=new Date(fromDate+"T00:00:00");if(Number.isFinite(startDate.getTime()))request=request.gte("created_at",startDate.toISOString());}
  if(toDate){const endDate=new Date(toDate+"T00:00:00");endDate.setDate(endDate.getDate()+1);if(Number.isFinite(endDate.getTime()))request=request.lt("created_at",endDate.toISOString());}
  const result=await request.ilike("body","%"+query+"%").order("created_at",{ascending:false}).order("id",{ascending:false}).range(from,to);
  if(result.error){status("message-search-status","Search failed: "+result.error.message,"error");return;}
  const rows=(result.data||[]).filter(m=>!S.deletedMessageIds.has(m.id));
  rows.forEach(m=>{
    const button=el("button","message-search-result");button.type="button";
    const chat=S.chats.find(item=>item.id===m.conversation_id);
    const chatLabel=conversationId?"":(chat?chatTitle(chat):"Conversation")+" · ";
    const sender=S.profiles[m.sender_id]?.display_name||"Member";
    button.append(el("strong","",chatLabel+sender+" · "+dateLabel(m.created_at)),el("span","",m.body));
    button.addEventListener("click",()=>openSearchResult(m));$("message-search-results").append(button);
  });
  S.searchOffset=to+1;S.searchHasMore=(result.data||[]).length===100;
  $("message-search-more").hidden=!S.searchHasMore;
  status("message-search-status",rows.length?("Found "+S.searchOffset+" matching messages"+(S.searchHasMore?" so far":".")):"No matching messages on this page.");
}
async function openSearchResult(message){
  const conversationId=message.conversation_id||S.searchConversationId;
  $("message-search-modal").hidden=true;
  releaseInitialChatScrollLock();
  if(!conversationId||!S.chats.some(chat=>chat.id===conversationId)){toast("That conversation is no longer available.");return;}
  if(S.active!==conversationId)await openChat(conversationId);
  const result=await db.from("messages").select("id,conversation_id,sender_id,body,created_at,edited_at,reply_to_id,attachment_path").eq("conversation_id",conversationId).lte("created_at",message.created_at).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(300);
  if(result.error){toast("That message could not be opened: "+result.error.message);return;}
  if(S.active!==conversationId)return;
  releaseInitialChatScrollLock();
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

function dismissUndoNotice(event){
  const button=event?.target?.closest?.("#message-undo-dismiss");
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  if(!S.pendingUndoSend)return;
  S.pendingUndoSend.dismissed=true;
  const bar=$("message-undo-bar");
  if(bar)bar.hidden=true;
}
function renderUndoSend(){
  const bar=$("message-undo-bar");if(!bar)return;
  const pending=S.pendingUndoSend;
  const remainingMs=pending?pending.expiresAt-Date.now():0;
  const visible=!!pending&&!pending.dismissed&&remainingMs>0&&pending.conversationId===S.active;
  bar.hidden=!visible;
  const countdown=$("message-undo-countdown");
  if(countdown&&pending&&remainingMs>0){
    countdown.textContent=Math.ceil(remainingMs/1000)+"s";
  }
  if((!pending||remainingMs<=0)&&S.undoCountdownInterval){
    clearInterval(S.undoCountdownInterval);
    S.undoCountdownInterval=null;
  }
}
function armUndoSend(message){
  if(S.undoSendTimer)clearTimeout(S.undoSendTimer);
  if(S.undoCountdownInterval)clearInterval(S.undoCountdownInterval);
  S.undoCountdownInterval=null;
  const expiresAt=message?._undoExpiresAt||0;
  if(!message||expiresAt<=Date.now()){
    S.pendingUndoSend=null;
    renderUndoSend();
    return;
  }
  S.pendingUndoSend={message,conversationId:message.conversation_id,expiresAt};
  S.undoCountdownInterval=setInterval(renderUndoSend,200);
  S.undoSendTimer=setTimeout(()=>{
    if(S.pendingUndoSend?.message.id===message.id){
      S.pendingUndoSend=null;
      S.undoSendTimer=null;
      if(S.undoCountdownInterval)clearInterval(S.undoCountdownInterval);
      S.undoCountdownInterval=null;
      renderUndoSend();
    }
  },Math.max(0,expiresAt-Date.now()));
  renderUndoSend();
}
async function undoSendMessage(message){
  if(!S.user||!message||message.sender_id!==S.user.id)return;
  const expiresAt=message._undoExpiresAt||0;
  if(!expiresAt||Date.now()>expiresAt){toast("Undo send is available for 10 seconds after sending.");return;}
  const button=$("message-undo");if(button)button.disabled=true;
  const result=await db.from("messages").delete().eq("id",message.id).eq("sender_id",S.user.id).select("id").maybeSingle();
  if(button)button.disabled=false;
  if(result.error||!result.data){toast("Message could not be unsent: "+(result.error?.message||"It may no longer be available."));return;}
  const attachmentPath=message._undoAttachmentPath||message.attachment_path;
  if(attachmentPath){
    const cleanup=await db.storage.from("gather-message-images").remove([attachmentPath]);
    if(cleanup.error)console.warn("Unsent image cleanup failed:",cleanup.error.message);
  }
  if(S.pendingUndoSend?.message.id===message.id){
    if(S.undoSendTimer)clearTimeout(S.undoSendTimer);
    if(S.undoCountdownInterval)clearInterval(S.undoCountdownInterval);
    S.undoSendTimer=null;S.undoCountdownInterval=null;S.pendingUndoSend=null;
  }
  S.messages=S.messages.filter(item=>item.id!==message.id);
  if(S.active===message.conversation_id)await loadMessages(message.conversation_id);
  await loadChats();renderUndoSend();
  toast("Message unsent for everyone in the conversation.");
}
async function undoLastSend(){
  const pending=S.pendingUndoSend;
  if(!pending)return;
  await undoSendMessage(pending.message);
}

async function sendMessage(e){
  e.preventDefault();
  if(!S.messageRestrictionLoaded){toast("Gather is still checking your messaging permissions. Please try again in a moment.");return;}
  if(activeMessageRestriction()){toast("Messaging is temporarily restricted for your account.");return;}
  const body=$("message").value.trim(),file=S.pendingImageFile;
  if((!body&&!file)||!S.active)return;
  const conversationId=S.active,activeChat=S.chats.find(x=>x.id===conversationId);
  if(activeChat?.kind==="direct"&&!S.directStatus?.can_message){toast("Private messaging is unavailable in this conversation.");return;}
  if(activeChat?.kind==="group"&&!S.groupMessageStatus?.can_message){toast("Group messaging is unavailable until age-group and block permissions are satisfied.");return;}
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
  let localMessage=S.messages.find(x=>x.id===r.data.id);
  if(!localMessage){localMessage={...withReply,reply_preview:reply||null};S.messages.push(localMessage);S.messageReactions[r.data.id]=[];}
  localMessage._undoExpiresAt=Date.now()+10000;localMessage._undoAttachmentPath=attachmentPath;
  renderMessages();armUndoSend(localMessage);
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
  $("people-desc").textContent=mode==="group"?"Name your group and choose who to invite.":mode==="friend"?"Send a friend request. They must accept before you become friends, and then private messaging opens automatically.":"Find someone by their Gather username. Cross-group messaging first requires Gather Admin approval, then the recipient must accept a chat request.";
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
    const copy=el("div","person-copy");copy.append(el("strong","",p.display_name));appendApprovedBadge(copy,p.id,(S.picker==="direct"||S.picker==="group")?"new-chat-picker":null);
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
  const access=await db.rpc("get_direct_chat_status",{p_other_user_id:p.id});
  if(access.error){status("people-status","Messaging eligibility could not be checked: "+access.error.message,"error");return;}
  if(access.data?.i_blocked||access.data?.they_blocked){status("people-status","This member is not available for messaging.","error");return;}
  if(access.data?.is_intergroup&&!access.data?.intergroup_permission){
    const request=await db.rpc("request_intergroup_message",{p_target_user_id:p.id});
    if(request.error){status("people-status","Intergroup request could not be sent: "+request.error.message,"error");return;}
    $("people-modal").hidden=true;
    toast(request.data?.status==="pending"
      ?"Intergroup messaging request sent to Gather Admin for review."
      :"Intergroup messaging is already approved. You can now send a chat request.");
    return;
  }
  const existing=S.chats.find(c=>c.kind==="direct"&&c.members.length===2&&c.members.some(m=>m.user_id===p.id)&&c.members.some(m=>m.user_id===S.user.id));
  if(existing){
    S.directStatusCache.set(existing.id,{userId:S.user.id,status:access.data,checkedAt:Date.now()});
    $("people-modal").hidden=true;await openChat(existing.id);return;
  }
  const r=await db.rpc("send_direct_chat_request",{p_recipient_id:p.id});
  if(r.error){status("people-status","Request could not be sent: "+r.error.message,"error");return;}
  if(r.data?.status==="age_verification_required"){status("people-status","Both members must complete age confirmation before messaging.","error");return;}
  if(r.data?.status==="intergroup_approval_required"){status("people-status","Admin approval is required before a cross-group chat request can be sent.","error");return;}
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
function renderProfileHighlights(node,values){
  if(!node)return;
  node.replaceChildren();
  const highlights=(Array.isArray(values)?values:[]).filter(value=>typeof value==="string"&&value.trim()).slice(0,3);
  node.hidden=!highlights.length;
  highlights.forEach(value=>node.append(el("span","profile-highlight",value.trim().slice(0,40))));
}
async function openPublicProfile(userId){
  if(!userId||!S.user)return;
  if(userId===S.user.id){openProfile();return;}
  if(!await canViewMemberProfile(userId)){toast("You can view profiles of members you can message or share a group chat with.");return;}
  $("member-profile-modal").hidden=false;
  $("member-profile-name").textContent="Loading profile…";
  $("member-profile-username").textContent="";
  $("member-profile-pronouns").textContent="";
  $("member-profile-status-message").textContent="";$("member-profile-status-message").hidden=true;
  renderProfileHighlights($("member-profile-highlights"),[]);
  $("member-profile-bio").textContent="";
  $("member-profile-mutuals").textContent="";
  S.publicProfileId=null;
  const presenceLabel=$("member-profile-presence");
  presenceLabel.textContent="";presenceLabel.hidden=true;presenceLabel.classList.remove("is-online");
  const existing=S.profiles[userId];
  const result=await db.from("profiles").select("id,username,display_name,bio,pronouns,banner_style,status_message,profile_highlights").eq("id",userId).maybeSingle();
  if(result.error||!result.data){$("member-profile-name").textContent="Profile unavailable";return;}
  const profile={...result.data,avatar_data:existing?.avatar_data||null};
  const picture=await db.from("profile_avatars").select("image_data").eq("user_id",userId).maybeSingle();
  profile.avatar_data=picture.error?null:(picture.data?.image_data||null);
  S.profiles[userId]=profile;S.publicProfileId=userId;
  renderPublicProfilePresence();
  $("member-profile-name").textContent=profile.display_name;appendApprovedBadge($("member-profile-name"),userId,"profile");
  $("member-profile-username").textContent="@"+profile.username;
  $("member-profile-pronouns").textContent=profile.pronouns||"";
  $("member-profile-pronouns").hidden=!profile.pronouns;
  $("member-profile-status-message").textContent=profile.status_message||"";$("member-profile-status-message").hidden=!profile.status_message;
  renderProfileHighlights($("member-profile-highlights"),profile.profile_highlights);
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
  const next=prompt("Edit your message (use **bold** and #italic#):",message.body);
  if(next===null)return;
  const body=next.trim();
  if(!body||body.length>4000){toast("Messages must contain 1–4,000 characters.");return;}
  if(body===message.body)return;
  const result=await db.from("messages").update({body,edited_at:new Date().toISOString()}).eq("id",message.id).eq("sender_id",S.user.id).select("id,body,edited_at").maybeSingle();
  if(result.error||!result.data){toast("Message could not be edited: "+(result.error?.message||"Permission denied."));return;}
  Object.assign(message,result.data);renderMessages(true);toast("Message updated.");
}
async function adminApi(action,data={}){
  if(!isFeedbackAdmin(S.user))throw new Error("Admin Mode is not available for this account.");
  const {data:sessionData,error:sessionError}=await db.auth.getSession();
  const token=sessionData?.session?.access_token;
  if(sessionError||!token)throw new Error("Your session expired. Please sign in again.");
  const result=await fetch(URL+"/functions/v1/gather-admin",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":KEY,
      "Authorization":"Bearer "+token
    },
    body:JSON.stringify({action,...data})
  });
  let payload={};
  try{payload=await result.json();}catch(error){}
  if(!result.ok)throw new Error(payload.error||"Admin Mode could not complete that action.");
  return payload;
}
const ADMIN_CHILD_MODAL_IDS=["announcement-compose-modal","announcements-page-modal","announcement-view-modal","reports-admin-modal","feedback-modal"];
function updateAdminModalStack(){
  const stack=S.admin.modalStack||[];
  ADMIN_CHILD_MODAL_IDS.forEach(id=>{
    const modal=$(id);if(!modal)return;
    const index=stack.indexOf(id);
    if(index<0){modal.style.removeProperty("z-index");}
    else{modal.hidden=false;modal.style.zIndex=String(6+index);}
  });
  document.querySelectorAll("[data-admin-back]").forEach(button=>{
    const parent=button.closest(".overlay");
    button.hidden=!parent||!stack.includes(parent.id);
  });
  syncModalBackButtons();
}
function showAdminChildModal(id){
  const modal=$(id);if(!modal)return;
  if(isFeedbackAdmin(S.user)&&$("admin-mode-modal")&&!$("admin-mode-modal").hidden){
    const stack=S.admin.modalStack;
    const existing=stack.indexOf(id);
    if(existing>=0){
      const removed=stack.splice(existing+1);
      removed.forEach(childId=>{const child=$(childId);if(child){child.hidden=true;child.style.removeProperty("z-index");}});
    }else stack.push(id);
    updateAdminModalStack();
  }else{
    modal.hidden=false;
  }
}
function closeAdminChildNavigation(){
  const stack=S.admin.modalStack;
  if(!stack?.length)return false;
  const id=stack.pop(),modal=$(id);
  if(modal){modal.hidden=true;modal.style.removeProperty("z-index");}
  updateAdminModalStack();
  return true;
}
function dismissAdminChildModal(id){
  const stack=S.admin.modalStack,index=stack.lastIndexOf(id);
  if(index>=0){
    const removed=stack.splice(index);
    removed.forEach(childId=>{const child=$(childId);if(child){child.hidden=true;child.style.removeProperty("z-index");}});
    updateAdminModalStack();
  }else if($(id))$(id).hidden=true;
}
function clearAdminChildNavigation(){
  S.admin.modalStack=[];
  ADMIN_CHILD_MODAL_IDS.forEach(id=>{const modal=$(id);if(modal){modal.hidden=true;modal.style.removeProperty("z-index");}});
  updateAdminModalStack();
}
function setAdminModeSection(section){
  if(!["overview","accounts","messages","age-access","reports","feedback","announcements","approvals","activity"].includes(section))return;
  S.admin.section=section;
  document.querySelectorAll("[data-admin-section]").forEach(button=>{
    if(button.classList.contains("admin-mode-tab"))button.classList.toggle("active",button.dataset.adminSection===section);
    if(button.getAttribute("role")==="tab")button.setAttribute("aria-selected",String(button.dataset.adminSection===section));
  });
  document.querySelectorAll("[data-admin-panel]").forEach(panel=>{
    panel.hidden=panel.dataset.adminPanel!==section;
  });
  if(section==="overview")loadAdminOverview();
  if(section==="accounts"&&!S.admin.users.length)loadAdminAccounts(true);
    if(section==="activity")loadAdminActivity();
  if(section==="approvals")loadAdminApprovals();
  if(section==="age-access"){loadAdminIntergroupRequests();loadAdminAgeChangeRequests();}
}
async function openAdminMode(){
  if(!isFeedbackAdmin(S.user)){toast("Admin Mode is only available to the designated Gather administrator.");return;}
  clearAdminChildNavigation();
  $("admin-mode-modal").hidden=false;
  setAdminModeSection("overview");
}
function adminActionLabel(action){
  return ({
    profile_updated:"Updated a member profile",
    user_banned:"Banned a member account",
    user_unbanned:"Unbanned a member account",
    user_deleted:"Deleted a member account",
    messaging_restricted:"Temporarily restricted a member's messaging",
    messaging_restriction_removed:"Removed a member's messaging restriction",
    intergroup_request_approved:"Approved intergroup messaging",
    intergroup_request_declined:"Declined an intergroup messaging request",
    intergroup_permission_revoked:"Revoked intergroup messaging permission",
    age_confirmation_reset:"Reset a member's age confirmation",
    age_change_approved:"Verified and approved an age correction",
    age_change_declined:"Declined an age correction"
  })[action]||String(action||"Admin action").replaceAll("_"," ");
}
async function loadAdminAgeChangeRequests(){
  if(!isFeedbackAdmin(S.user))return;
  const list=$("admin-age-change-request-list");if(!list)return;
  list.replaceChildren(el("p","muted tiny","Loading age correction requests…"));
  try{
    const result=await adminApi("list_age_change_requests");
    S.admin.ageChangeRequests=result.requests||[];
    renderAdminAgeChangeRequests();
  }catch(error){list.replaceChildren(el("p","status error",error.message));}
}
function renderAdminAgeChangeRequests(){
  const list=$("admin-age-change-request-list");if(!list)return;
  list.replaceChildren();
  const items=S.admin.ageChangeRequests||[];
  if(!items.length){list.append(el("p","muted tiny","There are no pending age correction requests."));return;}
  items.forEach(item=>{
    const row=el("article","admin-intergroup-request");
    const member=item.profile?.display_name||item.profile?.username||"Gather member";
    row.append(
      el("strong","",member+" · "+(item.current_age_group||"Unconfirmed")+" → "+(item.proposed_age_group||"Unconfirmed")),
      el("small","",dateLabel(item.submitted_at)+" · Date of birth is not shown to Admin")
    );
    const actions=el("div","admin-intergroup-actions");
    const approve=el("button","primary","Verify & approve");approve.type="button";
    const decline=el("button","outline","Decline");decline.type="button";
    approve.addEventListener("click",()=>reviewAgeChangeRequest(item.request_id,true));
    decline.addEventListener("click",()=>reviewAgeChangeRequest(item.request_id,false));
    actions.append(approve,decline);row.append(actions);list.append(row);
  });
}
async function reviewAgeChangeRequest(requestId,approve){
  if(!isFeedbackAdmin(S.user))return;
  const action=approve?"approve this age correction":"decline this age correction";
  if(!confirm("Are you sure you want to "+action+"? The member’s age-group assignment changes only when you approve."))return;
  try{
    await adminApi("review_age_change_request",{request_id:requestId,decision:approve?"approved":"declined"});
    await loadAdminAgeChangeRequests();
    toast(approve?"Age correction verified and approved.":"Age correction declined.");
  }catch(error){toast("Age correction could not be reviewed: "+error.message);}
}
async function loadAdminIntergroupRequests(){
  if(!isFeedbackAdmin(S.user))return;
  const list=$("admin-intergroup-request-list");
  if(!list)return;
  list.replaceChildren(el("p","muted tiny","Loading intergroup requests…"));
  try{
    const result=await adminApi("list_intergroup_requests");
    S.admin.intergroupRequests=result.requests||[];
    renderAdminIntergroupRequests();
  }catch(error){
    list.replaceChildren(el("p","status error",error.message));
  }
}
function renderAdminIntergroupRequests(){
  const list=$("admin-intergroup-request-list");if(!list)return;
  list.replaceChildren();
  const items=S.admin.intergroupRequests||[];
  if(!items.length){list.append(el("p","muted tiny","No intergroup messaging requests have been submitted."));return;}
  items.forEach(item=>{
    const row=el("article","admin-intergroup-request");
    const requester=item.requester?.display_name||"Member";
    const target=item.target?.display_name||"Member";
    const statusText=item.status==="approved"?"Approved":item.status==="declined"?"Declined":item.status==="revoked"?"Revoked":"Awaiting review";
    row.append(
      el("strong","",requester+" ("+item.requester_age_group+") → "+target+" ("+item.target_age_group+")"),
      el("small","",dateLabel(item.requested_at)+" · "+statusText)
    );
    if(item.status==="pending"){
      const actions=el("div","admin-intergroup-actions");
      const approve=el("button","primary","Approve");approve.type="button";
      const decline=el("button","outline","Decline");decline.type="button";
      approve.addEventListener("click",()=>reviewIntergroupRequest(item.id,"approved"));
      decline.addEventListener("click",()=>reviewIntergroupRequest(item.id,"declined"));
      actions.append(approve,decline);row.append(actions);
    }else if(item.status==="approved"){
      const revoke=el("button","outline admin-intergroup-revoke","Revoke permission");revoke.type="button";
      revoke.addEventListener("click",()=>reviewIntergroupRequest(item.id,"revoked"));
      row.append(revoke);
    }
    list.append(row);
  });
}
async function reviewIntergroupRequest(requestId,decision){
  if(!isFeedbackAdmin(S.user))return;
  const title=decision==="approved"?"Approve intergroup messaging?":decision==="revoked"?"Revoke this intergroup permission?":"Decline this intergroup request?";
  if(!confirm(title))return;
  try{
    await adminApi(decision==="revoked"?"revoke_intergroup_permission":"review_intergroup_request",{
      request_id:requestId,
      ...(decision==="revoked"?{}:{decision})
    });
    await loadAdminIntergroupRequests();
    toast(decision==="approved"?"Intergroup messaging approved.":decision==="revoked"?"Intergroup messaging permission revoked.":"Intergroup messaging request declined.");
  }catch(error){toast("The request could not be updated: "+error.message);}
}
function renderAdminActivity(listId,items){
  const list=$(listId);if(!list)return;
  list.replaceChildren();
  if(!items?.length){list.append(el("p","muted tiny","No admin actions have been recorded yet."));return;}
  items.forEach(item=>{
    const row=el("article","admin-activity-item");
    row.append(
      el("strong","",adminActionLabel(item.action)),
      el("small","",dateLabel(item.created_at)+(item.target_user_id?" · Member ID "+item.target_user_id.slice(0,8):"")),
      el("small","",Object.entries(item.details||{}).map(([key,value])=>key.replaceAll("_"," ")+": "+String(value)).join(" · "))
    );
    list.append(row);
  });
}
async function loadAdminOverview(){
  if(!isFeedbackAdmin(S.user))return;
  $("admin-overview-activity").replaceChildren(el("p","muted tiny","Loading admin activity…"));
  try{
    const result=await adminApi("summary");
    S.admin.summary=result.summary||{};
    $("admin-summary-accounts").textContent=String(S.admin.summary.accounts??0);
    $("admin-summary-reports").textContent=String(S.admin.summary.reports??0);
    $("admin-summary-feedback").textContent=String(S.admin.summary.feedback??0);
    $("admin-summary-announcements").textContent=String(S.admin.summary.announcements??0);
     $("admin-summary-approvals").textContent=String(S.admin.summary.pendingApprovals??0);
    S.admin.activity=result.activity||[];
    renderAdminActivity("admin-overview-activity",S.admin.activity);
  }catch(error){
    $("admin-overview-activity").replaceChildren(el("p","status error",error.message));
  }
}
async function loadAdminApprovals(){
  if(!isFeedbackAdmin(S.user))return;
  const pending=$("admin-approval-pending-list"),approved=$("admin-approval-approved-list");
  pending.replaceChildren(el("p","muted tiny","Loading approval requests…"));
  approved.replaceChildren(el("p","muted tiny","Loading approved accounts…"));
  try{
    const result=await adminApi("list_approval_data");
    S.admin.approvalPending=result.pending||[];
    S.admin.approvalApproved=result.approved||[];
    renderAdminApprovals();
  }catch(error){
    pending.replaceChildren(el("p","status error",error.message));
    approved.replaceChildren(el("p","muted tiny","Approved accounts could not be loaded."));
  }
}
function renderAdminApprovals(){
  const pending=$("admin-approval-pending-list"),approved=$("admin-approval-approved-list");
  if(!pending||!approved)return;
  pending.replaceChildren();approved.replaceChildren();
  if(!S.admin.approvalPending.length)pending.append(el("p","muted tiny section-empty","There are no pending account approval requests."));
  S.admin.approvalPending.forEach(item=>{
    const profile=item.profile||{},card=el("article","admin-approval-card");
    const heading=el("div","admin-approval-heading");
    heading.append(el("strong","",profile.display_name||"Gather member"),el("small","",profile.username?"@"+profile.username:"No username"));
    card.append(heading,el("small","muted","Requested "+dateLabel(item.created_at)));
    if(item.message)card.append(el("p","admin-approval-message",item.message));
    const noteLabel=el("label","admin-approval-note-label");
    noteLabel.append(el("span","","Review note (optional)"));
    const note=el("textarea");note.rows=2;note.maxLength=500;note.placeholder="Add a short note for the member…";
    noteLabel.append(note);card.append(noteLabel);
    const actions=el("div","admin-account-form-actions");
    const approve=el("button","primary","Approve");approve.type="button";
    const decline=el("button","outline","Decline");decline.type="button";
    approve.addEventListener("click",()=>reviewAdminApproval(item.id,"approve",note.value,approve,decline));
    decline.addEventListener("click",()=>reviewAdminApproval(item.id,"decline",note.value,approve,decline));
    actions.append(approve,decline);card.append(actions);pending.append(card);
  });
  if(!S.admin.approvalApproved.length)approved.append(el("p","muted tiny section-empty","No accounts have approved status yet."));
  S.admin.approvalApproved.forEach(item=>{
    const profile=item.profile||{},row=el("div","admin-approval-approved-row");
    const copy=el("div","admin-approval-approved-copy");
    copy.append(el("strong","",profile.display_name||"Gather member"),el("small","muted",profile.username?"@"+profile.username:"No username"),el("small","muted","Approved "+dateLabel(item.approved_at)));
    const revoke=el("button","admin-danger-button","Revoke");revoke.type="button";
    revoke.addEventListener("click",()=>revokeAdminApproval(item.user_id,revoke));
    row.append(copy,revoke);approved.append(row);
  });
}
async function reviewAdminApproval(requestId,decision,note,approveButton,declineButton){
  if(!isFeedbackAdmin(S.user))return;
  if(decision==="decline"&&!confirm("Decline this account approval request?"))return;
  approveButton.disabled=true;declineButton.disabled=true;
  try{
    await adminApi("review_account_approval",{request_id:requestId,decision,review_note:String(note||"").trim().slice(0,500)});
    toast(decision==="approve"?"Account approved.":"Approval request declined.");
    await Promise.all([loadAdminApprovals(),loadAdminOverview()]);
    await loadApprovedUserIds();
    renderChats();renderFriends();if(S.active)renderMessages(true);
  }catch(error){
    toast("The approval request could not be updated: "+error.message);
    approveButton.disabled=false;declineButton.disabled=false;
  }
}
async function revokeAdminApproval(userId,button){
  if(!isFeedbackAdmin(S.user)||!userId)return;
  const item=S.admin.approvalApproved.find(row=>row.user_id===userId),name=item?.profile?.display_name||"this member";
  if(!confirm("Remove approved status from "+name+"? The account will remain active as a regular Gather account."))return;
  button.disabled=true;
  try{
    await adminApi("revoke_account_approval",{user_id:userId});
    toast("Approved status revoked.");
    await Promise.all([loadAdminApprovals(),loadAdminOverview(),loadApprovedUserIds()]);
    renderChats();renderFriends();if(S.active)renderMessages(true);
  }catch(error){
    toast("Approved status could not be revoked: "+error.message);button.disabled=false;
  }
}
async function loadAdminAccounts(reset=false){
  if(!isFeedbackAdmin(S.user)||S.admin.loading)return;
  S.admin.loading=true;
  const button=$("admin-accounts-more");
  if(reset){S.admin.users=[];S.admin.page=0;S.admin.hasMore=false;S.admin.selectedUserId=null;}
  button.disabled=true;
  button.textContent="Loading accounts…";
  $("admin-account-list").replaceChildren(el("p","muted tiny","Loading member accounts…"));
  try{
    const page=(reset?0:S.admin.page)+1;
    const result=await adminApi("list_users",{page,per_page:50});
    if(reset)S.admin.users=[];
    S.admin.users.push(...(result.users||[]));
    S.admin.page=result.page||page;
    S.admin.hasMore=!!result.has_more;
    renderAdminAccounts();
    renderAdminAccountDetail();
  }catch(error){
    $("admin-account-list").replaceChildren(el("p","status error",error.message));
  }finally{
    S.admin.loading=false;
    button.disabled=false;
    button.hidden=!S.admin.hasMore;
    button.textContent="Load more accounts";
  }
}
function renderAdminAccounts(){
  const list=$("admin-account-list");if(!list)return;
  list.replaceChildren();
  const term=($("admin-account-search")?.value||"").trim().toLowerCase();
  const users=S.admin.users.filter(user=>{
    const search=[user.display_name,user.username,user.email,user.id].join(" ").toLowerCase();
    return !term||search.includes(term);
  });
  if(!users.length){
    list.append(el("p","muted tiny",term?"No loaded accounts match that search.":"No member accounts were returned."));
    return;
  }
  users.forEach(user=>{
    const button=el("button","admin-account-item"+(S.admin.selectedUserId===user.id?" active":""));
    button.type="button";
    const name=user.display_name||user.username||"Unnamed account";
    const banned=!!user.active_ban_reason||(user.banned_until&&new Date(user.banned_until)>new Date());
    button.append(
      el("strong","",name),
      el("small","",user.username?"@"+user.username:"No username set"),
      el("small","",user.email||"No email address"),
      el("small","admin-account-item-status",banned?"Banned":"Active")
    );
    button.addEventListener("click",()=>{S.admin.selectedUserId=user.id;renderAdminAccounts();renderAdminAccountDetail();});
    list.append(button);
  });
}
function renderAdminAccountDetail(){
  const detail=$("admin-account-detail");if(!detail)return;
  detail.replaceChildren();
  const user=S.admin.users.find(item=>item.id===S.admin.selectedUserId);
  if(!user){
    const empty=el("div","admin-empty-state");
    empty.append(el("strong","","Select a member"),el("p","muted tiny","Account details and moderation controls will appear here."));
    detail.append(empty);return;
  }
  const banned=!!user.active_ban_reason||(user.banned_until&&new Date(user.banned_until)>new Date());
  const header=el("div","admin-account-detail-header");
  header.append(el("h4","",user.display_name||"Unnamed account"),el("p","admin-account-email",user.email||"No email address on file"));
  const meta=el("div","admin-account-meta");
  meta.append(
    el("span","", "Account ID: "+user.id),
    el("span","", "Created: "+(dateLabel(user.created_at)||"Unknown")),
    el("span","", "Last sign-in: "+(dateLabel(user.last_sign_in_at)||"Never recorded")),
    el("span","", "Status: "+(banned?"Banned":"Active")),
    el("span","", "Age group: "+(user.age_group||"Not confirmed / outside age range")),
    ...(user.active_ban_reason?[el("span","","Ban reason: "+user.active_ban_reason)]:[])
  );
  const restriction=user.message_restriction&&Date.parse(user.message_restriction.expires_at)>Date.now()?user.message_restriction:null;
  const restrictionCard=el("section","admin-message-restriction-card");
  restrictionCard.append(el("h4","","Messaging restriction"));
  const restrictionStatus=el("p","tiny "+(restriction?"admin-restriction-active":"muted"));
  restrictionStatus.textContent=restriction
    ?"Restricted until "+new Date(restriction.expires_at).toLocaleString()+". "+restriction.notice
    :"This member can currently send messages.";
  restrictionCard.append(restrictionStatus);
  const restrictionDuration=el("select","");restrictionDuration.id="admin-message-restriction-duration";
  [[15,"15 minutes"],[30,"30 minutes"],[60,"1 hour"],[360,"6 hours"],[1440,"24 hours"],[4320,"3 days"],[10080,"7 days"]].forEach(([value,label])=>{
    const option=el("option","",label);option.value=String(value);restrictionDuration.append(option);
  });
  const restrictionDurationLabel=el("label","admin-restriction-field");
  restrictionDurationLabel.append(el("span","","Duration"),restrictionDuration);
  const restrictionNotice=el("textarea","");restrictionNotice.id="admin-message-restriction-notice";
  restrictionNotice.rows=3;restrictionNotice.maxLength=500;
  restrictionNotice.placeholder="Write the message the member will see while messaging is restricted.";
  const restrictionNoticeLabel=el("label","admin-restriction-field");
  restrictionNoticeLabel.append(el("span","","Message shown to member"),restrictionNotice);
  const restrictionActions=el("div","admin-restriction-actions");
  const restrictionApply=el("button","primary","Apply messaging restriction");restrictionApply.type="button";
  const restrictionLift=el("button","outline","Lift restriction");restrictionLift.type="button";restrictionLift.hidden=!restriction;
  restrictionApply.disabled=!!user.is_gather_admin||user.id===S.user.id;
  restrictionLift.disabled=!!user.is_gather_admin||user.id===S.user.id;
  if(user.is_gather_admin)restrictionStatus.textContent="Administrator accounts cannot be restricted.";
  restrictionActions.append(restrictionApply,restrictionLift);
  const restrictionFeedback=el("p","tiny muted");restrictionFeedback.id="admin-message-restriction-status";
  restrictionCard.append(restrictionDurationLabel,restrictionNoticeLabel,restrictionActions,restrictionFeedback);
  const form=el("form","admin-account-form");form.id="admin-account-form";
  const fields=[
    ["Username","username",24,user.username||""],
    ["Display name","display_name",50,user.display_name||""],
    ["Bio","bio",160,user.bio||""],
    ["Pronouns","pronouns",35,user.pronouns||""]
  ];
  fields.forEach(([label,key,maxLength,value])=>{
    const input=key==="bio"?el("textarea",""):el("input","");
    input.id="admin-edit-"+key;
    input.maxLength=maxLength;
    input.value=value;
    if(key!=="bio")input.type="text";
    const wrapper=el("label");
    wrapper.append(el("span","",label),input);
    form.append(wrapper);
  });
  const banner=el("select","");banner.id="admin-edit-banner_style";
  ["violet","blue","mint","rose","amber","teal"].forEach(value=>{
    const option=el("option","",value[0].toUpperCase()+value.slice(1));option.value=value;banner.append(option);
  });
  banner.value=user.banner_style||"violet";
  const bannerLabel=el("label");bannerLabel.append(el("span","","Profile banner"),banner);form.append(bannerLabel);
  const actions=el("div","admin-account-form-actions");
  const save=el("button","primary","Save profile");save.type="submit";
  const ban=el("button","outline",banned?"":"Ban account");ban.id="admin-account-ban";ban.type="button";ban.hidden=banned;
  const unban=el("button","outline","Unban account");unban.id="admin-account-unban";unban.type="button";unban.hidden=!banned;
  const resetAge=el("button","outline","Reset age confirmation");resetAge.type="button";
  resetAge.disabled=!!user.is_gather_admin;
  if(user.is_gather_admin)resetAge.title="Administrator accounts do not use age groups.";
  const remove=el("button","admin-danger-button","Delete account");remove.id="admin-account-delete";remove.type="button";
  actions.append(save,ban,unban,resetAge,remove);form.append(actions);
  const saveStatus=el("p","tiny muted");saveStatus.id="admin-account-save-status";
  const note=el("p","tiny muted","Emails are read from Auth. Passwords and password hashes are never available in this screen.");
  detail.append(header,meta,restrictionCard,form,saveStatus,note);
  restrictionApply.addEventListener("click",()=>setAdminMessagingRestriction(user.id));
  restrictionLift.addEventListener("click",()=>clearAdminMessagingRestriction(user.id));
  form.addEventListener("submit",saveAdminAccountProfile);
  ban.addEventListener("click",()=>banAdminAccount(user.id));
  unban.addEventListener("click",()=>unbanAdminAccount(user.id));
  resetAge.addEventListener("click",()=>resetAdminAgeConfirmation(user.id));
  remove.addEventListener("click",()=>deleteAdminAccount(user.id));
}
async function setAdminMessagingRestriction(userId){
  const user=S.admin.users.find(item=>item.id===userId);if(!user||!isFeedbackAdmin(S.user))return;
  const duration=Number($("admin-message-restriction-duration").value);
  const notice=$("admin-message-restriction-notice").value.trim();
  const statusNode=$("admin-message-restriction-status"),button=$("admin-account-detail")?.querySelector(".admin-restriction-actions .primary");
  if(!notice){statusNode.textContent="Write a message for the member before applying the restriction.";return;}
  if(button)button.disabled=true;
  statusNode.textContent="Applying messaging restriction…";
  try{
    const result=await adminApi("set_messaging_restriction",{user_id:userId,duration_minutes:duration,notice});
    user.message_restriction=result.restriction;
    renderAdminAccounts();renderAdminAccountDetail();
    toast("Messaging restriction applied.");
  }catch(error){
    statusNode.textContent="Restriction could not be applied: "+error.message;
    if(button)button.disabled=false;
  }
}
async function clearAdminMessagingRestriction(userId){
  const user=S.admin.users.find(item=>item.id===userId);if(!user||!isFeedbackAdmin(S.user))return;
  const statusNode=$("admin-message-restriction-status"),button=$("admin-account-detail")?.querySelector(".admin-restriction-actions .outline");
  if(button)button.disabled=true;
  if(statusNode)statusNode.textContent="Lifting messaging restriction…";
  try{
    await adminApi("clear_messaging_restriction",{user_id:userId});
    user.message_restriction=null;
    renderAdminAccounts();renderAdminAccountDetail();
    toast("Messaging restriction lifted.");
  }catch(error){
    if(statusNode)statusNode.textContent="Restriction could not be removed: "+error.message;
    if(button)button.disabled=false;
  }
}
async function resetAdminAgeConfirmation(userId){
  const user=S.admin.users.find(item=>item.id===userId);
  if(!user||!isFeedbackAdmin(S.user)||user.is_gather_admin)return;
  if(!confirm("Reset age confirmation for this member? They will be required to enter their date of birth again before using Gather."))return;
  try{
    await adminApi("reset_age_confirmation",{user_id:userId});
    user.age_group=null;
    renderAdminAccounts();renderAdminAccountDetail();
    toast("Age confirmation reset. The member must confirm again before using Gather.");
  }catch(error){toast("Age confirmation could not be reset: "+error.message);}
}
async function saveAdminAccountProfile(event){
  event.preventDefault();
  const user=S.admin.users.find(item=>item.id===S.admin.selectedUserId);if(!user)return;
  const statusNode=$("admin-account-save-status"),submit=$("admin-account-form")?.querySelector('button[type="submit"]');
  if(submit)submit.disabled=true;
  if(statusNode)statusNode.textContent="Saving profile…";
  const profile={
    username:$("admin-edit-username").value,
    display_name:$("admin-edit-display_name").value,
    bio:$("admin-edit-bio").value,
    pronouns:$("admin-edit-pronouns").value,
    banner_style:$("admin-edit-banner_style").value
  };
  try{
    const result=await adminApi("update_profile",{user_id:user.id,profile});
    Object.assign(user,result.profile||profile);
    if(S.profiles[user.id])Object.assign(S.profiles[user.id],result.profile||profile);
    renderAdminAccounts();renderAdminAccountDetail();toast("Member profile updated.");
  }catch(error){
    if(statusNode)statusNode.textContent=error.message;
  }finally{if(submit)submit.disabled=false;}
}
async function banAdminAccount(userId){
  const user=S.admin.users.find(item=>item.id===userId);if(!user)return;
  const reason=prompt("Why is this account being banned? This reason is saved in the moderation record.");
  if(!reason?.trim())return;
  if(!confirm("Ban "+(user.display_name||user.username||"this member")+"? They will be blocked from signing in."))return;
  try{
    await adminApi("ban_user",{user_id:userId,reason:reason.trim()});
    user.active_ban_reason=reason.trim();user.banned_until="9999-12-31T00:00:00.000Z";
    renderAdminAccounts();renderAdminAccountDetail();toast("Account banned.");
  }catch(error){toast(error.message);}
}
async function unbanAdminAccount(userId){
  const user=S.admin.users.find(item=>item.id===userId);if(!user)return;
  if(!confirm("Restore sign-in access for "+(user.display_name||user.username||"this member")+"?"))return;
  try{
    await adminApi("unban_user",{user_id:userId});
    user.active_ban_reason="";user.banned_until=null;
    renderAdminAccounts();renderAdminAccountDetail();toast("Account unbanned.");
  }catch(error){toast(error.message);}
}
async function deleteAdminAccount(userId){
  const user=S.admin.users.find(item=>item.id===userId);if(!user)return;
  const confirmText=prompt("Permanently delete "+(user.display_name||user.username||"this account")+"? This cannot be undone. Type DELETE to continue.");
  if(confirmText!=="DELETE")return;
  if(!confirm("Final confirmation: permanently delete this member account and its linked Auth profile?"))return;
  try{
    await adminApi("delete_user",{user_id:userId});
    S.admin.users=S.admin.users.filter(item=>item.id!==userId);
    S.admin.selectedUserId=null;
    renderAdminAccounts();renderAdminAccountDetail();await loadAdminOverview();
    toast("Member account deleted.");
  }catch(error){toast(error.message);}
}
async function loadAdminActivity(){
  if(!isFeedbackAdmin(S.user))return;
  $("admin-activity-list").replaceChildren(el("p","muted tiny","Loading admin activity…"));
  try{
    const result=await adminApi("list_audit");
    S.admin.activity=result.activity||[];
    renderAdminActivity("admin-activity-list",S.admin.activity);
  }catch(error){$("admin-activity-list").replaceChildren(el("p","status error",error.message));}
}
async function openReportsAdmin(){
  if(!isFeedbackAdmin(S.user)){toast("Only the administrator can review reports.");return;}
  showAdminChildModal("reports-admin-modal");
  const list=$("reports-admin-list");list.replaceChildren(el("p","muted tiny","Loading reports…"));
  const result=await db.from("reports").select("id,reporter_id,target_user_id,message_id,reason,details,status,created_at").order("created_at",{ascending:false}).limit(100);
  list.replaceChildren();
  if(result.error){list.append(el("p","status error","Reports could not be loaded: "+result.error.message));return;}
  if(!result.data?.length){list.append(el("p","muted tiny","There are no reports to review."));return;}
  const profilesResult=await fetchProfileRecords([...new Set(result.data.flatMap(report=>[report.reporter_id,report.target_user_id]))]);
  (profilesResult.data||[]).forEach(profile=>{S.profiles[profile.id]=profile;});
  const reportProfiles=new Map((profilesResult.data||[]).map(profile=>[profile.id,profile]));
  for(const report of result.data){
    const card=el("article","admin-report-card");
    const heading=el("div","admin-report-heading");
    heading.append(el("strong","",report.reason.replaceAll("_"," ")),el("small","",dateLabel(report.created_at)));
    const text=el("p","admin-report-details",report.details||(report.message_id?"A message was reported.":"An account was reported."));
    const reporter=reportProfiles.get(report.reporter_id),target=reportProfiles.get(report.target_user_id);
    const meta=el("small","muted", "From: "+(reporter?.display_name||"Member")+" (@"+(reporter?.username||"unknown")+") · About: "+(target?.display_name||"Member")+" (@"+(target?.username||"unknown")+")");
    const select=el("select","admin-report-status");["new","reviewing","resolved"].forEach(value=>{const option=el("option","",value==="new"?"New":value==="reviewing"?"Reviewing":"Resolved");option.value=value;select.append(option);});select.value=report.status;
    select.addEventListener("change",async()=>{
      const previous=report.status;
      select.disabled=true;
      try{
        const result=await adminApi("update_report_status",{report_id:report.id,status:select.value});
        report.status=result.report?.status||select.value;
        toast("Report status updated.");
      }catch(error){
        select.value=previous;
        toast("Report status could not be updated: "+error.message);
      }finally{select.disabled=false;}
    });
    card.append(heading,text,meta,select);list.append(card);
  }
}
async function signOutOtherSessions(){
  const button=$("signout-other-sessions");button.disabled=true;
  $("session-security-status").textContent="Signing out other devices…";
  const result=await db.auth.signOut({scope:"others"});
  button.disabled=false;
  if(result.error){$("session-security-status").textContent="Other sessions could not be signed out: "+result.error.message;return;}
  const audit=await db.rpc("record_other_sessions_signed_out");
  if(audit.error)console.warn("Session-security activity could not be recorded:",audit.error.message);
  $("session-security-status").textContent="Other sessions have been revoked. Their existing access tokens may remain valid until they expire; this device stays signed in.";
  if(!$("active-sessions-modal").hidden)await loadActiveSessions();
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
  $("profile-bio").value=S.profile.bio||"";$("profile-pronouns").value=S.profile.pronouns||"";$("profile-status-message").value=S.profile.status_message||"";$("profile-highlights").value=(Array.isArray(S.profile.profile_highlights)?S.profile.profile_highlights:[]).join(", ");$("profile-banner-style").value=S.profile.banner_style||"violet";
  $("current-password").value="";$("new-password").value="";$("confirm-password").value="";
  status("profile-status","");status("password-status","");
  S.pendingAvatarData=null;S.avatarChanged=false;
  paintAvatar($("profile-avatar-preview"),S.profile.display_name,S.profile.avatar_data);
  $("profile-avatar-file").value="";
  $("profile-modal").style.removeProperty("z-index");
  $("profile-modal").hidden=false;
  void refreshProfileAgeSettings();
}
function openGroupSettings(){
  const chat=S.chats.find(x=>x.id===S.active);
  if(!chat||chat.kind!=="group")return;
  const myRole=chat.members.find(x=>x.user_id===S.user.id)?.role;
  const owner=myRole==="owner",canManage=owner||myRole==="moderator";
  $("group-settings-title").value=chat.title||"";
  $("group-settings-description").value=chat.description||"";
  $("group-settings-guidelines").value=chat.guidelines||"";
  $("group-settings-slow-mode").value=String(chat.slow_mode_seconds||0);
  $("group-settings-guidelines").disabled=!canManage;$("group-settings-slow-mode").disabled=!canManage;
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
  const guidelines=$("group-settings-guidelines").value.trim(),slowMode=Number($("group-settings-slow-mode").value);
  if(!title||title.length>60){status("group-settings-status","Group names must be between 1 and 60 characters.","error");return;}
  if(description.length>280){status("group-settings-status","Descriptions must be 280 characters or fewer.","error");return;}
  if(guidelines.length>1200){status("group-settings-status","Guidelines must be 1,200 characters or fewer.","error");return;}
  const button=$("group-settings-save");button.disabled=true;
  const result=await db.rpc("update_group_settings",{p_conversation_id:chat.id,p_title:title,p_description:description||null});
  if(result.error){button.disabled=false;status("group-settings-status","Settings could not be saved: "+result.error.message,"error");return;}
  const moderation=await db.rpc("update_group_moderation_settings",{p_conversation_id:chat.id,p_slow_mode_seconds:slowMode,p_guidelines:guidelines||null});
  button.disabled=false;
  if(moderation.error){status("group-settings-status","Group details were saved, but moderation settings were not: "+moderation.error.message,"error");return;}
  chat.title=title;chat.description=description||null;chat.guidelines=guidelines||null;chat.slow_mode_seconds=slowMode;
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
  const bio=$("profile-bio").value.trim(),pronouns=$("profile-pronouns").value.trim(),banner_style=$("profile-banner-style").value,status_message=$("profile-status-message").value.trim();
  const profile_highlights=$("profile-highlights").value.split(/[;\n,]/).map(value=>value.trim()).filter(Boolean);
  if(profile_highlights.length>3||profile_highlights.some(value=>value.length>40)){status("profile-status","Use up to 3 highlights, each 40 characters or fewer.","error");return;}
  if(!display_name||!/^[a-z0-9_]{3,24}$/.test(username)){status("profile-status","Check the name and username format.","error");return;}
  const save=$("profile-save");save.disabled=true;
  const r=await db.from("profiles").update({display_name,username,bio,pronouns,banner_style,status_message,profile_highlights}).eq("id",S.user.id).select("*").single();
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
  if(S.feedbackAdminView)showAdminChildModal("feedback-modal");else $("feedback-modal").hidden=false;
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
  // Load the real profile names for every sender, including the administrator.
  const senderIds=S.feedbackMessages.map(message=>message.sender_id);
  const missingSenderIds=senderIds.filter(id=>id&&!S.feedbackProfiles[id]&&id!==S.user?.id);
  if(missingSenderIds.length){
    const senderProfiles=await fetchProfileRecords(missingSenderIds);
    if(!senderProfiles.error)(senderProfiles.data||[]).forEach(profile=>S.feedbackProfiles[profile.id]=profile);
  }
  if(S.user?.id&&!S.feedbackProfiles[S.user.id]){
    const ownProfile=await fetchProfileRecords([S.user.id]);
    if(!ownProfile.error)(ownProfile.data||[]).forEach(profile=>S.feedbackProfiles[profile.id]=profile);
  }
  renderFeedbackMessages();
}
function renderFeedbackMessages(){
  const list=$("feedback-message-list");list.replaceChildren();
  if(!S.feedbackMessages.length){list.append(el("p","muted tiny","No messages in this thread yet."));return;}
  const thread=S.feedbackThreads.find(item=>item.id===S.activeFeedbackThreadId);
  S.feedbackMessages.forEach(message=>{
    const mine=message.sender_id===S.user?.id;
    const isAdminReply=!!thread&&message.sender_id!==thread.user_id;
    const bubble=el("article","feedback-message"+(mine?" mine":""));
    const profile=S.feedbackProfiles[message.sender_id];
    // Keep administrator identity private in member-facing feedback; member senders retain their real names.
    const sender=isAdminReply?(mine?"You":"Gather Admin"):(profile?.display_name||profile?.username||"Gather member");
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

function setModalBackTarget(modalId,parentId){
  if(!modalId)return;
  if(!S.modalBackTargets)S.modalBackTargets={};
  if(parentId)S.modalBackTargets[modalId]=parentId;
  else delete S.modalBackTargets[modalId];
}
function syncModalBackButtons(){
  const adminOpen=!!(isFeedbackAdmin(S.user)&&$("admin-mode-modal")&&!$("admin-mode-modal").hidden);
  document.querySelectorAll(".modal-back-button").forEach(button=>{
    const modal=button.closest(".modal"),id=button.closest(".overlay")?.id;
    const inAdminStack=!!(adminOpen&&id&&(S.admin.modalStack||[]).includes(id));
    const hasParent=!!(id&&S.modalBackTargets?.[id]);
    const feedbackHasPreviousScreen=id==="feedback-modal"&&(
      !$("feedback-new-form").hidden||
      !$("feedback-detail").hidden||
      !$("feedback-edit-form").hidden
    );
    const hasExitButton=!!modal?.querySelector(":scope > .close");
    // Keep Back only when it returns to a previous screen or leaves a nested feedback view.
    // A root-level modal with its own close/exit control does not need a duplicate button.
    button.hidden=inAdminStack||(!hasParent&&!feedbackHasPreviousScreen&&hasExitButton);
  });
}
function installModalBackButtons(){
  document.querySelectorAll(".overlay > .modal").forEach(modal=>{
    const overlayId=modal.closest(".overlay")?.id;
    if(["admin-mode-modal","password-recovery-modal"].includes(overlayId))return;
    if(modal.querySelector(":scope > .modal-back-button"))return;
    const button=el("button","modal-back-button","← Back");
    button.type="button";
    button.setAttribute("aria-label","Go back");
    button.addEventListener("click",()=>handleModalBack(overlayId));
    modal.insertBefore(button,modal.firstChild);
  });
  syncModalBackButtons();
}
function returnFeedbackToList(){
  if(!$("feedback-edit-form").hidden){cancelFeedbackEdit();return true;}
  const composing=!$("feedback-new-form").hidden;
  const viewing=!$("feedback-detail").hidden;
  if(!composing&&!viewing)return false;
  $("feedback-new-form").hidden=true;
  $("feedback-detail").hidden=true;
  $("feedback-empty").hidden=false;
  $("feedback-request-actions").hidden=true;
  $("feedback-edit-form").hidden=true;
  $("feedback-message-list").hidden=false;
  $("feedback-reply-form").hidden=false;
  S.activeFeedbackThreadId=null;
  S.feedbackMessages=[];
  $("feedback-empty").textContent=S.feedbackAdminView
    ?"Select a feedback thread to read and respond."
    :"Choose a feedback thread or start a new one.";
  renderFeedbackThreads();
  return true;
}
function handleModalBack(modalId){
  if(!modalId)return;
  if(modalId==="feedback-modal"&&returnFeedbackToList())return;
  const stack=S.admin.modalStack||[];
  if(stack.length&&stack[stack.length-1]===modalId){closeAdminChildNavigation();return;}
  if(stack.includes(modalId)){dismissAdminChildModal(modalId);return;}
  const modal=$(modalId);
  if(modal)modal.hidden=true;
  const parentId=S.modalBackTargets?.[modalId];
  if(parentId&&$(parentId)){
    $(parentId).hidden=false;
    delete S.modalBackTargets[modalId];
  }else if(S.modalBackTargets){
    delete S.modalBackTargets[modalId];
  }
}
function closeModals(forceAll=false){
  if(!forceAll&&S.admin.modalStack?.length&&$("admin-mode-modal")&&!$("admin-mode-modal").hidden){closeAdminChildNavigation();return;}
  clearAdminChildNavigation();
  S.modalBackTargets={};
  $("admin-mode-modal").hidden=true;$("announcement-compose-modal").hidden=true;$("announcement-view-modal").hidden=true;$("announcements-page-modal").hidden=true;$("notifications-modal").hidden=true;$("member-profile-modal").hidden=true;$("report-modal").hidden=true;$("reports-admin-modal").hidden=true;$("people-modal").hidden=true;$("profile-modal").hidden=true;$("requests-modal").hidden=true;$("friends-modal").hidden=true;$("settings-modal").hidden=true;$("group-photo-modal").hidden=true;$("group-settings-modal").hidden=true;$("message-search-modal").hidden=true;$("poll-create-modal").hidden=true;$("forward-message-modal").hidden=true;$("saved-messages-modal").hidden=true;$("chat-actions-modal").hidden=true;$("shared-media-modal").hidden=true;$("image-viewer-modal").hidden=true;$("active-sessions-modal").hidden=true;$("security-activity-modal").hidden=true;$("group-events-modal").hidden=true;$("scheduled-message-modal").hidden=true;$("scheduled-messages-modal").hidden=true;$("message-edit-history-modal").hidden=true;$("feedback-modal").hidden=true;$("install-app-modal").hidden=true; }
function goHome(){
  closeConversationDrawer();
  saveActiveChatDraft();clearUnreadDividerState();
  closeTypingChannel();
  runScreenTransition(()=>{
    clearPendingMessageImage();closeModals(true);S.active=null;S.messages=[];S.messageReads={};S.messageReactions={};S.messagePolls={};S.pinnedMessages=[];S.forwardMessage=null;S.pendingReactionKeys.clear();S.openReactionPickerMessageId=null;S.replyTo=null;S.hasOlderMessages=false;S.selectingMessages=false;S.selectedMessageIds.clear();S.directStatus=null;renderReplyComposer();
    $("games-workspace")?.setAttribute("hidden", "");
    $("layout").classList.remove("show-chat", "show-games");$("layout").classList.add("show-home");
    $("workspace-games-tab")?.classList.remove("active");$("workspace-games-tab")?.setAttribute("aria-pressed","false");
    $("workspace-messages-tab")?.classList.add("active");$("workspace-messages-tab")?.setAttribute("aria-pressed","true");
    renderChats();renderActive();
  });
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
async function openMessageEditHistory(message){
  if(!message?.id)return;
  const list=$("message-edit-history-list");
  list.replaceChildren(el("p","muted tiny","Loading edit history…"));
  $("message-edit-history-modal").hidden=false;
  const result=await db.from("message_edit_history").select("previous_body,edited_at,editor_id").eq("message_id",message.id).order("edited_at",{ascending:false}).limit(30);
  if(result.error){list.replaceChildren(el("p","status error","Edit history could not be loaded: "+result.error.message));return;}
  list.replaceChildren();
  const current=el("article","feature-list-item");
  current.append(el("strong","","Current version"),el("p","",message.body||"(No text)"),el("small","muted tiny","Current"));
  list.append(current);
  (result.data||[]).forEach((entry,index)=>{
    const card=el("article","feature-list-item");
    card.append(el("strong","","Previous version "+(index+1)),el("p","",entry.previous_body),el("small","muted tiny",dateLabel(entry.edited_at)));
    list.append(card);
  });
  if(!result.data?.length)list.append(el("p","muted tiny","No earlier versions were recorded for this message."));
}
function openImageViewer(src,alt="Shared image"){
  if(!src)return;
  $("image-viewer-image").src=src;
  $("image-viewer-image").alt=alt;
  // Keep the prior surface open underneath the viewer. Back returns to it:
  // Shared media remains open when launched there; message scroll remains untouched
  // when launched directly from a message.
  $("image-viewer-modal").hidden=false;
}
function closeImageViewer(){
  const viewer=$("image-viewer-modal");
  if(!viewer||viewer.hidden)return;
  viewer.hidden=true;
  const image=$("image-viewer-image");
  image.removeAttribute("src");
  image.alt="";
}
async function openSharedMedia(){
  const chat=S.chats.find(item=>item.id===S.active);
  if(!chat)return;
  const list=$("shared-media-list");
  list.replaceChildren(el("p","muted tiny","Loading shared media…"));
  $("shared-media-modal").hidden=false;
  const result=await db.from("messages").select("id,sender_id,attachment_path,created_at").eq("conversation_id",chat.id).not("attachment_path","is",null).order("created_at",{ascending:false}).limit(150);
  if(result.error){list.replaceChildren(el("p","status error","Shared media could not be loaded: "+result.error.message));return;}
  const rows=(result.data||[]).filter(row=>!S.deletedMessageIds.has(row.id)&&row.attachment_path);
  if(!rows.length){list.replaceChildren(el("p","muted tiny","No shared images in this conversation yet."));return;}
  const signed=await db.storage.from("gather-message-images").createSignedUrls(rows.map(row=>row.attachment_path),3600);
  if(signed.error){list.replaceChildren(el("p","status error","Images could not be opened: "+signed.error.message));return;}
  const byPath=new Map((signed.data||[]).filter(row=>row.signedUrl).map(row=>[row.path,row.signedUrl]));
  list.replaceChildren();
  rows.forEach(row=>{
    const src=byPath.get(row.attachment_path);if(!src)return;
    const button=el("button","shared-media-item");button.type="button";
    const image=el("img");image.src=src;image.alt="Shared image";image.loading="lazy";
    button.append(image);button.addEventListener("click",()=>openImageViewer(src,"Image shared in "+chatTitle(chat)));
    list.append(button);
  });
  if(!list.children.length)list.append(el("p","muted tiny","No shared images are available right now."));
}
async function loadSecurityActivity(){
  const list=$("security-activity-list");
  list.replaceChildren(el("p","muted tiny","Loading account activity…"));
  $("security-activity-modal").hidden=false;
  const result=await db.from("user_security_activity").select("id,action,details,created_at").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(50);
  if(result.error){list.replaceChildren(el("p","status error","Account activity could not be loaded: "+result.error.message));return;}
  list.replaceChildren();
  const labels={login_success:"Signed in to Gather",profile_updated:"Profile information updated",member_blocked:"A member was blocked",member_unblocked:"A member was unblocked",other_sessions_signed_out:"Other devices were signed out"};
  (result.data||[]).forEach(row=>{
    const card=el("article","feature-list-item");
    card.append(el("strong","",labels[row.action]||"Account activity"),el("small","muted tiny",dateLabel(row.created_at)));
    list.append(card);
  });
  if(!result.data?.length)list.append(el("p","muted tiny","No account activity has been recorded yet."));
}
async function loadScheduledMessages(){
  const list=$("scheduled-messages-list"),conversationId=S.active;
  if(!conversationId){list.replaceChildren(el("p","muted tiny","Open a conversation to manage its scheduled messages."));return;}
  list.replaceChildren(el("p","muted tiny","Loading scheduled messages…"));
  const result=await db.from("scheduled_messages").select("id,body,scheduled_for,sent_at,cancelled_at,failed_at,last_error").eq("conversation_id",conversationId).eq("sender_id",S.user.id).order("scheduled_for",{ascending:true}).limit(50);
  if(result.error){list.replaceChildren(el("p","status error","Scheduled messages could not be loaded: "+result.error.message));return;}
  list.replaceChildren();
  (result.data||[]).forEach(row=>{
    const card=el("article","feature-list-item");
    const state=row.sent_at?"Sent":row.cancelled_at?"Cancelled":row.failed_at?"Not sent":"Scheduled";
    card.append(el("strong","",state+" · "+new Date(row.scheduled_for).toLocaleString()),el("p","",row.body));
    if(row.last_error)card.append(el("small","muted tiny",row.last_error));
    if(!row.sent_at&&!row.cancelled_at&&!row.failed_at){
      const actions=el("div","feature-list-actions"),edit=el("button","outline","Edit"),cancel=el("button","outline","Cancel");
      edit.type="button";edit.addEventListener("click",()=>editScheduledMessage(row));
      cancel.type="button";cancel.addEventListener("click",async()=>{
        const update=await db.from("scheduled_messages").update({cancelled_at:new Date().toISOString()}).eq("id",row.id).eq("sender_id",S.user.id).is("sent_at",null).is("cancelled_at",null).is("failed_at",null);
        if(update.error){toast("Scheduled message could not be cancelled: "+update.error.message);return;}
        await loadScheduledMessages();
      });
      actions.append(edit,cancel);card.append(actions);
    }
    list.append(card);
  });
  if(!result.data?.length)list.append(el("p","muted tiny","No scheduled messages for this conversation."));
}
function dateTimeLocalValue(date){
  const pad=n=>String(n).padStart(2,"0");
  return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+"T"+pad(date.getHours())+":"+pad(date.getMinutes());
}
function openScheduleMessage(){
  if(!S.active)return;
  const chat=S.chats.find(item=>item.id===S.active);
  const allowed=chat?.kind==="direct"?!!S.directStatus?.can_message:!!S.groupMessageStatus?.can_message;
  if(!S.messageRestrictionLoaded||activeMessageRestriction()||!allowed){toast("You can schedule a message only when messaging is currently permitted.");return;}
  $("scheduled-message-time").value=dateTimeLocalValue(new Date(Date.now()+15*60*1000));
  status("scheduled-message-status","");
  $("scheduled-message-modal").hidden=false;
  closeComposerMoreMenu();
}
async function editScheduledMessage(row){
  if(!row||row.sender_id&&row.sender_id!==S.user.id)return;
  const body=prompt("Edit scheduled message text:",row.body);
  if(body===null)return;
  const nextBody=body.trim();
  if(!nextBody||nextBody.length>4000){toast("Messages must contain 1–4,000 characters.");return;}
  const currentTime=new Date(row.scheduled_for);
  const nextTime=prompt("Enter the new local send time (YYYY-MM-DDTHH:MM):",dateTimeLocalValue(currentTime));
  if(nextTime===null)return;
  const scheduledFor=new Date(nextTime),now=Date.now();
  if(!Number.isFinite(scheduledFor.getTime())||scheduledFor.getTime()<now+60000||scheduledFor.getTime()>now+30*86400000){
    toast("Choose a time at least one minute from now and within the next 30 days.");return;
  }
  const result=await db.from("scheduled_messages").update({body:nextBody,scheduled_for:scheduledFor.toISOString()})
    .eq("id",row.id).eq("sender_id",S.user.id).is("sent_at",null).is("cancelled_at",null).is("failed_at",null);
  if(result.error){toast("Scheduled message could not be edited: "+result.error.message);return;}
  await loadScheduledMessages();toast("Scheduled message updated.");
}
async function submitScheduledMessage(event){
  event.preventDefault();
  const body=$("message").value.trim();
  if(!body){status("scheduled-message-status","Write a message in the composer before scheduling it.","error");return;}
  const scheduledFor=new Date($("scheduled-message-time").value);
  const now=Date.now();
  if(!Number.isFinite(scheduledFor.getTime())||scheduledFor.getTime()<now+60000||scheduledFor.getTime()>now+30*86400000){
    status("scheduled-message-status","Choose a time at least one minute from now and within the next 30 days.","error");return;
  }
  const chat=S.chats.find(item=>item.id===S.active);
  const allowed=chat?.kind==="direct"?!!S.directStatus?.can_message:!!S.groupMessageStatus?.can_message;
  if(!S.messageRestrictionLoaded||activeMessageRestriction()||!allowed){status("scheduled-message-status","Messaging is no longer permitted in this conversation.","error");return;}
  const button=$("scheduled-message-submit");button.disabled=true;
  const result=await db.from("scheduled_messages").insert({
    conversation_id:S.active,sender_id:S.user.id,body,scheduled_for:scheduledFor.toISOString()
  }).select("id").single();
  button.disabled=false;
  if(result.error){status("scheduled-message-status","The message could not be scheduled: "+result.error.message,"error");return;}
  $("scheduled-message-modal").hidden=true;
  $("message").value="";$("message").style.height="auto";saveLocalChatDraftOverride(S.active,"");delete S.chatSettings.drafts[S.active];saveChatSettings();
  toast("Message scheduled. Gather will recheck permissions when it is due.");
}
async function loadGroupEvents(){
  const chat=S.chats.find(item=>item.id===S.active);
  const list=$("group-events-list");
  if(!chat||chat.kind!=="group"){list.replaceChildren(el("p","muted tiny","Group events are only available inside group conversations."));return;}
  const result=await db.from("group_events").select("id,conversation_id,created_by,title,details,starts_at,ends_at,created_at").eq("conversation_id",chat.id).order("starts_at",{ascending:true}).limit(100);
  if(result.error){list.replaceChildren(el("p","status error","Events could not be loaded: "+result.error.message));return;}
  const events=result.data||[];
  const ids=events.map(row=>row.id);
  let rsvps=[];
  if(ids.length){
    const response=await db.from("group_event_rsvps").select("event_id,user_id,response").eq("conversation_id",chat.id).in("event_id",ids);
    if(response.error)console.warn("Event RSVPs could not be loaded:",response.error.message);
    else rsvps=response.data||[];
  }
  list.replaceChildren();
  events.forEach(event=>{
    const card=el("article","feature-list-item");
    card.append(el("strong","",event.title),el("small","muted tiny",new Date(event.starts_at).toLocaleString()+(event.ends_at?" – "+new Date(event.ends_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"")));
    if(event.details)card.append(el("p","",event.details));
    const mine=rsvps.find(row=>row.event_id===event.id&&row.user_id===S.user.id);
    const actions=el("div","feature-list-actions");
    [["going","Going"],["maybe","Maybe"],["not_going","Can't go"]].forEach(([value,label])=>{
      const button=el("button","outline"+(mine?.response===value?" active":""),label);
      button.type="button";button.addEventListener("click",()=>respondToGroupEvent(event,value));
      actions.append(button);
    });
    const counts=["going","maybe","not_going"].map(value=>value+": "+rsvps.filter(row=>row.event_id===event.id&&row.response===value).length).join(" · ");
    card.append(actions,el("small","muted tiny",counts));
    const me=chat.members.find(member=>member.user_id===S.user.id);
    if(me?.role==="owner"||me?.role==="moderator"){
      const remove=el("button","outline","Delete event");remove.type="button";
      remove.addEventListener("click",async()=>{
        if(!confirm("Delete this group event?"))return;
        const deleted=await db.from("group_events").delete().eq("id",event.id).eq("conversation_id",chat.id);
        if(deleted.error){toast("Event could not be deleted: "+deleted.error.message);return;}
        await loadGroupEvents();
      });
      actions.append(remove);
    }
    list.append(card);
  });
  if(!events.length)list.append(el("p","muted tiny","No group events yet."));
}
async function respondToGroupEvent(event,response){
  const result=await db.from("group_event_rsvps").upsert({
    event_id:event.id,conversation_id:event.conversation_id,user_id:S.user.id,response,updated_at:new Date().toISOString()
  },{onConflict:"event_id,user_id"});
  if(result.error){toast("Your RSVP could not be saved: "+result.error.message);return;}
  await loadGroupEvents();
}
async function submitGroupEvent(event){
  event.preventDefault();
  const chat=S.chats.find(item=>item.id===S.active);
  if(!chat||chat.kind!=="group")return;
  const title=$("group-event-name").value.trim(),details=$("group-event-details").value.trim();
  const startsAt=new Date($("group-event-start").value),endsRaw=$("group-event-end").value,endsAt=endsRaw?new Date(endsRaw):null;
  if(!title||title.length>100||!Number.isFinite(startsAt.getTime())){status("group-event-status","Enter an event name and a valid start time.","error");return;}
  if(endsAt&&(!Number.isFinite(endsAt.getTime())||endsAt<=startsAt)){status("group-event-status","The end time must be after the start time.","error");return;}
  const button=$("group-event-form").querySelector('button[type="submit"]');button.disabled=true;
  const result=await db.from("group_events").insert({
    conversation_id:chat.id,created_by:S.user.id,title,details:details||null,starts_at:startsAt.toISOString(),ends_at:endsAt?endsAt.toISOString():null
  });
  button.disabled=false;
  if(result.error){status("group-event-status","Event could not be created: "+result.error.message,"error");return;}
  $("group-event-form").reset();status("group-event-status","");
  await loadGroupEvents();toast("Group event created.");
}
async function openGroupEvents(){
  const chat=S.chats.find(item=>item.id===S.active);
  if(!chat||chat.kind!=="group")return;
  const role=chat.members.find(member=>member.user_id===S.user.id)?.role;
  $("group-event-form").hidden=!(role==="owner"||role==="moderator");
  $("group-events-modal").hidden=false;
  await loadGroupEvents();
}
function sessionDeviceLabel(userAgent){
  const ua=String(userAgent||"");
  const platform=/iPhone/i.test(ua)?"iPhone":/iPad/i.test(ua)?"iPad":/Android/i.test(ua)?"Android":/Windows/i.test(ua)?"Windows":/(Macintosh|Mac OS)/i.test(ua)?"Mac":/Linux/i.test(ua)?"Linux":"Unknown device";
  const browser=/Edg\//i.test(ua)?"Edge":/Firefox\//i.test(ua)?"Firefox":/CriOS\//i.test(ua)?"Chrome on iOS":/Chrome\//i.test(ua)?"Chrome":/Safari\//i.test(ua)?"Safari":"Browser";
  return browser+" · "+platform;
}
async function loadActiveSessions(){
  const list=$("active-sessions-list");
  list.replaceChildren(el("p","muted tiny","Loading sessions…"));
  $("active-sessions-modal").hidden=false;
  const result=await db.rpc("list_my_sessions");
  if(result.error){list.replaceChildren(el("p","status error","Active sessions could not be loaded: "+result.error.message));return;}
  list.replaceChildren();
  (result.data||[]).forEach(session=>{
    const row=el("article","session-row");
    const details=el("div");
    details.append(el("strong","",sessionDeviceLabel(session.user_agent)));
    details.append(el("small","", "Last active · "+(session.last_active_at?new Date(session.last_active_at).toLocaleString():"Unknown")));
    details.append(el("small","", "Signed in · "+(session.created_at?new Date(session.created_at).toLocaleString():"Unknown")));
    row.append(details);
    if(session.is_current)row.append(el("span","session-current","This device"));
    else row.append(el("span","session-current","Other device"));
    list.append(row);
  });
  if(!result.data?.length)list.append(el("p","muted tiny","No active sessions were returned."));
}
function wire(){
  installModalBackButtons();
  // Capture the shared-media back action before other modal or delegated handlers.
  // This keeps the navigation working even if other composer/modal handlers stop bubbling.
  document.addEventListener("click",event=>{
    const backButton=event.target instanceof Element?event.target.closest("#shared-media-back"):null;
    if(!backButton)return;
    event.preventDefault();
    event.stopPropagation();
    $("shared-media-modal").hidden=true;
    S.modalBackTargets={};
    renderChatOptions();
    $("chat-actions-modal").hidden=false;
  },true);
  $("image-viewer-back").addEventListener("click",closeImageViewer);
  $("image-viewer-modal").addEventListener("click",event=>{if(event.target===$("image-viewer-modal"))closeImageViewer();});
  $("shared-media-modal").addEventListener("click",event=>{
    if(event.target!==$("shared-media-modal"))return;
    $("shared-media-modal").hidden=true;
    S.modalBackTargets={};
    renderChatOptions();
    $("chat-actions-modal").hidden=false;
  });
  document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>authMode(b.dataset.mode)));
  $("forgot-password").addEventListener("click",requestPasswordReset);
  $("recovery-password-form").addEventListener("submit",completePasswordRecovery);
  $("age-verification-form").addEventListener("submit",submitAgeVerification);
  $("age-verification-open-profile").addEventListener("click",openProfileFromAgeGate);
  $("profile-age-form").addEventListener("submit",submitProfileAgeForm);
  $("age-verification-signout").addEventListener("click",async()=>{
    const result=await db.auth.signOut();
    if(result.error)status("age-verification-status",result.error.message,"error");
    else showAuth();
  });
  $("recovery-cancel").addEventListener("click",async()=>{const result=await db.auth.signOut();if(result.error)status("recovery-password-status",result.error.message,"error");else $("password-recovery-modal").hidden=true;});
  $("auth-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const email=$("email").value.trim(),password=$("password").value,isNew=S.mode==="signup";
    const button=$("auth-submit");
    button.disabled=true;
    status("auth-status",isNew?"Creating account…":"Signing in…");
    try{
      if(!db){status("auth-status","Gather could not load its secure login service. Please reload the page and check your connection or content blocker.","error");return;}
      const weak=isNew?strongPasswordError(password):"";
      if(weak){
        status("auth-status",weak+" Use a unique password you don't use on other sites.","error");
        return;
      }
      const result=isNew
        ?await db.auth.signUp({email,password,options:{data:{display_name:$("name").value.trim()},emailRedirectTo:location.origin+location.pathname}})
        :await db.auth.signInWithPassword({email,password});
      if(result.error){
        const invalidCredentials = result.error.code === "invalid_credentials" ||
          /invalid login credentials/i.test(result.error.message || "");
        status("auth-status",invalidCredentials
          ? "We couldn't find an account with that email and password. If this is your first time using Gather, choose Create account above and register first. If you already registered, double-check your email and password or use Forgot password?"
          : result.error.message,"error");
      }else if(isNew&&!result.data.session){
        status("auth-status","Account created and automatically submitted for administrator review. Check your email for the confirmation link, then sign in here. You'll confirm your age before you can access Gather.","success");
      }else if(result.data.session?.user){
        status("auth-status","Signed in. Loading chats…","success");
        const loginAudit=await db.rpc("record_login_activity");
        if(loginAudit.error)console.warn("Login activity could not be recorded:",loginAudit.error.message);
        await signedIn(result.data.session.user);
      }else{
        status("auth-status","Gather did not return a sign-in session. Please try again.","error");
      }
    }catch(error){
      console.error("Gather authentication request failed:",error);
      status("auth-status",error?.message||"Gather couldn't complete the sign-in request. Check your connection and try again.","error");
    }finally{
      button.disabled=false;
    }
  });
  $("new-private-chat").addEventListener("click",()=>openPeople("direct"));$("new-group-chat").addEventListener("click",()=>openPeople("group"));
  $("retry-load-chats").addEventListener("click",()=>{if(S.user&&!S.loading)signedIn(S.user,true);});
  $("empty-private").addEventListener("click",()=>openPeople("direct"));$("empty-group").addEventListener("click",()=>openPeople("group"));
  $("chat-actions-open").addEventListener("click",()=>{renderChatOptions();$("chat-actions-modal").hidden=false;});
  $("search-messages-open").addEventListener("click",()=>{ $("chat-actions-modal").hidden=true; openMessageSearch("conversation"); });
  $("archive-conversation").addEventListener("click",toggleArchiveConversation);
  $("group-events-open").addEventListener("click",()=>{$("chat-actions-modal").hidden=true;void openGroupEvents();});
  $("scheduled-messages-chat-open").addEventListener("click",()=>{$("chat-actions-modal").hidden=true;$("scheduled-messages-modal").hidden=false;void loadScheduledMessages();});
  $("shared-media-open").addEventListener("click",()=>{$("chat-actions-modal").hidden=true;void openSharedMedia();});

  $("mark-chat-unread").addEventListener("click",markActiveConversationUnread);
  $("toggle-chat-pin").addEventListener("click",()=>togglePinnedConversation());
  $("toggle-chat-mute").addEventListener("click",()=>toggleMutedConversation());
  $("chat-appearance-accent").addEventListener("change",updateChatAppearance);
  $("chat-appearance-background").addEventListener("change",updateChatAppearance);
  ["add-people","edit-group-photo","group-settings-open","group-events-open","shared-media-open","scheduled-messages-chat-open","saved-messages-open","leave-chat","block-user","select-messages","delete-selected","archive-conversation"].forEach(id=>$(id).addEventListener("click",()=>{$("chat-actions-modal").hidden=true;}));
  $("add-people").addEventListener("click",()=>openPeople("add"));$("edit-group-photo").addEventListener("click",openGroupPhoto);$("group-settings-open").addEventListener("click",openGroupSettings);$("group-settings-save").addEventListener("click",saveGroupSettings);$("group-avatar-file").addEventListener("change",handleGroupAvatarFile);$("group-avatar-remove").addEventListener("click",removeGroupAvatar);$("group-avatar-save").addEventListener("click",saveGroupAvatar);$("leave-chat").addEventListener("click",()=>{if(S.active)leaveGroupChat(S.active);});$("requests-open").addEventListener("click",openRequests);$("friends-open").addEventListener("click",openFriends);$("friends-find").addEventListener("click",()=>{setModalBackTarget("people-modal","friends-modal");$("friends-modal").hidden=true;openPeople("friend");});$("block-user").addEventListener("click",toggleBlock);
  $("people-search").addEventListener("input",()=>{clearTimeout(S.timer);S.timer=setTimeout(searchPeople,220);});$("people-create").addEventListener("click",createGroupOrAdd);
  $("home-open").addEventListener("click",goHome);
  $("chat-title").addEventListener("click",()=>{const chat=S.chats.find(item=>item.id===S.active);if(chat?.kind==="direct")openPublicProfile(peerForChat(chat));});
  $("settings-open").addEventListener("click",openSettings);
  $("notifications-open").addEventListener("click",openNotifications);
  $("admin-mode-open").addEventListener("click",openAdminMode);
  document.querySelectorAll("[data-admin-section]").forEach(button=>button.addEventListener("click",()=>setAdminModeSection(button.dataset.adminSection)));
  $("admin-quick-accounts").addEventListener("click",()=>setAdminModeSection("accounts"));
  $("admin-quick-reports").addEventListener("click",()=>setAdminModeSection("reports"));
  $("admin-quick-feedback").addEventListener("click",()=>setAdminModeSection("feedback"));
  $("admin-quick-announcements").addEventListener("click",()=>setAdminModeSection("announcements"));
  $("admin-reports-open").addEventListener("click",openReportsAdmin);
  $("admin-feedback-open").addEventListener("click",()=>openFeedback(true));
  $("admin-announcement-create").addEventListener("click",openAnnouncementComposer);
  $("admin-approvals-refresh").addEventListener("click",loadAdminApprovals);
  $("account-approval-submit").addEventListener("click",submitAccountApprovalRequest);
  $("admin-announcements-open").addEventListener("click",openAnnouncementsPage);
  $("admin-accounts-refresh").addEventListener("click",()=>loadAdminAccounts(true));
  $("admin-account-search").addEventListener("input",renderAdminAccounts);
  document.querySelectorAll(".message-restriction-retry").forEach(button=>button.addEventListener("click",()=>loadMessageRestriction()));
  $("admin-accounts-more").addEventListener("click",()=>loadAdminAccounts(false));
  $("admin-activity-refresh").addEventListener("click",loadAdminActivity);
  $("admin-overview-activity-refresh").addEventListener("click",loadAdminOverview);
  $("admin-intergroup-refresh").addEventListener("click",loadAdminIntergroupRequests);
  $("admin-age-change-refresh").addEventListener("click",loadAdminAgeChangeRequests);

  $("announcement-send-open").addEventListener("click",()=>{$("settings-modal").hidden=true;openAnnouncementComposer();});
  $("announcement-compose-form").addEventListener("submit",publishAnnouncement);
  $("announcement-edit-open").addEventListener("click",()=>openAnnouncementEditor(S.activeAnnouncementId));
  $("home-announcement-open").addEventListener("click",()=>{const latest=S.announcements[0];if(latest)openAnnouncement(latest.id);});
  $("home-announcements-all").addEventListener("click",openAnnouncementsPage);
  $("notifications-mark-all").addEventListener("click",markAllNotificationsRead);
  $("notifications-admin-open").addEventListener("click",()=>{setModalBackTarget("announcements-page-modal","notifications-modal");$("notifications-modal").hidden=true;openAnnouncementsPage();});
  $("notifications-recent-open").addEventListener("click",()=>setNotificationView("messages"));
  document.querySelectorAll("[data-notification-view]").forEach(button=>button.addEventListener("click",()=>setNotificationView(button.dataset.notificationView)));
  $("report-form").addEventListener("submit",submitReport);
  $("member-profile-report").addEventListener("click",()=>{const userId=S.publicProfileId;setModalBackTarget("report-modal","member-profile-modal");$("member-profile-modal").hidden=true;openReport(userId);});
  $("reports-admin-open").addEventListener("click",()=>{setModalBackTarget("reports-admin-modal","settings-modal");$("settings-modal").hidden=true;openReportsAdmin();});
  $("signout-other-sessions").addEventListener("click",signOutOtherSessions);
  $("sessions-list-open").addEventListener("click",loadActiveSessions);
  $("sessions-signout-others").addEventListener("click",signOutOtherSessions);
  $("security-activity-open").addEventListener("click",loadSecurityActivity);
  $("scheduled-message-form").addEventListener("submit",submitScheduledMessage);
  $("scheduled-message-cancel").addEventListener("click",()=>$("scheduled-message-modal").hidden=true);
  $("group-event-form").addEventListener("submit",submitGroupEvent);
  $("schedule-message-open").addEventListener("click",openScheduleMessage);
  $("scheduled-messages-open").addEventListener("click",()=>{$("scheduled-messages-modal").hidden=false;void loadScheduledMessages();closeComposerMoreMenu();});
  $("request-account-deletion").addEventListener("click",requestAccountDeletion);
  $("feedback-open").addEventListener("click",()=>openFeedback(false));
  $("feedback-admin-open").addEventListener("click",()=>{setModalBackTarget("feedback-modal","settings-modal");$("settings-modal").hidden=true;openFeedback(true);});
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
  $("filter").addEventListener("input",handleHomeSearchInput);
  document.querySelectorAll("[data-home-search-tab]").forEach(button=>button.addEventListener("click",()=>setHomeSearchTab(button.dataset.homeSearchTab)));
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
  $("send-form").addEventListener("submit",sendMessage);
  $("message-undo").addEventListener("click",undoLastSend);
  $("message-undo-bar").addEventListener("click",dismissUndoNotice,true);
  $("message-image-file").addEventListener("change",handleMessageImageFile);$("composer-more-trigger").addEventListener("click",event=>{event.stopPropagation();toggleComposerMoreMenu();});$("composer-more-menu").addEventListener("click",event=>event.stopPropagation());$("message-create-poll").addEventListener("click",openPollComposer);$("poll-form").addEventListener("submit",submitPoll);$("poll-add-option").addEventListener("click",addPollOptionInput);$("poll-cancel").addEventListener("click",()=>$("poll-create-modal").hidden=true);$("saved-messages-open").addEventListener("click",openSavedMessages);document.addEventListener("click",event=>{const wrap=$("composer-more-wrap");if(wrap&&!wrap.contains(event.target))closeComposerMoreMenu();if(S.openReactionPickerMessageId&&!event.target.closest(".message-reaction-area")){S.openReactionPickerMessageId=null;if(S.active)renderMessages(true);}});
  $("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";updateLocalTyping();saveActiveChatDraft();});
  $("message").addEventListener("blur",()=>stopTyping(true));
  $("share-online-status").addEventListener("change",event=>{
    S.preferences.shareOnlineStatus=!!event.target.checked;
    saveUIPreferences();
  });
  $("group-unread-messages").addEventListener("change",event=>setGroupUnreadMessages(event.target.checked));
  $("quiet-hours-enabled").addEventListener("change",event=>{
    S.preferences.quietHoursEnabled=!!event.target.checked;
    saveUIPreferences();
  });
  $("notification-sound-mode").addEventListener("change",event=>{S.preferences.notificationSound=event.target.value;saveUIPreferences();});
  $("direct-message-requests-mode").addEventListener("change",event=>{S.preferences.directMessageRequests=event.target.value==="friends_only"?"friends_only":"everyone";saveUIPreferences();});
  ["quiet-hours-start","quiet-hours-end"].forEach(id=>$(id).addEventListener("change",event=>{
    S.preferences[id==="quiet-hours-start"?"quietHoursStart":"quietHoursEnd"]=event.target.value||DEFAULT_PREFERENCES[id==="quiet-hours-start"?"quietHoursStart":"quietHoursEnd"];
    saveUIPreferences();
  }));
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){stopTyping(true);return;}
    if(S.user){
      void loadApprovedUserIds().then(ok=>{if(ok)refreshApprovedBadgeUI();});
      void loadMessageRestriction();
      const previousAgeGroup=S.ageStatus?.age_group;
      void loadMyAgeStatus().then(ageStatus=>{
        if(!ageStatus?.eligible&&!ageStatus?.is_admin)showAgeVerificationGate(ageStatus);
        else{
          S.ageStatus=ageStatus;
          if(previousAgeGroup&&ageStatus?.age_group&&previousAgeGroup!==ageStatus.age_group){
            toast("Your updated age group is "+ageStatus.age_group+".");
          }
          if(S.active)void refreshDirectStatus(S.active);
          if(!$("profile-modal").hidden)void loadMyAgeChangeStatus().then(renderProfileAgeSection);
        }
      }).catch(error=>console.warn("Age status refresh failed:",error));
    }
  });
  $("messages").addEventListener("scroll",()=>{repositionFloatingMessageActionMenu();if($("messages").scrollTop<80&&S.initialChatScrollLockId!==S.active)loadOlderMessages();checkUnreadDividerVisibility();},{passive:true});
  window.addEventListener("online",()=>{
    if(S.user){
      syncFriendPresenceChannels();
      if(!S.ownPresenceChannel)void syncOwnPresence();
    }
  });
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&S.user){
      syncFriendPresenceChannels();
      if(!S.ownPresenceChannel)void syncOwnPresence();
      void recordLastSeen();
    }
  });
  $("messages").addEventListener("wheel",()=>{if(S.initialChatScrollLockId===S.active)releaseInitialChatScrollLock();},{passive:true});
  $("messages").addEventListener("touchmove",()=>{if(S.initialChatScrollLockId===S.active)releaseInitialChatScrollLock();},{passive:true});
  $("messages").addEventListener("keydown",event=>{
    if(S.initialChatScrollLockId===S.active&&["ArrowUp","PageUp","Home"].includes(event.key))releaseInitialChatScrollLock();
  });
  window.addEventListener("resize",repositionFloatingMessageActionMenu);
  window.visualViewport?.addEventListener("resize",repositionFloatingMessageActionMenu);
  window.visualViewport?.addEventListener("scroll",repositionFloatingMessageActionMenu);
  $("cancel-reply").addEventListener("click",cancelReply);
  
  ["message-search-input","message-search-sender","message-search-from","message-search-to"].forEach(id=>$(id).addEventListener(id==="message-search-input"?"input":"change",()=>{clearTimeout(S.searchTimer);S.searchTimer=setTimeout(()=>searchConversationMessages(true),250);}));
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
  document.querySelectorAll("[data-admin-back]").forEach(b=>b.addEventListener("click",()=>handleModalBack(b.closest(".overlay")?.id)));
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModals()));
  ["admin-mode-modal","announcement-compose-modal","announcement-view-modal","announcements-page-modal","notifications-modal","member-profile-modal","report-modal","reports-admin-modal","people-modal","profile-modal","requests-modal","friends-modal","settings-modal","group-photo-modal","group-settings-modal","message-search-modal","poll-create-modal","forward-message-modal","saved-messages-modal","chat-actions-modal","feedback-modal","install-app-modal"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))closeModals();}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeComposerMoreMenu();if(!$("install-app-modal").hidden){$("install-app-modal").hidden=true;return;}if(!$("image-viewer-modal").hidden){closeImageViewer();return;}closeModals();}});
}

let deferredGatherInstall=null;
function isGatherInstalled(){
  return !!(window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true);
}
function refreshGatherInstallButtons(){
  const installed=isGatherInstalled();
  ["install-app-button","install-app-auth"].forEach(id=>{
    const button=$(id);
    if(button)button.hidden=installed;
  });
}
function openGatherInstallHelp(){
  const modal=$("install-app-modal"),list=$("install-app-instructions"),heading=$("install-app-help-title");
  if(!modal||!list||!heading)return;
  const ua=navigator.userAgent||"";
  const isApple=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const isAndroid=/Android/i.test(ua);
  let steps;
  if(isApple){
    heading.textContent="Add Gather to your iPhone or iPad";
    steps=[
      "Open this page in Safari. If you opened it inside another app, open it in Safari first.",
      "Tap the Share button (or the Page Menu button, then Share).",
      "Scroll down and choose Add to Home Screen.",
      "Turn on Open as Web App if that option appears, then tap Add."
    ];
  }else if(isAndroid){
    heading.textContent="Install Gather on Android";
    steps=[
      "Open Gather in Chrome.",
      "Open the browser menu and choose Install app or Add to Home screen.",
      "Confirm the installation."
    ];
  }else{
    heading.textContent="Install Gather on this computer";
    steps=[
      "Open Gather in Chrome or Edge.",
      "Look for the Install icon in the address bar, or open the browser menu and choose the install option.",
      "Confirm the installation. Gather will appear in your app launcher."
    ];
  }
  list.replaceChildren(...steps.map((step,index)=>{
    const item=el("div","install-step");
    item.append(el("span","install-step-number",String(index+1)),el("p","",step));
    return item;
  }));
  modal.hidden=false;
}
async function requestGatherInstall(){
  if(isGatherInstalled()){toast("Gather is already installed on this device.");return;}
  if(deferredGatherInstall){
    const promptEvent=deferredGatherInstall;
    deferredGatherInstall=null;
    try{
      await promptEvent.prompt();
      const choice=await promptEvent.userChoice;
      if(choice?.outcome==="accepted")toast("Gather is being installed.");
    }catch(error){
      console.warn("Gather install prompt could not be opened:",error);
      openGatherInstallHelp();
    }
    refreshGatherInstallButtons();
    return;
  }
  openGatherInstallHelp();
}
function setupGatherPWA(){
  refreshGatherInstallButtons();
  $("install-app-button").addEventListener("click",requestGatherInstall);
  $("install-app-auth").addEventListener("click",requestGatherInstall);
  $("install-app-close").addEventListener("click",()=>$("install-app-modal").hidden=true);
  $("install-app-modal").addEventListener("click",event=>{
    if(event.target===$("install-app-modal"))$("install-app-modal").hidden=true;
  });
  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    deferredGatherInstall=event;
  });
  window.addEventListener("appinstalled",()=>{
    deferredGatherInstall=null;
    refreshGatherInstallButtons();
    toast("Gather was installed successfully.");
  });
  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change",refreshGatherInstallButtons);
  const updateOfflineStatus=()=>{
    const banner=$("offline-status");
    if(banner)banner.hidden=!!navigator.onLine;
  };
  window.addEventListener("online",updateOfflineStatus);
  window.addEventListener("offline",updateOfflineStatus);
  updateOfflineStatus();
  if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")){
    navigator.serviceWorker.register("./service-worker.js",{scope:"./"})
      .then(registration=>registration.update().catch(()=>{}))
      .catch(error=>console.warn("Gather offline shell could not be prepared:",error));
  }
}

async function boot(){
  try{
    setupGatherPWA();
    wire();
    loadUIPreferences(DEFAULT_PREFERENCES);
    if(!window.supabase?.createClient||!db){
      status("auth-status","Gather could not load its secure login service. Please reload the page and check your connection or content blocker.","error");
      return;
    }
    db.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{
      if(event==="PASSWORD_RECOVERY"&&session?.user){signedIn(session.user);openPasswordRecovery();}
      else if(session?.user)signedIn(session.user);
      else if(event==="SIGNED_OUT")showAuth();
    },0);});
    const session=await db.auth.getSession();
    if(session.error){status("auth-status",session.error.message,"error");return;}
    if(session.data.session?.user)await signedIn(session.data.session.user);else showAuth();
  }catch(error){
    console.error("Gather startup failed:",error);
    status("auth-status","Gather could not start: "+(error?.message||"an unexpected startup error occurred."),"error");
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
