(function(){
  let activeCleanup=null,activeKey=null,activeWrap=null;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function attach(root,db,type,id,userId,nameOf){
    if(!root||!db||!id||!userId)return;
    const key=String(type)+":"+String(id);
    // Game screens are rebuilt during state refreshes. Reuse the same chat dock
    // so an open panel, loaded messages, and its polling loop survive rerenders.
    if(activeKey===key&&activeWrap){if(!root.contains(activeWrap))root.prepend(activeWrap);return;}
    if(activeCleanup){activeCleanup();activeCleanup=null;}
    const wrap=document.createElement("div");wrap.className="game-chat-dock";
    const toggle=document.createElement("button");toggle.type="button";toggle.className="game-chat-toggle";const icon=document.createElementNS("http://www.w3.org/2000/svg","svg");icon.setAttribute("viewBox","0 0 24 24");icon.setAttribute("width","20");icon.setAttribute("height","20");icon.setAttribute("fill","none");icon.setAttribute("stroke","currentColor");icon.setAttribute("stroke-width","1.8");icon.setAttribute("stroke-linecap","round");icon.setAttribute("stroke-linejoin","round");icon.setAttribute("aria-hidden","true");const bubble=document.createElementNS("http://www.w3.org/2000/svg","path");bubble.setAttribute("d","M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-4-.0L3 21l1.4-4.6A8.5 8.5 0 1 1 21 11.5Z");const dots=document.createElementNS("http://www.w3.org/2000/svg","path");dots.setAttribute("d","M8 11.5h.01M12 11.5h.01M16 11.5h.01");icon.append(bubble,dots);toggle.append(icon);toggle.setAttribute("aria-label","Open game chat");toggle.title="Game chat";toggle.setAttribute("aria-expanded","false");
    const panel=document.createElement("section");panel.className="game-chat-panel";panel.hidden=true;panel.setAttribute("aria-label","Temporary game chat");
    const head=document.createElement("header");head.className="game-chat-head";
    const title=document.createElement("strong");title.textContent="Game chat";
    const close=document.createElement("button");close.type="button";close.className="game-chat-close";close.textContent="×";close.setAttribute("aria-label","Close game chat");head.append(title,close);
    const note=document.createElement("p");note.className="game-chat-note";note.textContent="Messages are temporary and are deleted when this lobby or match ends.";
    const list=document.createElement("div");list.className="game-chat-list";list.setAttribute("aria-live","polite");
    const form=document.createElement("form");form.className="game-chat-form";
    const input=document.createElement("input");input.type="text";input.maxLength=1200;input.placeholder="Message players…";input.autocomplete="off";input.setAttribute("aria-label","Game chat message");
    const send=document.createElement("button");send.type="submit";send.textContent="Send";form.append(input,send);
    panel.append(head,note,list,form);wrap.append(toggle,panel);root.prepend(wrap);
    let timer=null,closed=false,lastSignature="";
    function draw(rows){
      const signature=(rows||[]).map(x=>x.id).join("|");
      if(signature===lastSignature&&list.childElementCount)return;lastSignature=signature;list.replaceChildren();
      if(!rows?.length){const empty=document.createElement("p");empty.className="game-chat-empty";empty.textContent="No messages yet. Say hello to everyone in this game.";list.append(empty);return;}
      rows.forEach(row=>{const item=document.createElement("article");item.className="game-chat-message"+(row.sender_id===userId?" mine":"");const who=document.createElement("strong");who.textContent=row.sender_id===userId?"You":(nameOf?.(row.sender_id)||"Player");const body=document.createElement("p");body.textContent=row.body;const time=document.createElement("time");time.dateTime=row.created_at;time.textContent=new Date(row.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});item.append(who,body,time);list.append(item);});list.scrollTop=list.scrollHeight;
    }
    async function load(){if(closed||panel.hidden)return;const r=await db.rpc("gather_game_chat_list",{p_game_type:type,p_game_id:id});if(r.error){list.textContent=r.error.message;return;}draw(r.data||[]);}
    function open(){panel.hidden=false;toggle.setAttribute("aria-expanded","true");toggle.classList.add("active");void load();if(!timer)timer=setInterval(load,3000);}
    function shut(){panel.hidden=true;toggle.setAttribute("aria-expanded","false");toggle.classList.remove("active");if(timer){clearInterval(timer);timer=null;}}
    toggle.addEventListener("click",()=>panel.hidden?open():shut());close.addEventListener("click",shut);
    form.addEventListener("submit",async e=>{e.preventDefault();const body=input.value.trim();if(!body)return;send.disabled=true;try{const r=await db.rpc("gather_game_chat_send",{p_game_type:type,p_game_id:id,p_body:body});if(r.error)throw r.error;input.value="";await load();}catch(error){list.textContent=error?.message||"Message could not be sent.";}finally{send.disabled=false;input.focus();}});
    activeKey=key;activeWrap=wrap;
    activeCleanup=()=>{closed=true;shut();wrap.remove();if(activeWrap===wrap){activeKey=null;activeWrap=null;} };
  }
  window.GatherGameChat={attach};
})();