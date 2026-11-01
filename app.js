(() => {
"use strict";
const URL = "https://xrwldphmeafiakittcof.supabase.co";
const KEY = "sb_publishable_5Gws8f_CODwrHigG2U6Veg_bTRrBoeA";
const $ = (id) => document.getElementById(id);
const db = window.supabase.createClient(URL, KEY);
const S = { user:null, profile:null, profiles:{}, chats:[], requests:[], friendRequests:[], friends:[], blockedUsers:[], deletedMessages:[], deletedMessageIds:new Set(), folder:"friends", requestChannel:null, directStatus:null, active:null, messages:[], channel:null, mode:"signin", picker:"direct", selected:new Set(), loading:null, loadError:null, timer:null };

function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
function status(id, text, kind) { const n=$(id); n.textContent=text||""; n.className="status"+(kind?" "+kind:""); }
function toast(text) { $("toast").textContent=text; $("toast").classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>$("toast").classList.remove("show"),3000); }
function setChatLoadStatus(message,retry=false){
  const box=$("chat-load-status");if(!box)return;
  box.hidden=!message;box.classList.toggle("error",retry);
  $("chat-load-message").textContent=message||"";$("retry-load-chats").hidden=!retry;
}
function initials(s) { return (String(s||"?").trim()[0]||"?").toUpperCase(); }
function avatar(name) { return el("span","avatar",initials(name)); }
function dateLabel(s) { if(!s)return ""; const d=new Date(s), now=new Date(); return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):d.toLocaleDateString([],{month:"short",day:"numeric"}); }
function showAuth() {
  if(S.channel){db.removeChannel(S.channel);S.channel=null;}
  if(S.requestChannel){db.removeChannel(S.requestChannel);S.requestChannel=null;}
  S.user=null;S.profile=null;S.profiles={};S.chats=[];S.requests=[];S.friendRequests=[];S.friends=[];S.blockedUsers=[];S.deletedMessages=[];S.deletedMessageIds=new Set();S.folder="friends";S.directStatus=null;S.active=null;S.messages=[];S.loadError=null;
  setChatLoadStatus("");$("auth").hidden=false;$("app").hidden=true;
}
function showApp(){ $("auth").hidden=true;$("app").hidden=false; }
function authMode(mode){
  S.mode=mode; const signUp=mode==="signup";
  document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("name-wrap").hidden=!signUp;$("name").required=signUp;
  $("auth-title").textContent=signUp?"Make yourself at home.":"Welcome back.";
  $("auth-subtitle").textContent=signUp?"Create an account to start talking.":"Sign in to see your conversations.";
  $("auth-submit").textContent=signUp?"Create account":"Sign in";$("password").autocomplete=signUp?"new-password":"current-password";
  status("auth-status","");
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
    $("user-initial").textContent=initials(S.profile.display_name);
    $("user-name").textContent=S.profile.display_name;
    subscribeRequests();
    const loaded=await loadChats();
    if(!loaded)throw new Error(S.loadError||"Please check your connection and try again.");
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
  if(c.kind==="group"){const names=c.members.map(m=>S.profiles[m.user_id]?.display_name||"Member");return c.members.length+" members · "+names.slice(0,3).join(", ");}
  const other=c.members.find(m=>m.user_id!==S.user.id),p=other&&S.profiles[other.user_id];return p?"@"+p.username:"Private conversation";
}
async function loadChats(){
  if(!S.user)return false;
  S.loadError=null;
  const hidden=await db.from("user_deleted_messages").select("message_id").eq("user_id",S.user.id);
  if(hidden.error){S.loadError="Deleted-message settings could not be loaded: "+hidden.error.message;toast(S.loadError);return false;}
  S.deletedMessageIds=new Set((hidden.data||[]).map(x=>x.message_id));
  const m=await db.from("conversation_members").select("conversation_id,role,conversations!inner(id,kind,title,updated_at)").eq("user_id",S.user.id);
  if(m.error){S.loadError="Chats could not be loaded: "+m.error.message;toast(S.loadError);return false;}
  const rows=m.data||[],ids=[...new Set(rows.map(x=>x.conversation_id))];
  if(!ids.length){S.chats=[];S.profiles={};renderChats();renderActive();return await loadRequests();}
  const [members,msgs]=await Promise.all([
    db.from("conversation_members").select("conversation_id,user_id,role").in("conversation_id",ids),
    db.from("messages").select("id,conversation_id,body,created_at").in("conversation_id",ids).order("created_at",{ascending:false}).limit(300)
  ]);
  if(members.error){S.loadError="Chat members could not be loaded: "+members.error.message;toast(S.loadError);return false;}
  const userIds=[...new Set(members.data.map(x=>x.user_id))];
  const p=await db.from("profiles").select("id,username,display_name").in("id",userIds);
  if(p.error){S.loadError="Member profiles could not be loaded: "+p.error.message;toast(S.loadError);return false;}
  S.profiles={};p.data.forEach(x=>S.profiles[x.id]=x);
  const byChat={},last={};members.data.forEach(x=>(byChat[x.conversation_id]??=[]).push(x));
  (msgs.data||[]).forEach(x=>{if(!S.deletedMessageIds.has(x.id)&&!last[x.conversation_id])last[x.conversation_id]=x;});
  S.chats=rows.map(x=>({...x.conversations,members:byChat[x.conversation_id]||[],last:last[x.conversation_id]||null}))
    .sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  renderChats();renderActive();return await loadRequests();
}
async function loadRequests(){
  if(!S.user)return false;
  const r=await db.from("conversation_requests").select("id,sender_id,recipient_id,status,created_at").or("sender_id.eq."+S.user.id+",recipient_id.eq."+S.user.id).order("created_at",{ascending:false}).limit(60);
  if(r.error){S.loadError="Chat requests could not be loaded: "+r.error.message;toast(S.loadError);return false;}
  S.requests=r.data||[];
  const ids=[...new Set(S.requests.flatMap(x=>[x.sender_id,x.recipient_id]).filter(id=>id!==S.user.id))];
  if(ids.length){
    const p=await db.from("profiles").select("id,username,display_name").in("id",ids);
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
    const profiles=await db.from("profiles").select("id,username,display_name").in("id",ids);
    if(profiles.error){
      $("friends-error").textContent="Friend profiles could not be loaded. "+profiles.error.message;
      return false;
    }
    profiles.data.forEach(x=>S.profiles[x.id]=x);
  }
  $("friends-error").textContent="";
  renderFriends();renderChats();
  return true;
}
function subscribeRequests(){
  if(S.requestChannel){db.removeChannel(S.requestChannel);S.requestChannel=null;}
  if(!S.user)return;
  const uid=S.user.id;
  S.requestChannel=db.channel("requests-"+uid)
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
    const row=el("div","request-item");row.append(avatar(p.display_name));
    const copy=el("div","request-copy");copy.append(el("strong","",p.display_name),el("small","","@"+p.username));row.append(copy);
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
  const row=el("div","request-item");row.append(avatar(p.display_name));
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
  const row=el("div","request-item");row.append(avatar(p.display_name));
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
  const chats=(sourceChats||S.chats.filter(c=>c.kind===kind)).filter(c=>(chatTitle(c)+" "+chatSub(c)).toLowerCase().includes(term));
  $(countId).textContent=chats.length;
  if(!chats.length){
    const empty=term
      ?(kind==="direct"?"No matching conversations.":"No matching group chats.")
      :(kind==="direct"?"No conversations in this tab yet.":"No group chats yet.");
    list.append(el("p","muted tiny section-empty",empty));return;
  }
  chats.forEach(c=>{
    const b=el("button","chat-item"+(c.id===S.active?" active":""));b.type="button";b.append(avatar(chatTitle(c)));
    const copy=el("div","chat-copy");copy.append(el("strong","",chatTitle(c)),el("span","",c.last?c.last.body:chatSub(c)));b.append(copy,el("small","chat-time",dateLabel(c.last?.created_at||c.updated_at)));
    b.addEventListener("click",()=>openChat(c.id));list.append(b);
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
    const row=el("div","request-item");row.append(avatar(p.display_name));
    const copy=el("div","request-copy");copy.append(el("strong","",p.display_name),el("small","","@"+p.username));row.append(copy);
    const actions=el("div","request-actions"),unblock=el("button","request-accept","Unblock");
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
    row.append(avatar(item.sender_name));
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
    const p=await db.from("profiles").select("id,username,display_name").in("id",ids);
    if(p.error){console.error("Blocked member profiles could not be loaded:",p.error.message);return false;}
    p.data.forEach(x=>S.profiles[x.id]=x);
  }
  renderChats();return true;
}
async function loadDeletedMessages(){
  if(!S.user)return false;
  const markers=await db.from("user_deleted_messages").select("message_id,deleted_at").eq("user_id",S.user.id).order("deleted_at",{ascending:false}).limit(250);
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
  if(!c)return;
  $("chat-title").textContent=chatTitle(c);$("chat-subtitle").textContent=chatSub(c);$("chat-avatar").textContent=initials(chatTitle(c));
  const me=c.members.find(x=>x.user_id===S.user.id);$("add-people").hidden=!(c.kind==="group"&&me?.role==="owner");
  renderDirectControls();renderChats();
}
function renderDirectControls(){
  const c=S.chats.find(x=>x.id===S.active),isDirect=c?.kind==="direct";
  $("block-user").hidden=!isDirect;
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
async function openChat(id){
  S.active=id;S.directStatus=null;$("layout").classList.add("show-chat");renderActive();await refreshDirectStatus();await loadMessages(id);
  if(S.channel){await db.removeChannel(S.channel);S.channel=null;}
  S.channel=db.channel("chat-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+id},payload=>{
    if(S.active!==id||S.deletedMessageIds.has(payload.new.id)||S.messages.some(x=>x.id===payload.new.id))return;
    S.messages.push(payload.new);renderMessages();loadChats();
  }).subscribe();
}
async function loadMessages(id){
  const r=await db.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",id).order("created_at",{ascending:true}).limit(300);
  if(r.error){toast("Messages could not be loaded: "+r.error.message);return;}
  if(S.active!==id)return;S.messages=(r.data||[]).filter(m=>!S.deletedMessageIds.has(m.id));renderMessages();
}
function renderMessages(){
  const list=$("messages");list.replaceChildren();
  if(!S.messages.length){list.append(el("p","muted tiny","This is the beginning of the conversation. Say hello."));return;}
  S.messages.forEach(m=>{
    const mine=m.sender_id===S.user.id,p=S.profiles[m.sender_id],row=el("div","message"+(mine?" mine":"")),bubble=el("div","bubble");
    const meta=el("div","meta");meta.append(el("strong","",mine?"You":(p?.display_name||"Member")),el("time","",new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})));bubble.append(meta);
    bubble.append(el("div","body-text",m.body));
    const del=el("button","delete-message","Delete");del.type="button";del.title="Move message to Deleted messages";del.setAttribute("aria-label","Delete message");del.addEventListener("click",()=>deleteMessage(m.id));bubble.append(del);
    row.append(bubble);list.append(row);
  });
  $("messages").scrollTop=$("messages").scrollHeight;
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
async function sendMessage(e){
  e.preventDefault();const body=$("message").value.trim();if(!body||!S.active)return;
  const activeChat=S.chats.find(x=>x.id===S.active);if(activeChat?.kind==="direct"&&!S.directStatus?.can_message){toast("Private messaging is unavailable in this conversation.");return;}
  $("send").disabled=true;
  const r=await db.from("messages").insert({conversation_id:S.active,sender_id:S.user.id,body}).select("id,conversation_id,sender_id,body,created_at").single();
  $("send").disabled=false;if(r.error){toast("Message not sent: "+r.error.message);return;}
  $("message").value="";$("message").style.height="auto";
  if(!S.messages.some(x=>x.id===r.data.id)){S.messages.push(r.data);renderMessages();}
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
  const r=await db.from("profiles").select("id,username,display_name").ilike("username","%"+term+"%").limit(15);box.replaceChildren();
  if(r.error){box.append(el("p","muted tiny",r.error.message));return;}
  let people=(r.data||[]).filter(p=>p.id!==S.user.id);
  if(S.picker==="add"){const c=S.chats.find(x=>x.id===S.active),ids=new Set((c?.members||[]).map(x=>x.user_id));people=people.filter(p=>!ids.has(p.id));}
  if(!people.length){box.append(el("p","muted tiny","No matching members found."));return;}
  people.forEach(p=>{
    const b=el("button","person");b.type="button";b.append(avatar(p.display_name));
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
  if(!S.profile)return;$("profile-name").value=S.profile.display_name;$("profile-username").value=S.profile.username;
  status("profile-status","");$("profile-modal").hidden=false;
}
async function saveProfile(e){
  e.preventDefault();const display_name=$("profile-name").value.trim(),username=$("profile-username").value.trim().toLowerCase();
  if(!display_name||!/^[a-z0-9_]{3,24}$/.test(username)){status("profile-status","Check the name and username format.","error");return;}
  const r=await db.from("profiles").update({display_name,username}).eq("id",S.user.id).select("*").single();
  if(r.error){status("profile-status",r.error.message,"error");return;}
  S.profile=r.data;S.profiles[S.user.id]=r.data;$("user-name").textContent=r.data.display_name;$("user-initial").textContent=initials(r.data.display_name);
  $("profile-modal").hidden=true;await loadChats();if(S.active)await loadMessages(S.active);toast("Profile updated.");
}
function closeModals(){ $("people-modal").hidden=true;$("profile-modal").hidden=true;$("requests-modal").hidden=true;$("friends-modal").hidden=true; }
function goHome(){
  closeModals();S.active=null;S.messages=[];S.directStatus=null;
  if(S.channel){db.removeChannel(S.channel);S.channel=null;}
  $("layout").classList.remove("show-chat");renderChats();renderActive();
}
function wire(){
  document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>authMode(b.dataset.mode)));
  $("auth-form").addEventListener("submit",async e=>{
    e.preventDefault();const email=$("email").value.trim(),password=$("password").value,isNew=S.mode==="signup";$("auth-submit").disabled=true;status("auth-status",isNew?"Creating account…":"Signing in…");
    const r=isNew?await db.auth.signUp({email,password,options:{data:{display_name:$("name").value.trim()},emailRedirectTo:location.origin}}):await db.auth.signInWithPassword({email,password});
    if(r.error)status("auth-status",r.error.message,"error");
    else if(isNew&&!r.data.session)status("auth-status","Account created. Check your email for the confirmation link, then sign in here.","success");
    else {status("auth-status","Signed in. Loading chats…","success");if(r.data.session?.user)await signedIn(r.data.session.user);}
    $("auth-submit").disabled=false;
  });
  $("new-private-chat").addEventListener("click",()=>openPeople("direct"));$("new-group-chat").addEventListener("click",()=>openPeople("group"));
  $("retry-load-chats").addEventListener("click",()=>{if(S.user&&!S.loading)signedIn(S.user,true);});
  $("empty-private").addEventListener("click",()=>openPeople("direct"));$("empty-group").addEventListener("click",()=>openPeople("group"));
  $("add-people").addEventListener("click",()=>openPeople("add"));$("requests-open").addEventListener("click",openRequests);$("friends-open").addEventListener("click",openFriends);$("friends-find").addEventListener("click",()=>{$("friends-modal").hidden=true;openPeople("friend");});$("block-user").addEventListener("click",toggleBlock);
  $("people-search").addEventListener("input",()=>{clearTimeout(S.timer);S.timer=setTimeout(searchPeople,220);});$("people-create").addEventListener("click",createGroupOrAdd);
  $("home-open").addEventListener("click",goHome);
  $("filter").addEventListener("input",renderChats);document.querySelectorAll("[data-folder]").forEach(b=>b.addEventListener("click",()=>selectFolder(b.dataset.folder)));$("profile-open").addEventListener("click",openProfile);$("profile-form").addEventListener("submit",saveProfile);
  $("send-form").addEventListener("submit",sendMessage);
  $("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";});
  $("message").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();$("send-form").requestSubmit();}});
  $("back").addEventListener("click",()=>{S.active=null;$("layout").classList.remove("show-chat");renderChats();renderActive();if(S.channel){db.removeChannel(S.channel);S.channel=null;}});
  $("signout").addEventListener("click",async()=>{const r=await db.auth.signOut();if(r.error)toast(r.error.message);else closeModals();});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",closeModals));
  ["people-modal","profile-modal","requests-modal","friends-modal"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))closeModals();}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModals();});
}
async function boot(){
  if(!window.supabase?.createClient){status("auth-status","The chat library did not load. Refresh and try again.","error");return;}
  wire();
  db.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{if(session?.user)signedIn(session.user);else if(event==="SIGNED_OUT")showAuth();},0);});
  const session=await db.auth.getSession();if(session.error){status("auth-status",session.error.message,"error");return;}
  if(session.data.session?.user)await signedIn(session.data.session.user);else showAuth();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
