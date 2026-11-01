(() => {
"use strict";
const URL = "https://xrwldphmeafiakittcof.supabase.co";
const KEY = "sb_publishable_5Gws8f_CODwrHigG2U6Veg_bTRrBoeA";
const $ = (id) => document.getElementById(id);
const db = window.supabase.createClient(URL, KEY);
const S = { user:null, profile:null, profiles:{}, chats:[], requests:[], directStatus:null, active:null, messages:[], channel:null, mode:"signin", picker:"direct", selected:new Set(), loading:null, timer:null };

function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=String(text); return n; }
function status(id, text, kind) { const n=$(id); n.textContent=text||""; n.className="status"+(kind?" "+kind:""); }
function toast(text) { $("toast").textContent=text; $("toast").classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>$("toast").classList.remove("show"),3000); }
function initials(s) { return (String(s||"?").trim()[0]||"?").toUpperCase(); }
function avatar(name) { return el("span","avatar",initials(name)); }
function dateLabel(s) { if(!s)return ""; const d=new Date(s), now=new Date(); return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):d.toLocaleDateString([],{month:"short",day:"numeric"}); }
function showAuth() {
  if(S.channel){db.removeChannel(S.channel);S.channel=null;}
  S.user=null;S.profile=null;S.profiles={};S.chats=[];S.requests=[];S.directStatus=null;S.active=null;S.messages=[];
  $("auth").hidden=false;$("app").hidden=true;
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
async function signedIn(user){
  if(!user||S.loading===user.id)return; if(S.user&&S.user.id===user.id&&S.profile)return;
  S.loading=user.id;S.user=user;showApp();
  try{S.profile=await ensureProfile(user);$("user-initial").textContent=initials(S.profile.display_name);$("user-name").textContent=S.profile.display_name;await loadChats();}
  catch(e){toast("Profile could not be loaded: "+e.message);}
  finally{S.loading=null;}
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
  if(!S.user)return;
  const m=await db.from("conversation_members").select("conversation_id,role,conversations!inner(id,kind,title,updated_at)").eq("user_id",S.user.id);
  if(m.error){toast("Chats could not be loaded: "+m.error.message);return;}
  const rows=m.data||[],ids=[...new Set(rows.map(x=>x.conversation_id))];
  if(!ids.length){S.chats=[];S.profiles={};renderChats();renderActive();await loadRequests();return;}
  const [members,msgs]=await Promise.all([
    db.from("conversation_members").select("conversation_id,user_id,role").in("conversation_id",ids),
    db.from("messages").select("conversation_id,body,created_at").in("conversation_id",ids).order("created_at",{ascending:false}).limit(300)
  ]);
  if(members.error){toast("Members could not be loaded: "+members.error.message);return;}
  const userIds=[...new Set(members.data.map(x=>x.user_id))];
  const p=await db.from("profiles").select("id,username,display_name").in("id",userIds);
  if(p.error){toast("Profiles could not be loaded: "+p.error.message);return;}
  S.profiles={};p.data.forEach(x=>S.profiles[x.id]=x);
  const byChat={},last={};members.data.forEach(x=>(byChat[x.conversation_id]??=[]).push(x));
  (msgs.data||[]).forEach(x=>{if(!last[x.conversation_id])last[x.conversation_id]=x;});
  S.chats=rows.map(x=>({...x.conversations,members:byChat[x.conversation_id]||[],last:last[x.conversation_id]||null}))
    .sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  renderChats();renderActive();await loadRequests();
}
async function loadRequests(){
  if(!S.user)return;
  const r=await db.from("conversation_requests").select("id,sender_id,recipient_id,status,created_at").or("sender_id.eq."+S.user.id+",recipient_id.eq."+S.user.id).order("created_at",{ascending:false}).limit(60);
  if(r.error){toast("Chat requests could not be loaded: "+r.error.message);return;}
  S.requests=r.data||[];
  const ids=[...new Set(S.requests.flatMap(x=>[x.sender_id,x.recipient_id]).filter(id=>id!==S.user.id))];
  if(ids.length){
    const p=await db.from("profiles").select("id,username,display_name").in("id",ids);
    if(p.error){toast("Request profiles could not be loaded: "+p.error.message);return;}
    p.data.forEach(x=>S.profiles[x.id]=x);
  }
  renderRequests();
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
async function respondToRequest(id,accept){
  const r=await db.rpc("respond_to_direct_chat_request",{p_request_id:id,p_accept:accept});
  if(r.error){toast("Request could not be updated: "+r.error.message);return;}
  if(r.data?.status==="blocked"){toast("This request cannot be accepted because private messaging is blocked.");await loadRequests();return;}
  if(accept&&r.data?.conversation_id){
    $("requests-modal").hidden=true;toast("Request accepted. You can now message each other.");await loadChats();await openChat(r.data.conversation_id);
  }else{toast("Request declined.");await loadRequests();}
}
function renderChats(){
  const list=$("chat-list");list.replaceChildren();const term=$("filter").value.trim().toLowerCase();
  const chats=S.chats.filter(c=>(chatTitle(c)+" "+chatSub(c)).toLowerCase().includes(term));
  $("chat-count").textContent=chats.length;
  if(!chats.length){list.append(el("p","muted tiny",term?"No matching conversations.":"No chats yet. Start one using a username."));return;}
  chats.forEach(c=>{
    const b=el("button","chat-item"+(c.id===S.active?" active":""));b.type="button";b.append(avatar(chatTitle(c)));
    const copy=el("div","chat-copy");copy.append(el("strong","",chatTitle(c)),el("span","",c.last?c.last.body:chatSub(c)));b.append(copy,el("small","chat-time",dateLabel(c.last?.created_at||c.updated_at)));
    b.addEventListener("click",()=>openChat(c.id));list.append(b);
  });
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
  S.directStatus=null;await refreshDirectStatus();await loadRequests();toast(unblock?"Member unblocked.":"Member blocked.");
}
async function openChat(id){
  S.active=id;S.directStatus=null;$("layout").classList.add("show-chat");renderActive();await refreshDirectStatus();await loadMessages(id);
  if(S.channel){await db.removeChannel(S.channel);S.channel=null;}
  S.channel=db.channel("chat-"+id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+id},payload=>{
    if(S.active!==id||S.messages.some(x=>x.id===payload.new.id))return;
    S.messages.push(payload.new);renderMessages();loadChats();
  }).subscribe();
}
async function loadMessages(id){
  const r=await db.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",id).order("created_at",{ascending:true}).limit(300);
  if(r.error){toast("Messages could not be loaded: "+r.error.message);return;}
  if(S.active!==id)return;S.messages=r.data||[];renderMessages();
}
function renderMessages(){
  const list=$("messages");list.replaceChildren();
  if(!S.messages.length){list.append(el("p","muted tiny","This is the beginning of the conversation. Say hello."));return;}
  const c=S.chats.find(x=>x.id===S.active),me=c?.members.find(x=>x.user_id===S.user.id);
  S.messages.forEach(m=>{
    const mine=m.sender_id===S.user.id,p=S.profiles[m.sender_id],row=el("div","message"+(mine?" mine":"")),bubble=el("div","bubble");
    const meta=el("div","meta");meta.append(el("strong","",mine?"You":(p?.display_name||"Member")),el("time","",new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})));bubble.append(meta);
    bubble.append(el("div","body-text",m.body));
    if(mine||me?.role==="owner"){const del=el("button","delete-message","×");del.type="button";del.title="Delete message";del.addEventListener("click",()=>deleteMessage(m.id));bubble.append(del);}
    row.append(bubble);list.append(row);
  });
  $("messages").scrollTop=$("messages").scrollHeight;
}
async function deleteMessage(id){
  if(!confirm("Delete this message?"))return;
  const r=await db.from("messages").delete().eq("id",id);if(r.error){toast("Delete failed: "+r.error.message);return;}
  S.messages=S.messages.filter(x=>x.id!==id);renderMessages();await loadChats();
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
  $("people-create").hidden=mode==="direct";$("people-create").textContent=mode==="group"?"Create group":"Add selected people";
  $("people-title").textContent=mode==="group"?"Create a group":mode==="add"?"Add people":"Start a conversation";
  $("people-desc").textContent=mode==="group"?"Name your group and choose who to invite.":"Find someone by their Gather username.";
  status("people-status","");await loadRequests();$("people-search").focus();
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
    const copy=el("div","person-copy"),sent=S.requests.some(x=>x.sender_id===S.user.id&&x.recipient_id===p.id&&x.status==="pending");
    copy.append(el("strong","",p.display_name),el("small","",sent?"@"+p.username+" · Request sent":"@"+p.username));b.append(copy);
    if(S.picker!=="direct")b.append(el("span","",S.selected.has(p.id)?"✓":"＋"));
    if(sent&&S.picker==="direct"){b.disabled=true;b.classList.add("person-disabled");}
    else b.addEventListener("click",()=>S.picker==="direct"?directChat(p):(S.selected.has(p.id)?S.selected.delete(p.id):S.selected.add(p.id),searchPeople(),status("people-status",S.selected.size+" selected.")));
    box.append(b);
  });
}
async function directChat(p){
  const existing=S.chats.find(c=>c.kind==="direct"&&c.members.length===2&&c.members.some(m=>m.user_id===p.id)&&c.members.some(m=>m.user_id===S.user.id));
  if(existing){$("people-modal").hidden=true;await openChat(existing.id);return;}
  const r=await db.rpc("send_direct_chat_request",{p_recipient_id:p.id});
  if(r.error){status("people-status","Request could not be sent: "+r.error.message,"error");return;}
  if(r.data?.status==="existing"&&r.data.conversation_id){$("people-modal").hidden=true;await loadChats();await openChat(r.data.conversation_id);return;}
  if(r.data?.status==="blocked"){status("people-status","A private chat request cannot be sent because blocking is active between these accounts.","error");return;}
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
function closeModals(){ $("people-modal").hidden=true;$("profile-modal").hidden=true;$("requests-modal").hidden=true; }
function wire(){
  document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>authMode(b.dataset.mode)));
  $("auth-form").addEventListener("submit",async e=>{
    e.preventDefault();const email=$("email").value.trim(),password=$("password").value,isNew=S.mode==="signup";$("auth-submit").disabled=true;status("auth-status",isNew?"Creating account…":"Signing in…");
    const r=isNew?await db.auth.signUp({email,password,options:{data:{display_name:$("name").value.trim()},emailRedirectTo:location.origin}}):await db.auth.signInWithPassword({email,password});
    if(r.error)status("auth-status",r.error.message,"error");
    else if(isNew&&!r.data.session)status("auth-status","Account created. Check your email for the confirmation link, then sign in here.","success");
    else status("auth-status","Signed in. Loading chats…","success");
    $("auth-submit").disabled=false;
  });
  $("new-chat").addEventListener("click",()=>openPeople("direct"));$("empty-new").addEventListener("click",()=>openPeople("direct"));$("add-people").addEventListener("click",()=>openPeople("add"));$("requests-open").addEventListener("click",openRequests);$("block-user").addEventListener("click",toggleBlock);
  $("people-search").addEventListener("input",()=>{clearTimeout(S.timer);S.timer=setTimeout(searchPeople,220);});$("people-create").addEventListener("click",createGroupOrAdd);
  $("filter").addEventListener("input",renderChats);$("profile-open").addEventListener("click",openProfile);$("profile-form").addEventListener("submit",saveProfile);
  $("send-form").addEventListener("submit",sendMessage);
  $("message").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";});
  $("message").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();$("send-form").requestSubmit();}});
  $("back").addEventListener("click",()=>{S.active=null;$("layout").classList.remove("show-chat");renderChats();renderActive();if(S.channel){db.removeChannel(S.channel);S.channel=null;}});
  $("signout").addEventListener("click",async()=>{const r=await db.auth.signOut();if(r.error)toast(r.error.message);else closeModals();});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",closeModals));
  ["people-modal","profile-modal","requests-modal"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id))closeModals();}));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModals();});
}
async function boot(){
  if(!window.supabase?.createClient){status("auth-status","The chat library did not load. Refresh and try again.","error");return;}
  wire();
  db.auth.onAuthStateChange((event,session)=>{if(session?.user)signedIn(session.user);else if(event==="SIGNED_OUT")showAuth();});
  const session=await db.auth.getSession();if(session.error){status("auth-status",session.error.message,"error");return;}
  if(session.data.session?.user)await signedIn(session.data.session.user);else showAuth();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
