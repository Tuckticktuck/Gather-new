(() => {
  "use strict";
  let ctx=null, lobbies=[], activeLobbyId=null, activeLobby=null, players=[], channel=null, refreshTimer=null, moveTimer=null, syncTimer=null;
  let busy=false, joystick={x:0,y:0}, movePending=false, moveQueued=null, panelOpen=false, predictedPosition=null;
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const btn=(text,cls,fn)=>{const b=el("button",cls,text);b.type="button";b.addEventListener("click",fn);return b;};
  const uid=()=>ctx?.user?.()?.id||null;
  const chats=()=>ctx?.chats?.()||[];
  const name=id=>{const p=ctx?.profiles?.()?.[id];return p?.display_name?.trim()||p?.username?.trim()||"Gather member";};
  const modeName=m=>({classic:"Classic",infection:"Infection",team_tag:"Team Tag",last_standing:"Last Player Standing"})[m]||"Tag";
  const toast=m=>ctx?.toast?.(m);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function mount(){
    const header=document.querySelector(".games-hub-header");
    if(header&&!$("tag-open")){const b=btn("● Tag Arena","outline tag-open",()=>openPanel());b.id="tag-open";header.append(b);}
    if(!$("tag-overlay")){
      const overlay=el("div","overlay tag-overlay");overlay.id="tag-overlay";overlay.hidden=true;
      overlay.innerHTML='<section class="modal tag-modal" role="dialog" aria-modal="true" aria-labelledby="tag-modal-title"><button id="tag-close" class="close" type="button" aria-label="Close">×</button><div id="tag-modal-content"></div></section>';
      document.body.append(overlay);
      $("tag-close").addEventListener("click",closePanel);
      overlay.addEventListener("click",e=>{if(e.target===overlay)closePanel();});
    }
  }
  function init(options){
    ctx=options;mount();
    if(!channel){
      channel=ctx.db.channel("gather-tag-lobbies-"+(uid()||"member"))
        .on("postgres_changes",{event:"*",schema:"public",table:"gather_tag_lobbies"},payload=>{
          const next=payload?.new;
          if(activeLobbyId&&next?.id===activeLobbyId){
            if(next.status&&next.status!==activeLobby?.status){activeLobby={...activeLobby,...next};void loadPlayers(activeLobbyId).then(()=>renderPanel());}
            else if(next.updated_at&&activeLobby)activeLobby.updated_at=next.updated_at;
          }else scheduleRefresh();
        })
        .on("postgres_changes",{event:"*",schema:"public",table:"gather_tag_players"},payload=>{
          const row=payload?.new;
          if(activeLobbyId&&row?.lobby_id===activeLobbyId){
            const idx=players.findIndex(p=>p.user_id===row.user_id);
            if(payload.eventType==="DELETE"){players=players.filter(p=>p.user_id!==payload.old?.user_id);}
            else if(idx>=0)players[idx]={...players[idx],...row};
            else players.push(row);
            if(row.user_id===uid())predictedPosition={x:Number(row.x),y:Number(row.y)};
            renderArenaPositions();
          }else if(!activeLobbyId)scheduleRefresh();
        })
        .subscribe();
    }
    void refresh();
  }
  function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(),350);}
  async function refresh(){
    if(!ctx||!uid())return;
    const ids=[...new Set(chats().map(c=>c.id).filter(Boolean))];
    if(!ids.length){lobbies=[];renderPanel();return;}
    const r=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,created_at,updated_at").in("conversation_id",ids).in("status",["lobby","active"]).order("updated_at",{ascending:false}).limit(40);
    if(r.error){if(panelOpen)status("Could not load Tag lobbies: "+r.error.message);return;}
    lobbies=r.data||[];
    if(activeLobbyId){
      const previousStatus=activeLobby?.status;
      const current=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,created_at,updated_at").eq("id",activeLobbyId).maybeSingle();
      if(!current.error&&current.data)activeLobby=current.data;
      await loadPlayers(activeLobbyId);
      if(previousStatus==="active"&&activeLobby?.status==="active"&&$("tag-arena"))renderArenaPositions();
      else renderPanel();
      return;
    }
    renderPanel();
  }
  async function loadPlayers(id){
    const r=await ctx.db.from("gather_tag_players").select("lobby_id,user_id,status,color,ready,x,y,is_it,team,joined_at").eq("lobby_id",id).order("joined_at");
    if(!r.error)players=r.data||[];
  }
  function openPanel(){panelOpen=true;$("tag-overlay").hidden=false;renderPanel();void refresh();}
  function closePanel(){panelOpen=false;$("tag-overlay").hidden=true;activeLobbyId=null;activeLobby=null;players=[];clearInterval(moveTimer);clearInterval(syncTimer);moveTimer=null;syncTimer=null;predictedPosition=null;joystick={x:0,y:0};}
  function status(message){const n=$("tag-status");if(n)n.textContent=message||"";}
  function renderPanel(){
    if(!panelOpen)return;
    const root=$("tag-modal-content");if(!root)return;root.replaceChildren();
    if(activeLobbyId&&activeLobby){renderLobby(root);return;}
    root.append(el("p","eyebrow","GATHER GAMES · MULTIPLAYER"));
    root.append(el("h2","tag-title","Tag Arena"));
    root.append(el("p","muted tiny","Create a lobby, customize your circle, and choose how the round works."));
    const create=btn("＋ Create lobby","primary tag-create",renderCreate);root.append(create);
    const list=el("div","tag-lobby-list");
    const open=lobbies.filter(x=>x.status==="lobby");
    if(!open.length)list.append(el("p","muted tiny tag-empty","No open lobbies right now. Create one to get started."));
    open.forEach(l=>{
      const card=el("article","tag-lobby-card");
      const info=el("div","tag-lobby-info");info.append(el("strong","",modeName(l.mode)),el("span","muted tiny",conversationTitle(l.conversation_id)+" · "+(l.join_mode==="open"?"Open lobby":"Invite only")));
      card.append(info,el("span","tag-player-count",l.max_players+" max"));
      const join=btn("Join","outline",()=>joinLobby(l));
      card.append(join);list.append(card);
    });
    root.append(el("h3","tag-section-title","Available lobbies"),list);
    const active=lobbies.filter(x=>x.status==="active");
    if(active.length){root.append(el("h3","tag-section-title","In progress"));active.forEach(l=>{const c=el("article","tag-lobby-card");c.append(el("div","tag-lobby-info",modeName(l.mode)+" · In progress"),btn("Watch / Play","outline",async()=>{activeLobbyId=l.id;activeLobby=l;await loadPlayers(l.id);renderPanel();}));root.append(c);});}
    const st=el("p","status tag-status","");st.id="tag-status";root.append(st);
  }
  function conversationTitle(id){const c=chats().find(x=>x.id===id);return c?.kind==="group"?(c.title||"Group chat"):c?.members?.find(m=>m.user_id!==uid())?.user_id?name(c.members.find(m=>m.user_id!==uid()).user_id):"Private conversation";}
  function renderCreate(){
    const root=$("tag-modal-content");root.replaceChildren();
    root.append(el("p","eyebrow","NEW TAG LOBBY"),el("h2","tag-title","Set up your lobby"),el("p","muted tiny","Players can join, pick a unique color, and ready up before the host starts."));
    const form=el("form","tag-form");
    const conv=el("label","","Conversation");const select=el("select");select.id="tag-conversation";select.required=true;
    chats().filter(c=>(c.members||[]).some(m=>m.user_id===uid())&&(c.members||[]).some(m=>m.user_id!==uid())).forEach(c=>{const o=el("option","",conversationTitle(c.id));o.value=c.id;select.append(o);});conv.append(select);
    const mode=el("label","","Mode");const modes=el("select");modes.id="tag-mode";[["classic","Classic"],["infection","Infection"],["team_tag","Team Tag"],["last_standing","Last Player Standing"]].forEach(([v,t])=>{const o=el("option","",t);o.value=v;modes.append(o);});mode.append(modes);
    const access=el("label","","Who can join?");const join=el("select");join.id="tag-join-mode";[["open","Anyone in this conversation"],["invite","Invited members only"]].forEach(([v,t])=>{const o=el("option","",t);o.value=v;join.append(o);});access.append(join);
    const count=el("label","","Player limit");const max=el("select");max.id="tag-max";[4,6,8,10,12,16,20].forEach(v=>{const o=el("option","",String(v)+" players");o.value=String(v);if(v===12)o.selected=true;max.append(o);});count.append(max);
    const color=el("label","tag-color-label","Your circle color");const input=el("input");input.type="color";input.id="tag-color";input.value="#38bdf8";color.append(input);
    const message=el("p","status","");message.id="tag-status";
    const actions=el("div","tag-actions");actions.append(btn("Back","secondary-action",()=>renderPanel()));const submit=btn("Create lobby","primary",async()=>{if(busy)return;busy=true;submit.disabled=true;message.textContent="Creating lobby…";const conversationId=select.value;const c=chats().find(x=>x.id===conversationId);const invitees=(c?.members||[]).map(m=>m.user_id).filter(id=>id!==uid());const result=await ctx.db.rpc("gather_tag_create",{p_conversation_id:conversationId,p_mode:modes.value,p_join_mode:join.value,p_invited_user_ids:join.value==="invite"?invitees:[],p_color:input.value,p_max_players:Number(max.value)});busy=false;submit.disabled=false;if(result.error){message.textContent=result.error.message;return;}activeLobby=Array.isArray(result.data)?result.data[0]:result.data;activeLobbyId=activeLobby?.id;if(!activeLobbyId){message.textContent="The lobby was created but could not be opened. Refresh Tag Arena.";return;}await refresh();});
    actions.append(submit);form.append(conv,mode,access,count,color,message,actions);form.addEventListener("submit",e=>e.preventDefault());root.append(form);
    if(!select.options.length){message.textContent="Join a conversation before creating a Tag lobby.";submit.disabled=true;}
  }
  async function joinLobby(lobby){
    const palette=["#38BDF8","#F97316","#A78BFA","#34D399","#F472B6","#FACC15","#60A5FA","#FB7185","#2DD4BF","#C084FC","#A3E635","#F59E0B"];
    const existing=await ctx.db.from("gather_tag_players").select("color").eq("lobby_id",lobby.id).eq("status","joined");
    const used=new Set((existing.data||[]).map(p=>String(p.color).toLowerCase()));
    let color=palette.find(c=>!used.has(c.toLowerCase()));if(!color){do{color="#"+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0").toUpperCase();}while(used.has(color.toLowerCase()));}
    const r=await ctx.db.rpc("gather_tag_join",{p_lobby_id:lobby.id,p_color:color});
    if(r.error){toast(r.error.message);return;}
    activeLobbyId=lobby.id;activeLobby=lobby;await loadPlayers(lobby.id);renderPanel();
  }
  function renderLobby(root){
    root.append(el("p","eyebrow",activeLobby.status==="active"?"MATCH IN PROGRESS":"WAITING ROOM"));
    root.append(el("h2","tag-title",modeName(activeLobby.mode)));
    root.append(el("p","muted tiny",conversationTitle(activeLobby.conversation_id)+" · "+(activeLobby.join_mode==="open"?"Open lobby":"Invite only")));
    const me=players.find(p=>p.user_id===uid());
    if(!me){root.append(el("p","muted","You are not currently in this lobby."),btn("Back to Tag Arena","outline",()=>{activeLobbyId=null;activeLobby=null;renderPanel();}));return;}
    if(activeLobby.status==="cancelled"){root.append(el("p","tag-complete","The host closed this lobby."),btn("Back to Tag Arena","outline",()=>{activeLobbyId=null;activeLobby=null;renderPanel();}));return;}
    const customization=el("div","tag-customize");
    customization.append(el("strong","","Your circle"));
    const color=el("input","");color.type="color";color.value=me.color;color.setAttribute("aria-label","Choose your circle color");color.disabled=activeLobby.status!=="lobby";
    color.addEventListener("change",async()=>{const r=await ctx.db.rpc("gather_tag_customize",{p_lobby_id:activeLobbyId,p_color:color.value});if(r.error){toast(r.error.message);color.value=me.color;}else{await loadPlayers(activeLobbyId);renderPanel();}});
    customization.append(color,el("span","muted tiny",activeLobby.status==="lobby"?"Choose a color nobody else is using.":"Color locked for this match."));
    root.append(customization);
    const roster=el("div","tag-roster");
    players.forEach(p=>{const row=el("div","tag-player-row");const swatch=el("span","tag-player-swatch");swatch.style.background=p.color;const copy=el("div","tag-player-copy");copy.append(el("strong","",name(p.user_id)),el("small","muted tiny",p.status==="invited"?"Invited":p.status==="eliminated"?"Eliminated":activeLobby.status==="lobby"?(p.ready?"Ready":"Not ready"):(p.is_it?"IT":"Playing")));row.append(swatch,copy);if(p.user_id===activeLobby.created_by)row.append(el("span","tag-host-mark","HOST"));roster.append(row);});
    root.append(el("h3","tag-section-title","Players · "+players.filter(p=>p.status==="joined").length+"/"+activeLobby.max_players),roster);
    if(activeLobby.status==="lobby"){
      const ready=btn(me.ready?"Not ready":"Ready up",me.ready?"outline":"primary",async()=>{const r=await ctx.db.rpc("gather_tag_ready",{p_lobby_id:activeLobbyId,p_ready:!me.ready});if(r.error)toast(r.error.message);else await refresh();});
      const actions=el("div","tag-actions");actions.append(ready);
      if(activeLobby.created_by===uid()){
        const start=btn("Start match","primary",async()=>{
          if(busy)return;busy=true;start.disabled=true;status("Starting match…");
          try{
            const r=await ctx.db.rpc("gather_tag_start",{p_lobby_id:activeLobbyId});
            if(r.error){status(r.error.message);toast(r.error.message);start.disabled=false;return;}
            const latest=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,created_at,updated_at").eq("id",activeLobbyId).single();
            if(latest.error){status("Start was requested, but the match status could not be refreshed: "+latest.error.message);start.disabled=false;return;}
            activeLobby=latest.data;
            await loadPlayers(activeLobbyId);
            if(activeLobby.status==="active"){status("");renderPanel();}
            else{status("The lobby is still waiting. Make sure every joined player is ready, then try again.");start.disabled=false;}
          }catch(error){status(error?.message||"Could not start the match.");start.disabled=false;}
          finally{busy=false;}
        });
        start.disabled=players.filter(p=>p.status==="joined").length<2||players.some(p=>p.status==="joined"&&!p.ready);
        actions.append(start);
      }
      actions.append(btn("Leave lobby","secondary-action",async()=>{await ctx.db.rpc("gather_tag_leave",{p_lobby_id:activeLobbyId});activeLobbyId=null;activeLobby=null;await refresh();}));
      root.append(actions);
      root.append(el("p","muted tiny","The host can start once at least two players have joined and everyone is ready."));
    } else {
      renderArena(root);
      if(activeLobby.created_by===uid()&&activeLobby.status==="active"){
        root.append(btn("End match","secondary-action tag-end",async()=>{if(!confirm("End this Tag match for everyone?"))return;const r=await ctx.db.rpc("gather_tag_end",{p_lobby_id:activeLobbyId});if(r.error)toast(r.error.message);else await refresh();}));
      }
    }
    const back=btn("Back to Tag Arena","outline tag-back",()=>{activeLobbyId=null;activeLobby=null;players=[];renderPanel();});root.append(back);
    const st=el("p","status tag-status","");st.id="tag-status";root.append(st);
  }
  function renderArena(root){
    const arena=el("div","tag-arena");arena.id="tag-arena";
    players.filter(p=>p.status==="joined").forEach(p=>{const dot=el("span","tag-dot");dot.dataset.userId=p.user_id;dot.style.left=p.x+"%";dot.style.top=p.y+"%";dot.style.background=p.color;dot.title=name(p.user_id)+(p.is_it?" · It":"");if(p.user_id===uid())dot.classList.add("mine");if(p.is_it)dot.classList.add("is-it");arena.append(dot);});
    root.append(arena);
    if(activeLobby.mode==="last_standing")root.append(el("p","muted tiny","Tagged players are eliminated. The last player remaining wins."));
    else if(activeLobby.mode==="infection")root.append(el("p","muted tiny","Tagged players join the infected team. The infection spreads."));
    else if(activeLobby.mode==="team_tag")root.append(el("p","muted tiny","Work with your team to tag the opposing team."));
    else root.append(el("p","muted tiny","One player is It. Tagging passes It to the next player."));
    if(activeLobby.status==="completed"){clearInterval(moveTimer);moveTimer=null;joystick={x:0,y:0};root.append(el("p","tag-complete","Round complete."));return;}
    const me=players.find(p=>p.user_id===uid());
    if(me?.status==="eliminated"){clearInterval(moveTimer);moveTimer=null;joystick={x:0,y:0};root.append(el("p","tag-complete","You have been eliminated. You can watch the rest of the round."));return;}
    const pad=el("div","tag-joystick");pad.setAttribute("aria-label","Movement joystick");
    const knob=el("span","tag-joystick-knob");pad.append(knob);
    const move=(e)=>{const r=pad.getBoundingClientRect();const dx=(e.clientX-(r.left+r.width/2))/(r.width/2);const dy=(e.clientY-(r.top+r.height/2))/(r.height/2);const len=Math.hypot(dx,dy)||1;joystick={x:dx/Math.max(1,len),y:dy/Math.max(1,len)};knob.style.transform="translate("+joystick.x*24+"px,"+joystick.y*24+"px)";};
    const stop=()=>{joystick={x:0,y:0};knob.style.transform="translate(0,0)";};
    pad.addEventListener("pointerdown",e=>{pad.setPointerCapture(e.pointerId);move(e);});
    pad.addEventListener("pointermove",e=>{if(e.buttons)move(e);});
    pad.addEventListener("pointerup",stop);pad.addEventListener("pointercancel",stop);pad.addEventListener("lostpointercapture",stop);
    const controls=el("div","tag-controls");controls.append(el("span","muted tiny","Move your circle"),pad);root.append(controls);
    if(!moveTimer)moveTimer=setInterval(stepLocalMovement,50);
    if(!syncTimer)syncTimer=setInterval(sendMove,240);
  }
  function stepLocalMovement(){
    if(!activeLobbyId||!$("tag-arena"))return;
    if(Math.abs(joystick.x)+Math.abs(joystick.y)<.05)return;
    const me=players.find(p=>p.user_id===uid()&&p.status==="joined");if(!me)return;
    const base=predictedPosition||{x:Number(me.x),y:Number(me.y)};
    predictedPosition={
      x:Math.max(2,Math.min(98,base.x+joystick.x*.34)),
      y:Math.max(2,Math.min(98,base.y+joystick.y*.34))
    };
    me.x=predictedPosition.x;me.y=predictedPosition.y;
    const dot=$("tag-arena")?.querySelector('.tag-dot[data-user-id="'+uid()+'"]');
    if(dot){dot.style.left=me.x+"%";dot.style.top=me.y+"%";}
  }
  async function sendMove(){
    if(!activeLobbyId||movePending)return;
    const me=players.find(p=>p.user_id===uid()&&p.status==="joined");if(!me)return;
    const target=predictedPosition||{x:Number(me.x),y:Number(me.y)};
    const confirmed={x:Number(me.x),y:Number(me.y)};
    if(Math.hypot(target.x-confirmed.x,target.y-confirmed.y)<.35)return;
    movePending=true;
    const lobbyId=activeLobbyId;
    try{
      const r=await ctx.db.rpc("gather_tag_move",{p_lobby_id:lobbyId,p_x:target.x,p_y:target.y});
      if(r.error){
        if(!/Movement update is too large/.test(r.error.message))status(r.error.message);
        predictedPosition={x:confirmed.x,y:confirmed.y};
        me.x=confirmed.x;me.y=confirmed.y;
        renderArenaPositions();
      }else{
        me.x=target.x;me.y=target.y;
      }
    }catch(error){status(error?.message||"Movement could not sync.");}
    finally{movePending=false;}
  }
  function renderArenaPositions(){
    const arena=$("tag-arena");if(!arena)return;
    players.filter(p=>p.status==="joined").forEach(p=>{
      let dot=[...arena.querySelectorAll(".tag-dot")].find(n=>n.dataset.userId===p.user_id);
      if(!dot){dot=el("span","tag-dot");dot.dataset.userId=p.user_id;arena.append(dot);}
      dot.style.left=p.x+"%";dot.style.top=p.y+"%";dot.style.background=p.color;
      dot.title=name(p.user_id)+(p.is_it?" · It":"");
      dot.classList.toggle("mine",p.user_id===uid());dot.classList.toggle("is-it",!!p.is_it);
    });
    [...arena.querySelectorAll(".tag-dot")].forEach(dot=>{if(!players.some(p=>p.user_id===dot.dataset.userId&&p.status==="joined"))dot.remove();});
  }
  function shutdown(){
    clearTimeout(refreshTimer);clearInterval(moveTimer);clearInterval(syncTimer);moveTimer=null;syncTimer=null;predictedPosition=null;
    if(channel){ctx?.db?.removeChannel?.(channel);channel=null;}
    ctx=null;panelOpen=false;activeLobbyId=null;activeLobby=null;players=[];lobbies=[];
    const overlay=$("tag-overlay");if(overlay)overlay.hidden=true;
  }
  window.GatherTag={init,shutdown,open:openPanel,refresh};
})();