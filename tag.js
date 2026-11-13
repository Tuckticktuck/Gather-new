(() => {
  "use strict";
  let ctx=null, lobbies=[], activeLobbyId=null, activeLobby=null, players=[], channel=null, refreshTimer=null, syncTimer=null, roundTimer=null, finishRequested=false;
  let busy=false, joystick={x:0,y:0}, movePending=false, moveQueued=null, panelOpen=false, predictedPosition=null, lastSyncedPosition=null, keyboardKeys=new Set(), keyboardBound=false, arenaEngine=null;
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
    if(!$("tag-overlay")){
      const overlay=el("div","overlay tag-overlay");overlay.id="tag-overlay";overlay.hidden=true;
      overlay.innerHTML='<section class="modal tag-modal" role="dialog" aria-modal="true" aria-labelledby="tag-modal-title"><button id="tag-close" class="close" type="button" aria-label="Close">×</button><div id="tag-modal-content"></div></section>';
      document.body.append(overlay);
      $("tag-close").addEventListener("click",closePanel);
      overlay.addEventListener("click",e=>{if(e.target===overlay)closePanel();});
    }
  }
  function updateKeyboardMovement(){
    let x=0,y=0;
    if(keyboardKeys.has("ArrowLeft"))x--;
    if(keyboardKeys.has("ArrowRight"))x++;
    if(keyboardKeys.has("ArrowUp"))y--;
    if(keyboardKeys.has("ArrowDown"))y++;
    const length=Math.hypot(x,y)||1;
    joystick={x:x/length,y:y/length};
    const knob=$("tag-joystick")?.querySelector(".tag-joystick-knob");
    if(knob)knob.style.transform="translate("+joystick.x*24+"px,"+joystick.y*24+"px)";
  }
  function bindKeyboard(){
    if(keyboardBound)return;
    keyboardBound=true;
    window.addEventListener("keydown",e=>{
      if(!activeLobbyId||!$("tag-arena")||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))return;
      const target=e.target;
      if(target&&(target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(target.tagName)))return;
      e.preventDefault();keyboardKeys.add(e.key);updateKeyboardMovement();
    });
    window.addEventListener("keyup",e=>{
      if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))return;
      keyboardKeys.delete(e.key);updateKeyboardMovement();
    });
    window.addEventListener("blur",()=>{keyboardKeys.clear();updateKeyboardMovement();});
  }
  function init(options){
    ctx=options;mount();bindKeyboard();
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
            if(row.user_id===uid()){
              lastSyncedPosition={x:Number(row.x),y:Number(row.y)};
              const own=players[idx>=0?idx:players.length-1];
              if(Math.abs(joystick.x)+Math.abs(joystick.y)<.05){predictedPosition={...lastSyncedPosition};own.x=lastSyncedPosition.x;own.y=lastSyncedPosition.y;arenaEngine?.setLocalPosition(lastSyncedPosition);}
              else if(predictedPosition){own.x=predictedPosition.x;own.y=predictedPosition.y;}
            }
            if(row.user_id===uid()&&row.status!=="joined"&&activeLobby?.status==="active"){renderPanel();return;}
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
    const mine=await ctx.db.from("gather_tag_players").select("lobby_id").eq("user_id",uid()).in("status",["joined","invited"]);
    if(mine.error){if(panelOpen)status("Could not load Tag invitations: "+mine.error.message);return;}
    const lobbyIds=[...new Set((mine.data||[]).map(p=>p.lobby_id))];
    if(!lobbyIds.length){lobbies=[];renderPanel();return;}
    const r=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,round_seconds,started_at,ends_at,winner_user_id,winning_team,created_at,updated_at").in("id",lobbyIds).in("status",["lobby","active"]).order("updated_at",{ascending:false}).limit(40);
    if(r.error){if(panelOpen)status("Could not load Tag lobbies: "+r.error.message);return;}
    lobbies=r.data||[];
    if(activeLobbyId){
      const previousStatus=activeLobby?.status;
      const current=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,round_seconds,started_at,ends_at,winner_user_id,winning_team,created_at,updated_at").eq("id",activeLobbyId).maybeSingle();
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
  async function openInvitation(id){if(!ctx||!uid())return;mount();panelOpen=true;$("tag-overlay").hidden=false;const r=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,round_seconds,started_at,ends_at,winner_user_id,winning_team,created_at,updated_at").eq("id",id).maybeSingle();if(r.error||!r.data){toast(r.error?.message||"That Tag invitation is no longer available.");return;}activeLobbyId=id;activeLobby=r.data;await joinLobby(r.data);}
  async function openGame(id){
    if(!ctx||!uid())return;mount();panelOpen=true;$("tag-overlay").hidden=false;
    const r=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,round_seconds,started_at,ends_at,winner_user_id,winning_team,created_at,updated_at").eq("id",id).in("status",["lobby","active"]).maybeSingle();
    if(r.error||!r.data){toast(r.error?.message||"That Tag lobby is no longer available.");return;}
    activeLobbyId=id;activeLobby=r.data;await loadPlayers(id);renderPanel();
  }
  function closePanel(){
    panelOpen=false;keyboardKeys.clear();joystick={x:0,y:0};stopArenaEngine();
    $("tag-overlay").hidden=true;activeLobbyId=null;activeLobby=null;players=[];
    predictedPosition=null;lastSyncedPosition=null;joystick={x:0,y:0};
  }
  function status(message){const n=$("tag-status");if(n)n.textContent=message||"";}
  function renderPanel(){
    if(!panelOpen)return;
    const root=$("tag-modal-content");if(!root)return;stopArenaEngine();root.replaceChildren();
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
  function conversationTitle(id){if(!id)return "Gather game";const c=chats().find(x=>x.id===id);return c?.kind==="group"?(c.title||c.name||"Group chat"):c?.members?.find(m=>m.user_id!==uid())?.user_id?name(c.members.find(m=>m.user_id!==uid()).user_id):"Private conversation";}
  const byName=(a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"});
  function sortedEligibleChats(){return chats().filter(c=>(c.members||[]).some(m=>m.user_id===uid())&&(c.members||[]).some(m=>m.user_id!==uid())).slice().sort((a,b)=>{const kind=(a.kind==="group"?1:0)-(b.kind==="group"?1:0);return kind||byName(conversationTitle(a.id),conversationTitle(b.id));});}
  function appendChatOptions(select,list){[{label:"Private chats",items:list.filter(c=>c.kind!=="group")},{label:"Group chats",items:list.filter(c=>c.kind==="group")}].forEach(section=>{if(!section.items.length)return;const group=el("optgroup");group.label=section.label;section.items.slice().sort((a,b)=>byName(conversationTitle(a.id),conversationTitle(b.id))).forEach(c=>{const option=el("option","",conversationTitle(c.id));option.value=c.id;group.append(option);});select.append(group);});}
  function sortedPeople(chat){return(chat?.members||[]).filter(m=>m.user_id!==uid()).slice().sort((a,b)=>byName(name(a.user_id),name(b.user_id)));}
  function renderCreate(){
    const root=$("tag-modal-content");root.replaceChildren();
    root.append(el("p","eyebrow","NEW TAG LOBBY"),el("h2","tag-title","Set up your lobby"),el("p","muted tiny","Invite friends directly. Game invitations do not create or add anyone to a chat."));
    const form=el("form","tag-form"),selected=[];
    const peopleField=el("section","tag-people-picker");
    const choose=btn("Choose people","outline",()=>{});
    const summary=el("small","muted tiny","No people selected");
    peopleField.append(choose,summary);
    const mode=el("label","","Mode"),modes=el("select");[["classic","Classic"],["infection","Infection"],["team_tag","Team Tag"],["last_standing","Last Player Standing"]].forEach(([v,t])=>{const o=el("option","",t);o.value=v;modes.append(o);});mode.append(modes);
    const count=el("label","","Player limit"),max=el("select");[4,6,8,10,12,16,20].forEach(v=>{const o=el("option","",v+" players");o.value=String(v);if(v===12)o.selected=true;max.append(o);});count.append(max);
    const color=el("label","tag-color-label","Your circle color"),input=el("input");input.type="color";input.id="tag-color";input.value="#38bdf8";color.append(input);
    const message=el("p","status","");message.id="tag-status";
    const actions=el("div","tag-actions");actions.append(btn("Back","secondary-action",()=>renderPanel()));
    const submit=btn("Create lobby","primary",async()=>{
      if(busy)return;
      if(!selected.length){message.textContent="Choose at least one person to invite.";return;}
      if(selected.length+1>Number(max.value)){message.textContent="The player limit must include you and everyone you invite.";return;}
      busy=true;submit.disabled=true;message.textContent="Creating lobby…";
      try{const result=await ctx.db.rpc("gather_tag_create",{p_conversation_id:null,p_mode:modes.value,p_join_mode:"invite",p_invited_user_ids:selected.slice(),p_color:input.value,p_max_players:Number(max.value)});
        if(result.error)throw result.error;activeLobby=Array.isArray(result.data)?result.data[0]:result.data;activeLobbyId=activeLobby?.id;
        if(!activeLobbyId)throw new Error("The lobby was created but could not be opened.");await refresh();
      }catch(error){message.textContent=error?.message||"Could not create lobby.";}finally{busy=false;submit.disabled=false;}
    });
    actions.append(submit);form.append(peopleField,mode,count,color,message,actions);form.addEventListener("submit",e=>e.preventDefault());root.append(form);
    window.GatherPeoplePicker?.create({db:ctx.db,button:choose,summary,onChange:ids=>{selected.splice(0,selected.length,...ids);}});
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
    if(activeLobby.status==="lobby"&&activeLobby.created_by===uid()){
      const modeWrap=el("label","tag-mode-setting");
      modeWrap.append(el("strong","","Game mode"));
      const modeSelect=el("select","tag-mode-select");
      [["classic","Classic"],["infection","Infection"],["team_tag","Team Tag"],["last_standing","Last Player Standing"]].forEach(([value,label])=>{const option=el("option","",label);option.value=value;option.selected=activeLobby.mode===value;modeSelect.append(option);});
      modeSelect.addEventListener("change",async()=>{modeSelect.disabled=true;try{const r=await ctx.db.rpc("gather_tag_set_mode",{p_lobby_id:activeLobbyId,p_mode:modeSelect.value});if(r.error)throw r.error;activeLobby=r.data||{...activeLobby,mode:modeSelect.value};toast("Game mode updated.");renderPanel();}catch(error){toast(error?.message||"Could not change the game mode.");modeSelect.value=activeLobby.mode;modeSelect.disabled=false;}});
      modeWrap.append(modeSelect,el("small","muted tiny","The host can change this before starting the next round."));root.append(modeWrap);
    }
    if(activeLobby.status==="lobby"&&activeLobby.created_by===uid()){
      const timeField=el("label","tag-round-setting");
      timeField.append(el("strong","","Round time limit"));
      const duration=el("input","tag-round-duration");duration.type="number";duration.min="1";duration.max="120";duration.step="1";duration.inputMode="numeric";duration.value=String(Math.round((Number(activeLobby.round_seconds)||300)/60));duration.setAttribute("aria-label","Round time limit in minutes");
      timeField.append(duration,el("small","muted tiny","Set a custom duration in minutes. You can change it before every round."));
      root.append(timeField);
    }
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
            const minutes=Number(root.querySelector(".tag-round-duration")?.value||5);if(!Number.isInteger(minutes)||minutes<1||minutes>120){status("Choose a round length between 1 and 120 minutes.");start.disabled=false;return;}const r=await ctx.db.rpc("gather_tag_start_round",{p_lobby_id:activeLobbyId,p_duration_seconds:minutes*60});
            if(r.error){status(r.error.message);toast(r.error.message);start.disabled=false;return;}
            const latest=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,round_seconds,started_at,ends_at,winner_user_id,winning_team,created_at,updated_at").eq("id",activeLobbyId).single();
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
      if(activeLobby.status==="completed"){
        const result=activeLobby.mode==="team_tag"?(activeLobby.winning_team?(activeLobby.winning_team==="taggers"?"Taggers":"Runners")+" team wins!":"The round ended in a draw."):(activeLobby.winner_user_id?name(activeLobby.winner_user_id)+" wins!":"The round ended in a draw.");
        root.append(el("p","tag-round-result",result));
        if(activeLobby.created_by===uid())root.append(btn("Return to lobby · Set next round","primary tag-end",async()=>{const r=await ctx.db.rpc("gather_tag_return_lobby",{p_lobby_id:activeLobbyId});if(r.error){toast(r.error.message);return;}await refresh();}));
      }else if(activeLobby.created_by===uid()&&activeLobby.status==="active"){
        root.append(btn("End match","secondary-action tag-end",async()=>{if(!confirm("End this round and return everyone to the lobby?"))return;const r=await ctx.db.rpc("gather_tag_return_lobby",{p_lobby_id:activeLobbyId});if(r.error){toast(r.error.message);return;}await refresh();}));
      }
    }
    const back=btn("Back to Tag Arena","outline tag-back",()=>{activeLobbyId=null;activeLobby=null;players=[];renderPanel();});root.append(back);
    if(["joined","eliminated"].includes(me.status)&&["lobby","active"].includes(activeLobby.status))window.GatherGameChat?.attach(root,ctx.db,"tag",activeLobbyId,uid(),name);
    const st=el("p","status tag-status","");st.id="tag-status";root.append(st);
  }
  function stopArenaEngine(){
    if(arenaEngine){arenaEngine.destroy();arenaEngine=null;}
    clearInterval(syncTimer);syncTimer=null;clearInterval(roundTimer);roundTimer=null;finishRequested=false;
  }
  function renderArena(root){
    const arena=el("canvas","tag-arena");arena.id="tag-arena";
    arena.width=960;arena.height=540;
    arena.setAttribute("role","img");
    arena.setAttribute("aria-label","Tag Arena. Player circles move around the game field.");
    root.append(arena);

    if(activeLobby.mode==="last_standing")root.append(el("p","muted tiny","Tagged players are eliminated. The last player remaining wins."));
    else if(activeLobby.mode==="infection")root.append(el("p","muted tiny","Tagged players join the infected team. The infection spreads."));
    else if(activeLobby.mode==="team_tag")root.append(el("p","muted tiny","Work with your team to tag the opposing team."));
    else root.append(el("p","muted tiny","One player is It. Tagging passes It to the next player."));

    if(activeLobby.status==="active"){
      const clock=el("div","tag-round-clock");clock.id="tag-round-clock";
      clock.innerHTML='<span class="tag-clock-icon" aria-hidden="true"></span><span class="tag-clock-label">TIME LEFT</span><strong id="tag-round-countdown">—:—</strong>';
      root.append(clock);updateRoundClock();
      if(!roundTimer)roundTimer=setInterval(updateRoundClock,1000);
    }
    if(activeLobby.status==="completed"){
      joystick={x:0,y:0};root.append(el("p","tag-complete","Round complete."));return;
    }
    const me=players.find(p=>p.user_id===uid());
    if(me?.status==="eliminated"){
      joystick={x:0,y:0};
      root.append(el("p","tag-complete","You have been eliminated. You can watch the rest of the round."));return;
    }
    if(me?.status!=="joined"){
      joystick={x:0,y:0};
      root.append(el("p","muted tiny","You are watching this match. You are not an active player."));return;
    }

    const pad=el("div","tag-joystick");pad.id="tag-joystick";pad.setAttribute("aria-label","Movement joystick");
    const knob=el("span","tag-joystick-knob");pad.append(knob);
    const move=(e)=>{
      const r=pad.getBoundingClientRect();
      const dx=(e.clientX-(r.left+r.width/2))/(r.width/2);
      const dy=(e.clientY-(r.top+r.height/2))/(r.height/2);
      const len=Math.hypot(dx,dy)||1;
      joystick={x:dx/Math.max(1,len),y:dy/Math.max(1,len)};
      knob.style.transform="translate("+joystick.x*24+"px,"+joystick.y*24+"px)";
    };
    const stop=()=>{
      if(keyboardKeys.size){updateKeyboardMovement();return;}
      joystick={x:0,y:0};knob.style.transform="translate(0,0)";
    };
    pad.addEventListener("pointerdown",e=>{pad.setPointerCapture(e.pointerId);move(e);});
    pad.addEventListener("pointermove",e=>{if(e.buttons)move(e);});
    pad.addEventListener("pointerup",stop);pad.addEventListener("pointercancel",stop);pad.addEventListener("lostpointercapture",stop);
    const controls=el("div","tag-controls");controls.append(el("span","muted tiny","Move your circle"),pad);root.append(controls);

    try{
      if(!window.GatherTagEngine?.create)throw new Error("The Tag Canvas engine did not load. Reload Gather and try again.");
      arenaEngine=window.GatherTagEngine.create(arena,{
        localUserId:()=>uid(),
        getInput:()=>joystick,
        getPlayers:()=>players,
        getPlayerName:id=>name(id),
        onLocalMove:position=>{
          const own=players.find(p=>p.user_id===uid()&&p.status==="joined");
          if(!own)return;
          predictedPosition={x:position.x,y:position.y};
          own.x=position.x;own.y=position.y;
        }
      });
      arenaEngine.setPlayers(players);
      if(predictedPosition)arenaEngine.setLocalPosition(predictedPosition);
      arenaEngine.start();
    }catch(error){
      arenaEngine=null;
      root.append(el("p","status tag-status",error?.message||"Canvas rendering could not start."));
      return;
    }
    if(!syncTimer)syncTimer=setInterval(sendMove,300);
  }
  function updateRoundClock(){
    const output=$("tag-round-countdown");if(!output||!activeLobby?.ends_at)return;
    const remaining=Math.max(0,Math.ceil((new Date(activeLobby.ends_at).getTime()-Date.now())/1000));
    output.textContent=String(Math.floor(remaining/60)).padStart(2,"0")+":"+String(remaining%60).padStart(2,"0");
    const clock=$("tag-round-clock");if(clock)clock.classList.toggle("is-urgent",remaining<=30);
    if(remaining===0&&!finishRequested&&activeLobby.status==="active"){
      finishRequested=true;
      void ctx.db.rpc("gather_tag_finish_expired",{p_lobby_id:activeLobbyId}).then(async r=>{
        if(r.error){finishRequested=false;return;}
        const latest=await ctx.db.from("gather_tag_lobbies").select("id,conversation_id,created_by,status,mode,join_mode,max_players,round_seconds,started_at,ends_at,winner_user_id,winning_team,created_at,updated_at").eq("id",activeLobbyId).single();
        if(!latest.error){activeLobby=latest.data;await loadPlayers(activeLobbyId);renderPanel();}
      });
    }
  }
  async function sendMove(){
    if(!activeLobbyId||movePending||document.hidden||activeLobby?.status!=="active")return;
    const me=players.find(p=>p.user_id===uid()&&p.status==="joined");if(!me)return;
    const target=predictedPosition||{x:Number(me.x),y:Number(me.y)};
    const confirmed=lastSyncedPosition||{x:Number(me.x),y:Number(me.y)};
    const dx=target.x-confirmed.x,dy=target.y-confirmed.y,distance=Math.hypot(dx,dy);
    if(distance<.35)return;
    const scale=distance>7.5?7.5/distance:1;
    const sent={x:confirmed.x+dx*scale,y:confirmed.y+dy*scale};
    movePending=true;
    const lobbyId=activeLobbyId;
    try{
      const r=await ctx.db.rpc("gather_tag_move",{p_lobby_id:lobbyId,p_x:sent.x,p_y:sent.y});
      if(r.error){
        if(!/Movement update is too large/.test(r.error.message))status(r.error.message);
        predictedPosition={x:confirmed.x,y:confirmed.y};
        lastSyncedPosition={x:confirmed.x,y:confirmed.y};
        me.x=confirmed.x;me.y=confirmed.y;
        arenaEngine?.setLocalPosition(confirmed);
        renderArenaPositions();
      }else{
        lastSyncedPosition={x:sent.x,y:sent.y};
        me.x=predictedPosition?.x??sent.x;me.y=predictedPosition?.y??sent.y;
      }
    }catch(error){status(error?.message||"Movement could not sync.");}
    finally{movePending=false;}
  }
  function renderArenaPositions(){
    if(arenaEngine)arenaEngine.setPlayers(players);
  }
  function shutdown(){
    clearTimeout(refreshTimer);stopArenaEngine();predictedPosition=null;
    if(channel){ctx?.db?.removeChannel?.(channel);channel=null;}
    ctx=null;panelOpen=false;keyboardKeys.clear();joystick={x:0,y:0};clearInterval(roundTimer);roundTimer=null;activeLobbyId=null;activeLobby=null;players=[];lobbies=[];
    const overlay=$("tag-overlay");if(overlay)overlay.hidden=true;
  }
  window.GatherTag={init,shutdown,open:openPanel,openInvitation,openGame,refresh};
})();