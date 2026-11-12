(() => {
  type Point = { x: number; y: number };

  type TagPlayer = {
    user_id: string;
    x: number;
    y: number;
    color: string;
    status: string;
    is_it?: boolean;
  };

  type PlayerState = {
    id: string;
    current: Point;
    target: Point;
    color: string;
    isIt: boolean;
  };

  type EngineOptions = {
    localUserId: () => string | null;
    getInput: () => Point;
    getPlayers: () => TagPlayer[];
    getPlayerName: (id: string) => string;
    onLocalMove: (position: Point) => void;
  };

  class TagCanvasEngine {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly options: EngineOptions;
    private readonly states = new Map<string, PlayerState>();
    private readonly resizeHandler = () => this.resize();
    private observer: ResizeObserver | null = null;
    private frameId = 0;
    private running = false;
    private lastFrame = 0;
    private width = 0;
    private height = 0;
    private pixelRatio = 1;
    private localPosition: Point | null = null;
    private accent = "#40826d";
    private panel = "#17212e";
    private background = "#101722";
    private lastThemeRead = 0;
    private lastDraw = 0;
    private readonly labelCache = new Map<string, { text: string; width: number }>();
    private readonly frameInterval = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 50 : 33;

    constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is not available in this browser.");
      this.canvas = canvas;
      this.context = context;
      this.options = options;
      this.refreshTheme();

      if (typeof ResizeObserver !== "undefined") {
        this.observer = new ResizeObserver(this.resizeHandler);
        this.observer.observe(canvas);
      }
      window.addEventListener("resize", this.resizeHandler, { passive: true });
      this.resize();
      this.setPlayers(this.options.getPlayers());
    }

    setPlayers(players: TagPlayer[]): void {
      const seen = new Set<string>();
      const localId = this.options.localUserId();

      for (const player of players || []) {
        if (!player || player.status !== "joined" || !player.user_id) continue;
        const id = player.user_id;
        const x = this.clamp(Number(player.x) || 50, 2, 98);
        const y = this.clamp(Number(player.y) || 50, 2, 98);
        seen.add(id);

        let state = this.states.get(id);
        if (!state) {
          state = {
            id,
            current: { x, y },
            target: { x, y },
            color: player.color || "#38bdf8",
            isIt: !!player.is_it
          };
          this.states.set(id, state);
        }

        state.color = player.color || state.color;
        state.isIt = !!player.is_it;
        if (id === localId) {
          if (!this.localPosition) this.localPosition = { x, y };
          state.current = { ...this.localPosition };
          state.target = { ...this.localPosition };
        } else {
          state.target = { x, y };
        }
      }

      for (const id of this.states.keys()) {
        if (!seen.has(id)) this.states.delete(id);
      }

      if (localId && !this.states.has(localId)) this.localPosition = null;
    }

    setLocalPosition(position: Point): void {
      this.localPosition = {
        x: this.clamp(position.x, 2, 98),
        y: this.clamp(position.y, 2, 98)
      };
      const localId = this.options.localUserId();
      const state = localId ? this.states.get(localId) : undefined;
      if (state) {
        state.current = { ...this.localPosition };
        state.target = { ...this.localPosition };
      }
    }

    start(): void {
      if (this.running) return;
      this.running = true;
      this.lastFrame = 0;
      this.lastDraw = 0;
      this.frameId = requestAnimationFrame(this.tick);
    }

    stop(): void {
      this.running = false;
      if (this.frameId) cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.lastFrame = 0;
    }

    destroy(): void {
      this.stop();
      this.observer?.disconnect();
      this.observer = null;
      window.removeEventListener("resize", this.resizeHandler);
      this.states.clear();
      this.labelCache.clear();
    }

    private readonly tick = (time: number): void => {
      if (!this.running) return;
      if (document.hidden) {
        this.lastFrame = 0;
        this.frameId = requestAnimationFrame(this.tick);
        return;
      }
      const elapsed = this.lastFrame ? Math.min(50, time - this.lastFrame) : this.frameInterval;
      if (time - this.lastDraw < this.frameInterval) {
        this.frameId = requestAnimationFrame(this.tick);
        return;
      }
      const delta = this.lastFrame ? elapsed : this.frameInterval;
      this.lastFrame = time;
      this.lastDraw = time;
      if (!this.lastThemeRead || time - this.lastThemeRead > 1000) {
        this.refreshTheme();
        this.lastThemeRead = time;
      }
      this.update(Math.max(0, delta));
      this.draw(time);
      this.frameId = requestAnimationFrame(this.tick);
    };

    private update(deltaMs: number): void {
      const localId = this.options.localUserId();
      const local = localId ? this.states.get(localId) : undefined;

      if (local && this.localPosition) {
        const input = this.options.getInput() || { x: 0, y: 0 };
        const length = Math.hypot(input.x, input.y);
        if (length > 0.05) {
          const scale = length > 1 ? 1 / length : 1;
          const speed = local.isIt ? 12 : 10;
          const distance = speed * (deltaMs / 1000);
          this.localPosition = {
            x: this.clamp(this.localPosition.x + input.x * scale * distance, 2, 98),
            y: this.clamp(this.localPosition.y + input.y * scale * distance, 2, 98)
          };
          local.current = { ...this.localPosition };
          local.target = { ...this.localPosition };
          this.options.onLocalMove({ ...this.localPosition });
        }
      }

      const smoothing = 1 - Math.exp(-deltaMs / 85);
      for (const state of this.states.values()) {
        if (state.id === localId) continue;
        state.current.x += (state.target.x - state.current.x) * smoothing;
        state.current.y += (state.target.y - state.current.y) * smoothing;
      }
    }

    private resize(): void {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(190, rect.height || width * 9 / 16);
      const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      this.width = width;
      this.height = height;
      this.pixelRatio = ratio;

      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
      if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    private draw(time: number): void {
      const ctx = this.context;
      const width = this.width;
      const height = this.height;
      if (!width || !height) return;

      const accent = this.accent;
      const panel = this.panel;
      const background = this.background;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, panel);
      gradient.addColorStop(1, background);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      for (let x = 30; x < width; x += 38) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 28; y < height; y += 38) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 2;
      this.roundRect(9, 9, width - 18, height - 18, 15);
      ctx.stroke();
      ctx.globalAlpha = 0.20;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width / 2, 10);
      ctx.lineTo(width / 2, height - 10);
      ctx.stroke();
      ctx.restore();

      const localId = this.options.localUserId();
      for (const state of this.states.values()) {
        this.drawPlayer(state, time, accent, localId);
      }
    }

    private drawPlayer(state: PlayerState, time: number, accent: string, localId: string | null): void {
      const ctx = this.context;
      const x = (state.current.x / 100) * this.width;
      const y = (state.current.y / 100) * this.height;
      const radius = Math.max(8, Math.min(12, Math.min(this.width, this.height) * 0.023));
      const isLocal = state.id === localId;
      const pulse = (Math.sin(time / 260) + 1) / 2;

      ctx.save();
      if (state.isIt) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 5 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff6b75";
        ctx.globalAlpha = 0.45 + pulse * 0.28;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (isLocal) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = state.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      const fullName = this.options.getPlayerName(state.id) || "Player";
      let cachedLabel = this.labelCache.get(state.id);
      if (!cachedLabel || cachedLabel.text !== fullName) {
        const label = fullName.length > 17 ? fullName.slice(0, 16) + "…" : fullName;
        ctx.font = "600 10px system-ui, -apple-system, sans-serif";
        cachedLabel = { text: fullName, width: Math.min(116, ctx.measureText(label).width) };
        this.labelCache.set(state.id, cachedLabel);
      }
      const label = fullName.length > 17 ? fullName.slice(0, 16) + "…" : fullName;
      ctx.font = "600 10px system-ui, -apple-system, sans-serif";
      const textWidth = cachedLabel.width;
      const labelWidth = textWidth + 14;
      const labelHeight = 21;
      const labelX = this.clamp(x - labelWidth / 2, 4, this.width - labelWidth - 4);
      const labelY = Math.max(4, y - radius - labelHeight - 8);

      ctx.fillStyle = "rgba(8, 13, 21, 0.82)";
      this.roundRect(labelX, labelY, labelWidth, labelHeight, 8);
      ctx.fill();
      ctx.fillStyle = "#f4f7fb";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX + labelWidth / 2, labelY + labelHeight / 2, textWidth);
      if (state.isIt) {
        ctx.fillStyle = "#ff8890";
        ctx.font = "800 8px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("IT", labelX + labelWidth - 17, labelY + labelHeight / 2 + 0.5);
      }
      ctx.restore();
    }

    private refreshTheme(): void {
      const rootStyle = getComputedStyle(document.documentElement);
      this.accent = rootStyle.getPropertyValue("--accent").trim() || "#40826d";
      this.panel = rootStyle.getPropertyValue("--panel").trim() || "#17212e";
      this.background = rootStyle.getPropertyValue("--bg").trim() || "#101722";
    }

    private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
      const ctx = this.context;
      const r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    private clamp(value: number, min: number, max: number): number {
      return Math.max(min, Math.min(max, value));
    }
  }

  (window as any).GatherTagEngine = {
    create: (canvas: HTMLCanvasElement, options: EngineOptions) => new TagCanvasEngine(canvas, options)
  };
})();
