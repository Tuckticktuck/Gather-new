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
    const lobby = el("section", "gather-shared-lobby");
    const header = el("header", "gather-shared-lobby-header");
    header.append(
      el("p", "eyebrow", "GATHER GAMES · WAITING ROOM"),
      el("h2", "gather-shared-lobby-title", gameName + " lobby"),
      el("p", "muted tiny", "Invite one opponent. Both players ready up before the host starts.")
    );
    lobby.append(header);

    const roster = players.filter(player => ["joined", "invited", "spectating"].includes(player.status));
    const hostId = game.created_by || game.host_id || game.player_one_id;
    const playerIds = [hostId, game.player_two_id || null];
    const cards = el("div", "gather-shared-lobby-players");
    playerIds.forEach((id, index) => {
      const player = roster.find(item => item.user_id === id);
      const isHost = index === 0;
      const card = el("article", "gather-shared-player-card" + (id === viewerId ? " is-you" : ""));
      const avatar = el("span", "gather-shared-player-avatar", (getName(id || "") || "?").trim().slice(0, 1).toUpperCase());
      const copy = el("span", "gather-shared-player-copy");
      copy.append(
        el("strong", "", id ? getName(id) + (id === viewerId ? " (you)" : "") : "Waiting for opponent"),
        el("small", "muted", isHost ? "Host" : "Opponent")
      );
      card.append(avatar, copy);
      const status = !id ? "Open seat" : !player || player.status === "invited"
        ? "Invitation sent" : player.ready ? "Ready" : "Not ready";
      const pill = el("span", "gather-shared-ready-pill" + (player?.ready ? " is-ready" : ""));
      pill.textContent = status;
      card.append(pill);
      if (isHost) card.append(el("span", "gather-shared-host-tag", "HOST"));
      cards.append(card);
    });
    lobby.append(cards);

    if (settingsSummary) {
      const settings = el("section", "gather-shared-lobby-settings");
      settings.append(el("span", "eyebrow", "MATCH SETTINGS"), el("p", "", settingsSummary));
      lobby.append(settings);
    }
    if (note) lobby.append(el("p", "gather-shared-lobby-note muted tiny", note));

    const joined = roster.filter(player => player.status === "joined");
    const bothReady = joined.length === 2 && joined.every(player => player.ready === true);
    const viewer = roster.find(player => player.user_id === viewerId);
    const isHost = hostId === viewerId;
    const actions = el("div", "gather-shared-lobby-actions");

    if (viewer?.status === "invited" && typeof onJoin === "function") {
      actions.append(action("Accept invitation", "primary", onJoin));
      if (typeof onDecline === "function") actions.append(action("Decline", "secondary-action", onDecline));
    } else if (viewer?.status === "joined" && !game.started_at && game.state?.started !== true) {
      if (typeof onReady === "function") {
        actions.append(action(viewer.ready ? "Not ready" : "Ready", viewer.ready ? "secondary-action" : "primary", onReady));
      }
      if (isHost && typeof onStart === "function") {
        actions.append(action("Start match", "primary", onStart, !bothReady));
      }
      if (isHost && typeof onCancel === "function") actions.append(action("Cancel lobby", "secondary-action", onCancel));
      if (!isHost && typeof onLeave === "function") actions.append(action("Leave lobby", "secondary-action", onLeave));
    } else if (isHost && typeof onCancel === "function") {
      actions.append(action("Cancel invitation", "secondary-action", onCancel));
    }

    if (actions.childElementCount) lobby.append(actions);
    const status = joined.length < 2
      ? "Waiting for your opponent to join."
      : bothReady
        ? (isHost ? "Both players are ready. You can start the match." : "Both players are ready. Waiting for the host to start.")
        : "Both players must be ready before the match can begin.";
    lobby.append(el("p", "gather-shared-lobby-status", status));
    root.append(lobby);
    return Object.freeze({ joinedCount: joined.length, bothReady, isHost, viewerStatus: viewer?.status || null });
  }

  window.GatherSharedLobby = Object.freeze({ render });
})();
