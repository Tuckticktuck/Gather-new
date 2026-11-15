function requireHandler(handlers, name) {
  if (typeof handlers?.[name] !== "function") throw new TypeError("Legacy board module handler " + name + " is required.");
  return handlers[name];
}

export function createLegacyBoardModules(handlers) {
  const renderLobby = requireHandler(handlers, "renderLobby");
  const renderTicTacToe = requireHandler(handlers, "renderTicTacToe");
  const renderConnectFour = requireHandler(handlers, "renderConnectFour");
  const onMount = typeof handlers.onMount === "function" ? handlers.onMount : null;
  const onUnmount = typeof handlers.onUnmount === "function" ? handlers.onUnmount : null;

  function createModule(id, renderMatch) {
    return Object.freeze({
      id,
      apiVersion: 1,
      mount(context = {}) {
        const instance = Object.freeze({
          gameId: id,
          services: context.services || null,
          viewerId: context.viewerId || null
        });
        if (onMount) onMount(id, instance);
        return instance;
      },
      renderLobby(context, instance) { return renderLobby(context, instance); },
      renderMatch(context, instance) { return renderMatch(context, instance); },
      unmount(instance) { if (onUnmount) onUnmount(id, instance || null); }
    });
  }

  return Object.freeze([
    createModule("tic_tac_toe", renderTicTacToe),
    createModule("connect_four", renderConnectFour)
  ]);
}
