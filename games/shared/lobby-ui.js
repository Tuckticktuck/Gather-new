(() => {
  "use strict";

  const el = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  };

  const action = (label, variant, handler, disabled = false) => {
    const item = el("button", variant, label);
    item.type = "button";
    item.disabled = !!disabled;
    item.addEventListener("click", handler);
    return item;
  };

  function render(options = {}) {
    const {
      root, gameName = "Gather game", game = {}, players = [], viewerId,
      getName = id => id === viewerId ? "You" : "Gather player",
      onJoin, onDecline, onReady, onStart, onCancel, onLeave,
      settingsSummary = "", note = ""
    } = options;
    if (!root) throw new TypeError("A lobby container is required.");

    root.replaceChildren();
    const maxCandidate = Number(options.maxPlayers ?? game.settings?.max_players ?? 2);
    const minCandidate = Number(options.minPlayers ?? 2);
    const maxPlayers = Number.isSafeInteger(maxCandidate) && maxCandidate >= 2 ? maxCandidate : 2;
    const minPlayers = Number.isSafeInteger(minCandidate) && minCandidate >= 2
      ? Math.min(minCandidate, maxPlayers) : 2;
    const lobby = el("section", "gather-shared-lobby");
    const header = el("header", "gather-shared-lobby-header");
    header.append(
      el("p", "eyebrow", "GATHER GAMES · WAITING ROOM"),
      el("h2", "gather-shared-lobby-title", gameName + " lobby"),
      el("p", "muted tiny", "Everyone joins the same lobby, readies up, and the host starts the match.")
    );
    lobby.append(header);

    const roster = players.filter(player =>
      ["joined", "invited", "spectating"].includes(player.status)
    ).slice();
    const hostId = game.created_by || game.host_id || game.player_one_id;
    if (hostId && !roster.some(player => player.user_id === hostId)) {
      roster.push({
        user_id: hostId,
        status: "joined",
        ready: game.player_one_ready === true,
        joined_at: game.created_at
      });
    }
    if (game.player_two_id && !roster.some(player => player.user_id === game.player_two_id)) {
      roster.push({
        user_id: game.player_two_id,
        status: game.status === "pending" ? "invited" : "joined",
        ready: game.player_two_ready === true,
        joined_at: game.updated_at
      });
    }
    roster.sort((a, b) => {
      if (a.user_id === hostId) return -1;
      if (b.user_id === hostId) return 1;
      const order = { joined: 0, invited: 1, spectating: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

    const cards = el("div", "gather-shared-lobby-players");
    roster.forEach(player => {
      const id = player.user_id;
      const isHost = id === hostId;
      const isYou = id === viewerId;
      const isSpectator = player.status === "spectating";
      const card = el("article", "gather-shared-player-card" + (isYou ? " is-you" : ""));
      const displayName = id ? getName(id) : "Gather player";
      const avatar = el("span", "gather-shared-player-avatar",
        (displayName || "?").trim().slice(0, 1).toUpperCase());
      const copy = el("span", "gather-shared-player-copy");
      copy.append(
        el("strong", "", displayName + (isYou ? " (you)" : "")),
        el("small", "muted", isHost ? "Host" : isSpectator ? "Spectator" : "Player")
      );
      card.append(avatar, copy);
      const status = isSpectator ? "Watching"
        : player.status === "invited" ? "Invitation sent"
        : player.ready ? "Ready" : "Not ready";
      const pill = el("span", "gather-shared-ready-pill" + (player.ready && !isSpectator ? " is-ready" : ""));
      pill.textContent = status;
      card.append(pill);
      if (isHost) card.append(el("span", "gather-shared-host-tag", "HOST"));
      cards.append(card);
    });
    lobby.append(cards);

    const joined = roster.filter(player => player.status === "joined");
    const invited = roster.filter(player => player.status === "invited");
    const spectators = roster.filter(player => player.status === "spectating");
    const reservedSeats = joined.length + invited.length;
    const openSeats = Math.max(0, maxPlayers - reservedSeats);
    const countLine = el("p", "gather-shared-lobby-count",
      joined.length + "/" + maxPlayers + " player seats filled" +
      (invited.length ? " · " + invited.length + " invited" : "") +
      (spectators.length ? " · " + spectators.length + " watching" : "") +
      (openSeats ? " · " + openSeats + " open" : ""));
    lobby.append(countLine);

    if (settingsSummary) {
      const settings = el("section", "gather-shared-lobby-settings");
      settings.append(el("span", "eyebrow", "MATCH SETTINGS"), el("p", "", settingsSummary));
      lobby.append(settings);
    }
    if (note) lobby.append(el("p", "gather-shared-lobby-note muted tiny", note));

    const everyoneReady = joined.length >= minPlayers &&
      joined.length <= maxPlayers && joined.every(player => player.ready === true);
    const viewer = roster.find(player => player.user_id === viewerId);
    const isHost = hostId === viewerId;
    const isUnstarted = !game.started_at && game.state?.started !== true;
    const actions = el("div", "gather-shared-lobby-actions");

    if (viewer?.status === "invited" && typeof onJoin === "function") {
      actions.append(action("Accept invitation", "primary", onJoin));
      if (typeof onDecline === "function") actions.append(action("Decline", "secondary-action", onDecline));
    } else if (viewer?.status === "joined" && isUnstarted) {
      if (typeof onReady === "function") {
        actions.append(action(viewer.ready ? "Not ready" : "Ready",
          viewer.ready ? "secondary-action" : "primary", onReady));
      }
      if (isHost && typeof onStart === "function") {
        actions.append(action("Start match", "primary", onStart, !everyoneReady));
      }
      if (isHost && typeof onCancel === "function") actions.append(action("Cancel lobby", "secondary-action", onCancel));
      if (!isHost && typeof onLeave === "function") actions.append(action("Leave lobby", "secondary-action", onLeave));
    } else if (!viewer && game.join_mode === "open" && typeof onJoin === "function") {
      actions.append(action("Join lobby", "primary", onJoin, joined.length + invited.length >= maxPlayers));
    } else if (isHost && typeof onCancel === "function") {
      actions.append(action("Cancel invitation", "secondary-action", onCancel));
    }

    if (actions.childElementCount) lobby.append(actions);
    let status;
    if (joined.length < minPlayers) {
      const remaining = minPlayers - joined.length;
      status = "Waiting for " + remaining + " more player" + (remaining === 1 ? "" : "s") + " to join.";
    } else if (everyoneReady) {
      status = isHost
        ? joined.length + " players are ready. You can start the match."
        : "Everyone is ready. Waiting for the host to start.";
    } else {
      status = "Every joined player must be ready before the host can start.";
    }
    lobby.append(el("p", "gather-shared-lobby-status", status));
    root.append(lobby);
    return Object.freeze({
      joinedCount: joined.length,
      invitedCount: invited.length,
      spectatorCount: spectators.length,
      openSeats,
      everyoneReady,
      bothReady: everyoneReady,
      isHost,
      viewerStatus: viewer?.status || null,
      maxPlayers,
      minPlayers
    });
  }

  window.GatherSharedLobby = Object.freeze({ render });
})();
