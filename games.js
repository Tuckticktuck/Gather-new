(() => {
  "use strict";

  const TYPES = {
    chess: { name: "Chess", description: "Classic chess with legal moves, castling, en passant and promotion.", mark: "♞" },
    checkers: { name: "Checkers", description: "Jump, capture and crown your pieces.", mark: "◈" },
    tic_tac_toe: { name: "Tic-Tac-Toe", description: "A quick three-in-a-row match.", mark: "×○" },
    connect_four: { name: "Connect Four", description: "Drop four discs in a row to win.", mark: "●" },
    battleship: { name: "Battleship", description: "Place your fleet, then find and hit every ship square.", mark: "⚓" }
  };
  const PIECES = {
    K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
    k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟"
  };
  let ctx = null;
  let games = [];
  let externalInvitations = [];
  let activeChat = null;
  let activeGameId = null;
  let activeGame = null;
  let selectedSquare = null;
  let promotionChoice = null;
  let channel = null;
  let initialized = false;
  let busy = false;
  let refreshTimer = null;
  let syncRefreshTimer = null;
  let refreshListenersBound = false;
  let keyListenerBound = false;
  let battleshipPrivateGameId = null;
  let battleshipPrivateState = null;
  let battleshipPrivateLoading = false;
  let battleshipDraft = { gameId: null, ships: [], selected: "carrier", orientation: "horizontal", message: "" };
  let hubFilter = "all";
  let selectedGameConversationId = null;
  let hubSearchQuery = "";

  const $ = id => document.getElementById(id);
  const node = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined && value !== null) el.textContent = String(value);
    return el;
  };
  const button = (label, cls, action) => {
    const el = node("button", cls, label);
    el.type = "button";
    el.addEventListener("click", action);
    return el;
  };
  const userId = () => ctx && typeof ctx.user === "function" ? ctx.user()?.id : null;
  const chatList = () => ctx && typeof ctx.chats === "function" ? (ctx.chats() || []) : [];
  const profiles = () => ctx && typeof ctx.profiles === "function" ? (ctx.profiles() || {}) : {};
  const toast = message => { if (ctx && typeof ctx.toast === "function") ctx.toast(message); };
  const memberName = id => {
    const profile = profiles()[id];
    return profile?.display_name?.trim() || profile?.username?.trim() || "Gather member";
  };
  const gameName = type => TYPES[type]?.name || "Gather game";
  const conversationName = id => {
    const chat = chatList().find(item => item.id === id);
    if (!chat) return "Conversation";
    if (chat.kind === "group") return chat.title?.trim() || "Group chat";
    const peer = chat.members?.find(member => member.user_id !== userId());
    return peer ? memberName(peer.user_id) : "Private chat";
  };
  const playerNames = game => memberName(game.player_one_id) + " vs " + memberName(game.player_two_id);
  const spectatorCount = game => Math.max(0, (chatList().find(chat => chat.id === game.conversation_id)?.members?.length || 2) - 2);
  const isPlayer = game => !!userId() && (game.player_one_id === userId() || game.player_two_id === userId());
  const statusLabel = game => ({
    pending: game.player_two_id === userId() ? "Your invitation" : "Invitation pending",
    active: "Live game",
    completed: game.result?.startsWith("ended_by_player_") ? "Ended" : "Completed",
    declined: "Declined",
    cancelled: "Cancelled"
  })[game.status] || game.status;

  function mount() {
    const main = document.querySelector(".main");
    if (main && !$("workspace-switcher")) {
      const switcher = node("nav", "workspace-switcher");
      switcher.id = "workspace-switcher";
      switcher.setAttribute("aria-label", "Gather sections");
      switcher.innerHTML = '<button id="workspace-messages-tab" class="workspace-switch-tab active" type="button" aria-pressed="true"><span class="workspace-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1-4.2A7.5 7.5 0 1 1 20 11.5Z"></path></svg></span> Messages</button><button id="workspace-games-tab" class="workspace-switch-tab" type="button" aria-pressed="false"><span aria-hidden="true">♟</span> Games</button>';
      const home = $("empty");
      document.body.appendChild(switcher);
      const positionSwitcher = () => {
        const rect = main.getBoundingClientRect();
        switcher.style.position = "fixed";
        switcher.style.top = Math.max(0, rect.top) + "px";
        switcher.style.left = Math.max(0, rect.left) + "px";
        switcher.style.width = Math.max(0, Math.min(rect.width, window.innerWidth - Math.max(0, rect.left))) + "px";
        switcher.style.right = "auto";
      };
      positionSwitcher();
      if (!window.__gatherSwitcherResizeBound) {
        window.__gatherSwitcherResizeBound = true;
        window.addEventListener("resize", () => {
          const bar = $("workspace-switcher");
          const host = document.querySelector(".main");
          if (!bar || !host) return;
          const rect = host.getBoundingClientRect();
          bar.style.top = Math.max(0, rect.top) + "px";
          bar.style.left = Math.max(0, rect.left) + "px";
          bar.style.width = Math.max(0, Math.min(rect.width, window.innerWidth - Math.max(0, rect.left))) + "px";
        }, { passive: true });
      }
      $("workspace-messages-tab").addEventListener("click", showHomeFromHub);
      $("workspace-games-tab").addEventListener("click", showHub);
    }

    const mainWorkspace = document.querySelector(".main");
    if (mainWorkspace && !$("games-workspace")) {
      const hub = node("section", "games-workspace");
      hub.id = "games-workspace";
      hub.hidden = true;
      hub.innerHTML = '<header class="games-hub-header"><div><p class="eyebrow">PLAY TOGETHER</p><h1>Gather Games</h1><p class="muted games-hub-subtitle">Your game conversations, invitations and matches — all in one place.</p></div><button id="games-new" class="primary games-new-button" type="button">＋ New game</button></header><section class="games-invitations-panel" aria-labelledby="games-invitations-title"><header class="games-invitations-head"><div><h2 id="games-invitations-title">Invitations</h2><p class="muted tiny">All game invites from your conversations and multiplayer lobbies.</p></div><span id="games-invitations-count" class="games-status-section-count">0</span></header><div id="games-invitations-list" class="games-invitations-list"><p class="games-empty muted">Loading invitations…</p></div></section><section class="games-inbox-layout"><aside class="games-inbox-sidebar"><div class="games-inbox-sidebar-head"><h2>Game conversations</h2><p class="muted tiny">People and groups you have played with.</p></div><label class="games-search-wrap"><span class="sr-only">Search game conversations</span><input id="games-search" type="search" autocomplete="off" placeholder="Search people or groups…"></label><div id="games-list" class="games-conversation-list"></div></aside><section class="games-conversation-detail"><header class="games-detail-header"><div><p class="eyebrow">GAME HISTORY</p><h2 id="games-conversation-title">Choose a conversation</h2><p id="games-conversation-subtitle" class="muted tiny">Open a game conversation to see its history.</p></div><button id="games-refresh" class="outline" type="button">Refresh</button></header><p id="games-hub-status" class="status" role="status"></p><div id="games-conversation-games" class="games-list"></div></section></section>';
      const chat = $("chat");
      main.insertBefore(hub, chat || null);
      $("games-new").addEventListener("click", () => openGameTypeChooser());
      $("games-refresh").addEventListener("click", () => refreshGames(true));
      $("games-search").addEventListener("input", event => { hubSearchQuery = event.target.value.trim().toLocaleLowerCase(); renderHub(); });
    }

    const composerMenu = $("composer-more-menu");
    if (composerMenu && !$("chat-games-open")) {
      const launch = button("Play a game", "composer-menu-item", () => {
        composerMenu.hidden = true;
        $("composer-more-trigger")?.setAttribute("aria-expanded", "false");
        if (activeChat?.id) openCreateModal(activeChat.id);
        else showHub();
      });
      launch.id = "chat-games-open";
      launch.type = "button";
      launch.setAttribute("role", "menuitem");
      composerMenu.append(launch);
    }

    const chat = $("chat");
    if (chat && !$("games-chat-tray")) {
      const tray = node("section", "games-chat-tray");
      tray.id = "games-chat-tray";
      tray.hidden = true;
      tray.setAttribute("aria-label", "Games in this conversation");
      const head = node("div", "games-chat-tray-head");
      head.append(node("strong", "", "Games in this conversation"));
      head.append(button("＋ Start", "games-tray-start", () => {
        if (activeChat?.id) openCreateModal(activeChat.id);
      }));
      const list = node("div", "games-chat-tray-list");
      list.id = "games-chat-tray-list";
      tray.append(head, list);
      const chatHeader = chat.querySelector(".chat-head");
      if (chatHeader) chatHeader.insertAdjacentElement("afterend", tray);
      else chat.prepend(tray);
    }

    if (!$("games-create-overlay")) {
      const overlay = node("div", "overlay games-overlay");
      overlay.id = "games-create-overlay";
      overlay.hidden = true;
      overlay.innerHTML = '<section class="modal games-create-modal" role="dialog" aria-modal="true" aria-labelledby="games-create-title"><button id="games-create-close" class="close" type="button" aria-label="Close">×</button><p class="eyebrow">NEW MATCH</p><h2 id="games-create-title">Invite someone to play</h2><p class="muted tiny">Choose a conversation, a game and one opponent. In a group chat, everyone else can watch the match.</p><form id="games-create-form"><label>Conversation<select id="games-conversation" required></select></label><label>Game<select id="games-type" required><option value="chess">Chess</option><option value="checkers">Checkers</option><option value="tic_tac_toe">Tic-Tac-Toe</option><option value="connect_four">Connect Four</option><option value="battleship">Battleship</option></select></label><label>Invite player<select id="games-opponent" required></select></label><p id="games-spectator-note" class="games-spectator-note"></p><p id="games-create-status" class="status" role="status"></p><div class="games-form-actions"><button id="games-create-cancel" class="secondary-action" type="button">Cancel</button><button id="games-create-submit" class="primary" type="submit">Send invitation</button></div></form></section>';
      document.body.append(overlay);
      $("games-create-close").addEventListener("click", closeCreateModal);
      $("games-create-cancel").addEventListener("click", closeCreateModal);
      overlay.addEventListener("click", event => { if (event.target === overlay) closeCreateModal(); });
      $("games-conversation").addEventListener("change", updateOpponentOptions);
      $("games-create-form").addEventListener("submit", createGame);
    }

    if (!$("games-type-chooser")) {
      const chooser = node("div", "overlay games-overlay");
      chooser.id = "games-type-chooser";
      chooser.hidden = true;
      chooser.innerHTML = '<section class="modal games-create-modal games-type-chooser-modal" role="dialog" aria-modal="true" aria-labelledby="games-type-chooser-title"><button id="games-type-chooser-close" class="close" type="button" aria-label="Close">×</button><p class="eyebrow">START PLAYING</p><h2 id="games-type-chooser-title">New game</h2><p class="muted tiny">Choose the kind of match you want to start.</p><div class="games-type-chooser-options"><button id="games-choose-two-player" class="games-type-choice" type="button"><span class="games-type-choice-icon" aria-hidden="true">♟</span><span><strong>2-player games</strong><small>Head-to-head games with one opponent.</small></span><span class="games-type-choice-arrow" aria-hidden="true">→</span></button><button id="games-choose-multiplayer" class="games-type-choice" type="button"><span class="games-type-choice-icon" aria-hidden="true">◎</span><span><strong>Multiplayer</strong><small>Group games with more than two players.</small></span><span class="games-type-choice-arrow" aria-hidden="true">→</span></button></div></section>';
      document.body.append(chooser);
      $("games-type-chooser-close").addEventListener("click", closeGameTypeChooser);
      chooser.addEventListener("click", event => { if (event.target === chooser) closeGameTypeChooser(); });
      $("games-choose-two-player").addEventListener("click", () => {
        closeGameTypeChooser();
        openCreateModal();
      });
      $("games-choose-multiplayer").addEventListener("click", () => {
        closeGameTypeChooser();
        openMultiplayerChooser();
      });
    }

    if (!$("games-board-overlay")) {
      const overlay = node("div", "overlay games-overlay");
      overlay.id = "games-board-overlay";
      overlay.hidden = true;
      overlay.innerHTML = '<section class="modal games-board-modal" role="dialog" aria-modal="true" aria-labelledby="games-board-title"><button id="games-board-close" class="close" type="button" aria-label="Close">×</button><p class="eyebrow">GATHER GAMES</p><h2 id="games-board-title">Game</h2><div id="games-board-meta" class="games-board-meta"></div><p id="games-board-status" class="games-board-status" role="status"></p><div id="games-board-area" class="games-board-area"></div><div id="games-promotion-choices" class="games-promotion-choices" hidden></div><p id="games-board-hint" class="games-board-hint"></p><div class="games-board-footer"><span id="games-board-spectators" class="muted tiny"></span><button id="games-board-done" class="outline" type="button">Close game</button></div></section>';
      document.body.append(overlay);
      $("games-board-close").addEventListener("click", closeBoardModal);
      $("games-board-done").addEventListener("click", closeBoardModal);
      overlay.addEventListener("click", event => { if (event.target === overlay) closeBoardModal(); });
    }

    if (!keyListenerBound) {
      keyListenerBound = true;
      document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (!$("games-board-overlay")?.hidden) closeBoardModal();
        else if (!$("games-create-overlay")?.hidden) closeCreateModal();
        else if (!$("games-type-chooser")?.hidden) closeGameTypeChooser();
      });
    }
  }

  function refreshGamesOnReturn() {
    if (!document.hidden && navigator.onLine && ctx && userId()) void refreshGames(false);
  }

  function init(options) {
    ctx = options;
    mount();
    if (!initialized) {
      initialized = true;
      channel = ctx.db.channel("gather-games-" + (userId() || "member"))
        .on("postgres_changes", { event: "*", schema: "public", table: "gather_games" }, () => {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => refreshGames(false), 140);
        }).subscribe();

      // Browsers can suspend realtime while a tab is in the background.
      // Catch up immediately on return and poll while visible in case realtime dropped.
      if (!refreshListenersBound) {
        document.addEventListener("visibilitychange", refreshGamesOnReturn);
        window.addEventListener("focus", refreshGamesOnReturn);
        window.addEventListener("pageshow", refreshGamesOnReturn);
        window.addEventListener("online", refreshGamesOnReturn);
        refreshListenersBound = true;
      }
      if (syncRefreshTimer) clearInterval(syncRefreshTimer);
      syncRefreshTimer = window.setInterval(refreshGamesOnReturn, 15000);
    }
    void refreshGames(false);
    setActiveChat(chatList().find(chat => chat.id === (ctx.activeChatId?.() || null)) || null);
  }
  function setActiveChat(chat) {
    activeChat = chat || null;
    const launch = $("chat-games-open");
    if (launch) launch.hidden = !activeChat;
    renderChatTray();
  }

  function showHub() {
    if (!ctx || !userId()) return;
    const home = $("empty");
    const chat = $("chat");
    const hub = $("games-workspace");
    if (!hub || !home || !chat) return;
    home.hidden = true;
    chat.hidden = true;
    hub.hidden = false;
    const layout = $("layout");
    layout?.classList.remove("show-chat", "show-home");
    layout?.classList.add("show-games");
    $("home-open").hidden = true;
    $("workspace-messages-tab")?.classList.remove("active");
    $("workspace-messages-tab")?.setAttribute("aria-pressed", "false");
    $("workspace-games-tab")?.classList.add("active");
    $("workspace-games-tab")?.setAttribute("aria-pressed", "true");
    void refreshGames(false);
    closeCreateModal();
  }

  function showHomeFromHub() {
    const hub = $("games-workspace");
    const home = $("empty");
    if (hub) hub.hidden = true;
    if (home) home.hidden = false;
    const chat = $("chat");
    if (chat) chat.hidden = true;
    $("layout")?.classList.remove("show-games", "show-chat");
    $("layout")?.classList.add("show-home");
    $("workspace-games-tab")?.classList.remove("active");
    $("workspace-games-tab")?.setAttribute("aria-pressed", "false");
    $("workspace-messages-tab")?.classList.add("active");
    $("workspace-messages-tab")?.setAttribute("aria-pressed", "true");
  }

  function openMultiplayerChooser() {
    if (!ctx || !userId()) return;
    let overlay = $("games-multiplayer-chooser");
    if (!overlay) {
      overlay = node("div", "overlay games-overlay");
      overlay.id = "games-multiplayer-chooser";
      overlay.innerHTML = '<section class="modal games-create-modal games-type-chooser-modal" role="dialog" aria-modal="true" aria-labelledby="games-multiplayer-title"><button id="games-multiplayer-close" class="close" type="button" aria-label="Close">×</button><p class="eyebrow">MULTIPLAYER</p><h2 id="games-multiplayer-title">Choose a game</h2><p class="muted tiny">Pick a game for your group.</p><div class="games-type-chooser-options"><button id="games-multiplayer-tag" class="games-type-choice" type="button"><span class="games-type-choice-icon" aria-hidden="true">●</span><span><strong>Tag Arena</strong><small>Move around the arena and tag other players.</small></span><span class="games-type-choice-arrow" aria-hidden="true">→</span></button><button id="games-multiplayer-uno" class="games-type-choice" type="button"><span class="games-type-choice-icon" aria-hidden="true">▦</span><span><strong>UNO</strong><small>Play cards with your group.</small></span><span class="games-type-choice-arrow" aria-hidden="true">→</span></button></div></section>';
      document.body.append(overlay);
      $("games-multiplayer-close").addEventListener("click", () => { overlay.hidden = true; });
      overlay.addEventListener("click", event => { if (event.target === overlay) overlay.hidden = true; });
      $("games-multiplayer-tag").addEventListener("click", () => { overlay.hidden = true; window.GatherTag?.open?.(); });
      $("games-multiplayer-uno").addEventListener("click", () => {
        overlay.hidden = true;
        window.GatherUno?.open?.();
      });
    }
    overlay.hidden = false;
  }

  function openGameTypeChooser() {
    if (!ctx || !userId()) return;
    $("games-type-chooser").hidden = false;
  }

  function closeGameTypeChooser() {
    const overlay = $("games-type-chooser");
    if (overlay) overlay.hidden = true;
  }

  function openCreateModal(defaultConversationId) {
    if (!ctx || !userId()) return;
    const eligible = chatList().filter(chat => (chat.members || []).some(member => member.user_id === userId()) && (chat.members || []).some(member => member.user_id !== userId()));
    if (!eligible.length) {
      toast("Start or join a conversation before inviting someone to a game.");
      return;
    }
    const select = $("games-conversation");
    select.replaceChildren();
    eligible.forEach(chat => {
      const option = node("option", "", conversationName(chat.id));
      option.value = chat.id;
      select.append(option);
    });
    const chosen = eligible.find(chat => chat.id === defaultConversationId) || eligible[0];
    select.value = chosen.id;
    updateOpponentOptions();
    $("games-type").value = "chess";
    $("games-create-status").textContent = "";
    $("games-create-submit").disabled = false;
    $("games-create-overlay").hidden = false;
  }

  function closeCreateModal() {
    const overlay = $("games-create-overlay");
    if (overlay) overlay.hidden = true;
  }

  function updateOpponentOptions() {
    const conversationId = $("games-conversation")?.value;
    const chat = chatList().find(item => item.id === conversationId);
    const select = $("games-opponent");
    if (!select) return;
    select.replaceChildren();
    (chat?.members || []).filter(member => member.user_id !== userId()).forEach(member => {
      const option = node("option", "", memberName(member.user_id));
      option.value = member.user_id;
      select.append(option);
    });
    const watchers = Math.max(0, (chat?.members?.length || 2) - 2);
    $("games-spectator-note").textContent = chat?.kind === "group"
      ? watchers + " other group member" + (watchers === 1 ? " can" : "s can") + " spectate. Only the two selected players can move."
      : "Private games have only the two players.";
    $("games-create-submit").disabled = !select.options.length;
  }

  async function createGame(event) {
    event.preventDefault();
    if (busy) return;
    const conversationId = $("games-conversation").value;
    const opponentId = $("games-opponent").value;
    const gameType = $("games-type").value;
    if (!conversationId || !opponentId || !TYPES[gameType]) {
      $("games-create-status").textContent = "Choose a conversation and an opponent.";
      return;
    }
    busy = true;
    const submit = $("games-create-submit");
    submit.disabled = true;
    $("games-create-status").textContent = "Sending invitation…";
    const result = await ctx.db.rpc("gather_game_create", {
      p_conversation_id: conversationId,
      p_game_type: gameType,
      p_player_two_id: opponentId
    });
    busy = false;
    submit.disabled = false;
    if (result.error) {
      $("games-create-status").textContent = result.error.message || "The game invitation could not be sent.";
      return;
    }
    closeCreateModal();
    const game = Array.isArray(result.data) ? result.data[0] : result.data;
    if (game?.id) {
      selectedGameConversationId = game.conversation_id;
      games = [game, ...games.filter(item => item.id !== game.id)];
      renderAll();
    }
    await refreshGames(false);
    toast(gameName(gameType) + " invitation sent to " + memberName(opponentId) + ".");
    if (activeChat?.id === conversationId) renderChatTray();
  }

  async function refreshGames(showStatus) {
    if (!ctx || !userId()) return;
    const ids = [...new Set(chatList().map(chat => chat.id).filter(Boolean))];
    if (!ids.length) {
      games = [];
      renderAll();
      return;
    }
    if (showStatus && $("games-hub-status")) $("games-hub-status").textContent = "Refreshing games…";
    const result = await ctx.db.from("gather_games")
      .select("id,conversation_id,game_type,status,created_by,player_one_id,player_two_id,turn_user_id,state,winner_id,result,revision,created_at,updated_at")
      .in("conversation_id", ids)
      .order("updated_at", { ascending: false })
      .limit(120);
    if (result.error) {
      if ($("games-hub-status")) $("games-hub-status").textContent = "Games could not be loaded: " + result.error.message;
      return;
    }
    games = result.data || [];
    const [unoInvites, tagInvites] = await Promise.all([
      ctx.db.from("gather_multiplayer_players").select("game_id,user_id,status,joined_at,gather_multiplayer_games!inner(id,conversation_id,game_type,status,created_by,join_mode,settings,created_at)").eq("user_id", userId()).eq("status", "invited").eq("gather_multiplayer_games.game_type", "uno").eq("gather_multiplayer_games.status", "active"),
      ctx.db.from("gather_tag_players").select("lobby_id,user_id,status,joined_at,gather_tag_lobbies!inner(id,conversation_id,created_by,status,mode,join_mode,max_players,created_at)").eq("user_id", userId()).eq("status", "invited").in("gather_tag_lobbies.status", ["lobby", "active"])
    ]);
    externalInvitations = [];
    if (!unoInvites.error) (unoInvites.data || []).forEach(row => { const game=row.gather_multiplayer_games; if(game) externalInvitations.push({kind:"uno",id:game.id,conversation_id:game.conversation_id,created_by:game.created_by,created_at:game.created_at,join_mode:game.join_mode,settings:game.settings}); });
    if (!tagInvites.error) (tagInvites.data || []).forEach(row => { const lobby=row.gather_tag_lobbies; if(lobby) externalInvitations.push({kind:"tag",id:lobby.id,conversation_id:lobby.conversation_id,created_by:lobby.created_by,created_at:lobby.created_at,join_mode:lobby.join_mode,mode:lobby.mode,max_players:lobby.max_players,status:lobby.status}); });
    renderAll();
    if (typeof ctx.onGamesUpdated === "function") ctx.onGamesUpdated();
  }

  function renderAll() {
    renderHub();
    renderChatTray();
    if (activeGameId) {
      const latest = games.find(game => game.id === activeGameId);
      if (latest) {
        activeGame = latest;
        if (!$("games-board-overlay")?.hidden) renderBoardModal();
      }
    }
  }

  function renderHub() {
    const conversationList = $("games-list");
    const gameList = $("games-conversation-games");
    if (!conversationList || !gameList) return;
    conversationList.replaceChildren();
    gameList.replaceChildren();
    renderCentralInvitations();

    const sorted = [...games].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    const groups = new Map();
    sorted.forEach(game => {
      if (!groups.has(game.conversation_id)) groups.set(game.conversation_id, []);
      groups.get(game.conversation_id).push(game);
    });
    const conversations = [...groups.entries()].filter(([id, items]) => {
      if (!hubSearchQuery) return true;
      const haystack = [conversationName(id), gameName(items[0]?.game_type), ...items.map(game => playerNames(game))].join(" ").toLocaleLowerCase();
      return haystack.includes(hubSearchQuery);
    });
    if (!conversations.some(([id]) => id === selectedGameConversationId)) {
      selectedGameConversationId = conversations[0]?.[0] || null;
    }

    conversations.forEach(([conversationId, items]) => {
      const latest = items[0];
      const liveCount = items.filter(game => game.status === "active").length;
      const inviteCount = items.filter(game => game.status === "pending").length;
      const item = button("", "games-conversation-item" + (conversationId === selectedGameConversationId ? " active" : ""), () => {
        selectedGameConversationId = conversationId;
        renderHub();
      });
      item.setAttribute("aria-pressed", String(conversationId === selectedGameConversationId));
      const mark = node("span", "games-conversation-avatar", "♟");
      const copy = node("span", "games-conversation-copy");
      copy.append(node("strong", "", conversationName(conversationId)));
      copy.append(node("small", "muted", gameName(latest.game_type) + " · " + new Date(latest.updated_at || latest.created_at).toLocaleDateString()));
      const preview = latest.status === "active" ? (latest.turn_user_id === userId() ? "Your turn" : "Waiting for move") : latest.status === "pending" ? (latest.player_two_id === userId() ? "Your invitation" : "Invitation sent") : latest.status === "completed" ? "Match completed" : statusLabel(latest);
      copy.append(node("span", "games-conversation-preview" + (latest.status === "active" && latest.turn_user_id === userId() ? " is-your-turn" : ""), preview));
      const meta = node("span", "games-conversation-meta");
      meta.append(node("span", "games-conversation-count", items.length + " game" + (items.length === 1 ? "" : "s")));
      if (liveCount) meta.append(node("span", "games-conversation-live", liveCount + " live"));
      if (inviteCount) meta.append(node("span", "games-conversation-invites", inviteCount + " invite" + (inviteCount === 1 ? "" : "s")));
      item.append(mark, copy, meta);
      conversationList.append(item);
    });

    if (!conversations.length) {
      conversationList.append(node("p", "games-empty muted", hubSearchQuery ? "No game conversations match that search." : "Your game conversations will appear here."));
      $("games-conversation-title").textContent = "No game conversations yet";
      $("games-conversation-subtitle").textContent = "Start a match to create your first game conversation.";
      $("games-hub-status").textContent = "";
      gameList.append(node("p", "games-empty muted", hubSearchQuery ? "Try another name or clear your search." : "No games yet. Start a match from a conversation or create one here."));
      return;
    }

    const selectedChat = chatList().find(chat => chat.id === selectedGameConversationId);
    const selectedGames = groups.get(selectedGameConversationId) || [];
    $("games-conversation-title").textContent = conversationName(selectedGameConversationId);
    const liveCount = selectedGames.filter(game => game.status === "active").length;
    const pendingCount = selectedGames.filter(game => game.status === "pending").length;
    $("games-conversation-subtitle").textContent =
      selectedGames.length + " game" + (selectedGames.length === 1 ? "" : "s") +
      " · " + liveCount + " live · " + pendingCount + " invitation" + (pendingCount === 1 ? "" : "s") +
      (selectedChat?.kind === "group" ? " · Group conversation" : "");

    const buckets = [
      { key: "active", title: "Active", subtitle: "Games currently being played", matches: game => game.status === "active", empty: "No active games in this conversation." },
      { key: "invitations", title: "Invites", subtitle: "Games waiting for a response", matches: game => game.status === "pending", empty: "No game invitations in this conversation." },
      { key: "completed", title: "Completed", subtitle: "Finished matches and their results", matches: game => game.status === "completed", empty: "Completed matches will appear here." }
    ];
    const visibleGames = selectedGames.filter(game => buckets.some(section => section.matches(game)));
    $("games-hub-status").textContent = visibleGames.length + " game" + (visibleGames.length === 1 ? "" : "s") + " across " + buckets.length + " sections.";
    buckets.forEach(section => {
      const items = selectedGames.filter(section.matches);
      const panel = node("section", "games-status-section games-status-section-" + section.key);
      const heading = node("header", "games-status-section-head");
      const titleWrap = node("div", "games-status-section-title");
      titleWrap.append(node("h3", "", section.title));
      titleWrap.append(node("p", "muted tiny", section.subtitle));
      heading.append(titleWrap, node("span", "games-status-section-count", String(items.length)));
      panel.append(heading);
      if (!items.length) {
        panel.append(node("p", "games-status-section-empty muted", section.empty));
      } else {
        const cards = node("div", "games-status-section-cards");
        items.forEach(game => cards.append(makeGameCard(game, false)));
        panel.append(cards);
      }
      gameList.append(panel);
    });
  }

  function renderCentralInvitations() {
    const list=$("games-invitations-list"), count=$("games-invitations-count");
    if(!list)return;
    list.replaceChildren();
    const all=[...getPendingInvitations().map(game=>({kind:"classic",game})),...externalInvitations].sort((a,b)=>new Date(a.game?.created_at||a.created_at)-new Date(b.game?.created_at||b.created_at)).reverse();
    if(count)count.textContent=String(all.length);
    if(!all.length){list.append(node("p","games-empty muted","You’re all caught up. New game invitations from any conversation will appear here."));return;}
    all.forEach(invite=>{
      if(invite.kind==="classic"){const card=makeGameCard(invite.game,true);card.classList.add("games-invitation-card");list.append(card);return;}
      const uno=invite.kind==="uno",card=node("article","games-card games-invitation-card"),top=node("div","games-card-top"),identity=node("div","games-card-identity"),copy=node("div","games-card-copy");
      identity.append(node("span","games-card-mark",uno?"🃏":"●"));
      copy.append(node("strong","",uno?"UNO invitation":"Tag invitation"),node("small","muted",memberName(invite.created_by)+" invited you"));
      identity.append(copy);top.append(identity,node("span","games-status-pill status-pending","Your invitation"));card.append(top);
      card.append(node("p","games-card-conversation muted tiny",conversationName(invite.conversation_id)));
      card.append(node("p","games-card-detail muted tiny",uno?((invite.join_mode==="open"?"Open":"Invite-only")+" lobby · "+(invite.settings?.max_players||10)+" player limit"):((invite.mode||"classic").replace(/_/g," ")+" · "+(invite.join_mode==="open"?"Open":"Invite-only")+" lobby")));
      const actions=node("div","games-card-actions");
      actions.append(button(uno?"Join UNO":"Join Tag","primary games-card-primary",async()=>{if(uno)await window.GatherUno?.openInvitation?.(invite.id);else await window.GatherTag?.openInvitation?.(invite.id);await refreshGames(false);}));actions.append(button("Decline","outline",async()=>{const result=await ctx.db.rpc(uno?"gather_uno_decline":"gather_tag_decline",uno?{p_game_id:invite.id}:{p_lobby_id:invite.id});if(result.error){toast(result.error.message||"Could not decline invitation.");return;}toast("Invitation declined.");await refreshGames(false);}));
      card.append(actions);list.append(card);
    });
  }

  function setHubFilter(filter) {
    if (!["all", "invitations", "active", "completed"].includes(filter)) return;
    hubFilter = filter;
    renderHub();
  }

  function getPendingInvitations() {
    return games.filter(game => game.status === "pending" && game.player_two_id === userId())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function respondToInvitation(gameId, accept) {
    const game = games.find(item => item.id === gameId);
    if (!game || game.status !== "pending" || game.player_two_id !== userId()) return;
    await gameAction(accept ? "gather_game_accept" : "gather_game_decline", game);
  }

  function openInvitation(gameId) {
    const game = games.find(item => item.id === gameId);
    if (game) openGame(game);
  }

  function renderChatTray() {
    const tray = $("games-chat-tray");
    const list = $("games-chat-tray-list");
    if (!tray || !list) return;
    const rows = activeChat ? games.filter(game => game.conversation_id === activeChat.id && ["pending", "active"].includes(game.status)) : [];
    tray.hidden = !activeChat || !rows.length;
    list.replaceChildren();
    rows.slice(0, 5).forEach(game => list.append(makeGameCard(game, false)));
  }

  function makeGameCard(game, inHub) {
    const card = node("article", "games-card");
    const top = node("div", "games-card-top");
    const identity = node("div", "games-card-identity");
    identity.append(node("span", "games-card-mark", TYPES[game.game_type]?.mark || "◎"));
    const copy = node("div", "games-card-copy");
    copy.append(node("strong", "", gameName(game.game_type)));
    copy.append(node("small", "muted", playerNames(game)));
    identity.append(copy);
    top.append(identity, node("span", "games-status-pill status-" + game.status, statusLabel(game)));
    card.append(top);
    if (inHub) card.append(node("p", "games-card-conversation muted tiny", conversationName(game.conversation_id)));
    let detail = "";
    if (game.status === "active") detail = game.turn_user_id ? memberName(game.turn_user_id) + "'s turn" : "Match in progress";
    else if (game.status === "pending") detail = game.player_two_id === userId() ? "You have been invited to play." : "Waiting for " + memberName(game.player_two_id) + " to respond.";
    else if (game.status === "completed") {
      if (game.result === "draw") detail = "The match ended in a draw.";
      else if (game.result?.startsWith("ended_by_player_")) {
        const endingPlayer = game.result === "ended_by_player_one" ? game.player_one_id : game.player_two_id;
        detail = "Ended by " + memberName(endingPlayer) + ".";
      } else detail = "Winner: " + memberName(game.winner_id);
    }
    else if (game.status === "declined") detail = "The invitation was declined.";
    else detail = "The invitation was cancelled.";
    if (game.status === "active") {
      const watchers = spectatorCount(game);
      detail += " · " + watchers + " spectator" + (watchers === 1 ? "" : "s");
    }
    card.append(node("p", "games-card-detail muted tiny", detail));
    const actions = node("div", "games-card-actions");
    if (game.status === "pending" && game.player_two_id === userId()) {
      actions.append(button("Accept", "primary games-card-primary", () => gameAction("gather_game_accept", game)));
      actions.append(button("Decline", "outline", () => gameAction("gather_game_decline", game)));
    } else if (game.status === "pending" && game.created_by === userId()) {
      actions.append(button("Cancel invite", "outline", () => gameAction("gather_game_cancel", game)));
    } else if (game.status === "active") {
      actions.append(button(!isPlayer(game) ? "Watch live" : "Open game", "games-card-primary", () => openGame(game)));
    } else if (game.status === "completed") {
      actions.append(button("View result", "outline", () => openGame(game)));
      if (isPlayer(game)) {
        actions.append(button("Rematch", "games-card-primary", () => requestRematch(game)));
      }
    } else if (game.status === "pending") {
      actions.append(button("View invitation", "outline", () => openGame(game)));
    } else {
      actions.append(button("View result", "outline", () => openGame(game)));
    }
    card.append(actions);
    return card;
  }

  async function gameAction(rpcName, game) {
    if (busy) return;
    busy = true;
    const result = await ctx.db.rpc(rpcName, { p_game_id: game.id });
    busy = false;
    if (result.error) {
      toast(result.error.message || "That game action could not be completed.");
      await refreshGames(false);
      return;
    }
    await refreshGames(false);
    if (rpcName === "gather_game_accept") {
      const latest = games.find(item => item.id === game.id) || game;
      openGame(latest);
    } else toast(rpcName === "gather_game_decline" ? "Invitation declined." : "Game invitation cancelled.");
  }

  function openGame(game) {
    if (activeGameId !== game.id) {
      battleshipPrivateGameId = game.id;
      battleshipPrivateState = null;
      battleshipPrivateLoading = false;
      battleshipDraft = { gameId: game.id, ships: [], selected: "carrier", orientation: "horizontal", message: "" };
    }
    activeGameId = game.id;
    activeGame = game;
    selectedSquare = null;
    promotionChoice = null;
    $("games-board-overlay").hidden = false;
    renderBoardModal();
  }

  function closeBoardModal() {
    const overlay = $("games-board-overlay");
    if (overlay) overlay.hidden = true;
    activeGameId = null;
    activeGame = null;
    selectedSquare = null;
    promotionChoice = null;
    battleshipPrivateGameId = null;
    battleshipPrivateState = null;
    battleshipPrivateLoading = false;
    battleshipDraft = { gameId: null, ships: [], selected: "carrier", orientation: "horizontal", message: "" };
  }

  function renderBoardModal() {
    const game = activeGame;
    if (!game) return;
    const boardArea = $("games-board-area");
    const status = $("games-board-status");
    const hint = $("games-board-hint");
    const promotion = $("games-promotion-choices");
    boardArea.replaceChildren();
    promotion.replaceChildren();
    promotion.hidden = true;
    $("games-board-title").textContent = gameName(game.game_type);
    $("games-board-meta").textContent = playerNames(game);
    $("games-board-spectators").textContent = spectatorCount(game) + " spectator" + (spectatorCount(game) === 1 ? "" : "s") + " in this conversation";
    const player = isPlayer(game);
    const isTurn = game.turn_user_id === userId();
    const isSpectator = !player;
    if (game.status === "pending") {
      if (game.player_two_id === userId()) {
        status.textContent = "You have been invited to play. Accept to start the match.";
        const actions = node("div", "games-invitation-actions");
        actions.append(button("Accept invitation", "primary", () => gameAction("gather_game_accept", game)));
        actions.append(button("Decline", "outline", () => gameAction("gather_game_decline", game)));
        boardArea.append(actions);
      } else if (isSpectator) {
        status.textContent = "You are a spectator. The match will become available when the invited player accepts.";
        boardArea.append(node("p", "games-board-waiting", "Waiting for players…"));
      } else {
        status.textContent = "Invitation sent. Waiting for " + memberName(game.player_two_id) + ".";
        boardArea.append(node("p", "games-board-waiting", "Waiting for the invited player…"));
        boardArea.append(button("Cancel invitation", "outline", () => gameAction("gather_game_cancel", game)));
      }
      hint.textContent = isSpectator ? "Spectators can watch the match but cannot make moves." : "";
      return;
    }
    if (game.status === "declined" || game.status === "cancelled") {
      status.textContent = game.status === "declined" ? "The invitation was declined." : "This invitation was cancelled.";
      boardArea.append(node("p", "games-board-waiting", status.textContent));
      hint.textContent = "";
      return;
    }
    const battleshipPlacement = game.game_type === "battleship" && game.status === "active" && game.state?.phase === "placement";
    if (game.status === "completed") {
      if (game.result === "draw") status.textContent = "Match complete · Draw.";
      else if (game.result?.startsWith("ended_by_player_")) {
        const endingPlayer = game.result === "ended_by_player_one" ? game.player_one_id : game.player_two_id;
        status.textContent = "Match ended by " + memberName(endingPlayer) + ".";
      } else status.textContent = "Match complete · " + memberName(game.winner_id) + " wins.";
    } else if (battleshipPlacement) {
      const readyCount = [game.state?.placed?.p1, game.state?.placed?.p2].filter(Boolean).length;
      status.textContent = "Fleet setup · " + readyCount + " of 2 fleets ready.";
    } else {
      status.textContent = (isSpectator ? "Spectating · " : "") + (game.turn_user_id ? memberName(game.turn_user_id) + " to move." : "Match in progress.");
      if (isSpectator) status.textContent += " You can watch, but only the players can move.";
    }
    hint.textContent = battleshipPlacement
      ? (isSpectator ? "The players are positioning their ships. Fleet layouts stay private." : "Place your five ships on your own board, then lock in your fleet.")
      : game.game_type === "battleship" && game.status === "active"
        ? (isSpectator ? "Spectator view. You can follow hits and misses, but ship locations remain private." : isTurn ? "Your turn. Choose a square on the opponent's board." : "Waiting for your opponent to fire.")
        : game.status === "completed" ? "This board is saved. You can request a rematch." :
        isSpectator ? "Spectator view · The board updates live as the players take turns." :
        isTurn ? "Your turn. Select a piece or column to make a move." : "Waiting for your opponent's move.";
    const canMove = game.status === "active" && player && isTurn && !busy;
    if (game.game_type === "battleship") {
      ensureBattleshipPrivateState(game);
      if (battleshipPrivateLoading || battleshipPrivateState === null) {
        boardArea.append(node("p", "games-board-waiting", "Loading your private Battleship board…"));
      } else if (battleshipPrivateState.error) {
        boardArea.append(node("p", "status error", battleshipPrivateState.error));
        boardArea.append(button("Try again", "outline", () => {
          battleshipPrivateState = null;
          ensureBattleshipPrivateState(game);
          renderBoardModal();
        }));
      } else {
        renderBattleship(game, boardArea, battleshipPrivateState, isSpectator, canMove);
      }
    } else if (game.game_type === "tic_tac_toe") renderTicTacToe(game, boardArea, canMove);
    else if (game.game_type === "connect_four") renderConnectFour(game, boardArea, canMove);
    else if (game.game_type === "checkers") renderCheckers(game, boardArea, canMove);
    else renderChess(game, boardArea, canMove);

    if (game.status === "active" && player) {
      const endActions = node("div", "games-end-actions");
      endActions.append(button("End game", "outline games-end-button", () => endGame(game)));
      boardArea.append(endActions);
    }

    if (game.status === "completed" && player) {
      const rematchActions = node("div", "games-rematch-actions");
      rematchActions.append(button("Request rematch", "primary", () => requestRematch(game)));
      boardArea.append(rematchActions);
    }
  }

  async function endGame(game) {
    if (busy || !game || game.status !== "active" || !isPlayer(game)) return;
    const confirmed = window.confirm("End this game for both players? The current match will be saved as ended, and neither player will be able to continue it.");
    if (!confirmed) return;

    busy = true;
    $("games-board-status").textContent = "Ending game…";
    try {
      const response = await ctx.db.rpc("gather_game_end", { p_game_id: game.id });
      const updated = Array.isArray(response.data) ? response.data[0] : response.data;
      if (response.error || !updated) {
        toast(response.error?.message || "The game could not be ended. Please refresh and try again.");
        await refreshGames(false);
        return;
      }
      games = [updated, ...games.filter(item => item.id !== updated.id)];
      activeGame = updated;
      selectedSquare = null;
      promotionChoice = null;
      toast("Game ended.");
    } catch (error) {
      toast(error?.message || "The game could not be ended. Please try again.");
      await refreshGames(false);
    } finally {
      busy = false;
      if (activeGameId === game.id) renderAll();
    }
  }

  async function requestRematch(game) {
    if (busy || !game || game.status !== "completed" || !isPlayer(game)) return;
    const opponentId = game.player_one_id === userId() ? game.player_two_id : game.player_one_id;
    if (!opponentId || !game.conversation_id) {
      toast("The original opponent could not be found.");
      return;
    }

    const existing = games.find(item =>
      item.id !== game.id &&
      item.conversation_id === game.conversation_id &&
      item.game_type === game.game_type &&
      item.status === "pending" &&
      ((item.player_one_id === userId() && item.player_two_id === opponentId) ||
       (item.player_one_id === opponentId && item.player_two_id === userId()))
    );
    if (existing) {
      toast("A rematch invitation is already waiting for a response.");
      openGame(existing);
      return;
    }

    busy = true;
    const response = await ctx.db.rpc("gather_game_create", {
      p_conversation_id: game.conversation_id,
      p_game_type: game.game_type,
      p_player_two_id: opponentId
    });
    busy = false;

    if (response.error) {
      toast(response.error.message || "The rematch invitation could not be sent.");
      return;
    }

    const rematch = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!rematch?.id) {
      await refreshGames(false);
      const latest = games.find(item =>
        item.conversation_id === game.conversation_id &&
        item.game_type === game.game_type &&
        item.status === "pending" &&
        item.player_one_id === userId() &&
        item.player_two_id === opponentId
      );
      if (latest) openGame(latest);
      else toast("The rematch invitation was created, but could not be opened.");
      return;
    }

    games = [rematch, ...games.filter(item => item.id !== rematch.id)];
    renderAll();
    await refreshGames(false);
    openGame(games.find(item => item.id === rematch.id) || rematch);
    toast("Rematch invitation sent to " + memberName(opponentId) + ".");
  }

  async function commitMove(game, nextState, nextTurnUserId, result) {
    if (!game || game.status !== "active" || game.turn_user_id !== userId() || busy) return;
    busy = true;
    $("games-board-status").textContent = "Saving move…";
    const response = await ctx.db.rpc("gather_game_move", {
      p_game_id: game.id,
      p_expected_revision: game.revision,
      p_state: nextState,
      p_next_turn_user_id: nextTurnUserId,
      p_result: result || null
    });
    busy = false;
    const updated = Array.isArray(response.data) ? response.data[0] : response.data;
    if (response.error || !updated) {
      toast(response.error?.message || "The move could not be saved. The latest board will be reloaded.");
      await refreshGames(false);
      const latest = games.find(item => item.id === game.id);
      if (latest) { activeGame = latest; renderBoardModal(); }
      return;
    }
    games = [updated, ...games.filter(item => item.id !== updated.id)];
    activeGame = updated;
    selectedSquare = null;
    promotionChoice = null;
    renderAll();
  }

  function resultForWinner(game, winnerId) {
    return winnerId === game.player_one_id ? "player_one_won" : "player_two_won";
  }


  const BATTLESHIP_FLEET = [
    { id: "carrier", name: "Carrier", length: 5 },
    { id: "battleship", name: "Battleship", length: 4 },
    { id: "cruiser", name: "Cruiser", length: 3 },
    { id: "submarine", name: "Submarine", length: 3 },
    { id: "destroyer", name: "Destroyer", length: 2 }
  ];

  function ensureBattleshipPrivateState(game) {
    if (battleshipPrivateGameId !== game.id) {
      battleshipPrivateGameId = game.id;
      battleshipPrivateState = null;
      battleshipPrivateLoading = false;
      battleshipDraft = { gameId: game.id, ships: [], selected: "carrier", orientation: "horizontal", message: "" };
    }
    if (battleshipPrivateLoading || battleshipPrivateState !== null) return;
    battleshipPrivateLoading = true;
    ctx.db.rpc("gather_game_battleship_private_state", { p_game_id: game.id })
      .then(response => {
        if (activeGameId !== game.id) return;
        battleshipPrivateLoading = false;
        if (response.error) battleshipPrivateState = { error: response.error.message || "Your private fleet could not be loaded." };
        else battleshipPrivateState = response.data || { is_player: false, placed: false, ships: [] };
        renderBoardModal();
      })
      .catch(error => {
        if (activeGameId !== game.id) return;
        battleshipPrivateLoading = false;
        battleshipPrivateState = { error: error?.message || "Your private fleet could not be loaded." };
        renderBoardModal();
      });
  }

  function battleshipShipCells(start, length, orientation) {
    const row = Math.floor(start / 10);
    const col = start % 10;
    if (orientation === "horizontal" && col + length > 10) return null;
    if (orientation === "vertical" && row + length > 10) return null;
    return Array.from({ length }, (_, i) => orientation === "horizontal" ? start + i : start + i * 10);
  }

  function battleshipDraftFor(game) {
    if (battleshipDraft.gameId !== game.id) {
      battleshipDraft = { gameId: game.id, ships: [], selected: "carrier", orientation: "horizontal", message: "" };
    }
    return battleshipDraft;
  }

  function placeBattleshipDraftShip(game, start) {
    const draft = battleshipDraftFor(game);
    const ship = BATTLESHIP_FLEET.find(item => item.id === draft.selected);
    if (!ship) return;
    const cells = battleshipShipCells(start, ship.length, draft.orientation);
    if (!cells) {
      draft.message = "That ship would extend beyond the edge of the board.";
      renderBoardModal();
      return;
    }
    const occupied = new Set(draft.ships.filter(item => item.id !== ship.id).flatMap(item => item.cells));
    if (cells.some(cell => occupied.has(cell))) {
      draft.message = "Ships cannot overlap. Choose another starting square.";
      renderBoardModal();
      return;
    }
    draft.ships = draft.ships.filter(item => item.id !== ship.id);
    draft.ships.push({ id: ship.id, name: ship.name, length: ship.length, cells });
    const next = BATTLESHIP_FLEET.find(item => !draft.ships.some(placed => placed.id === item.id));
    if (next) draft.selected = next.id;
    draft.message = ship.name + " placed. Continue with the remaining ships.";
    renderBoardModal();
  }

  async function submitBattleshipFleet(game) {
    const draft = battleshipDraftFor(game);
    if (draft.ships.length !== BATTLESHIP_FLEET.length || busy) return;
    await sendBattleshipAction(game, "place_fleet", {
      ships: BATTLESHIP_FLEET.map(ship => {
        const placed = draft.ships.find(item => item.id === ship.id);
        return { cells: placed.cells };
      })
    });
  }

  async function fireBattleshipSquare(game, cell) {
    if (busy || game.status !== "active" || game.turn_user_id !== userId()) return;
    await sendBattleshipAction(game, "fire", { cell });
  }

  async function sendBattleshipAction(game, action, payload) {
    if (busy || !ctx?.db) return;
    busy = true;
    const status = $("games-board-status");
    if (status) status.textContent = action === "place_fleet" ? "Locking in your fleet…" : "Checking that square…";
    try {
      const response = await ctx.db.rpc("gather_game_battleship_action", {
        p_game_id: game.id,
        p_action: action,
        p_payload: payload
      });
      if (response.error) {
        toast(response.error.message || "That Battleship action could not be completed.");
        battleshipDraft.message = response.error.message || "That action could not be completed.";
        return;
      }
      const updated = Array.isArray(response.data) ? response.data[0] : response.data;
      if (!updated) {
        toast("The Battleship board did not return an update. Refresh and try again.");
        return;
      }
      games = [updated, ...games.filter(item => item.id !== updated.id)];
      activeGame = updated;
      if (action === "place_fleet") {
        battleshipPrivateState = null;
        battleshipPrivateLoading = false;
        battleshipDraft.message = "";
      }
      renderAll();
    } catch (error) {
      toast(error?.message || "That Battleship action could not be completed.");
    } finally {
      busy = false;
      if (activeGameId === game.id) renderBoardModal();
    }
  }

  function battleshipShipLabels(rawShips) {
    const counts = { 3: 0 };
    return (Array.isArray(rawShips) ? rawShips : []).map((ship, index) => {
      const cells = Array.isArray(ship.cells) ? ship.cells.map(Number) : [];
      let name = "Ship";
      if (cells.length === 5) name = "Carrier";
      else if (cells.length === 4) name = "Battleship";
      else if (cells.length === 3) name = counts[3]++ === 0 ? "Cruiser" : "Submarine";
      else if (cells.length === 2) name = "Destroyer";
      return { id: "fleet-" + index, name, length: cells.length, cells };
    });
  }

  function makeBattleshipGrid(title, ships, shots, options = {}) {
    const panel = node("section", "games-battleship-panel");
    panel.append(node("h3", "", title));
    const grid = node("div", "games-battleship-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", title);
    const shipAt = new Map();
    (ships || []).forEach(ship => ship.cells.forEach(cell => shipAt.set(Number(cell), ship)));
    const shotAt = new Map((shots || []).map(shot => [Number(shot.cell), shot]));
    for (let index = 0; index < 100; index++) {
      const shot = shotAt.get(index);
      const ship = shipAt.get(index);
      const coord = String.fromCharCode(65 + index % 10) + (Math.floor(index / 10) + 1);
      const classes = ["games-battleship-cell"];
      if (ship) classes.push("is-ship");
      if (shot) classes.push(shot.hit ? "is-hit" : "is-miss");
      const mark = shot ? (shot.hit ? "×" : "•") : ship && options.showShips ? "■" : "";
      const cell = button(mark, classes.join(" "), () => {
        if (typeof options.onCell === "function") options.onCell(index);
      });
      cell.disabled = !options.onCell || !!shot;
      cell.setAttribute("aria-label", coord + (shot ? shot.hit ? ", hit" : ", miss" : ship && options.showShips ? ", ship" : ", empty"));
      cell.title = coord;
      grid.append(cell);
    }
    panel.append(grid);
    return panel;
  }

  function renderBattleship(game, container, privateState, isSpectator, canMove) {
    const state = game.state || {};
    const placed = state.placed || {};
    const shots = state.shots || { p1: [], p2: [] };
    const readyCount = [placed.p1, placed.p2].filter(Boolean).length;
    const playerKey = game.player_one_id === userId() ? "p1" : game.player_two_id === userId() ? "p2" : null;
    const opponentKey = playerKey === "p1" ? "p2" : "p1";
    const fleet = battleshipShipLabels(privateState?.ships);

    if (game.status === "active" && state.phase === "placement") {
      if (isSpectator) {
        container.append(node("p", "games-battleship-note", readyCount + " of 2 players have locked in their fleets. Ship layouts are hidden from spectators."));
        return;
      }
      if (privateState?.placed && fleet.length === 5) {
        const waiting = node("p", "games-battleship-note", "Your fleet is locked in. Waiting for " + (readyCount === 1 ? "the other player" : "the match to begin") + ".");
        container.append(waiting, makeBattleshipGrid("Your fleet · ready", fleet, [], { showShips: true }));
        return;
      }

      const draft = battleshipDraftFor(game);
      const controls = node("div", "games-battleship-setup");
      const setupTop = node("div", "games-battleship-setup-top");
      setupTop.append(node("strong", "", "Place your fleet"));
      setupTop.append(node("span", "muted tiny", draft.ships.length + " / 5 ships placed"));
      controls.append(setupTop);

      const picker = node("div", "games-battleship-fleet-picker");
      BATTLESHIP_FLEET.forEach(ship => {
        const isPlaced = draft.ships.some(item => item.id === ship.id);
        const choice = button(ship.name + " · " + ship.length + (isPlaced ? " ✓" : ""), "games-battleship-ship-choice" + (draft.selected === ship.id ? " is-selected" : "") + (isPlaced ? " is-placed" : ""), () => {
          draft.selected = ship.id;
          draft.message = "Select a square on the board to place the " + ship.name + ".";
          renderBoardModal();
        });
        choice.setAttribute("aria-pressed", draft.selected === ship.id ? "true" : "false");
        picker.append(choice);
      });
      controls.append(picker);

      const tools = node("div", "games-battleship-tools");
      tools.append(node("span", "muted tiny", "Orientation"));
      tools.append(button(draft.orientation === "horizontal" ? "Horizontal ↔" : "Vertical ↕", "outline", () => {
        draft.orientation = draft.orientation === "horizontal" ? "vertical" : "horizontal";
        draft.message = "Orientation changed to " + draft.orientation + ".";
        renderBoardModal();
      }));
      controls.append(tools);

      const board = makeBattleshipGrid("Your waters · tap a starting square", draft.ships, [], {
        showShips: true,
        onCell: index => placeBattleshipDraftShip(game, index)
      });
      container.append(controls, board);
      container.append(node("p", "games-battleship-note", draft.message || "Choose a ship, choose its direction, then tap where it should begin."));
      const lock = button("Lock in fleet", "primary", () => submitBattleshipFleet(game));
      lock.disabled = draft.ships.length !== BATTLESHIP_FLEET.length || busy;
      container.append(lock);
      return;
    }

    if (isSpectator) {
      const boards = node("div", "games-battleship-layout");
      boards.append(
        makeBattleshipGrid(memberName(game.player_one_id) + " · shots", [], shots.p1 || [], { showShips: false }),
        makeBattleshipGrid(memberName(game.player_two_id) + " · shots", [], shots.p2 || [], { showShips: false })
      );
      container.append(node("p", "games-battleship-note", "Spectator view. You can follow hits and misses, but ship locations remain private."), boards);
      return;
    }

    const incoming = shots[opponentKey] || [];
    const outgoing = shots[playerKey] || [];
    const boards = node("div", "games-battleship-layout");
    boards.append(
      makeBattleshipGrid("Your fleet", fleet, incoming, { showShips: true }),
      makeBattleshipGrid("Opponent's waters · your shots", [], outgoing, {
        showShips: false,
        onCell: canMove ? index => fireBattleshipSquare(game, index) : null
      })
    );
    container.append(boards);
    const hits = outgoing.filter(shot => shot.hit).length;
    container.append(node("p", "games-battleship-note", hits + " of 17 ship squares hit · " + outgoing.length + " shots fired"));
  }

  function tttWinningLine(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const line of lines) {
      const mark = board[line[0]];
      if (mark && mark === board[line[1]] && mark === board[line[2]]) return line;
    }
    return null;
  }

  function tttWinner(board) {
    const line = tttWinningLine(board);
    return line ? board[line[0]] : null;
  }

  function renderTicTacToe(game, container, canMove) {
    const state = game.state || {};
    const board = Array.isArray(state.board) && state.board.length === 9 ? state.board : Array(9).fill("");
    const winningLine = tttWinningLine(board);
    const winner = winningLine ? board[winningLine[0]] : null;
    const currentMark = state.turn === "o" ? "o" : "x";
    const playerOneTurn = game.turn_user_id === game.player_one_id;
    const players = node("div", "games-ttt-players");
    const makePlayer = (id, mark, isActive) => {
      const card = node("div", "games-ttt-player" + (isActive && game.status === "active" ? " is-current" : "") + (winner === mark ? " is-winner" : ""));
      const symbol = node("span", "games-ttt-player-symbol mark-" + mark, mark.toUpperCase());
      const info = node("span", "games-ttt-player-info");
      info.append(node("strong", "", memberName(id)), node("small", "", mark.toUpperCase() + (winner === mark ? " · Winner" : "")));
      card.append(symbol, info);
      if (isActive && game.status === "active") card.append(node("span", "games-ttt-turn-dot"));
      return card;
    };
    players.append(
      makePlayer(game.player_one_id, "x", playerOneTurn),
      makePlayer(game.player_two_id, "o", !playerOneTurn)
    );

    const boardFrame = node("div", "games-ttt-frame");
    const grid = node("div", "games-ttt-board");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Tic-Tac-Toe board");
    board.forEach((mark, index) => {
      const isWinningCell = !!winningLine?.includes(index);
      const cell = button("", "games-ttt-cell" + (mark ? " mark-" + mark : " mark-empty") + (isWinningCell ? " is-winning" : ""), () => {
        if (!canMove || board[index]) return;
        const next = board.slice();
        next[index] = currentMark;
        const nextWinningLine = tttWinningLine(next);
        const winningMark = nextWinningLine ? next[nextWinningLine[0]] : null;
        const draw = !winningMark && next.every(Boolean);
        const nextTurn = currentMark === "x" ? "o" : "x";
        const nextId = winningMark || draw ? null : (nextTurn === "x" ? game.player_one_id : game.player_two_id);
        const result = winningMark ? resultForWinner(game, winningMark === "x" ? game.player_one_id : game.player_two_id) : (draw ? "draw" : null);
        void commitMove(game, { board: next, turn: nextTurn, moves: (state.moves || 0) + 1 }, nextId, result);
      });
      cell.append(node("span", "games-ttt-mark", mark ? mark.toUpperCase() : ""));
      cell.disabled = !canMove || !!mark || game.status !== "active";
      cell.setAttribute("aria-label", "Square " + (index + 1) + (mark ? ", " + mark.toUpperCase() : ", empty"));
      cell.setAttribute("aria-pressed", mark ? "true" : "false");
      if (!mark && canMove && game.status === "active") cell.title = "Place " + currentMark.toUpperCase();
      grid.append(cell);
    });
    boardFrame.append(grid);

    const footer = node("div", "games-ttt-footer");
    const moveCount = Number.isFinite(state.moves) ? state.moves : board.filter(Boolean).length;
    footer.append(
      node("span", "games-ttt-move-count", moveCount + " / 9 moves"),
      node("span", "games-ttt-board-note", game.status === "completed" ? "Final board" : canMove ? "Your move" : "Waiting for the next move")
    );
    container.append(players, boardFrame, footer);
  }

  function connectWinner(board, row, col, token) {
    const directions = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of directions) {
      let count = 1;
      for (const sign of [-1,1]) {
        let r = row + dr * sign, c = col + dc * sign;
        while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r * 7 + c] === token) {
          count++; r += dr * sign; c += dc * sign;
        }
      }
      if (count >= 4) return true;
    }
    return false;
  }

  function renderConnectFour(game, container, canMove) {
    const state = game.state || {};
    const board = Array.isArray(state.board) && state.board.length === 42 ? state.board : Array(42).fill("");
    const grid = node("div", "games-connect-board");
    const columns = node("div", "games-connect-columns");
    for (let col = 0; col < 7; col++) {
      columns.append(button("↓", "games-connect-column", () => {
        if (!canMove) return;
        const next = board.slice();
        let row = -1;
        for (let r = 5; r >= 0; r--) if (!next[r * 7 + col]) { row = r; break; }
        if (row < 0) return;
        const token = state.turn === "red" ? "R" : "Y";
        next[row * 7 + col] = token;
        const won = connectWinner(next, row, col, token);
        const draw = !won && next.every(Boolean);
        const nextTurn = state.turn === "red" ? "yellow" : "red";
        const nextId = won || draw ? null : (nextTurn === "red" ? game.player_one_id : game.player_two_id);
        const result = won ? resultForWinner(game, token === "R" ? game.player_one_id : game.player_two_id) : (draw ? "draw" : null);
        void commitMove(game, { board: next, turn: nextTurn, moves: (state.moves || 0) + 1 }, nextId, result);
      }));
    }
    for (let i = 0; i < 42; i++) {
      const token = board[i];
      const cell = node("div", "games-connect-cell");
      const disc = node("span", "games-connect-disc" + (token === "R" ? " red" : token === "Y" ? " yellow" : ""));
      cell.append(disc);
      grid.append(cell);
    }
    container.append(columns, grid);
    columns.querySelectorAll("button").forEach(button => { button.disabled = !canMove; });
  }

  function checkerSide(piece) {
    if (!piece || piece === ".") return null;
    return piece.toLowerCase() === "w" ? "white" : "black";
  }
  function checkerDirections(piece) {
    const side = checkerSide(piece);
    const directions = [];
    if (piece === "W" || piece === "B" || side === "white") directions.push([-1,-1],[-1,1]);
    if (piece === "W" || piece === "B" || side === "black") directions.push([1,-1],[1,1]);
    return directions;
  }
  function checkersLegalMoves(state) {
    const board = String(state.board || "").split("");
    if (board.length !== 64) return [];
    const captures = [], normal = [];
    for (let from = 0; from < 64; from++) {
      const piece = board[from];
      if (checkerSide(piece) !== state.turn) continue;
      if (state.forcedIndex !== null && state.forcedIndex !== undefined && Number(state.forcedIndex) !== from) continue;
      const row = Math.floor(from / 8), col = from % 8;
      checkerDirections(piece).forEach(([dr,dc]) => {
        const r1 = row + dr, c1 = col + dc, r2 = row + dr * 2, c2 = col + dc * 2;
        if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) return;
        const adjacent = r1 * 8 + c1;
        if (checkerSide(board[adjacent]) && checkerSide(board[adjacent]) !== state.turn &&
            r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && board[r2 * 8 + c2] === ".") {
          captures.push({ from, to: r2 * 8 + c2, captured: adjacent });
        } else if (!board[adjacent] || board[adjacent] === ".") {
          normal.push({ from, to: adjacent, captured: null });
        }
      });
    }
    return captures.length ? captures : (state.forcedIndex !== null && state.forcedIndex !== undefined ? [] : normal);
  }
  function checkerCount(board, side) {
    return board.split("").filter(piece => checkerSide(piece) === side).length;
  }

  function renderCheckers(game, container, canMove) {
    const state = game.state || {};
    const board = String(state.board || "").length === 64 ? String(state.board) : ".".repeat(64);
    const moves = checkersLegalMoves(state);
    const selectedMoves = selectedSquare === null ? [] : moves.filter(move => move.from === selectedSquare);
    const grid = node("div", "games-checkers-board");
    for (let index = 0; index < 64; index++) {
      const row = Math.floor(index / 8), col = index % 8;
      const piece = board[index];
      const cell = button("", "games-checkers-cell " + ((row + col) % 2 ? "dark" : "light"), () => {
        if (!canMove) return;
        const chosen = moves.find(move => move.from === selectedSquare && move.to === index);
        if (chosen) { void playCheckerMove(game, state, chosen); return; }
        if (checkerSide(piece) === state.turn && (state.forcedIndex === null || state.forcedIndex === undefined || Number(state.forcedIndex) === index)) {
          selectedSquare = index;
          renderBoardModal();
        } else {
          selectedSquare = null;
          renderBoardModal();
        }
      });
      cell.disabled = !canMove;
      if (selectedSquare === index) cell.classList.add("selected");
      if (selectedMoves.some(move => move.to === index)) cell.classList.add("legal-target");
      if (piece !== ".") {
        const checker = node("span", "games-checker-piece " + (checkerSide(piece) === "white" ? "white" : "black") + (piece === "W" || piece === "B" ? " king" : ""));
        checker.textContent = piece === "W" || piece === "B" ? "♛" : "●";
        cell.append(checker);
      }
      cell.setAttribute("aria-label", "Row " + (row + 1) + ", column " + (col + 1) + (piece === "." ? ", empty" : ", " + (checkerSide(piece) === "white" ? "white" : "black") + (piece === "W" || piece === "B" ? " king" : " piece")));
      grid.append(cell);
    }
    container.append(grid);
  }

  async function playCheckerMove(game, state, move) {
    const board = String(state.board).split("");
    const piece = board[move.from];
    board[move.from] = ".";
    if (move.captured !== null) board[move.captured] = ".";
    board[move.to] = piece;
    const row = Math.floor(move.to / 8);
    const promoted = (piece === "w" && row === 0) || (piece === "b" && row === 7);
    if (promoted) board[move.to] = piece.toUpperCase();
    let nextTurn = state.turn === "white" ? "black" : "white";
    let forcedIndex = null;
    if (move.captured !== null && !promoted) {
      const continuation = checkersLegalMoves({ board: board.join(""), turn: state.turn, forcedIndex: move.to });
      if (continuation.length) {
        nextTurn = state.turn;
        forcedIndex = move.to;
      }
    }
    const nextState = { board: board.join(""), turn: nextTurn, forcedIndex, moves: (state.moves || 0) + 1 };
    let result = null, nextUser = nextTurn === "white" ? game.player_one_id : game.player_two_id;
    if (checkerCount(nextState.board, nextTurn) === 0 || checkersLegalMoves(nextState).length === 0) {
      result = resultForWinner(game, state.turn === "white" ? game.player_one_id : game.player_two_id);
      nextUser = null;
      nextState.forcedIndex = null;
    }
    selectedSquare = null;
    await commitMove(game, nextState, nextUser, result);
  }

  function renderChess(game, container, canMove) {
    if (typeof window.Chess !== "function") {
      container.append(node("p", "status error", "Chess rules could not load. Reload Gather and try again."));
      return;
    }
    let chess;
    try { chess = new window.Chess(game.state?.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"); }
    catch (error) {
      container.append(node("p", "status error", "This saved chess position could not be opened."));
      return;
    }
    const board = chess.board();
    const grid = node("div", "games-chess-board");
    const selectedMoves = selectedSquare ? chess.moves({ square: selectedSquare, verbose: true }) : [];
    const legalTargets = selectedMoves.map(move => move.to);
    board.forEach((rank, row) => rank.forEach((piece, col) => {
      const square = "abcdefgh"[col] + String(8 - row);
      const cell = button("", "games-chess-cell " + ((row + col) % 2 ? "dark" : "light"), () => {
        if (!canMove) return;
        const selectedPiece = selectedSquare ? chess.get(selectedSquare) : null;
        const legal = selectedSquare ? chess.moves({ square: selectedSquare, verbose: true }) : [];
        const target = legal.filter(move => move.to === square);
        if (target.length) {
          if (target.some(move => move.promotion)) {
            showPromotionChoices(game, chess, selectedSquare, square);
          } else {
            void playChessMove(game, chess, selectedSquare, square, null);
          }
          return;
        }
        if (piece && piece.color === chess.turn()) {
          selectedSquare = square;
          renderBoardModal();
        } else if (selectedPiece) {
          selectedSquare = null;
          renderBoardModal();
        }
      });
      cell.disabled = !canMove;
      if (selectedSquare === square) cell.classList.add("selected");
      if (legalTargets.includes(square)) cell.classList.add(piece ? "legal-capture" : "legal-target");
      if (piece) {
        const glyph = PIECES[piece.color === "w" ? piece.type.toUpperCase() : piece.type.toLowerCase()];
        cell.append(node("span", "games-chess-piece " + (piece.color === "w" ? "white" : "black"), glyph));
      }
      cell.setAttribute("aria-label", square + (piece ? ", " + piece.color + " " + piece.type : ", empty"));
      grid.append(cell);
    }));
    container.append(grid);
    const moves = chess.history();
    if (moves.length) {
      const last = moves.slice(-8).join(" · ");
      const history = node("p", "games-chess-history", "Recent moves: " + last);
      container.append(history);
    }
    if (chess.in_check()) $("games-board-status").textContent += " · Check";
  }

  function showPromotionChoices(game, chess, from, to) {
    const chooser = $("games-promotion-choices");
    chooser.replaceChildren(node("span", "muted tiny", "Promote pawn to:"));
    ["q","r","b","n"].forEach(piece => {
      chooser.append(button(({q:"Queen",r:"Rook",b:"Bishop",n:"Knight"})[piece], "outline", () => {
        chooser.hidden = true;
        void playChessMove(game, chess, from, to, piece);
      }));
    });
    chooser.hidden = false;
  }

  async function playChessMove(game, chess, from, to, promotion) {
    const move = chess.move({ from, to, promotion: promotion || "q" });
    if (!move) return;
    const over = chess.game_over();
    let result = null, nextUser = chess.turn() === "w" ? game.player_one_id : game.player_two_id;
    if (over) {
      if (chess.in_checkmate()) {
        const winnerIsWhite = chess.turn() === "b";
        result = resultForWinner(game, winnerIsWhite ? game.player_one_id : game.player_two_id);
      } else {
        result = "draw";
      }
      nextUser = null;
    }
    selectedSquare = null;
    await commitMove(game, { fen: chess.fen(), moves: chess.history(), lastMove: move.san }, nextUser, result);
  }

  function shutdown() {
    if (syncRefreshTimer) clearInterval(syncRefreshTimer);
    syncRefreshTimer = null;
    clearTimeout(refreshTimer);
    refreshTimer = null;
    if (channel && ctx?.db) ctx.db.removeChannel(channel);
    channel = null;
    initialized = false;
    games = [];
    activeGameId = null;
    activeGame = null;
    activeChat = null;
    $("games-create-overlay")?.setAttribute("hidden", "");
    $("games-board-overlay")?.setAttribute("hidden", "");
    $("games-workspace")?.setAttribute("hidden", "");
    $("games-chat-tray")?.setAttribute("hidden", "");
    ctx = null;
  }

  window.GatherGames = {
    init,
    setActiveChat,
    showHub,
    openCreateModal,
    openInvitation,
    getPendingInvitations,
    respondToInvitation,
    refresh: () => refreshGames(true),
    shutdown
  };
})();
