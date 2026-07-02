// Board renderer: takes a parsed spec and produces an SVG game board.
// Every room rect carries data-zone-id / data-x / data-y / data-w / data-h
// so a downstream simulation engine can consume the rendered SVG directly.

const { useMemo, useRef, useState, useEffect } = React;

// Convert a column index to a chess-style letter label (A, B, ..., Z, AA, AB, ...).
function colLabel(n) {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

function fmtCoord(x, y) {
  return `${colLabel(x)}${String(y + 1).padStart(2, "0")}`;
}

// Initials for an agent (used when no `name_short` is supplied).
function initialsOf(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Build the hull path for a ship of given tile dims.
// Bow tapers at left (cols 0..bowTaper) and stern rounds at right.
function hullPath(cols, rows, tile, pad, bowTaper = 4, sternTaper = 1.2) {
  const W = cols * tile;
  const H = rows * tile;
  const bx = bowTaper * tile; // bow taper width
  const sx = sternTaper * tile; // stern taper width
  const cy = H / 2;

  // Smooth path: bow tip on the left, gentle stern on the right.
  return [
    `M ${pad + bx} ${pad}`,
    `L ${pad + W - sx} ${pad}`,
    `Q ${pad + W} ${pad} ${pad + W} ${pad + sx}`,
    `L ${pad + W} ${pad + H - sx}`,
    `Q ${pad + W} ${pad + H} ${pad + W - sx} ${pad + H}`,
    `L ${pad + bx} ${pad + H}`,
    `Q ${pad} ${pad + H} ${pad} ${pad + cy + tile * 1.2}`,
    `Q ${pad} ${pad + cy} ${pad - tile * 0.6} ${pad + cy}`,
    `Q ${pad} ${pad + cy} ${pad} ${pad + cy - tile * 1.2}`,
    `Q ${pad} ${pad} ${pad + bx} ${pad}`,
    "Z",
  ].join(" ");
}

function Room({ room, type, tile, pad, selected, hovered, onClick, onMouseEnter }) {
  if (!type) return null;
  const x = pad + room.x * tile;
  const y = pad + room.y * tile;
  const w = room.w * tile;
  const h = room.h * tile;
  const stroke = darken(type.fill, 0.32);
  const cornerR = Math.min(3, tile * 0.12);

  const cls = ["room-rect"];
  if (hovered) cls.push("hover");
  if (selected) cls.push("selected");

  // Choose a label placement that fits the room
  const labelFontSize = Math.min(13, tile * 0.5, Math.max(9, Math.min(w, h) * 0.13 + 7));
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Tag with coord at top-left corner
  const coord = fmtCoord(room.x, room.y);

  return (
    <g
      data-zone-id={room.id}
      data-x={room.x}
      data-y={room.y}
      data-w={room.w}
      data-h={room.h}
      data-type={room.type}
      data-name={room.name}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <rect
        className={cls.join(" ")}
        x={x + 0.6}
        y={y + 0.6}
        width={w - 1.2}
        height={h - 1.2}
        rx={cornerR}
        ry={cornerR}
        fill={type.fill}
        stroke={stroke}
      />
      {/* subtle inner stripe to add texture */}
      <rect
        x={x + 2}
        y={y + 2}
        width={Math.max(0, w - 4)}
        height={Math.max(0, h - 4)}
        rx={Math.max(0, cornerR - 1)}
        ry={Math.max(0, cornerR - 1)}
        fill="none"
        stroke={lighten(type.fill, 0.25)}
        strokeWidth="1"
        opacity="0.4"
        pointerEvents="none"
      />
      {/* coord tag in top-left of room */}
      <text className="room-coord" x={x + 4} y={y + 9} fill={mixInk(type.ink, 0.5)}>
        {coord}
      </text>
      {/* room-specific decorations */}
      <RoomDecor room={room} type={type} tile={tile} x={x} y={y} w={w} h={h} />
      {/* primary label */}
      {h >= tile * 2 ? (
        <text
          className="room-label"
          x={cx}
          y={cy + 2}
          fontSize={labelFontSize}
          fill={type.ink}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ stroke: addAlpha(type.fill, 0.9) }}
        >
          {shortenName(room.name)}
        </text>
      ) : (
        // narrow rooms (corridors, lifeboat row, etc.) - small inline label
        <text
          className="room-label"
          x={cx}
          y={cy + 1}
          fontSize={Math.min(11, h * 0.6)}
          fill={type.ink}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ stroke: addAlpha(type.fill, 0.9) }}
        >
          {shortenName(room.name)}
        </text>
      )}
    </g>
  );
}

