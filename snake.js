(() => {
  "use strict";

  let ctx = null;
  let channel = null;
  let activeGameId = null;
  let activeGame = null;
  let activePlayers = [];
  let myInvites = [];
  let myGames = [];
  let openLobbies = [];
  let panelOpen = false;
  let busy = false;
  let tickTimer = null;
  let resizeObserver = null;
  let lifecycleEventsBound = false;
  let realtimeEverSubscribed = false;
  let resumeRefreshInFlight = false;
  let tickInFlight = false;
  let inputInFlight = false;
  let lastDirectionSentAt = 0;
  let localDirection = null;
  let cachedProfiles = {};
  const $ = id => document.getElementById(id);
  const el = (tag, cls, value) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value !== undefined && value !== null) n.textContent = String(value);
    return n;
  };
  const btn = (label, cls, action) => {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  };
  const uid = () => ctx?.user?.()?.id || null;
  const profiles = () => ctx?.profiles?.() || cachedProfiles;
  const playerName = id => {
    const p = profiles()[id];
    return p?.display_name?.trim() || p?.username?.trim() || "Gather member";
  };
  const toast = message => ctx?.toast?.(message);
  const notifyUpdate = () => { if (typeof ctx?.onGamesUpdated === "function") ctx.onGamesUpdated(); };
  const settingsDefaults = () => ({ arena: "standard", obstacles: "standard", speed: "standard", round_seconds: 180, max_players: 8 });
  const statusText = state => {
    if (!state) return "Waiting room";
    if (state.phase === "lobby") return "Waiting room";
    if (state.phase === "finished") return "Match finished";
    return "Match in progress";
  };

  function mount() {
    if ($("snake-overlay")) return;
    const overlay = el("div", "overlay tag-overlay snake-overlay");
    overlay.id = "snake-overlay";
    overlay.hidden = true;
    overlay.innerHTML = '<section class="modal tag-modal snake-modal" role="dialog" aria-modal="true" aria-labelledby="snake-title"><button id="snake-close" class="close" type="button" aria-label="Close Snake Arena">×</button><div id="snake-content"></div></section>';
    document.body.append(overlay);
    $("snake-close").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  }

  async function refreshOnResume() {
    if (!ctx || !uid() || document.hidden || resumeRefreshInFlight) return;
    resumeRefreshInFlight = true;
    try {
      await refresh();
    } catch (error) {
      if (panelOpen) setStatus(error?.message || "Could not refresh Snake Arena after reconnecting.");
    } finally {
      resumeRefreshInFlight = false;
    }
  }

  function handleVisibilityChange() {
    if (!document.hidden) void refreshOnResume();
  }

  function handleOnline() {
    void refreshOnResume();
  }

  function bindLifecycleEvents() {
    if (lifecycleEventsBound) return;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    lifecycleEventsBound = true;
  }

  function unbindLifecycleEvents() {
    if (!lifecycleEventsBound) return;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("online", handleOnline);
    lifecycleEventsBound = false;
  }

  async function init(options) {
    ctx = options;
    cachedProfiles = profiles();
    mount();
    bindLifecycleEvents();
    if (!channel) {
      channel = ctx.db.channel("gather-snake-" + (uid() || "member"))
        .on("postgres_changes", { event: "*", schema: "public", table: "gather_multiplayer_games" }, payload => {
          const row = payload?.new || payload?.old;
          if (row?.game_type !== "snake_arena") return;
          if (activeGameId && row.id === activeGameId) void loadGame(false);
          else void refresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "gather_multiplayer_players" }, payload => {
          const row = payload?.new || payload?.old;
          if (activeGameId && row?.game_id === activeGameId) void loadPlayers(activeGameId).then(render);
          else void refresh();
        })
        .subscribe(status => {
          if (status === "SUBSCRIBED") {
            if (realtimeEverSubscribed) void refreshOnResume();
            realtimeEverSubscribed = true;
          }
        });
    }
    await refresh();
  }

  async function refresh() {
    if (!ctx || !uid()) return;
    const [mine, open] = await Promise.all([
      ctx.db.from("gather_multiplayer_players")
        .select("game_id,user_id,status,ready,color,joined_at")
        .eq("user_id", uid())
        .in("status", ["joined", "invited", "spectating"]),
      ctx.db.rpc("gather_snake_open_lobbies")
    ]);
    if (mine.error) {
      if (panelOpen) setStatus("Could not load Snake Arena lobbies: " + mine.error.message);
      return;
    }
    openLobbies = open.error ? [] : (open.data || []);
    const rows = mine.data || [];
    const ids = [...new Set(rows.map(row => row.game_id).filter(Boolean))];
    myInvites = rows.filter(row => row.status === "invited");
    if (!ids.length) {
      myGames = [];
      renderPanel();
      notifyUpdate();
      return;
    }
    const games = await ctx.db.from("gather_multiplayer_games")
      .select("id,game_type,status,created_by,join_mode,settings,state,revision,created_at,updated_at")
      .eq("game_type", "snake_arena")
      .in("id", ids)
      .in("status", ["active", "completed", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(40);
    if (games.error) {
      if (panelOpen) setStatus("Could not load Snake Arena matches: " + games.error.message);
      return;
    }
    const byId = new Map((games.data || []).map(game => [game.id, game]));
    myGames = rows.filter(row => byId.has(row.game_id)).map(row => ({ player: row, game: byId.get(row.game_id) }));
    if (activeGameId) {
      const current = byId.get(activeGameId);
      if (!current) {
        activeGameId = null;
        activeGame = null;
        activePlayers = [];
        stopTickDriver();
      } else {
        activeGame = current;
        await loadPlayers(activeGameId);
      }
    }
    render();
    notifyUpdate();
  }

  async function loadPlayers(id) {
    const r = await ctx.db.from("gather_multiplayer_players")
      .select("game_id,user_id,status,color,ready,joined_at")
      .eq("game_id", id)
      .order("joined_at", { ascending: true });
    if (!r.error) activePlayers = r.data || [];
  }

  async function loadGame(restartDriver = true) {
    if (!activeGameId || !ctx) return;
    const r = await ctx.db.from("gather_multiplayer_games")
      .select("id,game_type,status,created_by,join_mode,settings,state,revision,created_at,updated_at")
      .eq("id", activeGameId)
      .maybeSingle();
    if (r.error || !r.data) {
      toast(r.error?.message || "This Snake Arena match is no longer available.");
      return;
    }
    activeGame = r.data;
    await loadPlayers(activeGameId);
    render();
    if (restartDriver) startTickDriver();
  }

  function open() {
    if (!ctx || !uid()) return toast("Sign in to play Snake Arena.");
    mount();
    panelOpen = true;
    activeGameId = null;
    activeGame = null;
    activePlayers = [];
    $("snake-overlay").hidden = false;
    stopTickDriver();
    renderPanel();
    void refresh();
  }

  async function openInvitation(id) {
    if (!ctx || !uid()) return;
    mount();
    $("snake-overlay").hidden = false;
    panelOpen = true;
    const color = await chooseColor(id);
    const join = await ctx.db.rpc("gather_snake_join", { p_game_id: id, p_color: color });
    if (join.error) {
      toast(join.error.message || "Could not join Snake Arena.");
      await refresh();
      renderPanel();
      return;
    }
    activeGameId = id;
    await loadGame();
  }

  async function watchLobby(id) {
    if (!ctx || !uid() || busy) return;
    busy = true;
    mount();
    $("snake-overlay").hidden = false;
    panelOpen = true;
    try {
      const result = await ctx.db.rpc("gather_snake_spectate", { p_game_id: id });
      if (result.error) throw result.error;
      activeGameId = id;
      await loadGame();
      await refresh();
    } catch (error) {
      toast(error?.message || "Could not open spectator view.");
      await refresh();
      renderPanel();
    } finally {
      busy = false;
    }
  }

  async function stopWatching(id) {
    const result = await ctx.db.rpc("gather_snake_leave", { p_game_id: id });
    if (result.error) {
      toast(result.error.message || "Could not stop watching.");
      return;
    }
    if (activeGameId === id) {
      activeGameId = null;
      activeGame = null;
      activePlayers = [];
      stopTickDriver();
    }
    await refresh();
    renderPanel();
  }

  async function openGame(id) {
    if (!ctx || !uid()) return;
    mount();
    $("snake-overlay").hidden = false;
    panelOpen = true;
    const check = await ctx.db.from("gather_multiplayer_players")
      .select("user_id,status")
      .eq("game_id", id)
      .eq("user_id", uid())
      .maybeSingle();
    if (check.error || !check.data || !["joined", "invited", "spectating"].includes(check.data.status)) {
      toast("You are not a participant or spectator in this Snake Arena lobby.");
      return;
    }
    if (check.data.status === "invited") return openInvitation(id);
    activeGameId = id;
    await loadGame();
  }

  async function chooseColor(id) {
    const palette = ["#40826D","#D9AD45","#4F83CC","#C06A9D","#8B72C8","#D67A47","#329A9A","#769A46"];
    const existing = await ctx.db.from("gather_multiplayer_players")
      .select("color").eq("game_id", id).eq("status", "joined");
    const used = new Set((existing.data || []).map(p => String(p.color || "").toLowerCase()));
    return palette.find(color => !used.has(color.toLowerCase())) || palette[0];
  }

  function close() {
    panelOpen = false;
    stopTickDriver();
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    $("snake-overlay").hidden = true;
    activeGameId = null;
    activeGame = null;
    activePlayers = [];
    localDirection = null;
  }

  function setStatus(message) {
    const status = $("snake-status");
    if (status) status.textContent = message || "";
  }

  function renderPanel() {
    const root = $("snake-content");
    if (!root) return;
    root.classList.remove("snake-in-match");
    root.replaceChildren();
    root.append(el("p", "eyebrow", "GATHER GAMES · MULTIPLAYER"));
    root.append(el("h2", "tag-title", "Snake Arena"));
    root.append(el("p", "muted tiny snake-intro", "Steer your snake, collect food, avoid collisions, and survive the round."));

    const create = btn("＋ Create lobby", "primary tag-create", renderCreate);
    root.append(create);

    const invites = myGames.filter(item => item.player.status === "invited" && item.game.status === "active");
    if (invites.length) {
      root.append(el("h3", "tag-section-title", "Invitations"));
      invites.forEach(item => {
        const card = el("article", "tag-lobby-card");
        const info = el("div", "tag-lobby-info");
        info.append(el("strong", "", "Snake Arena · " + playerName(item.game.created_by) + " invited you"));
        info.append(el("span", "muted tiny", statusText(item.game.state) + " · choose whether to play or watch"));
        const actions = el("div", "snake-lobby-actions");
        actions.append(btn("Join to play", "primary", () => openInvitation(item.game.id)));
        actions.append(btn("Watch only", "outline", () => watchLobby(item.game.id)));
        card.append(info, actions);
        root.append(card);
      });
    }

    const joined = myGames.filter(item => item.player.status === "joined");
    root.append(el("h3", "tag-section-title", "Your lobbies and matches"));
    if (!joined.length) root.append(el("p", "muted tiny tag-empty", "Your Snake Arena lobbies will appear here."));
    joined.forEach(item => {
      const phase = item.game.state?.phase;
      const card = el("article", "tag-lobby-card");
      const info = el("div", "tag-lobby-info");
      info.append(el("strong", "", item.game.created_by === uid() ? "Your Snake Arena" : "Snake Arena"));
      info.append(el("span", "muted tiny", statusText(item.game.state) + " · " + (item.game.settings?.arena || "standard") + " arena"));
      card.append(info);
      card.append(btn(phase === "active" ? "Open match" : phase === "finished" ? "View recap" : "Open lobby", "outline", () => openGame(item.game.id)));
      root.append(card);
    });

    const watching = myGames.filter(item => item.player.status === "spectating");
    if (watching.length) {
      root.append(el("h3", "tag-section-title", "Watching"));
      watching.forEach(item => {
        const card = el("article", "tag-lobby-card");
        const info = el("div", "tag-lobby-info");
        info.append(el("strong", "", "Snake Arena · " + playerName(item.game.created_by)));
        info.append(el("span", "muted tiny", statusText(item.game.state) + " · read-only spectator"));
        const actions = el("div", "snake-lobby-actions");
        actions.append(btn(item.game.state?.phase === "finished" ? "View recap" : "Watch match", "outline", () => openGame(item.game.id)));
        actions.append(btn("Stop watching", "secondary-action", () => stopWatching(item.game.id)));
        card.append(info, actions);
        root.append(card);
      });
    }

    if (openLobbies.length) {
      root.append(el("h3", "tag-section-title", "Open lobbies from friends"));
      openLobbies.forEach(lobby => {
        const card = el("article", "tag-lobby-card");
        const info = el("div", "tag-lobby-info");
        const full = Number(lobby.joined_count || 0) >= Number(lobby.settings?.max_players || 8);
        info.append(el("strong", "", "Snake Arena · " + playerName(lobby.created_by)));
        info.append(el("span", "muted tiny", (lobby.settings?.arena || "standard") + " arena · " +
          lobby.joined_count + "/" + (lobby.settings?.max_players || 8) + " players" + (full ? " · Full" : "")));
        const actions = el("div", "snake-lobby-actions");
        const join = btn("Join to play", full ? "outline" : "primary", () => openInvitation(lobby.id));
        join.disabled = full;
        actions.append(join, btn("Watch only", "outline", () => watchLobby(lobby.id)));
        card.append(info, actions);
        root.append(card);
      });
    }

    const status = el("p", "status tag-status", "");
    status.id = "snake-status";
    root.append(status);
  }

  function renderCreate() {
    const root = $("snake-content");
    root.replaceChildren();
    root.append(el("p", "eyebrow", "NEW SNAKE ARENA LOBBY"));
    root.append(el("h2", "tag-title", "Set up your lobby"));
    root.append(el("p", "muted tiny", "Invite 1–7 people. Game invitations do not create or add anyone to a chat."));
    const form = el("form", "tag-form snake-form");
    const selected = [];
    const peopleField = el("section", "tag-people-picker");
    const choose = btn("Choose people", "outline", () => {});
    const summary = el("small", "muted tiny", "No people selected");
    peopleField.append(choose, summary);
    form.append(peopleField);

    const field = (labelText, node) => {
      const label = el("label", "snake-field");
      label.append(el("strong", "", labelText), node);
      return label;
    };
    const select = (values, chosen) => {
      const s = el("select", "snake-select");
      values.forEach(([value, label]) => {
        const o = el("option", "", label);
        o.value = value;
        o.selected = value === chosen;
        s.append(o);
      });
      return s;
    };
    const arena = select([["small","Small"],["standard","Standard"],["large","Large"]], "standard");
    const speed = select([["slow","Slow"],["standard","Standard"],["fast","Fast"]], "standard");
    const obstacles = select([["off","Off"],["standard","Standard"]], "standard");
    const duration = el("input", "snake-number");
    duration.type = "number"; duration.min = "60"; duration.max = "300"; duration.step = "15";
    duration.value = "180"; duration.inputMode = "numeric";
    const capacity = select([["2","2 players"],["3","3 players"],["4","4 players"],["5","5 players"],["6","6 players"],["7","7 players"],["8","8 players"]], "8");
    form.append(field("Arena size", arena), field("Speed", speed), field("Obstacles", obstacles),
      field("Round length (seconds)", duration), field("Player limit", capacity));

    const joinMode = select([["invite","Invite only"],["open","Open · accepted friends"]], "invite");
    joinMode.addEventListener("change", () => {
      peopleField.hidden = joinMode.value === "open";
    });
    form.append(field("Joining", joinMode));
    const message = el("p", "status", "");
    message.id = "snake-status";
    const actions = el("div", "tag-actions");
    actions.append(btn("Back", "secondary-action", renderPanel));
    const submit = btn("Create lobby", "primary", async () => {
      if (busy) return;
      if (joinMode.value === "invite" && !selected.length) {
        message.textContent = "Choose at least one person to invite.";
        return;
      }
      if (joinMode.value === "invite" && selected.length + 1 > Number(capacity.value)) {
        message.textContent = "The player limit must include you and everyone invited.";
        return;
      }
      const secs = Number(duration.value);
      if (!Number.isInteger(secs) || secs < 60 || secs > 300) {
        message.textContent = "Choose a round length between 60 and 300 seconds.";
        return;
      }
      busy = true;
      submit.disabled = true;
      message.textContent = "Creating lobby…";
      try {
        const r = await ctx.db.rpc("gather_snake_create", {
          p_invited_user_ids: joinMode.value === "invite" ? selected.slice() : [],
          p_join_mode: joinMode.value,
          p_settings: {
            arena: arena.value,
            speed: speed.value,
            obstacles: obstacles.value,
            round_seconds: secs,
            max_players: Number(capacity.value)
          }
        });
        if (r.error) throw r.error;
        activeGameId = r.data?.id;
        if (!activeGameId) throw new Error("The lobby was created but could not be opened.");
        await loadGame();
        toast("Snake Arena lobby created.");
      } catch (error) {
        message.textContent = error?.message || "Could not create the lobby.";
      } finally {
        busy = false;
        submit.disabled = false;
      }
    });
    actions.append(submit);
    form.append(message, actions);
    form.addEventListener("submit", e => e.preventDefault());
    root.append(form);
    window.GatherPeoplePicker?.create({
      db: ctx.db,
      button: choose,
      summary,
      max: 7,
      onChange: ids => selected.splice(0, selected.length, ...ids)
    });
  }

  function render() {
    if (!panelOpen || !activeGame) return renderPanel();
    const root = $("snake-content");
    if (!root) return;
    root.replaceChildren();
    const state = activeGame.state || {};
    if (state.phase === "active") return renderArena(root);
    stopTickDriver();
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    root.classList.remove("snake-in-match");
    const host = activeGame.created_by === uid();
    const me = activePlayers.find(p => p.user_id === uid());
    root.append(el("p", "eyebrow", state.phase === "finished" ? "MATCH RECAP" : "SNAKE ARENA · WAITING ROOM"));
    root.append(el("h2", "tag-title", state.phase === "finished" ? "Match finished" : "Snake Arena"));
    root.append(el("p", "muted tiny", (activeGame.settings?.arena || "standard") + " arena · " +
      (Number(activeGame.settings?.round_seconds || 180)) + " second rounds · " +
      (activeGame.settings?.speed || "standard") + " speed"));

    const roster = el("div", "tag-roster");
    activePlayers.forEach(p => {
      const row = el("div", "tag-player-row");
      const dot = el("span", "tag-player-swatch");
      dot.style.background = p.color || "var(--accent)";
      const copy = el("div", "tag-player-copy");
      copy.append(el("strong", "", playerName(p.user_id) + (p.user_id === uid() ? " (you)" : "")),
        el("small", "muted tiny", p.status === "spectating" ? "Spectating · read-only" : p.status === "invited" ? "Invited" : p.ready ? "Ready" : "Not ready"));
      row.append(dot, copy);
      if (p.user_id === activeGame.created_by) row.append(el("span", "tag-host-mark", "HOST"));
      roster.append(row);
    });
    root.append(el("h3", "tag-section-title", "Players · " + activePlayers.filter(p => p.status === "joined").length +
      "/" + (activeGame.settings?.max_players || 8)), roster);
    const spectators = activePlayers.filter(p => p.status === "spectating");
    if (spectators.length) {
      const spectatorRoster = el("div", "tag-roster snake-spectator-roster");
      spectators.forEach(p => spectatorRoster.append(el("span", "muted tiny snake-spectator-name", playerName(p.user_id) +
        (p.user_id === uid() ? " (you)" : ""))));
      root.append(el("h3", "tag-section-title", "Spectators · " + spectators.length), spectatorRoster);
    }
    if (me?.status === "spectating" && state.phase === "lobby") {
      root.append(el("p", "snake-spectator-banner", "You are watching in read-only mode. You do not count toward the player limit or ready check."));
    }

    if (state.phase === "finished") {
      const recap = el("section", "snake-recap");
      recap.append(el("strong", "", state.winnerId ? playerName(state.winnerId) + " won!" : "No winner this round"),
        el("p", "muted tiny", "Finish reason: " + String(state.finishReason || "finished").replace(/-/g, " ")));
      (state.snakes || []).slice().sort((a,b) => Number(b.score || 0) - Number(a.score || 0)).forEach(snake => {
        recap.append(el("div", "snake-score-row", playerName(snake.user_id) + " · " + Number(snake.score || 0) + " points" + (snake.alive ? " · Survived" : " · Eliminated")));
      });
      root.append(recap);
      const controls = el("div", "tag-actions");
      controls.append(btn("Back to Snake Arena", "outline", () => { activeGameId = null; activeGame = null; stopTickDriver(); renderPanel(); }));
      if (host && activeGame.status === "completed") controls.append(btn("Rematch", "primary", async e => {
        if (busy) return;
        busy = true;
        try {
          const r = await ctx.db.rpc("gather_snake_rematch", { p_game_id: activeGameId });
          if (r.error) throw r.error;
          await loadGame();
        } catch (error) { toast(error.message || "Could not restart Snake Arena."); }
        finally { busy = false; }
      }));
      root.append(controls);
      return;
    }

    if (state.phase === "lobby" && host) {
      const settingsPanel = el("section", "snake-settings-panel");
      settingsPanel.append(el("strong", "", "Lobby settings"));
      const makeSetting = (labelText, values, current) => {
        const label = el("label", "snake-field");
        label.append(el("span", "muted tiny", labelText));
        const control = el("select", "snake-select");
        values.forEach(([value,caption]) => {
          const option = el("option", "", caption);
          option.value = value;
          option.selected = String(value) === String(current);
          control.append(option);
        });
        label.append(control);
        settingsPanel.append(label);
        return control;
      };
      const current = { ...settingsDefaults(), ...(activeGame.settings || {}) };
      const arena = makeSetting("Arena size", [["small","Small"],["standard","Standard"],["large","Large"]], current.arena);
      const obstacles = makeSetting("Obstacles", [["off","Off"],["standard","Standard"]], current.obstacles);
      const speed = makeSetting("Speed", [["slow","Slow"],["standard","Standard"],["fast","Fast"]], current.speed);
      const duration = makeSetting("Round duration", [["60","60 seconds"],["90","90 seconds"],["120","120 seconds"],["180","180 seconds"],["240","240 seconds"],["300","300 seconds"]], current.round_seconds);
      const capacity = makeSetting("Player limit", Array.from({length:7},(_,index)=>[String(index+2),(index+2)+" players"]), current.max_players);
      const save = btn("Save settings", "outline", async () => {
        save.disabled = true;
        const result = await ctx.db.rpc("gather_snake_set_settings", {
          p_game_id: activeGameId,
          p_settings: {
            arena: arena.value,
            obstacles: obstacles.value,
            speed: speed.value,
            round_seconds: Number(duration.value),
            max_players: Number(capacity.value)
          }
        });
        if (result.error) {
          toast(result.error.message || "Could not update Snake Arena settings.");
          save.disabled = false;
        } else {
          activeGame = result.data || activeGame;
          toast("Snake Arena settings saved.");
          await loadGame(false);
        }
      });
      settingsPanel.append(save);
      root.append(settingsPanel);
    }

    const actions = el("div", "tag-actions");
    if (me?.status === "joined") {
      const ready = btn(me.ready ? "Not ready" : "Ready up", me.ready ? "outline" : "primary", async () => {
        ready.disabled = true;
        const r = await ctx.db.rpc("gather_snake_ready", { p_game_id: activeGameId, p_ready: !me.ready });
        if (r.error) toast(r.error.message); else await loadGame(false);
      });
      actions.append(ready);
    }
    if (me?.status === "spectating" && state.phase === "lobby") {
      const joinedCount = activePlayers.filter(player => player.status === "joined").length;
      const maxPlayers = Number(activeGame.settings?.max_players || 8);
      const joinAsPlayer = btn(joinedCount >= maxPlayers ? "Lobby full" : "Join as player", "primary", async () => {
        joinAsPlayer.disabled = true;
        const color = await chooseColor(activeGameId);
        const result = await ctx.db.rpc("gather_snake_join", { p_game_id: activeGameId, p_color: color });
        if (result.error) {
          toast(result.error.message || "Could not join as a player.");
          joinAsPlayer.disabled = false;
        } else {
          toast("You joined Snake Arena as a player.");
          await loadGame(false);
        }
      });
      joinAsPlayer.disabled = joinedCount >= maxPlayers;
      actions.append(joinAsPlayer);
    }
    if (host) {
      const start = btn("Start match", "primary", async () => {
        start.disabled = true;
        const r = await ctx.db.rpc("gather_snake_start", { p_game_id: activeGameId });
        if (r.error) { toast(r.error.message); start.disabled = false; }
        else { await loadGame(); }
      });
      start.disabled = activePlayers.filter(p => p.status === "joined").length < 2 ||
        activePlayers.some(p => p.status === "joined" && !p.ready);
      actions.append(start);
    }
    actions.append(btn(me?.status === "spectating" ? "Stop watching" : "Leave lobby", "outline", async () => {
      const r = await ctx.db.rpc("gather_snake_leave", { p_game_id: activeGameId });
      if (r.error) toast(r.error.message);
      else { activeGameId = null; activeGame = null; stopTickDriver(); await refresh(); renderPanel(); }
    }));
    if (host) actions.append(btn("Cancel lobby", "secondary-action", async () => {
      const r = await ctx.db.rpc("gather_snake_end", { p_game_id: activeGameId });
      if (r.error) toast(r.error.message);
      else { await loadGame(false); }
    }));
    root.append(actions);
    if (me?.status === "joined" && !host && activeGame.state?.phase === "lobby") {
      root.append(el("p", "muted tiny", "The host can start once everyone who joined is ready."));
    }
  }

  function renderArena(root) {
    root.classList.add("snake-in-match");
    const state = activeGame.state || {};
    const membership = activePlayers.find(p => p.user_id === uid());
    const isSpectating = membership?.status === "spectating";
    const head = el("header", "snake-game-header");
    const title = el("div", "snake-game-title");
    title.append(el("p", "eyebrow", "SNAKE ARENA · LIVE MATCH"), el("h2", "", "Survive the arena"),
      el("p", "muted tiny", "Score food and avoid other snakes."));
    const closeButton = btn("×", "snake-game-exit", () => {
      stopTickDriver();
      root.classList.remove("snake-in-match");
      renderPanel();
    });
    closeButton.setAttribute("aria-label", "Exit match view");
    head.append(title, closeButton);
    root.append(head);
    if (isSpectating) {
      root.append(el("p", "snake-spectator-banner", "Spectator mode · read-only. You cannot move, change settings, end the match, or use player-only game chat."));
    }
    const watchers = activePlayers.filter(p => p.status === "spectating");
    if (watchers.length) {
      root.append(el("p", "muted tiny snake-watcher-count", "Watching · " + watchers.length));
    }

    const scoreboard = el("div", "snake-scoreboard");
    activePlayers.filter(p => p.status === "joined").forEach(player => {
      const snake = (state.snakes || []).find(s => s.user_id === player.user_id);
      const card = el("div", "snake-score-card" + (snake?.alive ? "" : " is-eliminated"));
      const dot = el("span", "snake-score-dot");
      dot.style.background = player.color || "var(--accent)";
      const copy = el("span", "snake-score-copy");
      copy.append(el("strong", "", playerName(player.user_id) + (player.user_id === uid() ? " · You" : "")),
        el("small", "", snake?.alive ? "Playing · " + (snake.score || 0) + " points" : "Eliminated · " + (snake?.score || 0) + " points"));
      card.append(dot, copy);
      scoreboard.append(card);
    });
    root.append(scoreboard);

    const canvasWrap = el("div", "snake-arena-wrap");
    const canvas = el("canvas", "snake-arena-canvas");
    canvas.id = "snake-arena";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Snake Arena multiplayer grid");
    canvasWrap.append(canvas);
    root.append(canvasWrap);
    drawArena(canvas, state);

    if (membership?.status === "joined" && window.GatherGameChat?.attach) {
      window.GatherGameChat.attach(root, ctx.db, "snake_arena", activeGameId, uid(), playerName);
    }

    const me = (state.snakes || []).find(s => s.user_id === uid());
    const controls = el("div", "snake-controls");
    if (me?.alive) {
      const pad = el("div", "snake-direction-pad");
      [["up","↑"],["left","←"],["down","↓"],["right","→"]].forEach(([direction,label]) => {
        const control = btn(label, "snake-direction snake-" + direction, () => sendDirection(direction));
        control.setAttribute("aria-label", "Move " + direction);
        pad.append(control);
      });
      controls.append(pad, el("p", "muted tiny", "Use arrow keys or WASD. On mobile, tap a direction."));
    } else if (isSpectating) {
      controls.append(el("p", "muted tiny snake-out", "You are observing this match. Your account has no player controls."));
    } else {
      controls.append(el("p", "muted tiny snake-out", "Your snake has been eliminated. You can watch until the round ends."));
    }
    if (activeGame.created_by === uid()) {
      controls.append(btn("End match", "outline", async () => {
        const r = await ctx.db.rpc("gather_snake_end", { p_game_id: activeGameId });
        if (r.error) toast(r.error.message); else await loadGame(false);
      }));
    }
    root.append(controls);

    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => drawArena(canvas, activeGame?.state || state));
    resizeObserver.observe(canvasWrap);
    if (membership?.status === "joined") {
      bindArenaKeys();
      startTickDriver();
    } else {
      stopTickDriver();
    }
  }

  function drawArena(canvas, state) {
    if (!canvas || !state?.width || !state?.height) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = rect.width, height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr,0,0,dpr,0,0);
    g.clearRect(0,0,width,height);
    const cell = Math.min(width / state.width, height / state.height);
    const boardWidth = cell * state.width;
    const boardHeight = cell * state.height;
    const ox = (width - boardWidth) / 2;
    const oy = (height - boardHeight) / 2;
    g.fillStyle = "#101a18";
    g.fillRect(ox,oy,boardWidth,boardHeight);
    g.strokeStyle = "rgba(255,255,255,.055)";
    g.lineWidth = .5;
    for(let x=0;x<=state.width;x++){g.beginPath();g.moveTo(ox+x*cell,oy);g.lineTo(ox+x*cell,oy+boardHeight);g.stroke();}
    for(let y=0;y<=state.height;y++){g.beginPath();g.moveTo(ox,oy+y*cell);g.lineTo(ox+boardWidth,oy+y*cell);g.stroke();}
    (state.obstacles||[]).forEach(point=>{
      g.fillStyle="#58645f";g.fillRect(ox+point.x*cell+1,oy+point.y*cell+1,cell-2,cell-2);
    });
    if(state.food){
      g.fillStyle="#f0c75e";
      g.beginPath();g.arc(ox+(state.food.x+.5)*cell,oy+(state.food.y+.5)*cell,Math.max(2,cell*.34),0,Math.PI*2);g.fill();
    }
    (state.snakes||[]).forEach(snake=>{
      const color=snake.color||"#40826D";
      (snake.segments||[]).forEach((point,index)=>{
        g.globalAlpha=snake.alive?1:.28;
        g.fillStyle=color;
        const inset=index===0?1:2;
        g.beginPath();
        g.roundRect(ox+point.x*cell+inset,oy+point.y*cell+inset,cell-inset*2,cell-inset*2,Math.max(2,cell*.2));
        g.fill();
      });
    });
    g.globalAlpha=1;
  }

  let keysBound = false;
  function bindArenaKeys() {
    if (keysBound) return;
    keysBound = true;
    window.addEventListener("keydown", event => {
      if (!activeGameId || !activeGame?.state || activeGame.state.phase !== "active") return;
      const target = event.target;
      if (target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
      const map = { ArrowUp:"up", w:"up", W:"up", ArrowDown:"down", s:"down", S:"down",
        ArrowLeft:"left", a:"left", A:"left", ArrowRight:"right", d:"right", D:"right" };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      void sendDirection(direction);
    });
  }

  async function sendDirection(direction) {
    if (!activeGameId || inputInFlight ||
        activePlayers.find(player => player.user_id === uid())?.status !== "joined") return;
    const now = Date.now();
    if (now - lastDirectionSentAt < 65) return;
    lastDirectionSentAt = now;
    const me = (activeGame?.state?.snakes || []).find(s => s.user_id === uid());
    if (!me?.alive) return;
    if (localDirection && !canClientTurn(localDirection,direction)) return;
    if (!canClientTurn(me.direction,direction)) return;
    inputInFlight = true;
    localDirection = direction;
    try {
      const r = await ctx.db.functions.invoke("gather-snake-action", {
        body: { gameId: activeGameId, action: "direction", direction }
      });
      if (r.error) throw r.error;
    } catch (error) {
      toast(error?.message || "The direction could not be sent.");
      localDirection = null;
    } finally {
      inputInFlight = false;
    }
  }

  function canClientTurn(current, requested) {
    const reverse = { up:"down", down:"up", left:"right", right:"left" };
    return reverse[current] !== requested;
  }

  function startTickDriver() {
    stopTickDriver();
    if (!activeGameId || activeGame?.state?.phase !== "active" ||
        activePlayers.find(player => player.user_id === uid())?.status !== "joined") return;
    tickTimer = window.setInterval(async () => {
      if (!activeGameId || !activeGame || activeGame.state?.phase !== "active" ||
          document.hidden || tickInFlight) return;
      const last = Date.parse(activeGame.state.lastTickAt || "");
      const interval = Number(activeGame.state.tickIntervalMs) || 300;
      if (!Number.isFinite(last)) return;
      const lateBy = Date.now() - last;
      const isHost = activeGame.created_by === uid();
      if (!isHost && lateBy < interval * 2.5) return;
      if (lateBy < interval) return;
      tickInFlight = true;
      try {
        const r = await ctx.db.functions.invoke("gather-snake-action", {
          body: { gameId: activeGameId, action: "tick" }
        });
        if (r.error && !/not due|changed|revision/i.test(r.error.message || "")) {
          // Realtime may refresh the state after a competing tick; do not toast every race.
          await loadGame(false);
        } else if (r.data?.game) {
          activeGame = r.data.game;
          await loadPlayers(activeGameId);
          render();
        }
      } catch {
        // The next interval retries. The server decides whether the tick is due.
      } finally {
        tickInFlight = false;
      }
    }, 100);
  }

  function stopTickDriver() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  async function openLive() {
    if (activeGameId) await loadGame();
  }

  function shutdown() {
    stopTickDriver();
    unbindLifecycleEvents();
    realtimeEverSubscribed = false;
    if (channel && ctx?.db) ctx.db.removeChannel(channel);
    channel = null;
    ctx = null;
    activeGameId = null;
    activeGame = null;
    activePlayers = [];
    myInvites = [];
    myGames = [];
    openLobbies = [];
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    if ($("snake-overlay")) $("snake-overlay").hidden = true;
  }

  window.GatherSnake = {
    init, shutdown, open, openGame, openInvitation,
    refresh,
    getLiveGames: () => myGames.filter(item => ["joined", "spectating"].includes(item.player.status) && item.game?.status === "active").map(item => item.game),
    getInvitations: () => myGames.filter(item => item.player.status === "invited" && item.game?.status === "active").map(item => item.game)
  };
})();
