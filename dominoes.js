(() => {
"use strict";
const THEMES={cyan:"#22D3EE",purple:"#A78BFA",green:"#4ADE80",pink:"#F472B6",orange:"#FB923C",red:"#F87171"};
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=String(text);return n;};
const btn=(text,cls,fn)=>{const n=el("button",cls,text);n.type="button";n.addEventListener("click",fn);return n;};
const safeJson=s=>{try{return JSON.parse(s);}catch{return null;}};
let ctx=null,channel=null,connected=false,refreshTimer=null,lifecycle=false,busy=false;
let engineModule=null,engineModulePromise=null;
let isOpen=false,gameId=null,snapshot=null,games=[],memberships=[],spectatorIntent=false,selectedTile=null,handOrder=[],audio=null,lastWinSound=null,suppressTileClickUntil=0;
let prefs={theme:"cyan",pip:"classic",border:"glow",largeTiles:false,highContrast:false,reducedMotion:false,soundVolume:35};
const uid=()=>ctx?.user?.()?.id||null, profiles=()=>ctx?.profiles?.()||{}, toast=m=>ctx?.toast?.(m);
const name=id=>profiles()[id]?.display_name?.trim()||profiles()[id]?.username?.trim()||"Gather player";
const game=()=>snapshot?.game||{}, state=()=>game().state||{}, me=()=>snapshot?.players?.find(p=>p.user_id===uid())||null;
const isHost=()=>game().created_by===uid(), isJoined=()=>me()?.status==="joined", isSpectator=()=>me()?.status==="spectating";
const joined=()=>snapshot?.players?.filter(p=>p.status==="joined")||[], invited=()=>snapshot?.players?.filter(p=>p.status==="invited")||[];
const currentTurn=()=>state().turn_user_id, prefKey=()=>"gather-dominoes-prefs:"+uid();
function loadPrefs(){prefs={...prefs,...(safeJson(localStorage.getItem(prefKey()))||{})};if(!THEMES[prefs.theme])prefs.theme="cyan";prefs.soundVolume=Math.max(0,Math.min(100,Number(prefs.soundVolume)||0));}
function savePrefs(){try{localStorage.setItem(prefKey(),JSON.stringify(prefs));}catch{}}
function applyPrefs(){const root=$("dominoes-overlay");if(!root)return;root.style.setProperty("--domino-accent",THEMES[prefs.theme]);root.classList.toggle("dominoes-large-tiles",!!prefs.largeTiles);root.classList.toggle("dominoes-high-contrast",!!prefs.highContrast);root.classList.toggle("dominoes-reduced-motion",!!prefs.reducedMotion);root.dataset.pipStyle=prefs.pip;root.dataset.borderStyle=prefs.border;}
function sound(type){if(prefs.soundVolume<=0||prefs.reducedMotion||!(window.AudioContext||window.webkitAudioContext))return;try{const A=window.AudioContext||window.webkitAudioContext;audio||=new A();if(audio.state==="suspended")void audio.resume();const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime,f={tile:520,draw:360,turn:660,win:820}[type]||520;o.type="sine";o.frequency.setValueAtTime(f,t);if(type==="win")o.frequency.exponentialRampToValueAtTime(1200,t+.24);g.gain.setValueAtTime(Math.min(.15,prefs.soundVolume/650),t);g.gain.exponentialRampToValueAtTime(.001,t+(type==="win"?.24:.08));o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+(type==="win"?.24:.08));}catch{}}
function mount(){if($("dominoes-overlay"))return;const overlay=el("div","overlay dominoes-overlay");overlay.id="dominoes-overlay";overlay.hidden=true;overlay.innerHTML='<section class="modal dominoes-modal" role="dialog" aria-modal="true" aria-labelledby="dominoes-title"><button class="close dominoes-close" id="dominoes-close" type="button" aria-label="Close Dominoes">×</button><div id="dominoes-content"></div></section>';document.body.append(overlay);$("dominoes-close").onclick=close;overlay.addEventListener("click",e=>{if(e.target===overlay)close();});}
function init(options){ctx=options;loadPrefs();mount();applyPrefs();if(!channel){channel=ctx.db.channel("gather-dominoes-"+(uid()||"member")).on("postgres_changes",{event:"*",schema:"public",table:"gather_multiplayer_games"},()=>scheduleRefresh()).on("postgres_changes",{event:"*",schema:"public",table:"gather_multiplayer_players"},()=>scheduleRefresh()).subscribe(s=>{if(s==="SUBSCRIBED"){if(connected)refreshOnReturn();connected=true;}});}if(!lifecycle){document.addEventListener("visibilitychange",refreshOnReturn);window.addEventListener("focus",refreshOnReturn);window.addEventListener("pageshow",refreshOnReturn);window.addEventListener("online",refreshOnReturn);window.addEventListener("offline",networkNotice);lifecycle=true;}void refresh();}
async function ensureEngineModule(){
  if(engineModule)return engineModule;
  if(!engineModulePromise){
    engineModulePromise=import("./games/modules/dominoes/index.mjs").then(({createDominoesModule})=>{
      const result=createDominoesModule({
        db:ctx.db,
        getViewerId:uid,
        onSnapshot:loaded=>{
          if(!isOpen||!gameId||loaded?.game?.id!==gameId)return;
          acceptLoadedSnapshot(loaded);
        }
      });
      engineModule=result.module;
      return engineModule;
    }).catch(error=>{engineModulePromise=null;throw error;});
  }
  return engineModulePromise;
}
function acceptLoadedSnapshot(loaded,shouldRender=true){
  const previous=currentTurn();
  snapshot=loaded;
  const ids=(snapshot.your_hand||[]).map(t=>t.id);
  handOrder=[...handOrder.filter(x=>ids.includes(x)),...ids.filter(x=>!handOrder.includes(x))];
  if(previous&&previous!==currentTurn()&&currentTurn()===uid())sound("turn");
  if(shouldRender&&isOpen){renderGame();if(state().phase==="playing"&&isJoined())showTutorialOnce();}
}
async function startEngineWatch(id){
  try{
    const module=await ensureEngineModule();
    if(gameId===id&&isOpen)await module.mount({matchId:id,onError:error=>setStatus(error?.message||"The match could not be synchronized.",true)});
  }catch(error){setStatus(error?.message||"The shared game engine could not be loaded.",true);}
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(!gameId&&ctx&&uid())void refresh();},230);}
function refreshOnReturn(){if(!document.hidden&&navigator.onLine&&ctx&&uid())scheduleRefresh();}
async function refresh(){if(!ctx||!uid())return;const r=await ctx.db.from("gather_multiplayer_players").select("game_id,user_id,status,joined_at,gather_multiplayer_games!inner(id,conversation_id,game_type,status,created_by,join_mode,settings,state,revision,created_at,updated_at)").eq("user_id",uid()).in("status",["joined","invited","spectating","left"]).eq("gather_multiplayer_games.game_type","dominoes").order("updated_at",{ascending:false,foreignTable:"gather_multiplayer_games"}).limit(80);if(r.error){if(isOpen)setStatus(r.error.message,true);return;}memberships=r.data||[];const map=new Map();memberships.forEach(x=>{if(x.gather_multiplayer_games)map.set(x.game_id,x.gather_multiplayer_games);});games=[...map.values()].sort((a,b)=>new Date(b.updated_at||b.created_at)-new Date(a.updated_at||a.created_at));ctx.onGamesUpdated?.();if(gameId)await loadGame();else if(isOpen)renderList();}
async function loadGame(){if(!ctx||!gameId)return;const id=gameId;try{const module=await ensureEngineModule();const loaded=await module.load(id);if(gameId!==id)return;acceptLoadedSnapshot(loaded);}catch(error){if(gameId===id)setStatus(error?.message||"This Dominoes game could not be loaded.",true);}}
function openGame(id){if(!ctx||!uid())return;engineModule?.unmount?.();mount();isOpen=true;gameId=id;snapshot=null;spectatorIntent=false;$("dominoes-overlay").hidden=false;applyPrefs();void loadGame();void startEngineWatch(id);}
function openInvitation(id,asSpectator=false){if(!ctx||!uid())return;engineModule?.unmount?.();mount();isOpen=true;gameId=id;snapshot=null;spectatorIntent=!!asSpectator;$("dominoes-overlay").hidden=false;applyPrefs();void loadGame();void startEngineWatch(id);void (async()=>{await loadGame();if(spectatorIntent&&me()?.status==="invited")await doSpectate();})();}
function launch(){if(!ctx||!uid()){toast("Sign in to play Dominoes.");return;}mount();isOpen=true;gameId=null;snapshot=null;spectatorIntent=false;$("dominoes-overlay").hidden=false;applyPrefs();renderList();void refresh();}
function close(){isOpen=false;engineModule?.unmount?.();gameId=null;snapshot=null;selectedTile=null;handOrder=[];if($("dominoes-overlay"))$("dominoes-overlay").hidden=true;if(audio?.state==="running")void audio.suspend();}
function shutdown(){clearTimeout(refreshTimer);refreshTimer=null;if(lifecycle){document.removeEventListener("visibilitychange",refreshOnReturn);window.removeEventListener("focus",refreshOnReturn);window.removeEventListener("pageshow",refreshOnReturn);window.removeEventListener("online",refreshOnReturn);window.removeEventListener("offline",networkNotice);lifecycle=false;}if(channel&&ctx?.db)ctx.db.removeChannel(channel);channel=null;connected=false;engineModule?.unmount?.();engineModule=null;engineModulePromise=null;ctx=null;close();games=[];memberships=[];}
function setStatus(m,error=false){const n=$("dominoes-status");if(n){n.textContent=m||"";n.classList.toggle("error",!!error);}else if(error)toast(m);}
function header(title,eyebrow,subtitle){const h=el("header","dominoes-header"),copy=el("div","dominoes-header-copy");copy.append(el("p","eyebrow",eyebrow));const t=el("h2","dominoes-title",title);t.id="dominoes-title";copy.append(t,el("p","dominoes-subtitle muted",subtitle));h.append(copy);const tools=el("div","dominoes-header-tools");tools.append(btn("Stats","dominoes-tool-button",stats),btn("Customize","dominoes-tool-button",settings));h.append(tools);return h;}
function renderList(){const root=$("dominoes-content");if(!root)return;root.replaceChildren();root.append(header("Dominoes","GATHER MULTIPLAYER · ARCADE TABLE","Draw, match, and score your way to the target."),btn("＋ Create Dominoes lobby","primary dominoes-create-button",createForm));const live=games.filter(g=>g.status==="active"),done=games.filter(g=>g.status==="completed"),sec=el("section","dominoes-section");sec.append(el("h3","dominoes-section-title","Your lobbies and invitations"));if(!live.length)sec.append(el("p","dominoes-empty muted","No Dominoes lobbies yet. Create one and invite people from Gather."));live.forEach(g=>{const row=el("article","dominoes-lobby-card"),copy=el("div","dominoes-lobby-copy");copy.append(el("strong","",g.settings?.preset==="quick"?"Quick Dominoes":g.settings?.preset==="marathon"?"Marathon Dominoes":"Draw Dominoes"),el("small","muted",(g.settings?.mode==="teams"?"Teams":"Free-for-all")+" · "+(g.state?.phase==="playing"?name(g.state.turn_user_id)+"'s turn":g.state?.phase||"Lobby")));row.append(copy,btn("Open","outline",()=>openGame(g.id)));sec.append(row);});root.append(sec);if(done.length){const h=el("section","dominoes-section");h.append(el("h3","dominoes-section-title","Completed matches"));done.slice(0,8).forEach(g=>{const row=el("article","dominoes-lobby-card");row.append(el("div","dominoes-lobby-copy","Dominoes · "+(g.state?.winner_id?name(g.state.winner_id)+" won":"Match ended")),btn("View result","outline",()=>openGame(g.id)));h.append(row);});root.append(h);}applyPrefs();}
function field(label,control){const l=el("label","dominoes-field");l.append(el("span","",label),control);return l;}
function createForm(){const root=$("dominoes-content");root.replaceChildren();root.append(header("Set up your table","NEW DOMINOES LOBBY","Invite 1–3 players. Team partners sit opposite each other."));const form=el("form","dominoes-form"),selected=[],choose=btn("Choose people","outline"),summary=el("small","muted","No players selected"),picker=el("section","dominoes-picker");picker.append(choose,summary);form.append(picker);const mode=el("select");[["free_for_all","Free-for-all"],["teams","Teams · 4 players"]].forEach(([v,t])=>{const o=el("option","",t);o.value=v;mode.append(o);});form.append(field("Match mode",mode));const preset=el("select");[["quick","Quick · 50 points"],["classic","Classic · 100 points"],["marathon","Marathon · 150 points"]].forEach(([v,t])=>{const o=el("option","",t);o.value=v;if(v==="classic")o.selected=true;preset.append(o);});form.append(field("Rule preset",preset),el("p","dominoes-hint","Seven tiles each · untimed turns · draw until playable."));mode.onchange=()=>{form.querySelector(".dominoes-hint").textContent=mode.value==="teams"?"Team mode needs exactly four players. Invite three people for two opposing pairs.":"Seven tiles each · untimed turns · draw until playable.";};const actions=el("div","dominoes-actions");actions.append(btn("Back","secondary-action",renderList));const submit=btn("Create lobby","primary");submit.type="submit";actions.append(submit);form.append(actions);form.onsubmit=async e=>{e.preventDefault();if(busy)return;if(!selected.length||selected.length>3||(mode.value==="teams"&&selected.length!==3)){toast(mode.value==="teams"?"Choose exactly three people for team mode.":"Choose one to three people to invite.");return;}busy=true;submit.disabled=true;try{const module=await ensureEngineModule();const created=await module.create({joinMode:"invite",invitedUserIds:selected,playerLimit:4,mode:mode.value,preset:preset.value});gameId=created.matchId;await loadGame();void startEngineWatch(gameId);await refresh();}catch(err){toast(err.message||"Could not create the Dominoes lobby.");}finally{busy=false;submit.disabled=false;}};root.append(form);window.GatherPeoplePicker?.create({db:ctx.db,button:choose,summary,maxSelected:3,onChange:ids=>selected.splice(0,selected.length,...ids)});applyPrefs();}
async function rpc(fn,args){
  if(busy||!ctx)return null;
  busy=true;
  try{
    let result;
    let sharedLifecycle=false;
    const module=await ensureEngineModule();
    if(fn==="gather_dominoes_join"){sharedLifecycle=true;result=await module.join(args.p_game_id,args.p_color);}
    else if(fn==="gather_dominoes_ready"){sharedLifecycle=true;result=await module.setReady(args.p_game_id,args.p_ready);}
    else if(fn==="gather_dominoes_start"){sharedLifecycle=true;result=await module.start(args.p_game_id);}
    else if(fn==="gather_dominoes_spectate"){sharedLifecycle=true;result=await module.spectate(args.p_game_id);}
    else if(fn==="gather_dominoes_end"){sharedLifecycle=true;result=await module.end(args.p_game_id);}
    else if(fn==="gather_dominoes_leave"){
      sharedLifecycle=true;
      result=me()?.status==="invited"
        ? await module.decline(args.p_game_id)
        : await module.leave(args.p_game_id);
    }else{
      const response=await ctx.db.rpc(fn,args);
      if(response.error)throw response.error;
      result=response.data;
    }
    await refresh();
    if(!sharedLifecycle)return result;
    return result&&typeof result==="object"&&Object.hasOwn(result,"result")?result.result:true;
  }catch(e){
    toast(e.message||"That Dominoes action could not be completed.");
    await loadGame();
    return null;
  }finally{busy=false;}
}
async function markNotice(kind){await ctx.db.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",uid()).eq("kind",kind).eq("body",gameId).is("read_at",null);}
async function join(){if(await rpc("gather_dominoes_join",{p_game_id:gameId,p_color:THEMES[prefs.theme]}))await markNotice("dominoes_invite");}
async function doSpectate(){if(await rpc("gather_dominoes_spectate",{p_game_id:gameId}))await markNotice("dominoes_spectate");}
function renderGame(){const root=$("dominoes-content");if(!root||!snapshot)return;root.replaceChildren();const g=game(),s=state(),m=me(),phase=s.phase||"lobby";root.append(header(s.started?"Dominoes match":"Dominoes lobby",s.started?"ARCADE TABLE · IN PROGRESS":"WAITING ROOM",(g.settings?.mode==="teams"?"Team match":"Free-for-all")+" · first to "+(s.target_score||g.settings?.target_score||100)));if(["joined","spectating"].includes(m?.status))window.GatherGameChat?.attach(root,ctx.db,"dominoes",g.id,uid(),name);if(phase==="paused"){paused(root);applyPrefs();return;}if(phase==="recap"){recap(root);applyPrefs();return;}if(phase==="finished"||g.status==="completed"){finished(root);applyPrefs();return;}if(phase==="lobby"||!s.started){
  const lobbyPlayers=(snapshot.players||[]).filter(player=>["joined","invited","spectating"].includes(player.status));
  window.GatherSharedLobby?.render({
    root,gameName:"Dominoes",game:g,players:lobbyPlayers,viewerId:uid(),getName:name,
    settingsSummary:"Two players · free-for-all · seven tiles each · first to "+(s.target_score||g.settings?.target_score||100)+" points",
    onJoin:()=>join(),
    onDecline:async()=>{await rpc("gather_dominoes_leave",{p_game_id:g.id});await refresh();},
    onReady:async()=>{await rpc("gather_dominoes_ready",{p_game_id:g.id,p_ready:!m?.ready});await loadGame();},
    onStart:async()=>{await rpc("gather_dominoes_start",{p_game_id:g.id});await loadGame();},
    onCancel:()=>end(),
    onLeave:()=>leave()
  });
  if(m?.status==="joined")window.GatherGameChat?.attach(root,ctx.db,"dominoes",g.id,uid(),name);
  applyPrefs();return;
}if(phase==="playing"){scoreboard(root);seats(root);board(root);boneyard(root);hand(root);history(root);if(isHost())root.append(btn("End match","secondary-action dominoes-end-match",end));root.append(btn("Leave match","outline dominoes-leave-match",leave));networkNotice();applyPrefs();}}
function roster(root){const box=el("section","dominoes-roster");box.append(el("h3","dominoes-section-title","Players · "+joined().length+"/4"));[...joined(),...invited(),...(snapshot.players||[]).filter(p=>p.status==="spectating")].forEach(p=>{const row=el("div","dominoes-roster-row"),sw=el("span","dominoes-player-swatch");sw.style.background=p.color||"var(--domino-accent)";const copy=el("div","dominoes-player-copy");copy.append(el("strong","",name(p.user_id)+(p.user_id===uid()?" (you)":"")),el("small","muted",p.status==="invited"?"Invited":p.status==="spectating"?"Spectator":p.ready?"Ready":"Not ready"));row.append(sw,copy);if(p.user_id===game().created_by)row.append(el("span","dominoes-host-pill","HOST"));box.append(row);});root.append(box);}
function scoreboard(root){const s=state(),scores=s.scores||{},box=el("section","dominoes-scoreboard");box.append(el("div","dominoes-scoreboard-heading","SCOREBOARD"));if(s.mode==="teams"){["team_a","team_b"].forEach(t=>{const r=el("div","dominoes-score-row");r.append(el("span","",t==="team_a"?"Team A":"Team B"),el("strong","",Number(scores[t]||0)+" / "+(s.target_score||100)));box.append(r);});}else(s.turn_order||[]).forEach(id=>{const r=el("div","dominoes-score-row");r.append(el("span","",name(id)),el("strong","",Number(scores[id]||0)+" / "+(s.target_score||100)));box.append(r);});root.append(box);}
function seats(root){const s=state(),box=el("section","dominoes-seats");(s.seat_order||s.turn_order||[]).forEach((id,i)=>{const p=(snapshot.players||[]).find(x=>x.user_id===id);if(!p)return;const row=el("div","dominoes-seat"+(id===currentTurn()?" is-turn":"")+(id===uid()?" is-you":""));row.dataset.seat=String(i);row.append(el("span","dominoes-seat-dot"),el("strong","",name(id)+(id===uid()?" · You":"")),el("small","",(s.mode==="teams"?(s.teams?.[id]==="team_a"?"Team A":"Team B"):"Player")+" · "+(s.tile_counts?.[id]??0)+" tiles"));if(id===currentTurn())row.append(el("em","","YOUR TURN"));box.append(row);});root.append(box);}
function tileNode(t){const node=el("span","dominoes-tile"+(t.a===t.b?" is-double":""));node.setAttribute("aria-label",t.a+" and "+t.b);[Number(t.a),Number(t.b)].forEach(v=>{const half=el("span","dominoes-half"),spots={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}[v]||[];for(let i=0;i<9;i++){const pip=el("i","dominoes-pip"+(spots.includes(i)?" is-on":""));pip.style.gridArea=(Math.floor(i/3)+1)+" / "+(i%3+1);if(prefs.pip==="star"&&spots.includes(i)){pip.textContent="✦";pip.classList.add("is-star");}half.append(pip);}node.append(half);});return node;}
function playable(t,s=state()){if(!(s.chain||[]).length)return true;return [s.left_end,s.right_end].some(v=>Number(t.a)===Number(v)||Number(t.b)===Number(v));}
function fits(t,end,s=state()){if(!(s.chain||[]).length)return end==="start";const n=Number(end==="left"?s.left_end:s.right_end);return Number(t.a)===n||Number(t.b)===n;}
function board(root){
  const s=state(),wrap=el("section","dominoes-table");
  wrap.append(el("div","dominoes-table-label","TABLE · ROUND "+s.round));
  const ends=el("div","dominoes-board-ends");
  const addDrop=(target,side)=>{
    target.addEventListener("dragover",event=>{event.preventDefault();target.classList.add("is-drop-target");});
    target.addEventListener("dragleave",()=>target.classList.remove("is-drop-target"));
    target.addEventListener("drop",event=>{
      event.preventDefault();target.classList.remove("is-drop-target");
      const tileId=event.dataTransfer?.getData("text/domino-tile");
      if(tileId){selectedTile=tileId;void place(side);}
    });
  };
  if(!(s.chain||[]).length){
    const first=btn("Place first tile","dominoes-end-target is-start",()=>place("start"));
    addDrop(first,"start");ends.append(first);
  }else{
    const chosen=(snapshot.your_hand||[]).find(t=>t.id===selectedTile),leftOK=!!chosen&&fits(chosen,"left"),rightOK=!!chosen&&fits(chosen,"right");
    const l=btn("← "+s.left_end,"dominoes-end-target left"+(leftOK?" is-highlighted":""),()=>place("left"));
    const r=btn(s.right_end+" →","dominoes-end-target right"+(rightOK?" is-highlighted":""),()=>place("right"));
    l.disabled=!!chosen&&!leftOK;r.disabled=!!chosen&&!rightOK;addDrop(l,"left");addDrop(r,"right");ends.append(l,r);
  }
  const viewport=el("div","dominoes-board-viewport");
  viewport.setAttribute("role","region");viewport.setAttribute("aria-label","Scrollable Dominoes playing board");viewport.tabIndex=0;
  const chain=el("div","dominoes-chain"),tiles=s.chain||[];
  let row=0,col=0,dir=1,inRow=0,turnNext=false,maxRow=0;
  const positions=[];
  tiles.forEach((tile,index)=>{
    if(turnNext){
      positions.push({tile,index,col,row,vertical:true});maxRow=Math.max(maxRow,row);
      row++;dir*=-1;col+=dir;inRow=0;turnNext=false;
    }else{
      positions.push({tile,index,col,row,vertical:false});maxRow=Math.max(maxRow,row);
      inRow++;if(inRow>=8)turnNext=true;else col+=dir;
    }
  });
  chain.style.width=(8*78+70)+"px";chain.style.height=((maxRow+1)*84+34)+"px";
  positions.forEach(({tile,index,col,row,vertical})=>{
    const item=el("div","dominoes-board-tile"+(vertical?" is-turn-tile":""));
    item.append(tileNode({a:tile.left,b:tile.right}));item.title="Tile "+(index+1);
    item.style.left=(col*78+(vertical?18:0))+"px";
    item.style.top=(row*84+(vertical?24:0))+"px";chain.append(item);
  });
  if(!tiles.length)chain.append(el("p","dominoes-empty","The first tile starts the chain."));
  viewport.append(chain);
  wrap.append(ends,el("p","dominoes-board-help","Follow the chain as it winds across the table. Scroll or swipe in either direction to explore the full board."),viewport);
  if(selectedTile){
    const chosen=(snapshot.your_hand||[]).find(t=>t.id===selectedTile),preview=el("div","dominoes-preview");
    preview.append(el("span","","Preview · "+(chosen?chosen.a+" | "+chosen.b+" · choose a glowing end":"selected tile")));
    if(chosen)preview.append(tileNode(chosen));wrap.append(preview);
  }
  root.append(wrap);
}
function boneyard(root){const s=state(),box=el("section","dominoes-boneyard"),stack=el("div","dominoes-boneyard-stack");for(let i=0;i<Math.min(4,Number(s.boneyard_count)||0);i++)stack.append(el("span","dominoes-boneyard-tile"));const copy=el("div","dominoes-boneyard-copy");copy.append(el("strong","","Boneyard"),el("small","muted",(s.boneyard_count||0)+" tiles remaining"));box.append(stack,copy);const hand=snapshot.your_hand||[],can=isJoined()&&currentTurn()===uid(),has=hand.some(t=>playable(t,s)),draw=btn("Draw until playable","primary dominoes-draw",drawUntilPlayable);draw.disabled=!can||Number(s.boneyard_count||0)===0;draw.title=!can?"Only the player whose turn it is can draw.":Number(s.boneyard_count||0)===0?"The boneyard is empty.":has?"You already have a playable tile.": "Draw one tile at a time until a playable tile appears.";box.append(draw);if(can&&!has&&!Number(s.boneyard_count||0))box.append(btn("Pass turn","outline",()=>action("pass")));root.append(box);}
function hand(root){const h=snapshot.your_hand||[],sec=el("section","dominoes-hand-section"),head=el("div","dominoes-hand-heading");head.append(el("strong","",isSpectator()?"Spectator view":"Your hand"),el("small","muted",isSpectator()?"Private tiles hidden":h.length+" tiles"));sec.append(head);if(!isJoined()){sec.append(el("p","dominoes-empty","Spectators never receive player hands."));root.append(sec);return;}const strip=el("div","dominoes-hand");handOrder.map(id=>h.find(t=>t.id===id)).filter(Boolean).forEach(t=>{const c=btn("","dominoes-hand-tile"+(playable(t)?" is-playable":"")+(selectedTile===t.id?" is-selected":""),()=>{if(Date.now()<suppressTileClickUntil)return;selectedTile=selectedTile===t.id?null:t.id;sound("tile");renderGame();});c.draggable=false;c.append(tileNode(t));c.setAttribute("aria-label","Tile "+t.a+" and "+t.b);c.dataset.tileId=t.id;let pointerStart=null;c.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;pointerStart={id:e.pointerId,x:e.clientX,y:e.clientY,dragging:false};try{c.setPointerCapture(e.pointerId);}catch{};});c.addEventListener("pointermove",e=>{if(!pointerStart||pointerStart.id!==e.pointerId)return;if(!pointerStart.dragging&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>8){pointerStart.dragging=true;c.classList.add("is-dragging");}if(pointerStart.dragging)e.preventDefault();});c.addEventListener("pointerup",e=>{if(!pointerStart||pointerStart.id!==e.pointerId)return;const drag=pointerStart.dragging;pointerStart=null;c.classList.remove("is-dragging");if(!drag)return;suppressTileClickUntil=Date.now()+500;const target=document.elementFromPoint(e.clientX,e.clientY),endTarget=target?.closest?.(".dominoes-end-target"),handTarget=target?.closest?.(".dominoes-hand-tile");if(endTarget&&!endTarget.disabled){const side=endTarget.classList.contains("is-start")?"start":endTarget.classList.contains("left")?"left":"right";selectedTile=t.id;void place(side);return;}if(handTarget&&handTarget!==c){const from=handOrder.indexOf(t.id),to=handOrder.indexOf(handTarget.dataset.tileId);if(from>=0&&to>=0){handOrder.splice(from,1);handOrder.splice(to,0,t.id);renderGame();return;}}selectedTile=t.id;sound("tile");renderGame();});c.addEventListener("pointercancel",()=>{pointerStart=null;c.classList.remove("is-dragging");});strip.append(c);});sec.append(strip,el("small","dominoes-hand-help muted","Tap a glowing tile, then choose a board end. Drag to rearrange your hand."));root.append(sec);}
async function place(end){if(!selectedTile){toast("Select a tile first.");return;}const t=(snapshot.your_hand||[]).find(x=>x.id===selectedTile);if(!t||!fits(t,end)){toast("That tile does not match this end.");return;}const id=selectedTile;selectedTile=null;await action("play",id,end);}
async function action(kind,tileId=null,end=null){if(busy||!gameId)return;busy=true;const id=gameId;try{const r=await ctx.db.rpc("gather_dominoes_action",{p_game_id:id,p_action:kind,p_tile_id:tileId,p_end:end});if(r.error)throw r.error;sound(kind==="play"?"tile":kind==="draw"?"draw":"turn");await loadGame();}catch(e){toast(e.message||"That move could not be made.");await loadGame();}finally{busy=false;}}
async function drawUntilPlayable(){
  if(busy){toast("A Dominoes move is already processing. Please wait a moment.");return;}
  if(!gameId){toast("Open a Dominoes match first.");return;}
  if(!isJoined()||currentTurn()!==uid()){toast("You can only draw on your turn.");return;}
  if((snapshot?.your_hand||[]).some(t=>playable(t))){toast("You already have a playable tile. Place it to continue.");return;}
  busy=true;
  const id=gameId;
  let draws=0;
  try{
    while(gameId===id&&draws<28){
      const before=state();
      if(before.phase!=="playing"||before.turn_user_id!==uid())break;
      if(Number(before.boneyard_count||0)<=0)break;
      const drawResult=await ctx.db.rpc("gather_dominoes_action",{
        p_game_id:id,p_action:"draw",p_tile_id:null,p_end:null
      });
      if(drawResult.error)throw drawResult.error;
      draws++;
      const module=await ensureEngineModule();
      const updatedSnapshot=await module.load(id);
      if(gameId!==id)return;
      if(!updatedSnapshot?.game?.state||!Array.isArray(updatedSnapshot.your_hand)){
        throw new Error("The updated hand could not be loaded. Please try again.");
      }
      acceptLoadedSnapshot(updatedSnapshot,false);
      const after=state();
      if(after.phase!=="playing"||after.turn_user_id!==uid())break;
      if((snapshot.your_hand||[]).some(t=>playable(t,after)))break;
      if(Number(after.boneyard_count||0)<=0)break;
    }
    if(gameId===id){
      sound("draw");
      renderGame();
      const handNow=snapshot?.your_hand||[];
      if(handNow.some(t=>playable(t)))toast(draws===1?"You drew a playable tile.":"You drew until you had a playable tile.");
      else if(draws>0)toast("The boneyard is empty. Your turn will pass.");
      else toast("There are no tiles left to draw.");
    }
  }catch(e){
    toast(e?.message||"The boneyard could not be drawn.");
    if(gameId===id)await loadGame();
  }finally{busy=false;}
}

