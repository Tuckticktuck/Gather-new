import { canPerformMatchCommand } from "../../core/match-contract.mjs";
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_PRIVATE_STATE=Object.freeze({is_player:false,placed:false,ships:Object.freeze([])});
function requiredMatchId(value){if(typeof value!=="string"||!UUID_PATTERN.test(value))throw new TypeError("matchId must be a valid match UUID.");return value;}
function privateStateView(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return EMPTY_PRIVATE_STATE;
 const ships=Array.isArray(value.ships)?value.ships.map(ship=>Object.freeze({cells:Object.freeze(Array.isArray(ship?.cells)?ship.cells.slice():[])})):[];
 return Object.freeze({is_player:value.is_player===true,placed:value.placed===true,ships:Object.freeze(ships)});
}
function legacyGameView(match){
 return Object.freeze({id:match.id,game_type:match.gameType,status:match.status,created_by:match.hostId,conversation_id:match.conversationId,
 player_one_id:match.playerOneId,player_two_id:match.playerTwoId,turn_user_id:match.turnUserId,state:match.state,
 winner_id:match.winnerId,result:match.result,revision:match.revision,created_at:match.createdAt,updated_at:match.updatedAt});
}
function validateIntent(action,payload){
 if(!["place_fleet","fire"].includes(action))throw new TypeError("Unsupported Battleship action.");
 if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new TypeError("Battleship action payload must be an object.");
 if(action==="place_fleet"){
  if(!Array.isArray(payload.ships)||payload.ships.length!==5||payload.ships.some(ship=>!ship||!Array.isArray(ship.cells)||!ship.cells.length||ship.cells.some(cell=>!Number.isInteger(cell)||cell<0||cell>99)))throw new TypeError("Place five ships using valid board squares.");
 }else if(!Number.isInteger(payload.cell)||payload.cell<0||payload.cell>99)throw new TypeError("Choose a valid Battleship square.");
}
/** Shared legacy lifecycle and canonical reads; private fleets and gameplay remain behind dedicated RPCs. */
export function createBattleshipModule(options={}){
 const {drivers,lobbyService,getViewerId=()=>null,renderLobby=()=>false,renderMatch=()=>{}}=options;
 const driver=drivers?.byGame?.battleship||drivers?.battleship;
 if(!driver||driver.id!=="battleship")throw new TypeError("A Battleship driver is required.");
 if(!lobbyService||typeof lobbyService.load!=="function"||typeof lobbyService.watch!=="function")throw new TypeError("The shared lobby service is required.");
 if(typeof getViewerId!=="function")throw new TypeError("getViewerId must be a function.");
 async function loadPrivateState(matchId){
  const id=requiredMatchId(matchId);if(typeof driver.loadPrivateState!=="function")throw new Error("The Battleship private-state RPC is unavailable.");
  return privateStateView(await driver.loadPrivateState(id));
 }
 async function load(matchId){
  const id=requiredMatchId(matchId),snapshot=await lobbyService.load("battleship",id);
  return Object.freeze({game:legacyGameView(snapshot.match),players:snapshot.players,privateState:await loadPrivateState(id)});
 }
 async function action(matchId,actionName,payload){
  const id=requiredMatchId(matchId);validateIntent(actionName,payload);
  const snapshot=await lobbyService.load("battleship",id);
  const permission=canPerformMatchCommand(snapshot,await getViewerId(),"action");
  if(!permission.ok)throw new Error("You cannot perform this Battleship action: "+permission.reason+".");
  await driver.action(id,actionName,payload);return load(id);
 }
 const services=Object.freeze({load,loadPrivateState,action,watch:(id,observer,opts)=>lobbyService.watch("battleship",requiredMatchId(id),observer,opts)});
 const module=Object.freeze({
  id:"battleship",apiVersion:1,
  mount(context={}){return Object.freeze({gameId:"battleship",viewerId:context.viewerId||null,services:context.services||services});},
  renderLobby(context,instance){return renderLobby(context,instance);},
  renderMatch(context,instance){return renderMatch({...context,services},instance);},
  unmount(){},
  create(options){return lobbyService.create("battleship",options);},
  join(id){return lobbyService.join("battleship",requiredMatchId(id));},
  decline(id){return lobbyService.decline("battleship",requiredMatchId(id));},
  cancel(id){return lobbyService.cancel("battleship",requiredMatchId(id));},
  end(id){return lobbyService.end("battleship",requiredMatchId(id));},
  load,loadPrivateState,action,watch:services.watch
 });
 return Object.freeze({module,services,load,loadPrivateState,action});
}