function shortenName(n) {
  return n
    .replace("Cabins ", "Cabins ")
    .replace("Stations", "Stns")
    .replace("Lifeboat Stns", "Lifeboats")
    .replace("Forward", "Fwd");
}

// Per-room visual flourishes
function RoomDecor({ room, type, tile, x, y, w, h }) {
  if (room.id === "helideck") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.32;
    return (
      <g pointerEvents="none">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(20,30,40,0.55)" strokeWidth="2" strokeDasharray="3 2" />
        <text className="helideck-h" x={cx} y={cy + 1} fontSize={Math.min(r * 1.4, 22)}>H</text>
      </g>
    );
  }
  if (room.id === "pool") {
    // pool basin
    const px = x + tile * 0.5;
    const py = y + tile * 0.4;
    const pw = w - tile;
    const ph = h - tile * 0.8;
    return (
      <g pointerEvents="none">
        <rect className="pool-water" x={px} y={py} width={pw} height={ph} rx={tile * 0.3} />
        <path className="pool-ripple" d={`M ${px + 6} ${py + ph * 0.35} q ${pw * 0.15} -4 ${pw * 0.3} 0 t ${pw * 0.3} 0 t ${pw * 0.3} 0`} />
        <path className="pool-ripple" d={`M ${px + 6} ${py + ph * 0.65} q ${pw * 0.15} -4 ${pw * 0.3} 0 t ${pw * 0.3} 0 t ${pw * 0.3} 0`} />
      </g>
    );
  }
  if (room.id === "bridge") {
    // compass / wheel
    const cx = x + w * 0.5;
    const cy = y + h * 0.42;
    const r = Math.min(w, h) * 0.22;
    return (
      <g pointerEvents="none" stroke="rgba(243,230,200,0.55)" strokeWidth="1.4" fill="none">
        <circle cx={cx} cy={cy} r={r} />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} />
        <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} />
        <line x1={cx + r * 0.7} y1={cy - r * 0.7} x2={cx - r * 0.7} y2={cy + r * 0.7} />
      </g>
    );
  }
  if (room.id === "infirmary" || room.id === "isolation") {
    const cx = x + w - 11;
    const cy = y + 11;
    const s = 5;
    const c = room.id === "isolation" ? "#fff" : "#9d2f28";
    return (
      <g pointerEvents="none" stroke={c} strokeWidth="2" strokeLinecap="round">
        <line x1={cx - s} y1={cy} x2={cx + s} y2={cy} />
        <line x1={cx} y1={cy - s} x2={cx} y2={cy + s} />
      </g>
    );
  }
  if (room.type === "cabin" || room.type === "suite") {
    // tiny "doors" along corridor edge to suggest individual cabins
    const cabinW = tile * 1; // each cabin is ~1 tile wide
    const count = Math.max(1, Math.floor(w / cabinW));
    const lineY = room.y < 10 ? y + h - 4 : y + 4; // line near corridor side
    return (
      <g pointerEvents="none" stroke={darken(type.fill, 0.4)} strokeWidth="1" opacity="0.5">
        {Array.from({ length: count - 1 }).map((_, i) => {
          const lx = x + (w / count) * (i + 1);
          const ly1 = room.y < 10 ? y + tile * 0.4 : y + h - tile * 0.4;
          const ly2 = room.y < 10 ? y + h - 2 : y + 2;
          return <line key={i} x1={lx} y1={ly1} x2={lx} y2={ly2} />;
        })}
      </g>
    );
  }
  if (room.type === "emergency") {
    // lifeboats along the row
    const boatW = tile * 1.4;
    const gap = tile * 0.4;
    const total = boatW + gap;
    const n = Math.max(1, Math.floor(w / total));
    const offset = (w - n * total + gap) / 2;
    const by = y + h / 2 - tile * 0.32;
    const bh = tile * 0.62;
    return (
      <g pointerEvents="none">
        {Array.from({ length: n }).map((_, i) => {
          const bx = x + offset + i * total;
          return (
            <g key={i}>
              <path
                className="lifeboat"
                d={`M ${bx} ${by} L ${bx + boatW} ${by} L ${bx + boatW - 3} ${by + bh} L ${bx + 3} ${by + bh} Z`}
                fill="#e8c47e"
              />
              <line x1={bx + 2} y1={by + bh * 0.5} x2={bx + boatW - 2} y2={by + bh * 0.5} stroke="#8c6b30" strokeWidth="0.7" />
            </g>
          );
        })}
      </g>
    );
  }
  if (room.type === "corridor") {
    // dashed center line
    return (
      <line
        pointerEvents="none"
        x1={x + 6}
        y1={y + h / 2}
        x2={x + w - 6}
        y2={y + h / 2}
        stroke={darken(type.fill, 0.35)}
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.6"
      />
    );
  }
  if (room.type === "atrium") {
    return (
      <g pointerEvents="none">
        {Array.from({ length: Math.floor(w / tile / 3) }).map((_, i) => {
          const sx = x + tile * 1.5 + i * tile * 3;
          return (
            <text
              key={i}
              x={sx}
              y={y + h / 2 + 4}
              fontSize={12}
              fill={darken(type.fill, 0.45)}
              textAnchor="middle"
              opacity="0.55"
            >
              &#x2726;
            </text>
          );
        })}
      </g>
    );
  }
  return null;
}

