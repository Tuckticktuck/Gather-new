import {GatherGameRegistry,createGameModuleRegistry,createLobbyService,createSupabaseGameDrivers,createSupabaseMatchRepository} from "../../core/index.mjs";
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requiredString(value,field){if(typeof value!=="string"||!value.trim())throw new TypeError(field+" is required.");return value;}
function toViewModel(snapshot){const {match,players}=snapshot;return Object.freeze({game:Object.freeze({id:match.id,game_type:match.gameType,status:match.status,created_by:match.hostId,join_mode:match.joinMode,conversation_id:match.conversationId,settings:match.settings,state:match.state,revision:match.revision,created_at:match.createdAt,updated_at:match.updatedAt}),players:Object.freeze(players.map(p=>Object.freeze({user_id:p.userId,status:p.status,ready:p.ready,color:p.color,joined_at:p.joinedAt})))});}
/** Multiplayer Ludo shares the common match/lobby services while preserving authoritative game rules. */
export function createLudoModule(options={}) {
 const {db,getViewerId=()=>null}=options;if(!db)throw new TypeError("A Supabase client is required.");
 const repository=createSupabaseMatchRepository(db),drivers=createSupabaseGameDrivers(db);
 const lobby=createLobbyService({registry:GatherGameRegistry,drivers:drivers.byGame,repository,getViewerId});
 let activeMatchId=null,activeSync=null,mounted=false,snapshotHandler=null;
 async function load(matchId){requiredString(matchId,"matchId");if(!UUID_PATTERN.test(matchId))throw new TypeError("matchId must be a valid match UUID.");return toViewModel(await lobby.load("ludo",matchId));}
 function stopWatching(){if(activeSync)activeSync.stop();activeSync=null;activeMatchId=null;}
 const module={
  id:"ludo",apiVersion:1,
  async mount(context={}){stopWatching();mounted=true;snapshotHandler=typeof context.onSnapshot==="function"?context.onSnapshot:null;if(context.matchId){const matchId=requiredString(context.matchId,"matchId");activeMatchId=matchId;activeSync=lobby.watch("ludo",matchId,snapshot=>{if(!mounted||activeMatchId!==matchId)return;snapshotHandler?.(toViewModel(snapshot),{source:"realtime",gameId:"ludo",matchId});},{onError:error=>{if(mounted&&activeMatchId===matchId)context.onError?.(error);}});activeSync.start();}return ()=>module.unmount();},
  renderLobby(){},renderMatch(){},
  async load(matchId){return load(matchId);},
  async create(options){return lobby.create("ludo",options);},
  async join(matchId,color){await lobby.join("ludo",matchId,{color:requiredString(color,"Ludo player color")});return load(matchId);},
  async decline(matchId){return lobby.decline("ludo",matchId);},
  async setReady(matchId,ready){return lobby.setReady("ludo",matchId,ready);},
  async start(matchId){await lobby.start("ludo",matchId);return load(matchId);},
  async leave(matchId){return lobby.leave("ludo",matchId);},
  async cancel(matchId){await lobby.cancel("ludo",matchId);return load(matchId);},
  async action(matchId,action,tokenIndex=null){const id=requiredString(matchId,"matchId");if(!["roll","move","end"].includes(action))throw new TypeError("Unsupported Ludo action.");if(action==="move"&&(!Number.isInteger(tokenIndex)||tokenIndex<0||tokenIndex>3))throw new TypeError("Choose one of your four tokens.");if(action!=="move"&&tokenIndex!==null&&tokenIndex!==undefined)throw new TypeError("Only token moves accept a token index.");await drivers.byGame.ludo.action(id,action,tokenIndex);return load(id);},
  async end(matchId){return module.action(matchId,"end",null);},
  unmount(){mounted=false;stopWatching();snapshotHandler=null;}
 };
 const registry=createGameModuleRegistry([module],GatherGameRegistry);
 return Object.freeze({module:registry.get("ludo"),lobby,drivers,repository});
}
