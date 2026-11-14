(()=>{"use strict";
let ctx=null,channel=null,activeGameId=null,state=null,games=[],myGames=[],busy=false,playersPanelOpen=false,selectedCardId=null,handScrollPosition=0,lastCardCounts=new Map(),lastCountGameId=null,avatarCache=new Map(),refreshTimer=null,channelConnected=false,lifecycleListenersBound=false;
const $=id=>document.getElementById(id),el=(t,c="",v="")=>{const n=document.createElement(t);if(c)n.className=c;if(v)n.textContent=v;return n;};
const uid=()=>ctx?.user?.()?.id||null,chats=()=>ctx?.chats?.()||[],toast=m=>ctx?.toast?.(m),profile=id=>ctx?.profiles?.()?.[id]||{},name=id=>profile(id).display_name||profile(id).username||"Gather member";
const call=async(n,a)=>{const r=await ctx.db.rpc(n,a);if(r.error)throw r.error;return r.data;};
function mount(){if($("uno-overlay"))return;const o=el("div","overlay uno-overlay");o.id="uno-overlay";o.hidden=true;o.innerHTML='<section class="modal uno-modal tag-modal" role="dialog" aria-modal="true" aria-labelledby="uno-dialog-title"><button id="uno-close" class="close" type="button" aria-label="Close">×</button><div id="uno-content"></div></section>';document.body.append(o);$("uno-close").onclick=close;o.onclick=e=>{if(e.target===o)close();};}
function close(){if($("uno-overlay"))$("uno-overlay").hidden=true;$("uno-content")?.classList.remove("uno-in-match");activeGameId=null;state=null;playersPanelOpen=false;selectedCardId=null;handScrollPosition=0;}
const eligible=()=>chats().filter(c=>(c.members||[]).some(m=>m.user_id===uid())&&(c.members||[]).length>=2);
const conversationTitle=c=>c.kind==="group"?(c.title||c.name||"Group chat"):name((c.members||[]).find(m=>m.user_id!==uid())?.user_id);
const byName=(a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"});
function appendChatOptions(select,list){[{label:"Private chats",items:list.filter(c=>c.kind!=="group")},{label:"Group chats",items:list.filter(c=>c.kind==="group")}].forEach(section=>{if(!section.items.length)return;const group=el("optgroup");group.label=section.label;section.items.slice().sort((a,b)=>byName(conversationTitle(a),conversationTitle(b))).forEach(c=>{const o=el("option","",conversationTitle(c));o.value=c.id;group.append(o);});select.append(group);});}
function sortedPeople(c){return(c?.members||[]).filter(m=>m.user_id!==uid()).slice().sort((a,b)=>byName(name(a.user_id),name(b.user_id)));}
async function refresh(){if(!ctx||!uid())return;const [r,mine]=await Promise.all([ctx.db.from("gather_multiplayer_games").select("*").eq("game_type","uno").eq("status","active").order("created_at",{ascending:false}).limit(60),ctx.db.from("gather_multiplayer_players").select("game_id,status,ready,joined_at").eq("user_id",uid()).in("status",["joined","invited","spectating"])]);if(r.error){toast("UNO lobbies could not be loaded: "+r.error.message);return;}if(mine.error){toast("Your UNO games could not be loaded: "+mine.error.message);return;}games=r.data||[];myGames=(mine.data||[]).map(p=>({player:p,game:games.find(g=>g.id===p.game_id)})).filter(x=>x.game);if(typeof ctx.onGamesUpdated==="function")ctx.onGamesUpdated();if(activeGameId)await loadGame();else if(!$("uno-overlay")?.hidden)renderLobby();}
function open(){if(!ctx||!uid()){toast("Sign in to play UNO.");return;}mount();$("uno-overlay").hidden=false;activeGameId=null;state=null;playersPanelOpen=false;selectedCardId=null;handScrollPosition=0;renderLobby();void refresh();}
async function openInvitation(id){open();await enter(id);}
async function openGame(id){if(!ctx||!uid()){toast("Sign in to play UNO.");return;}mount();$("uno-overlay").hidden=false;activeGameId=id;state=null;playersPanelOpen=false;selectedCardId=null;handScrollPosition=0;const root=$("uno-content");root.classList.remove("uno-in-match");root.replaceChildren(el("p","uno-empty muted tiny","Loading UNO game…"));await loadGame();}
function renderLobby(){const root=$("uno-content");root.classList.remove("uno-in-match");root.replaceChildren();const head=el("div","uno-lobby-heading");head.append(el("p","muted tiny","Create a match or join an open game with people in your conversations."));const create=el("button","primary","＋ Create UNO lobby");create.onclick=renderCreate;head.append(create);root.append(head);root.append(el("h3","uno-section-title","Current games"));const mine=el("div","uno-lobby-list");if(!myGames.length)mine.append(el("p","uno-empty muted tiny","You have no current UNO invitations or games. New invitations and games you join will stay listed here."));myGames.forEach(entry=>{const g=entry.game,p=entry.player,chat=eligible().find(c=>c.id===g.conversation_id),card=el("article","uno-lobby-card"),info=el("div","uno-lobby-info"),started=!!g.state?.started;const status=p.status==="spectating"?"Watching":p.status==="invited"?"Invitation waiting":started?"In progress":"Lobby open";info.append(el("strong","",g.settings?.title||"UNO match"),el("small","muted",status+" · "+(chat?conversationTitle(chat):"Conversation")+" · "+(g.settings?.max_players||10)+" players max"));const controls=el("div","uno-lobby-card-actions");if(p.status==="spectating"){const watch=el("button","primary","Continue watching");watch.onclick=()=>watchGame(g.id);controls.append(watch);const join=el("button","outline","Join as player");join.onclick=()=>enter(g.id);controls.append(join);}else if(p.status==="invited"&&started){const join=el("button","primary","Join & get 7 cards");join.onclick=()=>enter(g.id);const watch=el("button","outline","Watch instead");watch.onclick=()=>watchGame(g.id);controls.append(join,watch);}else{const button=el("button",p.status==="invited"?"primary":"outline",p.status==="invited"?"Accept invitation":"Open game");button.onclick=()=>enter(g.id);controls.append(button);}card.append(info,controls);mine.append(card);});root.append(mine);root.append(el("h3","uno-section-title","Other active lobbies"));const list=el("div","uno-lobby-list");const available=eligible();const shown=games.filter(g=>available.some(c=>c.id===g.conversation_id)&&!myGames.some(x=>x.game.id===g.id));if(!shown.length)list.append(el("p","uno-empty muted tiny","No other active UNO lobbies are available in your conversations."));shown.forEach(g=>{const c=available.find(x=>x.id===g.conversation_id),card=el("article","uno-lobby-card"),info=el("div","uno-lobby-info"),inProgress=!!g.state?.started;info.append(el("strong","",g.settings?.title||"UNO match"),el("small","muted",(c?.kind==="group"?"Group":"Conversation")+" · "+(g.join_mode==="open"?"Open":"Invite-only")+" · "+(g.settings?.max_players||10)+" players max"+(inProgress?" · In progress":"")));const b=el("button","outline",inProgress?"Join & get 7 cards":g.join_mode==="open"?"Join":"View");b.onclick=()=>enter(g.id);card.append(info,b);list.append(card);});root.append(list);}
function field(label,control){const w=el("label","uno-field");w.append(el("span","",label),control);return w;}
function renderCreate(){
const root=$("uno-content");root.replaceChildren();const title=el("h2","uno-title","Set up your lobby");title.id="uno-dialog-title";
root.append(el("p","eyebrow","NEW UNO LOBBY"),title,el("p","muted tiny uno-intro","Choose friends to invite. This creates a game lobby, not a chat."));
const form=el("form","uno-form tag-form"),selected=[];
const choose=el("button","outline","Choose people");choose.type="button";const summary=el("small","muted tiny","No people selected");
const people=el("section","uno-people-picker tag-people-picker");people.append(choose,summary);
const max=el("select");[2,3,4,5,6,8,10].forEach(n=>{const o=el("option","",n+" players");o.value=n;if(n===10)o.selected=true;max.append(o);});
form.append(people,field("Player limit",max));
const actions=el("div","uno-actions tag-actions"),back=el("button","secondary-action","Back"),submit=el("button","primary","Create lobby");back.type="button";back.onclick=renderLobby;submit.type="submit";actions.append(back,submit);form.append(actions);
form.onsubmit=async e=>{e.preventDefault();if(busy)return;if(!selected.length){toast("Choose at least one person to invite.");return;}if(selected.length+1>Number(max.value)){toast("The player limit must include you and every invited player.");return;}busy=true;submit.disabled=true;try{const g=await call("gather_uno_create",{p_conversation_id:null,p_join_mode:"invite",p_invited_user_ids:selected.slice(),p_max_players:Number(max.value)});activeGameId=g.id;selectedCardId=null;await loadGame();}catch(err){toast(err.message||"Could not create lobby.");}finally{busy=false;submit.disabled=false;}};
root.append(form);window.GatherPeoplePicker?.create({db:ctx.db,button:choose,summary,onChange:ids=>selected.splice(0,selected.length,...ids)});
}
async function enter(id){if(busy)return;busy=true;try{await call("gather_uno_join",{p_game_id:id,p_color:"#40826D"});await ctx.db.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",uid()).eq("kind","uno_invite").eq("body",id).is("read_at",null);activeGameId=id;selectedCardId=null;await loadGame();await refresh();}catch(e){toast(e.message||"Could not join UNO.");}finally{busy=false;}}
async function watchGame(id){if(busy)return;busy=true;try{await call("gather_uno_spectate",{p_game_id:id});activeGameId=id;selectedCardId=null;await loadGame();await refresh();}catch(e){toast(e.message||"Could not watch this UNO match.");}finally{busy=false;}}
async function stopWatching(){if(!activeGameId)return;const id=activeGameId;try{await call("gather_uno_stop_spectating",{p_game_id:id});activeGameId=null;state=null;selectedCardId=null;await refresh();toast("You stopped watching the UNO match.");}catch(e){toast(e.message||"Could not stop spectating.");}}
async function loadGame(){if(!activeGameId)return;const gameId=activeGameId;try{const next=await call("gather_uno_get_state",{p_game_id:gameId});if(activeGameId!==gameId)return;state=next;void loadPlayerAvatars(next.players||[],gameId);if(selectedCardId&&!next.hand?.some(card=>card.id===selectedCardId))selectedCardId=null;renderGame();}catch(e){if(activeGameId===gameId)toast(e.message||"Could not load UNO.");}}
function pubWinner(v){return !!(v?.public_state?.winner_id||v?.game?.state?.winner_id);}
function playerPrefs(){
  try{return JSON.parse(localStorage.getItem("gather-uno-preferences:"+uid())||"{}");}catch(_){return {};}
}
function savePlayerPrefs(prefs){
  try{localStorage.setItem("gather-uno-preferences:"+uid(),JSON.stringify(prefs));}catch(_){toast("Appearance settings could not be saved on this device.");}
}
function applyPlayerPrefs(){
  const prefs=playerPrefs(),modal=document.querySelector(".uno-modal");
  if(!modal)return;
  const accent=/^#[0-9a-f]{6}$/i.test(prefs.accent||"")?prefs.accent:"#65e0b1";
  modal.style.setProperty("--uno-neon",accent);
  modal.style.setProperty("--uno-glow",accent+"33");
  modal.classList.toggle("uno-effects-off",prefs.effects===false);
}
function avatarInitial(userId){return String(name(userId)||"P").trim().slice(0,1).toUpperCase();}
function avatarNode(userId,kind="uno-seat-avatar"){
  const node=el("span",kind,avatarInitial(userId));node.dataset.avatarId=userId;
  const image=avatarCache.get(userId);
  if(image){const img=el("img");img.src=image;img.alt="";node.replaceChildren(img);node.classList.add("has-picture");}
  return node;
}
function paintAvatarNode(node,userId){
  if(!node)return;node.dataset.avatarId=userId;
  const image=avatarCache.get(userId);
  if(image){const img=el("img");img.src=image;img.alt="";node.replaceChildren(img);node.classList.add("has-picture");}
  else{node.classList.remove("has-picture");node.textContent=avatarInitial(userId);}
}
async function loadPlayerAvatars(players,gameId){
  const ids=[...new Set((players||[]).map(p=>p.user_id).filter(Boolean))],missing=ids.filter(id=>!avatarCache.has(id));
  if(!missing.length||!ctx?.db)return;
  const result=await ctx.db.from("profile_avatars").select("user_id,image_data").in("user_id",missing);
  if(result.error)return;
  missing.forEach(id=>avatarCache.set(id,null));
  (result.data||[]).forEach(row=>avatarCache.set(row.user_id,row.image_data));
  if(activeGameId!==gameId)return;
  $("uno-content")?.querySelectorAll("[data-avatar-id]").forEach(node=>paintAvatarNode(node,node.dataset.avatarId));
}
function showPlayerProfile(player){
  const root=$("uno-content");if(!root||!player)return;
  root.querySelector(".uno-profile-popover")?.remove();
  const info=profile(player.user_id)||{},panel=el("aside","uno-profile-popover");
  panel.setAttribute("role","dialog");panel.setAttribute("aria-label","Player profile");
  const head=el("div","uno-profile-head"),avatar=avatarNode(player.user_id,"uno-profile-avatar");
  const title=el("div","uno-profile-title");title.append(el("strong","",name(player.user_id)),el("small","muted",player.user_id===uid()?"Your player profile":"UNO player"));
  const closeButton=el("button","uno-profile-close","×");closeButton.type="button";closeButton.setAttribute("aria-label","Close profile");
  head.append(avatar,title,closeButton);panel.append(head);
  const details=el("div","uno-profile-details");
  const addDetail=(label,value)=>{if(value===undefined||value===null||value==="")return;const item=el("div","uno-profile-stat");item.append(el("small","muted",label),el("strong","",String(value)));details.append(item);};
  addDetail("Cards held",player.card_count??0);
  const online=info.online??info.is_online??(info.status==="online"?true:undefined);
  if(online!==undefined)addDetail("Status",online?"Online":"Offline");
  const wins=info.uno_wins??info.game_stats?.uno_wins;
  if(wins!==undefined)addDetail("UNO wins",wins);
  const losses=info.uno_losses??info.game_stats?.uno_losses;
  if(losses!==undefined)addDetail("UNO losses",losses);
  if(details.childElementCount)panel.append(details);
  const note=el("p","muted tiny","Player information is shown from data currently available to Gather.");
  panel.append(note);closeButton.onclick=()=>panel.remove();root.append(panel);
}
function renderSettingsPanel(root){
  root.querySelector(".uno-settings-panel")?.remove();
  const prefs=playerPrefs(),panel=el("aside","uno-settings-panel");
  panel.setAttribute("role","dialog");panel.setAttribute("aria-label","UNO appearance settings");
  const head=el("div","uno-settings-head");head.append(el("div","", "PERSONAL SETTINGS"),el("button","uno-settings-close","×"));
  head.lastChild.type="button";head.lastChild.setAttribute("aria-label","Close settings");head.lastChild.onclick=()=>panel.remove();panel.append(head);
  const intro=el("p","muted tiny","These appearance choices affect only your view on this device.");
  panel.append(intro);
  const accentLabel=el("label","uno-settings-field");accentLabel.append(el("span","","Neon accent"));
  const accent=el("input");accent.type="color";accent.value=/^#[0-9a-f]{6}$/i.test(prefs.accent||"")?prefs.accent:"#65e0b1";
  accentLabel.append(accent);panel.append(accentLabel);
  const motionLabel=el("label","uno-settings-check"),motion=el("input");motion.type="checkbox";motion.checked=prefs.effects!==false;
  motionLabel.append(motion,el("span","","Enable arcade glow and motion"));panel.append(motionLabel);
  const save=el("button","primary uno-settings-save","Apply appearance");save.type="button";
  save.onclick=()=>{const next={accent:accent.value,effects:motion.checked};savePlayerPrefs(next);applyPlayerPrefs();toast("Your UNO appearance was updated.");panel.remove();};
  panel.append(save);root.append(panel);
}
function renderGame(){
  const root=$("uno-content");root.replaceChildren();
  const g=state.game,players=(state.players||[]).filter(p=>p.status==="joined"||p.status==="invited"),joined=players.filter(p=>p.status==="joined"),spectating=!!state.spectating;
  const started=!!state.started,host=g.created_by===uid(),pub=state.public_state||g.state||{};
  const finished=!!(pub.finished||pub.winner_id||g.status==="completed");
  if(lastCountGameId!==g.id){lastCountGameId=g.id;lastCardCounts.clear();}
  root.classList.toggle("uno-in-match",started&&!finished);applyPlayerPrefs();
  const top=el("div","uno-game-top"),heading=el("div","uno-game-heading");
  const gameTitle=el("h2","uno-title",finished?"UNO results":started?"UNO":"UNO lobby");gameTitle.id="uno-dialog-title";
  const chat=eligible().find(c=>c.id===g.conversation_id);
  heading.append(el("p","eyebrow",finished?"ROUND COMPLETE":started?"ARCADE MATCH":"ARCADE LOBBY"),gameTitle,
    el("p","muted tiny uno-intro",(chat?conversationTitle(chat):"Gather multiplayer")+" · "+(g.join_mode==="open"?"Open lobby":"Invite only")));
  top.append(heading);
  const headerActions=el("div","uno-header-actions");
  const playerToggle=el("button","uno-player-toggle","Players · "+joined.length+"/"+(g.settings?.max_players||10));
  playerToggle.type="button";playerToggle.hidden=!started||finished||spectating;playerToggle.setAttribute("aria-expanded",String(playersPanelOpen));
  headerActions.append(playerToggle);
  const settingsButton=el("button","uno-settings-toggle","⚙");settingsButton.type="button";settingsButton.setAttribute("aria-label","Open UNO appearance settings");settingsButton.title="Appearance settings";
  settingsButton.onclick=()=>renderSettingsPanel(root);headerActions.append(settingsButton);
  top.append(headerActions);root.append(top);
  if(joined.some(p=>p.user_id===uid())){
    window.GatherGameChat?.attach(root,ctx.db,"uno",activeGameId,uid(),name);
    const chatDock=root.querySelector(".game-chat-dock");if(chatDock)headerActions.prepend(chatDock);
  }
  const actions=el("div","uno-actions tag-actions tag-lobby-actions");let lobbyExit=null;
  if(host&&!finished){
    const end=el("button","secondary-action",started?"End match":"Cancel lobby");
    end.onclick=async()=>{if(!confirm(started?"End this UNO game for everyone?":"Cancel this UNO lobby?"))return;end.disabled=true;try{await call("gather_uno_end",{p_game_id:activeGameId});activeGameId=null;state=null;await refresh();}catch(e){toast(e.message||"Could not end game.");end.disabled=false;}};
    lobbyExit=end;
  }else if(!host&&!finished&&g.status==="active"){
    const leave=el("button","secondary-action","Leave lobby");
    leave.onclick=async()=>{if(!confirm("Leave this UNO lobby?"))return;leave.disabled=true;try{await call("gather_uno_leave",{p_game_id:activeGameId});activeGameId=null;state=null;await refresh();toast("You left the UNO lobby.");}catch(e){toast(e.message||"Could not leave this lobby.");leave.disabled=false;}};
    lobbyExit=leave;
  }
  if(!started&&!finished){
    const me=joined.find(p=>p.user_id===uid()),ready=el("button",me?.ready?"secondary-action":"primary",me?.ready?"Not ready":"Ready");
    ready.onclick=async()=>{ready.disabled=true;try{await call("gather_uno_ready",{p_game_id:activeGameId,p_ready:!me?.ready});await loadGame();}catch(e){toast(e.message||"Could not update readiness.");ready.disabled=false;}};
    actions.append(ready);
    if(host){
      const start=el("button","primary","Start game");start.onclick=async()=>{start.disabled=true;try{state=await call("gather_uno_start",{p_game_id:activeGameId});selectedCardId=null;renderGame();}catch(e){toast(e.message||"Could not start.");start.disabled=false;}};
      start.disabled=joined.length<2||joined.some(p=>!p.ready);actions.append(start);
    }
  }
  if(lobbyExit)actions.append(lobbyExit);
  if(!started&&!finished){
    const handInfo=el("section","uno-lobby-feature");handInfo.append(el("strong","","Ready for the arcade?"),el("span","muted tiny","Each player must mark Ready before the host can start. Seven cards are dealt when the match begins."));root.append(handInfo);
    const roster=el("div","uno-roster tag-roster");roster.append(el("h3","tag-section-title","Players · "+joined.length+"/"+(g.settings?.max_players||10)));
    players.forEach(p=>{
      const row=el("button","uno-player-row tag-player-row"),copy=el("span","tag-player-copy");
      row.type="button";row.append(el("span","uno-player-dot tag-player-swatch"));
      copy.append(el("strong","",name(p.user_id)+(p.user_id===uid()?" (you)":"")),el("small","muted tiny",p.status==="invited"?"Invitation sent":p.ready?"Ready":"Not ready"));row.append(copy);
      if(p.user_id===g.created_by)row.append(el("span","tag-host-mark","HOST"));
      row.onclick=()=>showPlayerProfile(p);roster.append(row);
    });
    root.append(roster,actions,el("p","uno-lobby-wait tag-lobby-hint muted tiny","The host can start when at least two players have joined and everyone is ready."));
    const back=el("button","outline tag-back","Back to UNO");back.onclick=async()=>{activeGameId=null;state=null;await refresh();};root.append(back);return;
  }
  if(spectating&&!finished){
    const board=el("section","uno-board");
    board.append(el("div","uno-turn-banner","SPECTATING · "+(pub.turn_user_id?name(pub.turn_user_id)+" is playing":"The match is waiting")));
    const table=el("div","uno-table"),ring=el("div","uno-seat-ring");ring.setAttribute("aria-label","Players in the match");
    joined.forEach((p,index)=>{
      const seat=el("button","uno-seat"+(p.user_id===pub.turn_user_id?" is-turn":""));seat.type="button";
      const angle=(joined.length===1?0:-150+(300*index/Math.max(1,joined.length-1)))*Math.PI/180;
      seat.style.left=(50+36*Math.sin(angle))+"%";seat.style.top=(44-27*Math.cos(angle))+"%";
      seat.append(avatarNode(p.user_id));
      const copy=el("span","uno-seat-copy");copy.append(el("strong","",name(p.user_id)),el("small","",String(Math.max(0,Number(p.card_count)||0))+" cards"));seat.append(copy);
      if(p.user_id===pub.turn_user_id)seat.append(el("span","uno-seat-turn","TURN"));
      seat.onclick=()=>showPlayerProfile(p);ring.append(seat);
    });
    const piles=el("div","uno-piles"),draw=el("div","uno-deck is-inactive","DRAW");
    const discard=el("div","uno-discard");discard.append(cardNode(pub.top_card,true));
    piles.append(draw,discard,el("span","uno-current-color "+(pub.current_color||"wild"),"COLOR · "+String(pub.current_color||"wild").toUpperCase()));
    table.append(ring,piles);board.append(table,el("p","muted tiny","You are watching this match. Spectators cannot draw, play cards, call UNO, or use the temporary player chat."));
    const controls=el("div","uno-spectator-actions"),join=el("button","primary","Join as player"),stop=el("button","outline","Stop watching");
    join.type="button";join.onclick=()=>enter(activeGameId);stop.type="button";stop.onclick=()=>stopWatching();
    controls.append(join,stop);root.append(board,controls);
    const roster=el("div","uno-roster tag-roster");roster.append(el("h3","tag-section-title","Players · "+joined.length+"/"+(g.settings?.max_players||10)));
    joined.forEach(p=>{const row=el("button","uno-player-row");row.type="button";row.append(el("span","uno-player-dot"));const copy=el("span","tag-player-copy");copy.append(el("strong","",name(p.user_id)),el("small","muted tiny",String(p.card_count||0)+" cards"));row.append(copy);row.onclick=()=>showPlayerProfile(p);roster.append(row);});
    root.append(roster);return;
  }
  if(finished){
    const winner=pub.winner_id,scoreboard=el("section","uno-results-scoreboard uno-finished-panel"),finish=scoreboard;
    const hero=el("div","uno-results-hero");hero.append(el("div","uno-results-trophy","✦"),el("p","eyebrow","ROUND COMPLETE"),
      el("h3","",winner?name(winner)+" wins!":"Match finished"),
      el("p","muted tiny","The round has ended. Review the standings before returning to the lobby."));
    scoreboard.append(hero);
    const scores=pub.match_scores||{},roundPoints=Math.max(0,Number(pub.round_points)||0);
    const ordered=joined.slice().sort((a,b)=>{
      if(a.user_id===winner)return -1;if(b.user_id===winner)return 1;
      const scoreDiff=(Number(scores[b.user_id])||0)-(Number(scores[a.user_id])||0);
      return scoreDiff||((Number(a.card_count)||0)-(Number(b.card_count)||0));
    });
    const list=el("div","uno-results-list");
    ordered.forEach((p,index)=>{
      const total=Math.max(0,Number(scores[p.user_id])||0),remaining=Math.max(0,Number(p.card_count)||0);
      const row=el("div","uno-results-row"+(p.user_id===winner?" is-winner":""));
      row.append(el("span","uno-result-rank",String(index+1).padStart(2,"0")),
        el("span","uno-result-player",name(p.user_id)+(p.user_id===uid()?" (you)":"")),
        el("small","uno-result-cards",p.user_id===winner?"Winner · +"+roundPoints+" this round":remaining+" cards left"),
        el("strong","uno-result-score",total+" pts"));
      list.append(row);
    });
    scoreboard.append(el("h4","","Round standings"),list);
    scoreboard.append(el("p","uno-results-points","Points awarded to the winner this round: "+roundPoints));
    root.append(scoreboard);
    const doneMap=pub.done||{},doneCount=joined.filter(p=>doneMap[p.user_id]).length,alreadyDone=!!doneMap[uid()];
    const completion=el("div","uno-results-completion");
    completion.append(el("p","muted tiny",g.status==="completed"?"This lobby has closed.":"Confirm when you are finished with the results."),
      el("strong","",doneCount+" of "+joined.length+" players confirmed"));
    joined.forEach(p=>completion.append(el("div","uno-done-player",(doneMap[p.user_id]?"✓ ":"○ ")+name(p.user_id)+(p.user_id===uid()?" (you)":""))));
    scoreboard.append(completion);
    if(state.rematch_pending)scoreboard.append(el("p","uno-rematch-wait","A rematch request is pending. Check your Gather notifications to accept or decline."));
    if(spectating){
      const stop=el("button","outline","Stop watching");stop.onclick=()=>stopWatching();actions.append(stop);
    }else if(g.status==="completed"){
      const back=el("button","outline","Back to UNO");back.onclick=async()=>{activeGameId=null;state=null;selectedCardId=null;await refresh();};actions.append(back);
      if(host){
        const hostRematch=el("button","primary","Start rematch now");hostRematch.onclick=async()=>{hostRematch.disabled=true;try{state=await call("gather_uno_host_rematch",{p_game_id:activeGameId});selectedCardId=null;renderGame();}catch(e){toast(e.message||"Could not start host rematch.");hostRematch.disabled=false;}};actions.append(hostRematch);
      }
    }else{
      const done=el("button",alreadyDone?"outline":"primary",alreadyDone?"You are done":"I am done");
      done.disabled=alreadyDone;done.onclick=async()=>{done.disabled=true;try{await call("gather_uno_done",{p_game_id:activeGameId});await loadGame();await refresh();}catch(e){toast(e.message||"Could not confirm.");done.disabled=false;}};
      const rematch=el("button","outline",state.rematch_pending?"Rematch requested":"Request rematch");
      rematch.disabled=!!state.rematch_pending;rematch.onclick=async()=>{rematch.disabled=true;try{await call("gather_uno_request_rematch",{p_game_id:activeGameId});toast("Rematch request sent.");await loadGame();await refresh();}catch(e){toast(e.message||"Could not request a rematch.");rematch.disabled=!!state.rematch_pending;}};
      actions.append(done,rematch);
      if(host){
        const hostRematch=el("button","outline","Start rematch now");hostRematch.onclick=async()=>{hostRematch.disabled=true;try{state=await call("gather_uno_host_rematch",{p_game_id:activeGameId});selectedCardId=null;renderGame();}catch(e){toast(e.message||"Could not start host rematch.");hostRematch.disabled=false;}};actions.append(hostRematch);
      }
    }
    finish.append(actions);root.append(finish);return;
  }
  const myTurn=pub.turn_user_id===uid(),drawPending=!!state.drawn_card_id&&myTurn,hand=sortHand(state.hand||[]);
  const board=el("section","uno-board");
  const banner=el("div","uno-turn-banner",drawPending?"You drew a card · Play it if legal or pass":myTurn?"Your turn":"Waiting for "+name(pub.turn_user_id));
  board.append(banner);
  if(pub.message)board.append(el("p","uno-turn-message muted tiny",pub.message));
  const table=el("div","uno-table");
  const seatRing=el("div","uno-seat-ring");seatRing.setAttribute("aria-label","Players around the UNO table");
  const opponents=joined.filter(p=>p.user_id!==uid());
  opponents.forEach((p,index)=>{
    const count=Math.max(0,Number(p.card_count)||0),previous=lastCardCounts.get(p.user_id),delta=previous===undefined?0:count-previous;lastCardCounts.set(p.user_id,count);
    const seat=el("button","uno-seat"+(p.user_id===pub.turn_user_id?" is-turn":"")+(delta?" has-card-change":""));
    seat.type="button";seat.dataset.userId=p.user_id;seat.setAttribute("aria-label",name(p.user_id)+", "+count+" cards");
    const angle=(opponents.length===1?0:-150+(300*index/Math.max(1,opponents.length-1)))*Math.PI/180;
    seat.style.left=(50+36*Math.sin(angle))+"%";seat.style.top=(44-27*Math.cos(angle))+"%";
    const avatar=avatarNode(p.user_id);
    const copy=el("span","uno-seat-copy");copy.append(el("strong","",name(p.user_id)),el("small","",String(Math.max(0,Number(p.card_count)||0))+" cards"));
    seat.append(avatar,copy);if(p.user_id===pub.turn_user_id)seat.append(el("span","uno-seat-turn","TURN"));if(delta)seat.append(el("span","uno-card-change",(delta>0?"+":"")+delta));
    seat.onclick=()=>showPlayerProfile(p);seatRing.append(seat);
  });
  const me=joined.find(p=>p.user_id===uid());
  if(me){
    const ownCount=hand.length,previous=lastCardCounts.get(me.user_id),delta=previous===undefined?0:ownCount-previous;lastCardCounts.set(me.user_id,ownCount);
    const own=el("button","uno-seat uno-seat-you"+(myTurn?" is-turn":"")+(delta?" has-card-change":""));own.type="button";own.style.left="50%";own.style.top="88%";
    own.append(avatarNode(uid()));
    const ownCopy=el("span","uno-seat-copy");ownCopy.append(el("strong","","You"),el("small","",hand.length+" cards"));own.append(ownCopy);if(delta)own.append(el("span","uno-card-change",(delta>0?"+":"")+delta));
    own.onclick=()=>showPlayerProfile(me);seatRing.append(own);
  }
  const direction=Number(pub.direction??1)<0?-1:1;
  const directionRing=el("div","uno-direction-ring"+(direction<0?" is-reversed":""));
  directionRing.append(el("span","uno-direction-symbol",direction<0?"↺":"↻"),el("small","",direction<0?"REVERSE":"CLOCKWISE"));
  table.append(directionRing,seatRing);
  const piles=el("div","uno-piles"),drawCan= myTurn&&!drawPending;
  const draw=el(drawCan?"button":"div","uno-deck"+(drawCan?"":" is-inactive"),drawPending?"DRAWN":"DRAW");
  if(drawCan){draw.type="button";draw.setAttribute("aria-label","Draw a card");draw.onclick=()=>act("draw");}
  else draw.setAttribute("aria-label",drawPending?"A card has been drawn":"Draw pile");
  piles.append(draw);
  const disc=el("div","uno-discard uno-discard-target");disc.setAttribute("role","button");disc.tabIndex=0;
  disc.setAttribute("aria-label",selectedCardId?"Play selected card":"Discard pile. Select a playable card first.");
  disc.append(cardNode(pub.top_card,true));
  const playSelected=()=>{const selected=hand.find(card=>card.id===selectedCardId);if(!selected){toast("Choose a card from your hand first.");return;}void play(selected);};
  disc.addEventListener("click",playSelected);disc.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();playSelected();}});
  disc.addEventListener("dragover",e=>{if(myTurn&&!drawPending){e.preventDefault();disc.classList.add("is-drop-target");}});
  disc.addEventListener("dragleave",()=>disc.classList.remove("is-drop-target"));
  disc.addEventListener("drop",e=>{e.preventDefault();disc.classList.remove("is-drop-target");const id=e.dataTransfer?.getData("text/plain");const card=hand.find(item=>item.id===id);if(card)void play(card);});
  piles.append(disc,el("span","uno-current-color "+(pub.current_color||"wild"),"COLOR · "+String(pub.current_color||"wild").toUpperCase()));
  table.append(piles);board.append(table);
  const area=el("div","uno-hand-area");
  area.append(el("div","uno-hand-heading","YOUR HAND · "+hand.length+" CARDS"));
  const selected=hand.find(card=>card.id===selectedCardId);
  if(selected){
    const preview=el("div","uno-selection-preview");
    const mini=cardNode(selected,true);mini.disabled=true;mini.tabIndex=-1;
    const copy=el("div","uno-selection-copy");copy.append(el("strong","",selected.color==="wild"?"Wild card":String(selected.color||"").toUpperCase()+" "+(selected.kind==="number"?selected.value:selected.kind)));
    const legal=myTurn&&isCardPlayable(selected,pub,hand)&&(!drawPending||selected.id===state.drawn_card_id);
    copy.append(el("small","muted",legal?"Selected · Tap the discard pile or drag this card onto it": "Selected · Not playable in the current turn"));
    const clear=el("button","outline","Clear");clear.type="button";clear.onclick=()=>{selectedCardId=null;renderGame();};
    preview.append(mini,copy,clear);area.append(preview);
  }
  const strip=el("div","uno-hand-strip");strip.id="uno-hand-strip";
  strip.setAttribute("aria-label","Your UNO hand. Swipe or use the arrow controls to browse cards.");
  const fanCenter=(hand.length-1)/2;
  hand.forEach((card,index)=>{
    const n=cardNode(card,false),legal=isCardPlayable(card,pub,hand),canPlay=myTurn&&legal&&(!drawPending||card.id===state.drawn_card_id);
    const angle=Math.max(-13,Math.min(13,(index-fanCenter)*1.75)),lift=Math.min(17,Math.abs(index-fanCenter)*1.25);
    n.style.setProperty("--fan-angle",angle.toFixed(2)+"deg");n.style.setProperty("--fan-lift",lift.toFixed(2)+"px");
    n.style.zIndex=String(index+1);n.dataset.cardIndex=String(index);n.dataset.cardId=String(card.id);
    n.draggable=!!canPlay;n.setAttribute("aria-pressed",String(card.id===selectedCardId));
    n.classList.toggle("uno-card-unplayable",!canPlay);n.classList.toggle("is-selected",card.id===selectedCardId);
    if(drawPending&&card.id===state.drawn_card_id)n.classList.add("uno-card-drawn");
    n.addEventListener("dragstart",event=>{if(!canPlay){event.preventDefault();return;}selectedCardId=card.id;event.dataTransfer?.setData("text/plain",String(card.id));if(event.dataTransfer)event.dataTransfer.effectAllowed="move";n.classList.add("is-dragging");});
    n.addEventListener("dragend",()=>n.classList.remove("is-dragging"));
    strip.append(n);
  });
  strip.addEventListener("click",event=>{
    const button=event.target?.closest?.(".uno-card");if(!button||!strip.contains(button))return;
    const card=hand.find(item=>item.id===button.dataset.cardId);if(!card)return;
    selectedCardId=selectedCardId===card.id?null:card.id;renderGame();
  });
  area.append(strip);
  const controls=el("div","uno-hand-controls"),left=el("button","outline","‹"),right=el("button","outline","›");
  left.type="button";right.type="button";left.setAttribute("aria-label","Scroll to earlier cards");right.setAttribute("aria-label","Scroll to later cards");
  const updateScrollButtons=()=>{const max=Math.max(0,strip.scrollWidth-strip.clientWidth);left.disabled=strip.scrollLeft<=2;right.disabled=strip.scrollLeft>=max-2;};
  left.onclick=()=>strip.scrollBy({left:-Math.max(180,strip.clientWidth*.72),behavior:"smooth"});
  right.onclick=()=>strip.scrollBy({left:Math.max(180,strip.clientWidth*.72),behavior:"smooth"});
  strip.addEventListener("scroll",()=>{handScrollPosition=strip.scrollLeft;updateScrollButtons();},{passive:true});controls.append(left,right);
  if(hand.length===1&&!pub.uno_called?.[uid()]){
    const callUno=el("button","primary","UNO!");callUno.type="button";callUno.onclick=()=>act("call_uno");controls.append(callUno);
  }
  if(drawPending){const pass=el("button","outline uno-pass-button","Pass turn");pass.type="button";pass.onclick=()=>act("pass");controls.append(pass);}
  area.append(controls);board.append(area);root.append(board);strip.scrollLeft=handScrollPosition;
  const playerPanel=el("aside","uno-players-panel");playerPanel.id="uno-players-panel";
  const panelHead=el("div","uno-players-panel-head");panelHead.append(el("strong","","Players"),el("button","uno-players-close","×"));
  panelHead.lastChild.type="button";panelHead.lastChild.setAttribute("aria-label","Close players panel");
  const roster=el("div","uno-roster tag-roster");joined.forEach(p=>{
    const row=el("button","uno-player-row tag-player-row");row.type="button";
    row.append(el("span","uno-player-dot tag-player-swatch"));
    const copy=el("span","tag-player-copy");copy.append(el("strong","",name(p.user_id)+(p.user_id===uid()?" (you)":"")),
      el("small","muted tiny",(p.user_id===pub.turn_user_id?"Current turn · ":"")+(p.card_count||0)+" cards"));
    row.append(copy);row.onclick=()=>showPlayerProfile(p);roster.append(row);
  });
  playerPanel.append(panelHead,roster);playerPanel.hidden=!playersPanelOpen;root.append(playerPanel);
  const closePanel=()=>{playersPanelOpen=false;playerPanel.hidden=true;playerToggle.setAttribute("aria-expanded","false");};
  playerToggle.onclick=()=>{playersPanelOpen=!playersPanelOpen;playerPanel.hidden=!playersPanelOpen;playerToggle.setAttribute("aria-expanded",String(playersPanelOpen));};
  panelHead.lastChild.onclick=closePanel;
  const exitButton=lobbyExit;if(exitButton)actions.append(exitButton);
  if(actions.childElementCount)root.append(actions);
  updateScrollButtons();
}
function cardNode(card,small){const icons={skip:"⊘",reverse:"↻",draw2:"＋2",wild:"✦",wild4:"✦＋4"},label=card?.kind==="number"?String(card.value):({skip:"Skip",reverse:"Reverse",draw2:"+2",wild:"Wild",wild4:"+4"})[card?.kind]||String(card?.value||""),display=icons[card?.kind]||label,actionIcon=!!icons[card?.kind],n=el("button","uno-card "+(card?.color||"wild")+(small?" uno-card-small":""));n.type="button";n.setAttribute("aria-label",(card?.color||"wild")+" "+label);n.append(el("span","uno-card-corner"+(actionIcon?" uno-action-icon":""),display),el("span","uno-card-center"+(actionIcon?" uno-action-icon":""),display),el("span","uno-card-color",card?.color==="wild"?"WILD":String(card?.color||"").toUpperCase()));return n;}
function sortHand(cards){const colorOrder={red:0,yellow:1,green:2,blue:3,wild:4},kindOrder={number:0,draw2:1,skip:2,reverse:3,wild:4,wild4:5};return(cards||[]).slice().sort((a,b)=>{const colorDiff=(colorOrder[a?.color]??4)-(colorOrder[b?.color]??4);if(colorDiff)return colorDiff;const kindDiff=(kindOrder[a?.kind]??6)-(kindOrder[b?.kind]??6);if(kindDiff)return kindDiff;if(a?.kind==="number"&&b?.kind==="number")return Number(a.value)-Number(b.value);return String(a?.kind||"").localeCompare(String(b?.kind||""));});}
function isCardPlayable(card,pub,hand){if(!card||!pub)return false;if(card.color==="wild"){if(card.kind==="wild4")return !(hand||[]).some(item=>item.id!==card.id&&item.color===pub.current_color);return true;}return card.color===pub.current_color||String(card.value)===String(pub.top_card?.value);}
async function play(card){const pub=state?.public_state;if(pub?.turn_user_id!==uid()){toast("It is not your turn yet.");return;}if(state?.drawn_card_id&&state.drawn_card_id!==card.id){toast("You can only play the card you just drew, or pass.");return;}if(!isCardPlayable(card,pub,state?.hand||[])){toast("That card does not match the current color or number.");return;}if(card.color==="wild"){const root=$("uno-content"),picker=el("section","uno-color-picker");picker.setAttribute("aria-label","Choose a color");picker.append(el("strong","","Choose the next color"));const choices=el("div","uno-color-choices");["red","blue","green","yellow"].forEach(color=>{const choice=el("button","uno-color-choice "+color,color);choice.type="button";choice.setAttribute("aria-label","Choose "+color);choice.onclick=()=>{picker.remove();void act("play",card.id,color);};choices.append(choice);});const cancel=el("button","outline","Cancel");cancel.type="button";cancel.onclick=()=>picker.remove();picker.append(choices,cancel);root.append(picker);return;}await act("play",card.id,null);}
async function act(action,id=null,color=null){if(busy||!activeGameId)return;busy=true;const gameId=activeGameId;try{const next=await call("gather_uno_action",{p_game_id:gameId,p_action:action,p_card_id:id,p_color:color});if(activeGameId!==gameId)return;state=next;selectedCardId=null;renderGame();}catch(e){if(activeGameId===gameId)toast(e.message||"That move could not be made.");}finally{busy=false;}}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=window.setTimeout(()=>{if(ctx&&uid())void refresh();},160);}
function refreshOnReturn(){if(!document.hidden&&navigator.onLine&&ctx&&uid())scheduleRefresh();}
function init(options){ctx=options;mount();if(!channel)channel=ctx.db.channel("gather-uno-sync").on("postgres_changes",{event:"*",schema:"public",table:"gather_multiplayer_games"},e=>{if(e.new?.game_type==="uno"||e.old?.game_type==="uno")scheduleRefresh();}).on("postgres_changes",{event:"*",schema:"public",table:"gather_multiplayer_players"},scheduleRefresh).subscribe(status=>{if(status==="SUBSCRIBED"){if(channelConnected)refreshOnReturn();channelConnected=true;}});if(!lifecycleListenersBound){document.addEventListener("visibilitychange",refreshOnReturn);window.addEventListener("focus",refreshOnReturn);window.addEventListener("pageshow",refreshOnReturn);window.addEventListener("online",refreshOnReturn);lifecycleListenersBound=true;}void refresh();}
function shutdown(){if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=null;if(lifecycleListenersBound){document.removeEventListener("visibilitychange",refreshOnReturn);window.removeEventListener("focus",refreshOnReturn);window.removeEventListener("pageshow",refreshOnReturn);window.removeEventListener("online",refreshOnReturn);lifecycleListenersBound=false;}if(channel&&ctx?.db)ctx.db.removeChannel(channel);channel=null;channelConnected=false;ctx=null;close();games=[];myGames=[];}
async function respondToRematch(offerId,accept){try{const result=await call("gather_uno_respond_rematch",{p_offer_id:offerId,p_accept:!!accept});if(result.status==="started"){toast("Everyone accepted. The rematch is starting!");activeGameId=result.game_id;await loadGame();}else if(result.status==="accepted_waiting")toast("You accepted. Waiting for the other players.");else toast("Rematch declined.");await refresh();return true;}catch(e){toast(e.message||"Could not respond to the rematch.");return false;}}
window.GatherUno={init,shutdown,open,openInvitation,openGame,refresh,respondToRematch,getLiveGames:()=>myGames.filter(x=>x.player.status==="joined"&&x.game?.status==="active").map(x=>x.game),getInvitations:()=>myGames.filter(x=>x.player.status==="invited"&&x.game?.status==="active").map(x=>x.game)};
})();