function Door({ door, tile, pad }) {
  // dir h: horizontal wall door (between row y-1 and row y) - width across X
  // dir v: vertical   wall door (between col x-1 and col x) - height across Y
  const px = pad + door.x * tile;
  const py = pad + door.y * tile;
  const len = tile * 0.55;
  if (door.dir === "h") {
    const cx = px + tile / 2;
    const cy = py;
    return (
      <g>
        <line className="door-bg" x1={cx - len / 2} y1={cy} x2={cx + len / 2} y2={cy} />
        <line className="door" x1={cx - len / 2} y1={cy} x2={cx + len / 2} y2={cy} />
        <circle cx={cx} cy={cy} r="1.5" fill="var(--brass-soft, #8c6b30)" />
      </g>
    );
  }
  // v
  const cx = px;
  const cy = py + tile / 2;
  return (
    <g>
      <line className="door-bg" x1={cx} y1={cy - len / 2} x2={cx} y2={cy + len / 2} />
      <line className="door" x1={cx} y1={cy - len / 2} x2={cx} y2={cy + len / 2} />
      <circle cx={cx} cy={cy} r="1.5" fill="var(--brass-soft, #8c6b30)" />
    </g>
  );
}

function Agent({ agent, state, tile, pad, selected, onClick, size }) {
  const cx = pad + agent.x * tile + tile / 2;
  const cy = pad + agent.y * tile + tile / 2;
  const r = (size || 11);
  const initials = agent.name_short || initialsOf(agent.name);
  return (
    <g
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onClick && onClick(agent); }}
      data-agent-id={agent.id}
    >
      <ellipse className="agent-shadow" cx={cx} cy={cy + r * 0.7} rx={r * 0.85} ry={r * 0.25} />
      {selected && (
        <circle className="agent-pulse" cx={cx} cy={cy} r={r + 5} stroke={state.color} opacity="0.6">
          <animate attributeName="r" values={`${r + 3};${r + 9};${r + 3}`} dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        className={`agent-body ${selected ? "selected" : ""}`}
        cx={cx}
        cy={cy}
        r={r}
        fill={state.color}
      />
      <text className="agent-init" x={cx} y={cy + 0.5} fontSize={Math.max(8, r * 0.85)}>{initials}</text>
    </g>
  );
}

