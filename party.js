(() => {
  "use strict";

  let ctx = null;
  let parties = [];
  let busy = false;
  let initialized = false;
  let dialog = null;
  let pickerController = null;

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
  const chats = () => ctx?.chats?.() || [];
  const toast = message => ctx?.toast?.(message);
  const GAME_LABELS = {
    chess: "Chess",
    checkers: "Checkers",
    tic_tac_toe: "Tic-Tac-Toe",
    connect_four: "Connect Four",
    battleship: "Battleship",
    uno: "UNO",
    ludo: "Ludo",
  };
  const GAME_MARKS = {
    chess: "♞", checkers: "◈", tic_tac_toe: "×○", connect_four: "●",
    battleship: "⚓", uno: "▦", ludo: "◉"
  };
  const MULTIPLAYER = new Set(["uno", "ludo"]);
  const TWO_PLAYER = new Set(["chess", "checkers", "tic_tac_toe", "connect_four", "battleship"]);

  function memberName(member) {
    return member?.display_name?.trim() || member?.username?.trim() || "Gather member";
  }

  function mount() {
    const hub = $("games-workspace");
    if (!hub || $("games-parties-panel")) return;
    const panel = el("section", "games-party-panel");
    panel.id = "games-parties-panel";
    panel.setAttribute("aria-labelledby", "games-parties-title");
    const header = el("header", "games-party-panel-header");
    const heading = el("div", "games-party-heading");
    heading.append(
      el("p", "eyebrow", "PLAY WITH YOUR GROUP"),
      el("h2", "", "Parties"),
      el("p", "muted tiny", "Stay together between games, vote on what to play, and launch a match with one tap.")
    );
    const actions = el("div", "games-party-header-actions");
    actions.append(
      btn("Refresh", "outline games-party-refresh", () => refresh(true)),
      btn("＋ Create party", "primary games-party-create", openCreateDialog)
    );
    actions.children[0].setAttribute("aria-label", "Refresh parties");
    header.append(heading, actions);
    const list = el("div", "games-party-list");
    list.id = "games-party-list";
    panel.append(header, list);
    const live = hub.querySelector(".games-invitations-panel");
    if (live) hub.insertBefore(panel, live);
    else hub.append(panel);
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = el("div", "overlay games-overlay games-party-dialog-overlay");
    dialog.id = "games-party-dialog";
    dialog.hidden = true;
    document.body.append(dialog);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) closeDialog();
    });
    return dialog;
  }

  function closeDialog() {
    if (dialog) dialog.hidden = true;
    pickerController = null;
    busy = false;
  }

  function renderPeopleDialog(mode, party) {
    const overlay = ensureDialog();
    overlay.replaceChildren();
    const modal = el("section", "modal games-create-modal games-party-dialog-card");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "games-party-dialog-title");
    const close = btn("×", "close", closeDialog);
    close.setAttribute("aria-label", "Close");
    const title = mode === "create" ? "Create a party" : "Invite people";
    modal.append(close, el("p", "eyebrow", mode === "create" ? "NEW PARTY" : "PARTY INVITATIONS"),
      el("h2", "", title),
      el("p", "muted tiny", mode === "create"
        ? "Start a group, then invite people from your chats or accepted friends."
        : "Invite people who can already receive game invitations from you."));
    const form = el("form", "games-party-form");
    let titleInput = null;
    if (mode === "create") {
      const label = el("label", "games-party-field");
      label.append(el("span", "", "Party name"));
      titleInput = el("input", "");
      titleInput.type = "text";
      titleInput.maxLength = 36;
      titleInput.required = true;
      titleInput.value = "Game Party";
      titleInput.placeholder = "Game Party";
      label.append(titleInput);
      form.append(label);
    }
    const selected = [];
    const peopleRow = el("div", "games-party-people-row");
    const choose = btn("Choose people", "outline", () => {});
    choose.classList.add("games-party-choose-people");
    const summary = el("small", "muted tiny", "No people selected");
    peopleRow.append(choose, summary);
    form.append(peopleRow);
    const status = el("p", "status games-party-dialog-status", "");
    status.setAttribute("role", "status");
    const footer = el("div", "games-form-actions");
    footer.append(btn("Cancel", "secondary-action", closeDialog));
    const submit = btn(mode === "create" ? "Create party" : "Send invitations", "primary", () => {});
    submit.type = "submit";
    footer.append(submit);
    form.append(status, footer);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      if (!selected.length && mode !== "create") {
        status.textContent = "Choose at least one person.";
        return;
      }
      if (selected.length > 19) {
        status.textContent = "A party can have up to 20 members, including you.";
        return;
      }
      busy = true;
      submit.disabled = true;
      status.textContent = mode === "create" ? "Creating party…" : "Sending invitations…";
      try {
        const response = mode === "create"
          ? await ctx.db.rpc("gather_party_create", {
              p_title: titleInput.value.trim() || "Game Party",
              p_invited_user_ids: selected
            })
          : await ctx.db.rpc("gather_party_invite", {
              p_party_id: party.id,
              p_invited_user_ids: selected
            });
        if (response.error) throw response.error;
        closeDialog();
        await refresh(false);
        toast(mode === "create" ? "Party created and invitations sent." : "Party invitations sent.");
      } catch (error) {
        status.textContent = error?.message || "The party action could not be completed.";
      } finally {
        busy = false;
        submit.disabled = false;
      }
    });
    modal.append(form);
    overlay.append(modal);
    overlay.hidden = false;
    if (window.GatherPeoplePicker?.create) {
      pickerController = window.GatherPeoplePicker.create({
        db: ctx.db,
        button: choose,
        summary,
        max: 19,
        onChange: ids => selected.splice(0, selected.length, ...ids)
      });
    }
  }

  function openCreateDialog() {
    if (!ctx || !uid()) return toast("Sign in to create a party.");
    renderPeopleDialog("create", null);
  }

  function openInviteDialog(party) {
    if (!ctx || !uid()) return;
    const memberCount = party.members?.filter(m => ["joined", "invited"].includes(m.status)).length || 0;
    if (memberCount >= 20) return toast("This party already has 20 members or invitations.");
    renderPeopleDialog("invite", party);
  }

  function supportedGames(party) {
    const joined = (party.members || []).filter(m => m.status === "joined");
    const count = joined.length;
    if (count < 2) return [];
    const result = [];
    const sharedChat = count === 2 ? findSharedChat(joined.map(m => m.user_id)) : null;
    if (count === 2 && sharedChat) {
      TWO_PLAYER.forEach(type => result.push(type));
    }
    if (count <= 20) result.push("uno");
    if (count <= 4) result.push("ludo");
    return result;
  }

  function findSharedChat(memberIds) {
    if (!memberIds?.length) return null;
    const expected = [...new Set(memberIds.filter(Boolean))];
    if (expected.length !== 2) return null;
    return chats().find(chat => {
      if (chat.kind !== "direct" || !Array.isArray(chat.members) || chat.members.length !== 2) return false;
      const ids = new Set(chat.members.map(member => member.user_id).filter(Boolean));
      return ids.size === 2 && expected.every(id => ids.has(id));
    }) || null;
  }

  async function verifyPartyLobbyRoster(table, foreignKey, gameId, expectedIds) {
    const result = await ctx.db.from(table)
      .select("user_id,status")
      .eq(foreignKey, gameId)
      .in("status", ["joined", "invited"]);
    if (result.error) throw result.error;
    const expected = [...new Set(expectedIds)].sort();
    const actual = (result.data || []).map(row => row.user_id).sort();
    if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
      throw new Error("A lobby of this type already exists with a different player group. Finish or close that lobby before starting Quick Play for this party.");
    }
  }

  function renderPartyPoll(card, party) {
    const poll = party.poll;
    if (!poll) return;
    const section = el("section", "games-party-poll");
    const stateLabel = poll.status === "open" ? "Voting open" : "Voting closed";
    const heading = el("div", "games-party-poll-heading");
    heading.append(el("strong", "", poll.question || "What should we play?"),
      el("span", "games-party-poll-state" + (poll.status === "open" ? " is-open" : ""), stateLabel));
    section.append(heading);
    const counts = Array.isArray(poll.vote_counts) ? poll.vote_counts : [];
    const total = counts.reduce((sum, item) => sum + Number(item.count || 0), 0);
    (poll.options || []).forEach((type, index) => {
      if (!GAME_LABELS[type]) return;
      const count = Number(counts.find(item => Number(item.option_index) === index)?.count || 0);
      const hasVoted = poll.my_vote !== null && poll.my_vote !== undefined;
      const isSelected = hasVoted && Number(poll.my_vote) === index;
      const option = btn("", "games-party-vote-option" + (isSelected ? " is-selected" : ""),
        () => vote(party, poll, index));
      const name = el("span", "games-party-vote-name");
      name.append(el("span", "games-party-vote-mark", GAME_MARKS[type] || "•"),
        el("strong", "", GAME_LABELS[type]));
      const amount = el("span", "games-party-vote-count", count + (count === 1 ? " vote" : " votes"));
      const track = el("span", "games-party-vote-track");
      const fill = el("span", "games-party-vote-fill");
      fill.style.width = (total ? Math.round((count / total) * 100) : 0) + "%";
      track.append(fill);
      option.append(name, amount, track);
      option.disabled = poll.status !== "open" || party.my_status !== "joined";
      option.setAttribute("aria-pressed", isSelected ? "true" : "false");
      section.append(option);
    });
    if (poll.status === "open") {
      const note = el("p", "muted tiny games-party-poll-note",
        "Each joined member can vote once and change their vote before voting closes.");
      section.append(note);
    } else if (total) {
      const maxVotes = Math.max(...counts.map(item => Number(item.count || 0)));
      const winners = (poll.options || []).filter((type, index) =>
        Number(counts.find(item => Number(item.option_index) === index)?.count || 0) === maxVotes);
      section.append(el("p", "muted tiny games-party-poll-note",
        maxVotes ? "Top choice: " + (winners.map(type => GAME_LABELS[type]).join(" / ")) : "No votes were cast."));
    } else {
      section.append(el("p", "muted tiny games-party-poll-note", "No votes were cast."));
    }
    card.append(section);
  }

  async function vote(party, poll, optionIndex) {
    if (busy || poll.status !== "open") return;
    busy = true;
    try {
      const response = await ctx.db.rpc("gather_party_poll_vote", {
        p_poll_id: poll.id,
        p_option_index: optionIndex
      });
      if (response.error) throw response.error;
      await refresh(false);
      toast("Your vote has been saved.");
    } catch (error) {
      toast(error?.message || "Your vote could not be saved.");
    } finally {
      busy = false;
    }
  }

  async function startVote(party) {
    if (busy) return;
    const options = supportedGames(party);
    if (options.length < 2) {
      toast("At least two joined party members are needed to start a game vote.");
      return;
    }
    busy = true;
    try {
      const response = await ctx.db.rpc("gather_party_poll_create", {
        p_party_id: party.id,
        p_question: "What should we play?",
        p_options: options
      });
      if (response.error) throw response.error;
      await refresh(false);
      toast("Game vote started. Everyone in the party can vote.");
    } catch (error) {
      toast(error?.message || "The game vote could not be started.");
    } finally {
      busy = false;
    }
  }

  function chooseQuickPlayGame(party, options) {
    const poll = party.poll;
    if (poll?.status === "open") {
      toast("The party vote is still open. Let everyone vote before starting Quick Play.");
      return null;
    }
    if (poll?.status === "closed" && Array.isArray(poll.options) && Array.isArray(poll.vote_counts)) {
      const candidates = poll.options.map((type, index) => ({
        type,
        votes: Number(poll.vote_counts.find(item => Number(item.option_index) === index)?.count || 0)
      })).filter(item => options.includes(item.type));
      if (candidates.length) {
        const high = Math.max(...candidates.map(item => item.votes));
        const winners = candidates.filter(item => item.votes === high);
        if (high > 0) return winners[Math.floor(Math.random() * winners.length)].type;
      }
    }
    return options[Math.floor(Math.random() * options.length)];
  }

  async function quickPlay(party) {
    if (busy) return;
    if (party.my_status !== "joined" || party.my_role !== "leader") {
      toast("Only the party leader can start Quick Play.");
      return;
    }
    const members = (party.members || []).filter(m => m.status === "joined");
    if (members.length < 2) {
      toast("At least two party members need to join before starting a game.");
      return;
    }
    const options = supportedGames(party);
    if (!options.length) {
      toast("There is no compatible game for the current party size.");
      return;
    }
    const type = chooseQuickPlayGame(party, options);
    if (!type) return;
    const otherIds = members.map(m => m.user_id).filter(id => id !== uid());
    if (!otherIds.length) return toast("Invite someone to your party first.");

    busy = true;
    try {
      let gameId = null;
      if (TWO_PLAYER.has(type)) {
        const chat = findSharedChat(members.map(m => m.user_id));
        if (!chat || otherIds.length !== 1) {
          throw new Error("This two-player game needs a shared conversation between both party members. Start a new vote or choose a multiplayer game.");
        }
        const response = await ctx.db.rpc("gather_game_create", {
          p_conversation_id: chat.id,
          p_game_type: type,
          p_player_two_id: otherIds[0]
        });
        if (response.error) throw response.error;
        gameId = response.data?.id || response.data?.[0]?.id;
        if (gameId) window.GatherGames?.openInvitation?.(gameId);
      } else if (type === "uno") {
        const existing = await ctx.db.from("gather_multiplayer_games")
          .select("id").eq("created_by", uid()).eq("game_type", "uno").eq("status", "active")
          .limit(1).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.id) throw new Error("You already have an open UNO lobby. Finish or close it before starting another Quick Play match.");
        const response = await ctx.db.rpc("gather_uno_create", {
          p_conversation_id: null,
          p_join_mode: "invite",
          p_invited_user_ids: otherIds,
          p_max_players: members.length
        });
        if (response.error) throw response.error;
        gameId = response.data?.id;
        if (gameId) {
          await verifyPartyLobbyRoster("gather_multiplayer_players", "game_id", gameId, [uid(), ...otherIds]);
          window.GatherUno?.openGame?.(gameId);
        }
      } else if (type === "ludo") {
        const existing = await ctx.db.from("gather_multiplayer_games")
          .select("id").eq("created_by", uid()).eq("game_type", "ludo").eq("status", "active")
          .limit(1).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.id) throw new Error("You already have an open Ludo lobby. Finish or close it before starting another Quick Play match.");
        const response = await ctx.db.rpc("gather_ludo_create", {
          p_conversation_id: null,
          p_join_mode: "invite",
          p_invited_user_ids: otherIds,
          p_max_players: members.length,
          p_creator_color: "#D9AD45"
        });
        if (response.error) throw response.error;
        gameId = response.data?.id;
        if (gameId) {
          await verifyPartyLobbyRoster("gather_multiplayer_players", "game_id", gameId, [uid(), ...otherIds]);
          window.GatherLudo?.openGame?.(gameId);
        }
      }
            if (!gameId) throw new Error("The game lobby was created but could not be opened. Refresh the Games tab and check your invitations.");
      toast("Quick Play started " + GAME_LABELS[type] + " for your party.");
      await refresh(false);
    } catch (error) {
      toast(error?.message || "Quick Play could not start a game.");
    } finally {
      busy = false;
    }
  }

  function renderParty(party) {
    const card = el("article", "games-party-card");
    const top = el("header", "games-party-card-header");
    const titleWrap = el("div", "games-party-card-title");
    titleWrap.append(el("h3", "", party.title || "Game Party"),
      el("p", "muted tiny", party.members?.filter(m => m.status === "joined").length + " joined · " +
        party.members?.filter(m => m.status === "invited").length + " invited"));
    const role = el("span", "games-party-role", party.my_status === "invited" ? "Invitation" :
      party.my_role === "leader" ? "Leader" : "Member");
    top.append(titleWrap, role);
    card.append(top);

    const roster = el("div", "games-party-roster");
    (party.members || []).forEach(member => {
      const chip = el("span", "games-party-member" + (member.status === "invited" ? " is-invited" : ""));
      const avatar = el("span", "games-party-avatar", (memberName(member).trim()[0] || "?").toUpperCase());
      const copy = el("span", "games-party-member-copy");
      copy.append(el("strong", "", memberName(member)),
        el("small", "", member.role === "leader" ? "Party leader" : member.status === "invited" ? "Invited" : "Joined"));
      chip.append(avatar, copy);
      roster.append(chip);
    });
    card.append(roster);

    if (party.my_status === "invited") {
      const actions = el("div", "games-party-card-actions");
      actions.append(
        btn("Join party", "primary", async () => {
          if (busy) return;
          busy = true;
          try {
            const r = await ctx.db.rpc("gather_party_join", { p_party_id: party.id });
            if (r.error) throw r.error;
            await refresh(false);
            toast("You joined the party.");
          } catch (error) { toast(error?.message || "Could not join this party."); }
          finally { busy = false; }
        }),
        btn("Decline", "secondary-action", async () => {
          if (busy) return;
          busy = true;
          try {
            const r = await ctx.db.rpc("gather_party_leave", { p_party_id: party.id });
            if (r.error) throw r.error;
            await refresh(false);
          } catch (error) { toast(error?.message || "Could not decline this invitation."); }
          finally { busy = false; }
        })
      );
      card.append(actions);
      return card;
    }

    if (party.my_status === "joined") {
      if (party.poll) renderPartyPoll(card, party);
      const actions = el("div", "games-party-card-actions");
      if (party.my_role === "leader") {
        actions.append(
          btn("Invite people", "outline", () => openInviteDialog(party)),
          btn("Start game vote", "outline", () => startVote(party)),
          btn("Quick Play", "primary games-party-quick-play", () => quickPlay(party))
        );
      } else {
        actions.append(btn("Leave party", "secondary-action", async () => {
          if (busy) return;
          if (!window.confirm("Leave this party?")) return;
          busy = true;
          try {
            const r = await ctx.db.rpc("gather_party_leave", { p_party_id: party.id });
            if (r.error) throw r.error;
            await refresh(false);
            toast("You left the party.");
          } catch (error) { toast(error?.message || "Could not leave the party."); }
          finally { busy = false; }
        }));
      }
      if (party.my_role === "leader") {
        actions.append(btn("Close party", "secondary-action games-party-close", async () => {
          if (busy) return;
          if (!window.confirm("Close this party for everyone?")) return;
          busy = true;
          try {
            const r = await ctx.db.rpc("gather_party_close", { p_party_id: party.id });
            if (r.error) throw r.error;
            await refresh(false);
            toast("Party closed.");
          } catch (error) { toast(error?.message || "Could not close this party."); }
          finally { busy = false; }
        }));
      }
      card.append(actions);
    }
    return card;
  }

  function render() {
    const list = $("games-party-list");
    if (!list) return;
    list.replaceChildren();
    if (!parties.length) {
      const empty = el("div", "games-party-empty");
      empty.append(el("strong", "", "No parties yet"),
        el("p", "muted tiny", "Create a party, invite friends, and keep the group together while you play."));
      empty.append(btn("＋ Create your first party", "primary", openCreateDialog));
      list.append(empty);
      return;
    }
    parties.forEach(party => list.append(renderParty(party)));
  }

  async function refresh(showToast) {
    if (!ctx || !uid()) return;
    const response = await ctx.db.rpc("gather_party_list");
    if (response.error) {
      const list = $("games-party-list");
      if (list) {
        list.replaceChildren(el("p", "status error", "Parties could not be loaded: " + response.error.message));
      }
      return;
    }
    parties = Array.isArray(response.data) ? response.data : [];
    render();
    if (showToast) toast("Parties refreshed.");
  }

  function refreshOnReturn() {
    if (!document.hidden && navigator.onLine && ctx && uid()) void refresh(false);
  }

  function init(options) {
    ctx = options;
    mount();
    void refresh(false);
    if (!initialized) {
      initialized = true;
      document.addEventListener("visibilitychange", refreshOnReturn);
      window.addEventListener("focus", refreshOnReturn);
      window.addEventListener("online", refreshOnReturn);
    }
  }

  function shutdown() {
    ctx = null;
    parties = [];
    busy = false;
    if (dialog) dialog.hidden = true;
    const list = $("games-party-list");
    if (list) list.replaceChildren();
    const panel = $("games-parties-panel");
    if (panel) panel.remove();
  }

  window.GatherParty = { init, shutdown, refresh: () => refresh(true) };
})();