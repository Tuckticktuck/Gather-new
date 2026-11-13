(() => {
  "use strict";

  let people = null;
  let selected = new Set();
  let overlay = null;
  let list = null;
  let search = null;
  let count = null;
  let active = null;
  let selectionLimit = 20;

  function normalizeLimit(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(20, Math.floor(parsed))) : 20;
  }

  async function load(db) {
    if (people) return people;
    const response = await db.rpc("gather_game_invitable_people");
    if (response.error) throw response.error;
    people = (response.data || []).map(person => ({
      ...person,
      label: person.display_name?.trim() || person.username
    }));
    return people;
  }

  function mount() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "overlay game-people-overlay";
    overlay.hidden = true;
    overlay.innerHTML = '<section class="modal game-people-modal" role="dialog" aria-modal="true" aria-labelledby="game-people-title"><header class="game-people-head"><div><p class="eyebrow">GAME INVITATIONS</p><h2 id="game-people-title">Choose people</h2><p class="muted tiny">Invite people from your private chats, group chats, or friends.</p></div><button type="button" class="primary game-people-done" aria-label="Done" title="Done"><span aria-hidden="true">✓</span></button></header><label class="game-people-search"><span class="sr-only">Search people</span><input type="search" placeholder="Search people…" autocomplete="off"></label><div class="game-people-count" aria-live="polite"></div><div class="game-people-list"></div></section>';
    document.body.append(overlay);
    list = overlay.querySelector(".game-people-list");
    search = overlay.querySelector("input");
    count = overlay.querySelector(".game-people-count");
    overlay.querySelector(".game-people-done").addEventListener("click", () => {
      overlay.hidden = true;
      active?.finish();
    });
    overlay.addEventListener("click", event => {
      if (event.target === overlay) overlay.hidden = true;
    });
    search.addEventListener("input", draw);
  }

  function updateCount(limitReached = false) {
    if (!count) return;
    count.textContent = limitReached
      ? "Maximum of " + selectionLimit + " people selected."
      : selected.size + " / " + selectionLimit + " selected";
  }

  function draw() {
    if (!list) return;
    const query = search.value.trim().toLocaleLowerCase();
    list.replaceChildren();
    const visible = (people || []).filter(person =>
      (person.label + " " + person.username).toLocaleLowerCase().includes(query)
    );

    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "muted tiny";
      empty.textContent = "No people from your chats or friends found.";
      list.append(empty);
    }

    visible.forEach(person => {
      const label = document.createElement("label");
      label.className = "game-people-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(person.user_id);
      checkbox.disabled = !checkbox.checked && selected.size >= selectionLimit;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (!selected.has(person.user_id) && selected.size >= selectionLimit) {
            checkbox.checked = false;
            updateCount(true);
            return;
          }
          selected.add(person.user_id);
        } else {
          selected.delete(person.user_id);
        }
        updateCount();
        active?.change([...selected]);
        draw();
      });

      const avatar = document.createElement("span");
      avatar.className = "game-people-avatar";
      avatar.textContent = (person.label || "?").slice(0, 1).toUpperCase();
      const names = document.createElement("span");
      names.className = "game-people-names";
      const strong = document.createElement("strong");
      strong.textContent = person.label;
      const username = document.createElement("small");
      username.textContent = "@" + person.username;
      names.append(strong, username);
      label.append(checkbox, avatar, names);
      list.append(label);
    });
    updateCount();
  }

  window.GatherPeoplePicker = {
    create({ db, button, summary, onChange, max = 20 }) {
      mount();
      selectionLimit = normalizeLimit(max);
      let selectedIds = [];

      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await load(db);
          selected = new Set(selectedIds.slice(0, selectionLimit));
          selectedIds = [...selected];
          search.value = "";
          active = {
            change(ids) {
              selectedIds = ids.slice(0, selectionLimit);
              if (summary) summary.textContent = selectedIds.length
                ? selectedIds.length + " people selected"
                : "No people selected";
              onChange?.(selectedIds);
            },
            finish() {
              selectedIds = [...selected].slice(0, selectionLimit);
              if (summary) summary.textContent = selectedIds.length
                ? selectedIds.length + " people selected"
                : "No people selected";
              onChange?.(selectedIds);
            }
          };
          draw();
          overlay.hidden = false;
          search.focus();
        } catch (error) {
          window.alert(error?.message || "Could not load people from your chats.");
        } finally {
          button.disabled = false;
        }
      });

      return {
        getSelected: () => [...selectedIds],
        setMax(value) {
          selectionLimit = normalizeLimit(value);
          selectedIds = selectedIds.slice(0, selectionLimit);
          selected = new Set(selectedIds);
          active?.change(selectedIds);
          draw();
        },
        clear() {
          selectedIds = [];
          selected.clear();
          if (summary) summary.textContent = "No people selected";
          onChange?.([]);
          draw();
        }
      };
    }
  };
})();