// SVG Axes (column letters across top, row numbers down left).
function Axes({ cols, rows, tile, pad }) {
  const W = cols * tile;
  const H = rows * tile;
  return (
    <g>
      {/* top axis ribbon */}
      <rect className="axis-bg" x={pad} y={pad - 14} width={W} height={14} rx="2" opacity="0.55" />
      {Array.from({ length: cols }).map((_, i) => (
        <text key={`cx${i}`} className="axis-label" x={pad + i * tile + tile / 2} y={pad - 4} textAnchor="middle">
          {colLabel(i)}
        </text>
      ))}
      {/* left axis ribbon */}
      <rect className="axis-bg" x={pad - 18} y={pad} width={14} height={H} rx="2" opacity="0.55" />
      {Array.from({ length: rows }).map((_, i) => (
        <text key={`ry${i}`} className="axis-label" x={pad - 11} y={pad + i * tile + tile / 2 + 3} textAnchor="middle">
          {String(i + 1).padStart(2, "0")}
        </text>
      ))}
    </g>
  );
}

// Color utilities (operate on hex strings)
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function darken(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
function mixInk(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
function addAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function Board({
  spec,
  hoverTile,
  setHoverTile,
  selectedRoomId,
  setSelectedRoomId,
  selectedAgentId,
  setSelectedAgentId,
  showGrid,
  showCoords,
  showDoors,
  showAgents,
  dimRoomTypes,
  agentSize,
  hullStyle,
}) {
  const { grid, rooms, doors, agents, types, states } = spec;
  const tile = grid.tile;
  const pad = 26; // room for axes
  const W = grid.cols * tile + pad * 2;
  const H = grid.rows * tile + pad * 2 + 8;
  const innerW = grid.cols * tile;
  const innerH = grid.rows * tile;

  // Lookup which room contains tile (x,y)
  const tileRoom = useMemo(() => {
    const idx = {};
    rooms.forEach((r) => {
      for (let dy = 0; dy < r.h; dy++) {
        for (let dx = 0; dx < r.w; dx++) {
          idx[`${r.x + dx},${r.y + dy}`] = r;
        }
      }
    });
    return idx;
  }, [rooms]);

  function handleSvgMouseMove(e) {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    const tx = Math.floor((loc.x - pad) / tile);
    const ty = Math.floor((loc.y - pad) / tile);
    if (tx < 0 || ty < 0 || tx >= grid.cols || ty >= grid.rows) {
      setHoverTile(null);
      return;
    }
    const r = tileRoom[`${tx},${ty}`];
    setHoverTile({ x: tx, y: ty, room: r || null });
  }

  function handleSvgLeave() { setHoverTile(null); }

  const hull = useMemo(() =>
    hullStyle === "square"
      ? `M ${pad} ${pad} L ${pad + innerW} ${pad} L ${pad + innerW} ${pad + innerH} L ${pad} ${pad + innerH} Z`
      : hullPath(grid.cols, grid.rows, tile, pad, 4, 1.2),
  [grid.cols, grid.rows, tile, hullStyle]);

  return (
    <svg
      className="board-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onMouseMove={handleSvgMouseMove}
      onMouseLeave={handleSvgLeave}
      onClick={() => setSelectedRoomId(null)}
    >
      <defs>
        <pattern id="hullGrain" patternUnits="userSpaceOnUse" width="6" height="6">
          <rect width="6" height="6" fill="var(--hull-fill, #f2e6c8)" />
          <circle cx="1" cy="1" r="0.5" fill="rgba(140,107,48,0.06)" />
        </pattern>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="0" dy="2" />
          <feComponentTransfer><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <Axes cols={grid.cols} rows={grid.rows} tile={tile} pad={pad} />

      {/* Hull */}
      <path d={hull} className="hull-fill" fill="url(#hullGrain)" filter="url(#softShadow)" />
      <path d={hull} className="hull-stroke" />
      {/* Hull pinstripe inset */}
      <path d={hullStyle === "square"
        ? `M ${pad + 4} ${pad + 4} L ${pad + innerW - 4} ${pad + 4} L ${pad + innerW - 4} ${pad + innerH - 4} L ${pad + 4} ${pad + innerH - 4} Z`
        : hullPath(grid.cols, grid.rows, tile, pad, 4, 1.2)}
        className="hull-pinstripe" transform={hullStyle === "square" ? "" : "scale(1)"}
      />

      {/* Tile grid overlay */}
      {showGrid && (
        <g pointerEvents="none">
          {Array.from({ length: grid.cols + 1 }).map((_, i) => (
            <line key={`gx${i}`} className={i % 5 === 0 ? "tile-grid-strong" : "tile-grid-line"}
              x1={pad + i * tile} y1={pad} x2={pad + i * tile} y2={pad + innerH} />
          ))}
          {Array.from({ length: grid.rows + 1 }).map((_, i) => (
            <line key={`gy${i}`} className={i % 5 === 0 ? "tile-grid-strong" : "tile-grid-line"}
              x1={pad} y1={pad + i * tile} x2={pad + innerW} y2={pad + i * tile} />
          ))}
        </g>
      )}

      {/* Rooms */}
      <g>
        {rooms.map((r) => {
          const t = types[r.type];
          const dim = dimRoomTypes && dimRoomTypes[r.type] === false;
          return (
            <g key={r.id} className={dim ? "dim" : ""} style={{ opacity: dim ? 0.25 : 1 }}>
              <Room
                room={r}
                type={t}
                tile={tile}
                pad={pad}
                hovered={hoverTile && hoverTile.room && hoverTile.room.id === r.id}
                selected={selectedRoomId === r.id}
                onClick={(e) => { e.stopPropagation(); setSelectedRoomId(r.id); }}
                onMouseEnter={() => {}}
              />
            </g>
          );
        })}
      </g>

      {/* Doors */}
      {showDoors && (
        <g style={{ pointerEvents: "none" }}>
          {doors.map((d, i) => <Door key={i} door={d} tile={tile} pad={pad} />)}
        </g>
      )}

      {/* Hover cursor */}
      {hoverTile && (
        <g pointerEvents="none">
          <rect
            className="hover-cursor-bg"
            x={pad + hoverTile.x * tile + 0.5}
            y={pad + hoverTile.y * tile + 0.5}
            width={tile - 1}
            height={tile - 1}
            rx="2"
          />
          <rect
            className="hover-cursor"
            x={pad + hoverTile.x * tile + 0.5}
            y={pad + hoverTile.y * tile + 0.5}
            width={tile - 1}
            height={tile - 1}
            rx="2"
          />
        </g>
      )}

      {/* Agents */}
      {showAgents && (
        <g>
          {agents.map((a) => {
            const s = states[a.state] || states.healthy;
            return (
              <Agent
                key={a.id}
                agent={a}
                state={s}
                tile={tile}
                pad={pad}
                size={agentSize}
                selected={selectedAgentId === a.id}
                onClick={(ag) => setSelectedAgentId(ag.id === selectedAgentId ? null : ag.id)}
              />
            );
          })}
        </g>
      )}

      {/* Compass rose */}
      <g transform={`translate(${pad + innerW - 36}, ${pad + innerH - 36})`} pointerEvents="none">
        <circle r="22" fill="rgba(20,30,40,0.55)" stroke="var(--brass, #c89849)" strokeWidth="1.2" />
        <text className="compass" x="0" y="-9" textAnchor="middle" fontSize="9" fill="var(--brass, #c89849)">N</text>
        <text className="compass" x="0" y="16" textAnchor="middle" fontSize="9" fill="var(--brass, #c89849)" opacity="0.6">S</text>
        <text className="compass" x="-17" y="3" textAnchor="middle" fontSize="9" fill="var(--brass, #c89849)" opacity="0.6">W</text>
        <text className="compass" x="17" y="3" textAnchor="middle" fontSize="9" fill="var(--brass, #c89849)" opacity="0.6">E</text>
        <path d="M 0 -16 L 4 0 L 0 16 L -4 0 Z" fill="var(--brass, #c89849)" opacity="0.85" />
      </g>

      {/* Bow / Stern markers */}
      <text x={pad + 6} y={pad + innerH + 18} className="axis-label" fill="var(--brass, #c89849)">&#x25C0; BOW</text>
      <text x={pad + innerW - 6} y={pad + innerH + 18} className="axis-label" fill="var(--brass, #c89849)" textAnchor="end">STERN &#x25B6;</text>
    </svg>
  );
}

Object.assign(window, {
  Board,
  fmtCoord,
  colLabel,
  initialsOf,
  hexToRgb,
  darken,
  lighten,
});