function history(root){const d=el("details","dominoes-history"),moves=state().move_history||[];d.append(el("summary","","Move history · "+moves.length));const list=el("ol","dominoes-history-list");moves.slice(-30).forEach(x=>list.append(el("li","",x.action==="play"?name(x.player_id)+" played "+x.tile+" on "+x.end+".":x.action==="draw"?name(x.player_id)+" drew a tile.":name(x.player_id)+" passed.")));d.append(list);root.append(d);}
function recap(root){const s=state(),r=s.last_round||{},p=el("section","dominoes-recap");p.append(el("p","eyebrow","ROUND "+(r.round||s.round)+" COMPLETE"),el("h3","dominoes-victory-title",r.winner_team?r.winner_team.replace("_"," ").toUpperCase()+" wins":r.winner_id?name(r.winner_id)+" wins":"Round tied"),el("p","dominoes-round-points","+"+(r.points||0)+" points"));scoreboard(p);const h=el("div","dominoes-round-history");h.append(el("strong","","Round history"));(s.round_history||[]).slice(-6).forEach(x=>h.append(el("p","muted","Round "+x.round+" · "+(x.winner_team||name(x.winner_id)||"Tie")+" · "+x.points+" points")));p.append(h);root.append(p);const a=el("div","dominoes-actions");a.append(btn("Continue","primary",()=>rpc("gather_dominoes_continue_round",{p_game_id:game().id})));if(isHost())a.append(btn("End match","secondary-action",end));root.append(a);}
function finished(root){const s=state(),p=el("section","dominoes-finished");p.append(el("div","dominoes-trophy","✦"),el("p","eyebrow","MATCH COMPLETE"),el("h3","dominoes-victory-title",s.winner_team?s.winner_team.replace("_"," ").toUpperCase()+" wins!":s.winner_id?name(s.winner_id)+" wins!":"Match ended"),el("p","muted","Final scoreboard"));scoreboard(p);root.append(p);const a=el("div","dominoes-actions");if(isHost())a.append(btn("Rematch","primary",rematch));a.append(btn("Return to Games","outline",close));root.append(a);const historyBox=el("details","dominoes-history");historyBox.append(el("summary","","Full match history"));const rounds=el("section","dominoes-round-history");rounds.append(el("strong","","Round results"));(s.round_history||[]).forEach(x=>rounds.append(el("p","", "Round "+x.round+" · "+(x.winner_team||name(x.winner_id)||"Tie")+" · "+x.points+" points")));historyBox.append(rounds);const moves=el("ol","dominoes-history-list");(s.move_history||[]).slice(-100).forEach(x=>moves.append(el("li","",x.action==="play"?name(x.player_id)+" played "+x.tile+" on "+x.end+".":x.action==="draw"?name(x.player_id)+" drew a tile.":name(x.player_id)+" passed.")));historyBox.append(el("strong","","Move history"),moves);root.append(historyBox);const h=el("details","dominoes-history");h.append(el("summary","","Achievements"));const labels={first_match:"First match",first_win:"First win",ten_matches:"10 matches",ten_wins:"10 wins",century_points:"100 points earned",team_victory:"Team victory"};void ctx.db.from("gather_dominoes_achievements").select("achievement_key").eq("user_id",uid()).then(r=>(r.data||[]).forEach(x=>h.append(el("p","",labels[x.achievement_key]||x.achievement_key))));root.append(h);if(lastWinSound!==game().id){lastWinSound=game().id;sound("win");}}
function paused(root){const s=state(),p=el("section","dominoes-paused");p.append(el("p","eyebrow","MATCH PAUSED"),el("h3","","Waiting for "+name(s.departed_user_id)+" to reconnect"),el("p","muted","Scores, turns, and hands are preserved."));if(isHost()){p.append(btn("Wait for player","primary",()=>rpc("gather_dominoes_resolve_departure",{p_game_id:game().id,p_action:"wait",p_replacement_user_id:null})),btn("End match","secondary-action",()=>rpc("gather_dominoes_resolve_departure",{p_game_id:game().id,p_action:"end",p_replacement_user_id:null})));const chosen=[],choose=btn("Choose replacement","outline"),summary=el("small","muted","No replacement selected");p.append(choose,summary);choose.onclick=()=>window.GatherPeoplePicker?.create({db:ctx.db,button:choose,summary,maxSelected:1,onChange:ids=>chosen.splice(0,chosen.length,...ids)});p.append(btn("Continue with replacement","primary",()=>chosen[0]?rpc("gather_dominoes_resolve_departure",{p_game_id:game().id,p_action:"replace",p_replacement_user_id:chosen[0]}):toast("Choose a replacement player first.")));}else p.append(el("p","muted","The host can wait, end the match, or invite a replacement."));root.append(p);}
async function leave(){if(!confirm("Leave this Dominoes game? The host will decide whether to wait, end, or replace you."))return;const ok=await rpc("gather_dominoes_leave",{p_game_id:gameId});if(ok)toast("You left the table.");}
async function end(){if(!isHost()||!confirm("End this Dominoes match for everyone?"))return;const ok=await rpc("gather_dominoes_end",{p_game_id:gameId});if(ok)toast("Dominoes match ended.");}
async function rematch(){
  if(busy)return;
  const ids=joined().map(p=>p.user_id).filter(id=>id!==uid());
  if(!ids.length){toast("Invite players to start a rematch.");return;}
  busy=true;
  try{
    const module=await ensureEngineModule();
    const created=await module.create({joinMode:"invite",invitedUserIds:ids,playerLimit:Math.min(4,ids.length+1),mode:state().mode,preset:game().settings?.preset||"classic"});
    engineModule?.unmount?.();
    gameId=created.matchId;
    await loadGame();
    void startEngineWatch(gameId);
    await refresh();
  }catch(error){toast(error?.message||"The Dominoes rematch could not be created.");}
  finally{busy=false;}
}
function inviteSpectators(){const root=$("dominoes-content");root.replaceChildren(header("Invite spectators","WATCH THE TABLE","Spectators can watch but never see private hands."));const selected=[],choose=btn("Choose people","outline"),summary=el("small","muted","No spectators selected"),picker=el("section","dominoes-picker");picker.append(choose,summary);choose.onclick=()=>window.GatherPeoplePicker?.create({db:ctx.db,button:choose,summary,maxSelected:20,onChange:ids=>selected.splice(0,selected.length,...ids)});root.append(picker,btn("Send invitations","primary",async()=>{if(!selected.length){toast("Choose at least one spectator.");return;}const r=await ctx.db.rpc("gather_dominoes_invite_spectators",{p_game_id:game().id,p_user_ids:selected});if(r.error){toast(r.error.message);return;}toast("Spectator invitations sent.");await loadGame();}),btn("Back","outline",renderGame));}
function settings(){const root=$("dominoes-content");root.replaceChildren();root.append(header("Customize your table","YOUR DOMINOES","Preferences are saved for your account on this device."));const form=el("form","dominoes-form"),theme=el("select");Object.keys(THEMES).forEach(k=>{const o=el("option","",k[0].toUpperCase()+k.slice(1));o.value=k;o.selected=prefs.theme===k;theme.append(o);});form.append(field("Tile theme",theme));const pip=el("select");["classic","square","star"].forEach(k=>{const o=el("option","",k+" pips");o.value=k;o.selected=prefs.pip===k;pip.append(o);});form.append(field("Pip style",pip));const border=el("select");["glow","solid","dotted"].forEach(k=>{const o=el("option","",k+" border");o.value=k;o.selected=prefs.border===k;border.append(o);});form.append(field("Tile border",border));const large=el("input");large.type="checkbox";large.checked=prefs.largeTiles;form.append(field("Larger tiles",large));const contrast=el("input");contrast.type="checkbox";contrast.checked=prefs.highContrast;form.append(field("High contrast",contrast));const reduced=el("input");reduced.type="checkbox";reduced.checked=prefs.reducedMotion;form.append(field("Reduced motion",reduced));const volume=el("input");volume.type="range";volume.min=0;volume.max=100;volume.step=5;volume.value=prefs.soundVolume;form.append(field("Sound volume",volume));const a=el("div","dominoes-actions");a.append(btn("Back","secondary-action",()=>gameId?loadGame():renderList()));const save=btn("Save preferences","primary");save.type="submit";a.append(save);form.append(a);form.onsubmit=e=>{e.preventDefault();prefs={theme:theme.value,pip:pip.value,border:border.value,largeTiles:large.checked,highContrast:contrast.checked,reducedMotion:reduced.checked,soundVolume:Number(volume.value)};savePrefs();applyPrefs();toast("Dominoes preferences saved.");gameId?renderGame():renderList();};root.append(form);applyPrefs();}
async function stats(){const root=$("dominoes-content");root.replaceChildren();root.append(header("Player statistics","YOUR PROGRESS","Match totals, achievements, and Gather rankings."));const tabs=el("div","dominoes-stats-tabs");tabs.append(btn("My stats","primary",stats),btn("Friends","outline",()=>leaderboard("friends")),btn("Global","outline",()=>leaderboard("global")));root.append(tabs);const r=await ctx.db.from("gather_dominoes_stats").select("matches_played,wins,losses,points_earned,team_wins").eq("user_id",uid()).maybeSingle(),s=r.data||{matches_played:0,wins:0,losses:0,points_earned:0,team_wins:0},grid=el("div","dominoes-stat-grid");[["Matches",s.matches_played],["Wins",s.wins],["Losses",s.losses],["Win rate",s.matches_played?Math.round(s.wins/s.matches_played*100)+"%":"0%"],["Points earned",s.points_earned],["Team wins",s.team_wins]].forEach(([a,b])=>{const c=el("div","dominoes-stat-card");c.append(el("small","",a),el("strong","",b));grid.append(c);});root.append(grid);const ach=await ctx.db.from("gather_dominoes_achievements").select("achievement_key").eq("user_id",uid()),box=el("section","dominoes-section");box.append(el("h3","dominoes-section-title","Achievements"));const labels={first_match:"First match",first_win:"First win",ten_matches:"10 matches",ten_wins:"10 wins",century_points:"100 points",team_victory:"Team victory"};(ach.data||[]).forEach(x=>box.append(el("span","dominoes-achievement",labels[x.achievement_key]||x.achievement_key)));if(!ach.data?.length)box.append(el("p","muted","Your achievements appear after completed matches."));root.append(box);applyPrefs();}
async function leaderboard(scope){const root=$("dominoes-content");root.replaceChildren();root.append(header(scope==="friends"?"Friends leaderboard":"Global leaderboard","GATHER RANKINGS","Wins rank first, then points earned."));const tabs=el("div","dominoes-stats-tabs");tabs.append(btn("My stats","outline",stats),btn("Friends","outline",()=>leaderboard("friends")),btn("Global","outline",()=>leaderboard("global")));root.append(tabs);const r=await ctx.db.rpc("gather_dominoes_leaderboard",{p_scope:scope});if(r.error){root.append(el("p","status error",r.error.message));return;}const box=el("div","dominoes-leaderboard");(r.data||[]).forEach((x,i)=>{const row=el("div","dominoes-leader-row"+(x.user_id===uid()?" is-you":"")),who=el("div","dominoes-leader-who");row.append(el("span","dominoes-rank","#"+(x.rank||i+1)));who.append(el("strong","",x.display_name||x.username||"Gather player"),el("small","muted",x.wins+" wins · "+x.matches_played+" matches"));row.append(who,el("strong","dominoes-leader-points",x.points_earned+" pts"));box.append(row);});if(!r.data?.length)box.append(el("p","muted","No completed matches are ranked yet."));root.append(box);applyPrefs();}
function showTutorialOnce(){const k="gather-dominoes-tutorial:"+uid();if(localStorage.getItem(k)==="done"||$("dominoes-tutorial"))return;let step=0;const items=[["Match a number","Play a tile with a number that matches either open end of the chain."],["Draw if you cannot play","Draw from the boneyard until you have a playable tile. If it is empty, pass."],["Build the chain","Select a tile, then choose the left or right end. Drag tiles to rearrange your hand."],["Score the round","Empty your hand to win. Remaining pips count toward your score. First to the target wins."]];function paint(){const old=$("dominoes-tutorial");old?.remove();const box=el("section","dominoes-tutorial");box.id="dominoes-tutorial";box.append(el("p","eyebrow","QUICK TUTORIAL · "+(step+1)+" / 4"),el("h3","",items[step][0]),el("p","muted",items[step][1]));const a=el("div","dominoes-actions");a.append(btn("Skip","outline",finish));if(step)a.append(btn("Back","secondary-action",()=>{step--;paint();}));a.append(btn(step===3?"Finish":"Next","primary",()=>{if(step===3)finish();else{step++;paint();}}));box.append(a);$("dominoes-content").append(box);}function finish(){$("dominoes-tutorial")?.remove();localStorage.setItem(k,"done");}paint();}
function networkNotice(){const root=$("dominoes-content");if(!root)return;root.querySelector(".dominoes-network-notice")?.remove();if(!navigator.onLine)root.prepend(el("p","dominoes-network-notice","Connection lost · your current turn is preserved and will refresh after reconnecting."));}
window.GatherDominoes={init,open:launch,openInvitation,openGame,refresh,shutdown,close,getLiveGames:()=>games.filter(g=>g.status==="active"&&memberships.some(m=>m.game_id===g.id&&["joined","spectating"].includes(m.status))),getInvitations:()=>games.filter(g=>g.status==="active"&&memberships.some(m=>m.game_id===g.id&&m.status==="invited"))};
})();