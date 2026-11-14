(() => {
  "use strict";

  const COLORS = [
    { key: "red", label: "Red", hex: "#D85A60", offset: 0, base: "2 / span 5", row: "2 / span 5", lane: Array.from({ length: 6 }, (_, i) => [i + 1, 7]) },
    { key: "yellow", label: "Yellow", hex: "#D9AD45", offset: 13, base: "10 / span 5", row: "2 / span 5", lane: Array.from({ length: 6 }, (_, i) => [7, 13 - i]) },
    { key: "blue", label: "Blue", hex: "#4F83D1", offset: 26, base: "10 / span 5", row: "10 / span 5", lane: Array.from({ length: 6 }, (_, i) => [13 - i, 7]) },
    { key: "green", label: "Green", hex: "#39A96B", offset: 39, base: "2 / span 5", row: "10 / span 5", lane: Array.from({ length: 6 }, (_, i) => [7, i + 1]) }
  ];
  const COLOR_BY_KEY = Object.fromEntries(COLORS.map(color => [color.key, color]));
  const COLOR_BY_HEX = Object.fromEntries(COLORS.map(color => [color.hex.toLowerCase(), color]));
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  const TRACK = (() => {
    const cells = [];
    for (let col = 7; col <= 13; col++) cells.push([0, col]);
    for (let row = 1; row <= 13; row++) cells.push([row, 14]);
    for (let col = 13; col >= 1; col--) cells.push([14, col]);
    for (let row = 13; row >= 1; row--) cells.push([row, 0]);
    for (let col = 1; col <= 6; col++) cells.push([0, col]);
    return cells;
  })();

  let ctx = null;
  let channel = null;
  let lifecycleListenersBound = false;
  let channelConnected = false;
  let refreshTimer = null;
  let busy = false;
  let panelOpen = false;
  let panelView = "list";
  let activeGameId = null;
  let activeGame = null;
  let players = [];
  let games = [];
  let membershipRows = [];
  let gameMenuOpen = false;

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  const btn = (label, cls, action) => {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  };
  const uid = () => ctx?.user?.()?.id || null;
  const chats = () => ctx?.chats?.() || [];
  const profiles = () => ctx?.profiles?.() || {};
  const toast = message => ctx?.toast?.(message);
  const name = id => {
    const p = profiles()[id];
    return p?.display_name?.trim() || p?.username?.trim() || "Gather member";
  };
  const colorName = value => COLOR_BY_KEY[value]?.label || COLOR_BY_HEX[String(value || "").toLowerCase()]?.label || "Player";
  const colorKey = value => COLOR_BY_KEY[value] ? value : COLOR_BY_HEX[String(value || "").toLowerCase()]?.key || null;
  const conversationName = id => {
    const chat = chats().find(item => item.id === id);
    if (!chat) return "Conversation";
    if (chat.kind === "group") return chat.title?.trim() || "Group chat";
    const peer = chat.members?.find(member => member.user_id !== uid());
    return peer ? name(peer.user_id) : "Private chat";
  };
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const currentPlayer = () => players.find(player => player.user_id === uid());
  const isHost = () => !!activeGame && activeGame.created_by === uid();
  const isJoined = () => currentPlayer()?.status === "joined";
  const isStarted = () => !!activeGame?.state?.started;
  const maxPlayers = game => Math.max(2, Math.min(4, Number(game?.settings?.max_players) || 4));
  const joinedPlayers = list => (list || []).filter(player => player.status === "joined");
  const availableColors = self => COLORS.filter(color => {
    const used = joinedPlayers(players).some(player => player.user_id !== self && colorKey(player.color) === color.key);
    return !used;
  });

  function mount() {
    if ($("ludo-overlay")) return;
    const overlay = el("div", "overlay ludo-overlay");
    overlay.id = "ludo-overlay";
    overlay.hidden = true;
    overlay.innerHTML = '<section class="modal ludo-modal tag-modal" role="dialog" aria-modal="true" aria-labelledby="ludo-dialog-title"><button id="ludo-close" class="close" type="button" aria-label="Close Ludo">×</button><div id="ludo-game-menu" class="ludo-game-menu" hidden aria-label="Ludo match menu"></div><div id="ludo-content"></div></section>';
    document.body.append(overlay);
    $("ludo-close").addEventListener("click", () => {
      if (isLiveMatchView()) toggleGameMenu();
      else close();
    });
    overlay.addEventListener("click", event => {
      if (event.target === overlay) {
        if (gameMenuOpen) closeGameMenu();
        else close();
      }
    });
    overlay.addEventListener("keydown", event => {
      if (event.key === "Escape" && gameMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeGameMenu();
        $("ludo-close")?.focus();
      }
    });
  }

  function refreshOnReturn() {
    if (document.hidden || !navigator.onLine || !ctx || !uid()) return;
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => { if (ctx && uid()) void refresh(); }, 160);
  }

  function init(options) {
    ctx = options;
    mount();
    if (!channel) {
      channel = ctx.db.channel("gather-ludo-multiplayer-" + (uid() || "member"))
        .on("postgres_changes", { event: "*", schema: "public", table: "gather_multiplayer_games" }, payload => {
          const row = payload?.new || payload?.old;
          if (activeGameId && row?.id === activeGameId) scheduleLoad();
          else scheduleRefresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "gather_multiplayer_players" }, payload => {
          const row = payload?.new || payload?.old;
          if (activeGameId && row?.game_id === activeGameId) scheduleLoad();
          else scheduleRefresh();
        })
        .subscribe(status => {
          if (status === "SUBSCRIBED") {
            if (channelConnected) refreshOnReturn();
            channelConnected = true;
          }
        });
    }
    if (!lifecycleListenersBound) {
      document.addEventListener("visibilitychange", refreshOnReturn);
      window.addEventListener("focus", refreshOnReturn);
      window.addEventListener("pageshow", refreshOnReturn);
      window.addEventListener("online", refreshOnReturn);
      lifecycleListenersBound = true;
    }
    void refresh();
  }

  function scheduleLoad() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (activeGameId) void loadGame(); }, 160);
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (!activeGameId && panelOpen) void refresh(); }, 260);
  }

  async function refresh() {
    if (!ctx || !uid()) return;
    // Game-only lobbies have conversation_id = null. Always load the current
    // member's own game memberships first, then add discoverable legacy chat lobbies.
    const mine = await ctx.db.from("gather_multiplayer_players")
      .select("game_id,user_id,status,color,ready,joined_at")
      .eq("user_id", uid())
      .in("status", ["joined", "invited"]);
    if (mine.error) {
      if (panelOpen) setStatus("Your Ludo games could not be loaded: " + mine.error.message, true);
      return;
    }
    const ownGameIds = [...new Set((mine.data || []).map(row => row.game_id).filter(Boolean))];
    const conversationIds = [...new Set(chats().map(chat => chat.id).filter(Boolean))];
    const queries = [];
    if (ownGameIds.length) {
      queries.push(ctx.db.from("gather_multiplayer_games")
        .select("id,conversation_id,game_type,status,created_by,join_mode,settings,state,revision,created_at,updated_at")
        .eq("game_type", "ludo").in("id", ownGameIds));
    }
    if (conversationIds.length) {
      queries.push(ctx.db.from("gather_multiplayer_games")
        .select("id,conversation_id,game_type,status,created_by,join_mode,settings,state,revision,created_at,updated_at")
        .eq("game_type", "ludo").in("conversation_id", conversationIds)
        .in("status", ["active", "completed"]).order("updated_at", { ascending: false }).limit(60));
    }
    const results = await Promise.all(queries);
    const failed = results.find(result => result.error);
    if (failed) {
      if (panelOpen) setStatus("Ludo lobbies could not be loaded: " + failed.error.message, true);
      return;
    }
    const byId = new Map();
    results.forEach(result => (result.data || []).forEach(game => byId.set(game.id, game)));
    games = [...byId.values()].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    const gameIds = games.map(game => game.id);
    if (gameIds.length) {
      const members = await ctx.db.from("gather_multiplayer_players")
        .select("game_id,user_id,status,color,ready,joined_at").in("game_id", gameIds);
      membershipRows = members.error ? (mine.data || []) : (members.data || []);
    } else {
      membershipRows = mine.data || [];
    }
    if (typeof ctx.onGamesUpdated === "function") ctx.onGamesUpdated();
    if (activeGameId) {
      await loadGame();
      return;
    }
    if (panelOpen && panelView === "list") renderLobbyList();
  }

  async function loadPlayers(id) {
    const result = await ctx.db.from("gather_multiplayer_players")
      .select("game_id,user_id,status,color,ready,joined_at")
      .eq("game_id", id)
      .in("status", ["joined", "invited"])
      .order("joined_at", { ascending: true });
    if (result.error) throw result.error;
    players = result.data || [];
  }

  async function loadGame() {
    if (!ctx || !activeGameId) return;
    const result = await ctx.db.from("gather_multiplayer_games")
      .select("id,conversation_id,game_type,status,created_by,join_mode,settings,state,revision,created_at,updated_at")
      .eq("id", activeGameId)
      .eq("game_type", "ludo")
      .maybeSingle();
    if (result.error || !result.data) {
      setStatus(result.error?.message || "This Ludo game could not be found.", true);
      return;
    }
    activeGame = result.data;
    try {
      await loadPlayers(activeGameId);
    } catch (error) {
      setStatus(error?.message || "The player list could not be loaded.", true);
      return;
    }
    if (panelOpen) renderGamePanel();
  }

  function open() {
    if (!ctx || !uid()) {
      toast("Sign in to play Ludo.");
      return;
    }
    mount();
    panelOpen = true;
    panelView = "list";
    activeGameId = null;
    activeGame = null;
    players = [];
    $("ludo-overlay").hidden = false;
    renderLobbyList();
    void refresh();
  }

  async function openInvitation(id) {
    if (!ctx || !uid()) return;
    mount();
    panelOpen = true;
    panelView = "game";
    $("ludo-overlay").hidden = false;
    activeGameId = id;
    await loadGame();
  }
  async function openGame(id) {
    if (!ctx || !uid()) return;
    mount();panelOpen=true;panelView="game";activeGameId=id;activeGame=null;players=[];
    $("ludo-overlay").hidden=false;await loadGame();
  }

  function close() {
    gameMenuOpen = false;
    const menu = $("ludo-game-menu");
    if (menu) menu.hidden = true;
    panelOpen = false;
    panelView = "list";
    $("ludo-overlay").hidden = true;
    activeGameId = null;
    activeGame = null;
    players = [];
    syncGameMenuTrigger();
  }


  function isLiveMatchView() {
    return panelOpen && panelView === "game" &&
      activeGame?.status === "active" && !!activeGame?.state?.started;
  }

  function syncGameMenuTrigger() {
    const trigger = $("ludo-close");
    const menu = $("ludo-game-menu");
    if (!trigger) return;

    if (!isLiveMatchView()) {
      gameMenuOpen = false;
      if (menu) {
        menu.hidden = true;
        menu.replaceChildren();
      }
      trigger.textContent = "×";
      trigger.classList.remove("ludo-menu-trigger");
      trigger.setAttribute("aria-label", "Close Ludo");
      trigger.setAttribute("aria-expanded", "false");
      trigger.title = "Close";
      return;
    }

    trigger.classList.add("ludo-menu-trigger");
    trigger.textContent = gameMenuOpen ? "×" : "☰";
    trigger.setAttribute("aria-label", gameMenuOpen ? "Close match menu" : "Open match menu");
    trigger.setAttribute("aria-expanded", String(gameMenuOpen));
    trigger.title = gameMenuOpen ? "Close menu" : "Match menu";
  }

  function closeGameMenu() {
    gameMenuOpen = false;
    const menu = $("ludo-game-menu");
    if (menu) menu.hidden = true;
    syncGameMenuTrigger();
  }

  function addGameMenuAction(menu, label, description, symbol, variant, handler, disabled = false) {
    const item = el("button", "ludo-menu-action" + (variant ? " " + variant : ""));
    item.type = "button";
    item.disabled = !!disabled;

    const icon = el("span", "ludo-menu-icon", symbol);
    icon.setAttribute("aria-hidden", "true");
    const copy = el("span", "ludo-menu-copy");
    copy.append(el("strong", "", label), el("small", "", description));
    item.append(icon, copy);
    item.addEventListener("click", handler);
    menu.append(item);
    return item;
  }

  function renderGameMenu() {
    const menu = $("ludo-game-menu");
    if (!menu || !isLiveMatchView()) return;

    menu.replaceChildren();
    const header = el("div", "ludo-menu-heading");
    header.append(el("span", "eyebrow", "MATCH MENU"), el("strong", "", "Ludo options"));
    menu.append(header);

    addGameMenuAction(
      menu, "Game chat", "Open the temporary match conversation", "▤", "",
      () => {
        closeGameMenu();
        const chatToggle = $("ludo-content")?.querySelector(".game-chat-toggle");
        if (!chatToggle) {
          toast("Game chat is unavailable right now.");
          return;
        }
        if (chatToggle.getAttribute("aria-expanded") !== "true") chatToggle.click();
      },
      !isJoined()
    );

    if (isHost()) {
      addGameMenuAction(
        menu, "End match", "Finish this match for everyone", "■", "danger",
        async () => {
          if (busy || !activeGame) return;
          if (!window.confirm("End this Ludo match for everyone?")) return;
          closeGameMenu();
          await callAction("end");
        },
        busy
      );
    }

    const membership = currentPlayer();
    const canLeave = membership && ["joined", "invited"].includes(membership.status);
    addGameMenuAction(
      menu, "Leave lobby", "Leave the match and remove your player slot", "↗", "danger",
      async () => {
        if (busy || !canLeave || !activeGame) return;
        if (!window.confirm("Leave this Ludo lobby? You will no longer be part of this match.")) return;

        const gameId = activeGame.id;
        busy = true;
        try {
          const result = await ctx.db.rpc("gather_ludo_leave", { p_game_id: gameId });
          if (result.error) throw result.error;
          closeGameMenu();
          activeGameId = null;
          activeGame = null;
          players = [];
          panelView = "list";
          toast("You left the Ludo lobby.");
          await refresh();
        } catch (error) {
          toast(error?.message || "You could not leave this Ludo lobby.");
        } finally {
          busy = false;
        }
      },
      !canLeave || busy
    );

    addGameMenuAction(
      menu, "Exit game", "Return to Ludo games and stay in this lobby", "↩", "",
      async () => {
        if (busy) return;
        closeGameMenu();
        activeGameId = null;
        activeGame = null;
        players = [];
        panelView = "list";
        await refresh();
      },
      busy
    );

    menu.hidden = false;
    syncGameMenuTrigger();
  }

  function toggleGameMenu() {
    if (!isLiveMatchView()) {
      close();
      return;
    }
    if (gameMenuOpen) {
      closeGameMenu();
      return;
    }
    gameMenuOpen = true;
    renderGameMenu();
    syncGameMenuTrigger();
  }

  function setStatus(message, isError) {
    const n = $("ludo-status");
    if (n) {
      n.textContent = message || "";
      n.classList.toggle("error", !!isError);
    }
  }

  function eligibleChats() {
    return chats().filter(chat =>
      (chat.members || []).some(member => member.user_id === uid()) &&
      (chat.members || []).some(member => member.user_id !== uid())
    );
  }

  function appendChatOptions(select, list) {
    [
      { label: "Private chats", items: list.filter(chat => chat.kind !== "group") },
      { label: "Group chats", items: list.filter(chat => chat.kind === "group") }
    ].forEach(section => {
      if (!section.items.length) return;
      const group = el("optgroup");
      group.label = section.label;
      section.items.slice().sort((a, b) => byName(conversationName(a.id), conversationName(b.id))).forEach(chat => {
        const option = el("option", "", conversationName(chat.id));
        option.value = chat.id;
        group.append(option);
      });
      select.append(group);
    });
  }

  function makeField(labelText, control) {
    const label = el("label", "ludo-field");
    label.append(el("span", "", labelText), control);
    return label;
  }

  function renderLobbyList() {
    panelView = "list";
    syncGameMenuTrigger();
    const root = $("ludo-content");
    if (!root) return;
    root.replaceChildren();
    root.append(el("p", "eyebrow", "GATHER GAMES · MULTIPLAYER"));
    root.append(el("h2", "ludo-title", "Ludo"));
    root.append(el("p", "muted tiny ludo-intro", "Race four tokens around the board. Create a private lobby or let people in a conversation join."));
    root.append(btn("＋ Create Ludo lobby", "primary ludo-create-button", renderCreate));
    const section = el("section", "ludo-lobby-section");
    section.append(el("h3", "ludo-section-title", "Available lobbies"));
    const list = el("div", "ludo-lobby-list");
    const available = new Set(eligibleChats().map(chat => chat.id));
    const shown = games.filter(game => {
      if (game.status !== "active") return false;
      const mine = membershipRows.some(player => player.game_id === game.id && player.user_id === uid() && ["joined", "invited"].includes(player.status));
      if (mine) return true;
      if (!available.has(game.conversation_id)) return false;
      return game.join_mode === "open" || game.created_by === uid();
    });
    if (!shown.length) list.append(el("p", "ludo-empty muted tiny", "No active Ludo lobbies in your conversations yet."));
    shown.forEach(game => {
      const card = el("article", "ludo-lobby-card");
      const currentPlayers = playersForSummary(game);
      const info = el("div", "ludo-lobby-info");
      const started = !!game.state?.started;
      info.append(
        el("strong", "", game.settings?.title || "Ludo match"),
        el("small", "muted", conversationName(game.conversation_id) + " · " +
          (game.join_mode === "open" ? "Open" : "Invite-only") + " · " +
          (game.state?.player_count || currentPlayers || "?") + "/" + maxPlayers(game) + " players")
      );
      const action = btn(started ? "Open match" : game.join_mode === "open" ? "Join lobby" : "View invite", "outline", async () => {
        activeGameId = game.id;
        activeGame = game;
        await loadGame();
        if (!activeGame) return;
        // Keep color selection in the lobby panel for invitees and open-lobby joiners.
        // renderGamePanel() presents the join prompt when this member has not joined yet.
      });
      card.append(info, action);
      list.append(card);
    });
    section.append(list);
    root.append(section);
    const history = games.filter(game => game.status === "completed");
    if (history.length) {
      const historySection = el("section", "ludo-lobby-section");
      historySection.append(el("h3", "ludo-section-title", "Completed matches"));
      history.slice(0, 8).forEach(game => {
        const card = el("article", "ludo-lobby-card");
        card.append(el("div", "ludo-lobby-info", conversationName(game.conversation_id) + " · " + (game.state?.winner_id ? name(game.state.winner_id) + " won" : "Match ended")),
          btn("View result", "outline", async () => { activeGameId = game.id; activeGame = game; await loadGame(); }));
        historySection.append(card);
      });
      root.append(historySection);
    }
    const status = el("p", "status ludo-status", "");
    status.id = "ludo-status";
    root.append(status);
  }

  function playersForSummary(game) {
    return membershipRows.filter(player => player.game_id === game.id && player.status === "joined").length;
  }

  function renderCreate() {
    panelView = "create";
    syncGameMenuTrigger();
    const root=$("ludo-content");root.replaceChildren();root.append(el("p","eyebrow","NEW LUDO LOBBY"));
    const title=el("h2","ludo-title","Set up your lobby");title.id="ludo-dialog-title";
    root.append(title,el("p","muted tiny ludo-intro","Choose friends to invite. Game invitations do not create a group conversation."));
    const form=el("form","ludo-form tag-form"),selected=[];
    const choose=el("button","outline","Choose people");choose.type="button";const summary=el("small","muted tiny","No people selected");
    const people=el("section","ludo-people-picker tag-people-picker");people.append(choose,summary);form.append(people);
    const max=el("select");[2,3,4].forEach(v=>{const o=el("option","",v+" players");o.value=String(v);if(v===4)o.selected=true;max.append(o);});form.append(makeField("Player limit",max));
    const color=el("select");COLORS.forEach(item=>{const o=el("option","",item.label);o.value=item.hex;color.append(o);});form.append(makeField("Your color",color));
    const actions=el("div","ludo-actions tag-actions");actions.append(btn("Back","secondary-action",renderLobbyList));
    const submit=btn("Create lobby","primary",()=>{});submit.type="submit";actions.append(submit);form.append(actions);
    form.addEventListener("submit",async event=>{event.preventDefault();if(busy)return;if(!selected.length){toast("Choose at least one person to invite.");return;}if(selected.length+1>Number(max.value)){toast("The player limit must include you and everyone you invite.");return;}
      busy=true;submit.disabled=true;try{const result=await ctx.db.rpc("gather_ludo_create",{p_conversation_id:null,p_join_mode:"invite",p_invited_user_ids:selected.slice(),p_max_players:Number(max.value),p_creator_color:color.value});if(result.error)throw result.error;activeGameId=result.data.id;panelView="game";await loadGame();}
      catch(error){toast(error?.message||"Could not create the Ludo lobby.");}finally{busy=false;submit.disabled=false;}
    });
    root.append(form);window.GatherPeoplePicker?.create({db:ctx.db,button:choose,summary,onChange:ids=>selected.splice(0,selected.length,...ids)});
  }

  function renderGamePanel() {
    panelView = "game";
    const root = $("ludo-content");
    if (!root || !activeGame) return;
    root.replaceChildren();
    syncGameMenuTrigger();
    if (gameMenuOpen) renderGameMenu();
    const game = activeGame;
    const started = !!game.state?.started;
    const me = currentPlayer();
    const joined = me?.status === "joined";
    const top = el("div", "ludo-game-top");
    const heading = el("div", "ludo-game-heading");
    const dialogTitle = el("h2", "ludo-title", started ? "Ludo match" : "Ludo lobby");
    dialogTitle.id = "ludo-dialog-title";
    heading.append(el("p", "eyebrow", started ? "MATCH IN PROGRESS" : "WAITING ROOM"), dialogTitle, el("p", "muted tiny ludo-intro", conversationName(game.conversation_id) + " · " + (game.join_mode === "open" ? "Open lobby" : "Invite only")));
    top.append(heading, el("span", "ludo-player-count", joinedPlayers(players).length + "/" + maxPlayers(game) + " players"));
    root.append(top);
    // Keep the chat toggle in the top-right corner, outside the board layout.
    if(joined) window.GatherGameChat?.attach(root, ctx.db, "ludo", game.id, uid(), name);

    const actionBar = el("div", "ludo-actions tag-actions tag-lobby-actions");

    if (game.status === "cancelled") {
      root.append(el("p", "ludo-empty muted", "This Ludo lobby was cancelled."));
      return;
    }
    const closeLobby = () => btn("Close lobby", "secondary-action tag-end", async () => {
      if (busy || !activeGame || activeGame.id !== game.id) return;
      if (!window.confirm("Close this Ludo lobby for everyone? The match will end and all invited and joined players will be removed.")) return;
      busy = true;
      try {
        const result = await ctx.db.rpc("gather_ludo_cancel", { p_game_id: game.id });
        if (result.error) throw result.error;
        activeGame = { ...activeGame, status: "cancelled" };
        players = players.map(player => ({ ...player, status: "left", ready: false }));
        toast("Ludo lobby closed.");
        renderGamePanel();
        await refresh();
      } catch (error) {
        toast(error?.message || "The Ludo lobby could not be closed.");
      } finally {
        busy = false;
      }
    });

    if (game.status === "completed" || game.state?.winner_id) {
      const winner = game.state?.winner_id;
      root.append(el("section", "ludo-finished-panel", winner ? name(winner) + " wins!" : "Ludo match ended"));
      if (started) renderBoard(root, false);
      root.append(btn("Create another Ludo game", "primary", () => renderCreate()));
      if (isHost()) root.append(closeLobby());
      return;
    }

    if (!started) {
      if (joined) {
        const colorPanel = el("section", "tag-customize ludo-lobby-feature");
        colorPanel.append(el("strong", "", "Your circle"));
        const swatch = el("span", "ludo-player-swatch tag-player-swatch");
        swatch.style.background = me.color || "#38bdf8";
        swatch.style.width = "48px"; swatch.style.height = "48px";
        colorPanel.append(swatch, el("span", "muted tiny", "Your selected color for this match."));
        root.append(colorPanel);
      }
      renderPlayers(root);
      if (!joined) renderJoinPrompt(root);
      else {
        const ready = btn(me.ready ? "Not ready" : "Ready", me.ready ? "secondary-action" : "primary", async () => {
          if (busy || !activeGame || activeGame.id !== game.id) return;
          busy = true;
          ready.disabled = true;
          ready.textContent = "Updating…";
          try {
            const result = await ctx.db.rpc("gather_ludo_ready", {
              p_game_id: game.id,
              p_ready: !me.ready
            });
            if (result.error) throw result.error;
            await loadGame();
          } catch (error) {
            toast(error?.message || "Your ready status could not be changed.");
            await loadGame();
          } finally {
            busy = false;
          }
        });
        actionBar.append(ready);
      }
      if (isHost()) {
        const readyAll = joinedPlayers(players).every(player => player.ready);
        const canStart = joinedPlayers(players).length >= 2 && readyAll && joinedPlayers(players).length <= maxPlayers(game);
        const start = btn("Start match", "primary", async () => {
          start.disabled = true;
          try {
            const result = await ctx.db.rpc("gather_ludo_start", { p_game_id: game.id });
            if (result.error) throw result.error;
            await loadGame();
          } catch (error) {
            toast(error?.message || "The match could not be started.");
            start.disabled = false;
          }
        });
        start.disabled = !canStart;
        actionBar.append(start, btn("Close lobby", "secondary-action tag-end", async () => {
          if (!window.confirm("Close this Ludo lobby for everyone?")) return;
          try {
            const result = await ctx.db.rpc("gather_ludo_cancel", { p_game_id: game.id });
            if (result.error) throw result.error;
            activeGame = { ...activeGame, status: "cancelled" };
            players = players.map(player => ({ ...player, status: "left", ready: false }));
            toast("Ludo lobby closed.");
            renderGamePanel();
          } catch (error) { toast(error?.message || "The lobby could not be cancelled."); }
        }));
      }
      root.append(actionBar);
      root.append(el("p", "muted tiny ludo-lobby-hint tag-lobby-hint", "The host can start once at least two players have joined and everyone is ready."));
      root.append(btn("Back to Ludo", "outline tag-back", async () => { activeGameId = null; activeGame = null; players = []; await refresh(); }));
      return;
    }

    renderPlayers(root, true);
    renderBoard(root, joined);
    if (isHost()) root.append(closeLobby());
  }

  function renderPlayers(root, compactMatch = false) {
    const roster = el("section", "ludo-roster tag-roster" + (compactMatch ? " ludo-roster--match" : ""));
    if (!compactMatch) {
      roster.append(el("h3", "ludo-section-title tag-section-title", "Players · " + joinedPlayers(players).length + "/" + maxPlayers(activeGame)));
    }
    const visiblePlayers = compactMatch ? joinedPlayers(players) : players;
    visiblePlayers.forEach(player => {
      const row = el("div", "ludo-player-row tag-player-row");
      const color = colorKey(player.color);
      const swatch = el("span", "ludo-player-swatch tag-player-swatch " + (color || ""));
      if (compactMatch) {
        row.setAttribute("aria-label", (color || "Player") + " player");
        row.append(swatch);
      } else {
        const copy = el("div", "tag-player-copy");
        copy.append(el("strong", "ludo-player-name", name(player.user_id) + (player.user_id === uid() ? " (you)" : "")));
        copy.append(el("small", "ludo-player-state muted tiny", player.status === "invited" ? "Invited" : player.ready ? "Ready" : "Not ready"));
        row.append(swatch, copy);
        if(player.user_id===activeGame.created_by)row.append(el("span","tag-host-mark","HOST"));
      }
      roster.append(row);
    });
    root.append(roster);
  }

  function renderJoinPrompt(root) {
    const target = root || $("ludo-content");
    const available = availableColors(uid());
    if (!available.length) {
      target.append(el("p", "muted tiny", "All four colors are taken."));
      return;
    }
    const panel = el("section", "ludo-join-panel");
    panel.append(el("strong", "", currentPlayer()?.status === "invited" ? "Your Ludo invitation" : "Join this open lobby"));
    panel.append(el("p", "muted tiny", "Choose an unused color before joining."));
    const select = el("select");
    available.forEach(color => {
      const option = el("option", "", color.label);
      option.value = color.hex;
      select.append(option);
    });
    const join = btn("Join lobby", "primary", async () => {
      join.disabled = true;
      await joinGame(select.value);
      join.disabled = false;
    });
    panel.append(select, join);
    if (currentPlayer()?.status === "invited") {
      panel.append(btn("Decline invitation", "outline", async () => {
        try {
          const result = await ctx.db.rpc("gather_ludo_decline", { p_game_id: activeGame.id });
          if (result.error) throw result.error;
          activeGameId = null; activeGame = null; players = [];
          await refresh();
        } catch (error) { toast(error?.message || "The invitation could not be declined."); }
      }));
    }
    target.append(panel);
  }

  async function joinGame(color) {
    if (busy || !activeGameId) return;
    busy = true;
    try {
      const result = await ctx.db.rpc("gather_ludo_join", { p_game_id: activeGameId, p_color: color });
      if (result.error) throw result.error;
      await loadGame();
    } catch (error) {
      toast(error?.message || "Could not join this Ludo lobby.");
      await loadGame();
    } finally { busy = false; }
  }

  function tokenLabel(progress) {
    if (progress < 0) return "Base";
    if (progress === 57) return "Home";
    if (progress >= 52) return "Home lane " + (progress - 51) + "/6";
    return "Track " + (progress + 1) + "/52";
  }
  function canMoveToken(progress, dice) {
    return Number.isInteger(dice) && dice >= 1 && dice <= 6 &&
      ((progress === -1 && dice === 6) || (progress >= 0 && progress < 57 && progress + dice <= 57));
  }
  function trackIndex(color, progress) {
    return (COLOR_BY_KEY[color].offset + progress) % 52;
  }

  function renderBoard(root, canPlay) {
    const game = activeGame;
    const state = game.state || {};
    const pieces = state.pieces || {};
    const myColor = colorKey(currentPlayer()?.color);
    const turnId = state.turn_user_id;
    const myTurn = canPlay && turnId === uid() && game.status === "active";
    const dice = state.dice === null || state.dice === undefined ? null : Number(state.dice);
    const lastRoll = state.last_roll === null || state.last_roll === undefined ? null : Number(state.last_roll);
    const displayDice = dice !== null ? dice : lastRoll;
    const board = el("div", "ludo-board");
    board.setAttribute("role", "group");
    board.setAttribute("aria-label", "Ludo board with four colored home areas and a shared track.");

    const occupants = new Map();
    COLORS.forEach(color => {
      (pieces[color.key] || [-1, -1, -1, -1]).forEach((progress, tokenIndex) => {
        const value = Number(progress);
        let location = null;
        if (value >= 0 && value <= 51) location = "track:" + trackIndex(color.key, value);
        else if (value >= 52 && value <= 56) location = "lane:" + color.key + ":" + (value - 52);
        else if (value === 57) location = "home";
        if (!location) return;
        if (!occupants.has(location)) occupants.set(location, []);
        occupants.get(location).push({ color: color.key, tokenIndex, progress: value });
      });
    });

    const canSelect = token => myTurn && token.color === myColor && dice !== null && canMoveToken(token.progress, dice);
    TRACK.forEach(([row, col], index) => {
      const cell = el("div", "ludo-track-cell" + (SAFE.has(index) ? " safe" : ""));
      cell.style.gridRow = String(row + 1);
      cell.style.gridColumn = String(col + 1);
      cell.setAttribute("aria-label", "Track space " + (index + 1) + (SAFE.has(index) ? ", safe" : ""));
      appendOccupants(cell, occupants.get("track:" + index), canSelect);
      if (SAFE.has(index) && !occupants.has("track:" + index)) cell.append(el("span", "ludo-safe-mark", "✦"));
      board.append(cell);
    });

    COLORS.forEach(color => {
      color.lane.forEach(([row, col], index) => {
        const cell = el("div", "ludo-home-lane " + color.key);
        cell.style.gridRow = String(row + 1);
        cell.style.gridColumn = String(col + 1);
        cell.setAttribute("aria-label", color.label + " home lane " + (index + 1));
        appendOccupants(cell, occupants.get("lane:" + color.key + ":" + index), canSelect);
        board.append(cell);
      });
    });

    const bases = [
      { color: "red", row: "2 / span 5", col: "2 / span 5" },
      { color: "yellow", row: "2 / span 5", col: "10 / span 5" },
      { color: "blue", row: "10 / span 5", col: "10 / span 5" },
      { color: "green", row: "10 / span 5", col: "2 / span 5" }
    ];
    bases.forEach(base => {
      const info = COLOR_BY_KEY[base.color];
      const panel = el("section", "ludo-base " + base.color);
      panel.style.gridRow = base.row;
      panel.style.gridColumn = base.col;
      const myTokens = pieces[base.color] || [-1, -1, -1, -1];
      const heading = el("div", "ludo-base-heading");
      heading.append(el("strong", "", info.label), el("small", "", myTokens.filter(value => Number(value) === 57).length + "/4 home"));
      const baseTokens = el("div", "ludo-base-tokens");
      myTokens.forEach((progress, tokenIndex) => {
        if (Number(progress) !== -1) return;
        const selectable = myTurn && base.color === myColor && dice === 6;
        const token = selectable
          ? btn(String(tokenIndex + 1), "ludo-base-token ludo-token-selectable", () => callAction("move", tokenIndex))
          : el("span", "ludo-base-token");
        if (selectable) {
          token.setAttribute("aria-label", "Move token " + (tokenIndex + 1) + " out of base");
          token.title = "Move token " + (tokenIndex + 1);
        }
        token.append(el("span", "ludo-token-dot " + base.color, String(tokenIndex + 1)));
        baseTokens.append(token);
      });
      if (!baseTokens.childElementCount) baseTokens.append(el("small", "ludo-base-empty", "No tokens in base"));
      panel.append(heading, baseTokens);
      board.append(panel);
    });

    const center = el("div", "ludo-center");
    center.style.gridRow = "7 / span 3";
    center.style.gridColumn = "7 / span 3";
    center.append(el("strong", "", "LUDO"), el("small", "", "Home"));
    const homeTokens = occupants.get("home") || [];
    if (homeTokens.length) appendOccupants(center, homeTokens, () => false);
    board.append(center);
    root.append(board);

    const tokenControls = el("section", "ludo-controls");
    const diceCard = el("div", "ludo-dice-card");
    diceCard.setAttribute("aria-label", "Current dice roll");
    const diceFace = el("div", "ludo-dice-face");
    const diceLabel = el("span", "ludo-dice-label",
      dice !== null ? "ROLL RESULT" : displayDice !== null ? "LAST ROLL" : myTurn ? "YOUR TURN" : "WAITING");
    const diceValue = el("strong", "ludo-dice-value", displayDice === null ? "—" : String(displayDice));
    diceValue.id = "ludo-dice-value";
    diceValue.setAttribute("aria-live", "polite");
    diceValue.setAttribute("aria-label", displayDice === null ? "No dice roll yet" : (dice !== null ? "Dice rolled " : "Last roll was ") + displayDice);
    diceFace.append(diceLabel, diceValue);
    diceCard.append(diceFace);
    const roll = btn(myTurn && dice === null ? "Roll dice" : dice === null ? "Waiting" : "Move a token",
      "primary ludo-roll", () => callAction("roll"));
    roll.disabled = !myTurn || dice !== null;
    roll.title = myTurn && dice === null ? "Roll the dice" : "Wait for your turn or move a token";
    diceCard.append(roll);
    tokenControls.append(diceCard);

    const panel = el("div", "ludo-token-panel");
    panel.hidden = true;
    panel.append(el("strong", "", myColor ? "Your tokens" : "Token positions"));
    const list = el("div", "ludo-token-buttons");
    const shownColors = myColor ? [myColor] : COLORS.map(color => color.key);
    shownColors.forEach(color => {
      (pieces[color] || [-1, -1, -1, -1]).forEach((progress, tokenIndex) => {
        const value = Number(progress);
        const button = btn("Token " + (tokenIndex + 1) + " · " + tokenLabel(value),
          "ludo-token-button " + color,
          () => callAction("move", tokenIndex));
        button.disabled = !myTurn || color !== myColor || dice === null || !canMoveToken(value, dice);
        list.append(button);
      });
    });
    panel.append(list);
    const tokenToggle = btn("Tokens", "secondary-action ludo-token-toggle", () => {
      panel.hidden = !panel.hidden;
      tokenToggle.textContent = panel.hidden ? "Tokens" : "Hide tokens";
      tokenToggle.setAttribute("aria-expanded", String(!panel.hidden));
    });
    tokenToggle.setAttribute("aria-label", "View tokens");
    tokenToggle.setAttribute("aria-expanded", "false");
    tokenControls.append(tokenToggle, panel);
    if (state.message) tokenControls.append(el("p", "ludo-message", state.message));
    root.append(tokenControls);
  }

  function appendOccupants(target, tokens, canSelect = () => false) {
    if (!tokens?.length) return;
    const stack = el("div", "ludo-occupants");
    tokens.forEach(token => {
      if (canSelect(token)) {
        const piece = btn(String(token.tokenIndex + 1), "ludo-token-dot " + token.color + " ludo-token-selectable",
          () => callAction("move", token.tokenIndex));
        piece.setAttribute("aria-label", "Move " + token.color + " token " + (token.tokenIndex + 1));
        piece.title = "Move token " + (token.tokenIndex + 1);
        stack.append(piece);
      } else {
        stack.append(el("span", "ludo-token-dot " + token.color, String(token.tokenIndex + 1)));
      }
    });
    target.append(stack);
  }

  async function callAction(action, tokenIndex) {
    if (busy || !activeGame) return;
    busy = true;
    const gameId = activeGame.id;
    const diceValue = action === "roll" ? $("ludo-dice-value") : null;
    const rollButton = action === "roll" ? $("ludo-content")?.querySelector(".ludo-roll") : null;
    if (diceValue) diceValue.classList.add("is-rolling");
    if (rollButton) {
      rollButton.disabled = true;
      rollButton.classList.add("is-pending");
      rollButton.textContent = "Rolling…";
    }
    try {
      const request = ctx.db.rpc("gather_ludo_multiplayer_action", {
        p_game_id: gameId,
        p_action: action,
        p_token_index: tokenIndex === undefined ? null : tokenIndex
      });
      const [result] = await Promise.all([
        request,
        action === "roll" ? new Promise(resolve => window.setTimeout(resolve, 560)) : Promise.resolve()
      ]);
      if (activeGameId !== gameId) return;
      if (result.error) throw result.error;
      activeGame = result.data;
      await loadPlayers(gameId);
      if (activeGameId !== gameId) return;
      renderGamePanel();
      if (action === "roll" && activeGame?.state?.dice !== null && activeGame?.state?.dice !== undefined) {
        const landedDie = $("ludo-dice-value");
        landedDie?.classList.add("is-result");
        window.setTimeout(() => landedDie?.classList.remove("is-result"), 820);
      }
    } catch (error) {
      toast(error?.message || "That Ludo action could not be completed.");
      if (activeGameId === gameId) await loadGame();
    } finally {
      busy = false;
    }
  }

  function shutdown() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    if (lifecycleListenersBound) {
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
      window.removeEventListener("pageshow", refreshOnReturn);
      window.removeEventListener("online", refreshOnReturn);
      lifecycleListenersBound = false;
    }
    if (channel && ctx?.db) ctx.db.removeChannel(channel);
    channel = null;
    channelConnected = false;
    ctx = null;
    close();
  }

  window.GatherLudo = {
    init, open, openInvitation, openGame, refresh, shutdown,
    getLiveGames: () => games.filter(game => game.status === "active" &&
      membershipRows.some(member => member.game_id === game.id && member.status === "joined")),
    getInvitations: () => games.filter(game => game.status === "active" &&
      membershipRows.some(member => member.game_id === game.id && member.status === "invited"))
  };
})();