// App shell: parses the YAML spec, renders board + sidebar, exposes a live
// spec editor and tweaks. The board is generated from the spec on every change.

const { useState, useEffect, useMemo, useRef } = React;

const SPEC_TEXT_DEFAULT = document.getElementById("ship-spec").textContent;

function safeParse(text) {
  try {
    const parsed = jsyaml.load(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Spec must be an object");
    if (!parsed.grid) throw new Error("Missing `grid`");
    if (!Array.isArray(parsed.rooms)) throw new Error("Missing `rooms` array");
    if (!parsed.types) throw new Error("Missing `types`");
    if (!parsed.states) parsed.states = {};
    if (!parsed.doors) parsed.doors = [];
    if (!parsed.agents) parsed.agents = [];
    return { spec: parsed, error: null };
  } catch (e) {
    return { spec: null, error: e.message };
  }
}

function downloadFile(name, content, mime = "image/svg+xml") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "hull_style": "rounded",
  "agent_size": 11,
  "show_grid": true,
  "show_doors": true,
  "show_agents": true,
  "show_coord_tags": true
}/*EDITMODE-END*/;

function StatBar({ spec }) {
  const counts = useMemo(() => {
    const byState = {};
    (spec.agents || []).forEach(a => { byState[a.state] = (byState[a.state] || 0) + 1; });
    const passengers = (spec.agents || []).filter(a => a.role === "passenger").length;
    const crew = (spec.agents || []).filter(a => a.role !== "passenger").length;
    return { byState, passengers, crew, rooms: spec.rooms.length, doors: spec.doors.length };
  }, [spec]);
  return (
    <>
      <div className="stat"><span className="v">{spec.grid.cols}x{spec.grid.rows}</span><span className="l">Grid</span></div>
      <div className="stat"><span className="v">{counts.rooms}</span><span className="l">Rooms</span></div>
      <div className="stat"><span className="v">{counts.doors}</span><span className="l">Doors</span></div>
      <div className="stat"><span className="v">{counts.passengers}</span><span className="l">Passengers</span></div>
      <div className="stat"><span className="v">{counts.crew}</span><span className="l">Crew</span></div>
    </>
  );
}

function HoverReadout({ hoverTile, spec, selectedRoom, selectedAgent }) {
  // priority: selected agent > hover > selected room
  if (selectedAgent) {
    const s = spec.states[selectedAgent.state] || { color: "#999", label: selectedAgent.state };
    const room = roomAt(spec, selectedAgent.x, selectedAgent.y);
    return (
      <div className="readout">
        <div className="k">Agent</div><div className="v">{selectedAgent.name}</div>
        <div className="k">ID</div><div className="v mono">{selectedAgent.id}</div>
        <div className="k">Role</div><div className="v">{selectedAgent.role}</div>
        <div className="k">State</div><div className="v"><span className="swatch" style={{background: s.color}} />{s.label}</div>
        <div className="k">Tile</div><div className="v mono">{fmtCoord(selectedAgent.x, selectedAgent.y)} ({selectedAgent.x},{selectedAgent.y})</div>
        <div className="k">Room</div><div className="v">{room ? room.name : "-"}</div>
      </div>
    );
  }
  if (hoverTile) {
    const r = hoverTile.room;
    return (
      <div className="readout">
        <div className="k">Tile</div><div className="v mono">{fmtCoord(hoverTile.x, hoverTile.y)} ({hoverTile.x},{hoverTile.y})</div>
        <div className="k">Room</div><div className="v">{r ? r.name : <span style={{color:"var(--panel-mute)"}}>Outside hull</span>}</div>
        {r && <><div className="k">Zone ID</div><div className="v mono">{r.id}</div></>}
        {r && <><div className="k">Type</div><div className="v"><span className="swatch" style={{background: spec.types[r.type].fill}} />{spec.types[r.type].label}</div></>}
        {r && <><div className="k">Bounds</div><div className="v mono">{fmtCoord(r.x, r.y)} - {fmtCoord(r.x + r.w - 1, r.y + r.h - 1)} * {r.w}x{r.h}</div></>}
      </div>
    );
  }
  if (selectedRoom) {
    return (
      <div className="readout">
        <div className="k">Room</div><div className="v">{selectedRoom.name}</div>
        <div className="k">Zone ID</div><div className="v mono">{selectedRoom.id}</div>
        <div className="k">Type</div><div className="v"><span className="swatch" style={{background: spec.types[selectedRoom.type].fill}} />{spec.types[selectedRoom.type].label}</div>
        <div className="k">Bounds</div><div className="v mono">{fmtCoord(selectedRoom.x, selectedRoom.y)} - {fmtCoord(selectedRoom.x + selectedRoom.w - 1, selectedRoom.y + selectedRoom.h - 1)}</div>
        <div className="k">Tiles</div><div className="v mono">{selectedRoom.w * selectedRoom.h} ({selectedRoom.w}x{selectedRoom.h})</div>
      </div>
    );
  }
  return <div style={{color:"var(--panel-mute)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace"}}>Hover a tile or select an agent.</div>;
}

function roomAt(spec, x, y) {
  for (const r of spec.rooms) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
  }
  return null;
}

function App() {
  const [specText, setSpecText] = useState(SPEC_TEXT_DEFAULT);
  const [parsed, setParsed] = useState(() => safeParse(SPEC_TEXT_DEFAULT));
  const [hoverTile, setHoverTile] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [tab, setTab] = useState("roster"); // roster | spec
  const [dimRoomTypes, setDimRoomTypes] = useState({}); // type -> false to dim
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const svgWrapRef = useRef(null);

  // Re-parse on edit
  useEffect(() => {
    const tid = setTimeout(() => setParsed(safeParse(specText)), 200);
    return () => clearTimeout(tid);
  }, [specText]);

  const spec = parsed.spec || (parsed.spec === null ? null : null);
  const fallbackSpec = useMemo(() => safeParse(SPEC_TEXT_DEFAULT).spec, []);
  const effectiveSpec = spec || fallbackSpec;
  const selectedRoom = selectedRoomId ? effectiveSpec.rooms.find(r => r.id === selectedRoomId) : null;
  const selectedAgent = selectedAgentId ? effectiveSpec.agents.find(a => a.id === selectedAgentId) : null;

  const typesList = Object.keys(effectiveSpec.types);

  function exportSVG(withAgents) {
    const svg = svgWrapRef.current && svgWrapRef.current.querySelector("svg");
    if (!svg) return;
    let clone = svg.cloneNode(true);
    if (!withAgents) {
      clone.querySelectorAll("[data-agent-id]").forEach(n => n.remove());
    }
    // strip hover cursor
    clone.querySelectorAll(".hover-cursor, .hover-cursor-bg").forEach(n => n.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(clone);
    const header = '<?xml version="1.0" encoding="UTF-8"?>\n';
    downloadFile(withAgents ? "ship-snapshot.svg" : "ship-board.svg", header + xml);
  }

  function exportYAML() {
    downloadFile("ship-spec.yaml", specText, "text/yaml");
  }

  function resetSpec() {
    setSpecText(SPEC_TEXT_DEFAULT);
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="ship"><span className="pre">M.S.</span>VERITY * SIMULATION BOARD</div>
          <div className="sub">Tile grid * {effectiveSpec.grid.cols}x{effectiveSpec.grid.rows} * {effectiveSpec.grid.tile}px tiles * YAML-driven</div>
        </div>
        <div className="spacer" />
        <StatBar spec={effectiveSpec} />
      </div>

      <div className="board-wrap" ref={svgWrapRef}>
        <div className="board-frame">
          <Board
            spec={effectiveSpec}
            hoverTile={hoverTile}
            setHoverTile={setHoverTile}
            selectedRoomId={selectedRoomId}
            setSelectedRoomId={(id) => { setSelectedRoomId(id); setSelectedAgentId(null); }}
            selectedAgentId={selectedAgentId}
            setSelectedAgentId={setSelectedAgentId}
            showGrid={t.show_grid}
            showCoords={t.show_coord_tags}
            showDoors={t.show_doors}
            showAgents={t.show_agents}
            dimRoomTypes={dimRoomTypes}
            agentSize={t.agent_size}
            hullStyle={t.hull_style}
          />
        </div>
      </div>

      <div className="sidebar">
        {/* readout */}
        <div className="panel">
          <h3>Inspector</h3>
          <HoverReadout hoverTile={hoverTile} spec={effectiveSpec} selectedRoom={selectedRoom} selectedAgent={selectedAgent} />
          <div className="hint">
            Hover tiles to read coords. Click a room or agent to pin it. Coord format: <kbd>A01</kbd>-<kbd>{colLabel(effectiveSpec.grid.cols - 1)}{String(effectiveSpec.grid.rows).padStart(2,"0")}</kbd>.
          </div>
        </div>

        {/* tabbed: roster / spec */}
        <div className="panel">
          <div className="spec-tabs">
            <button className={tab === "roster" ? "active" : ""} onClick={() => setTab("roster")}>Agents</button>
            <button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}>Rooms</button>
            <button className={tab === "spec" ? "active" : ""} onClick={() => setTab("spec")}>Spec</button>
          </div>

          {tab === "roster" && (
            <>
              <h3>Roster <span className="count">{effectiveSpec.agents.length}</span></h3>
              <div className="roster">
                {effectiveSpec.agents.map(a => {
                  const s = effectiveSpec.states[a.state] || { color: "#999", label: a.state };
                  const room = roomAt(effectiveSpec, a.x, a.y);
                  return (
                    <div
                      key={a.id}
                      className={`agent-row ${selectedAgentId === a.id ? "selected" : ""}`}
                      onClick={() => { setSelectedAgentId(selectedAgentId === a.id ? null : a.id); setSelectedRoomId(null); }}
                    >
                      <div className="chip" style={{ background: s.color }}>
                        {a.name_short || initialsOf(a.name)}
                      </div>
                      <div className="meta">
                        <div className="name">{a.name}</div>
                        <div className="sub">{a.id} * {a.role} * {s.label}</div>
                      </div>
                      <div className="where">{fmtCoord(a.x, a.y)}<br/><span style={{color:"var(--panel-mute)"}}>{room ? room.id : "-"}</span></div>
                    </div>
                  );
                })}
              </div>
              <h3 style={{marginTop: 14}}>Health States</h3>
              <div className="states">
                {Object.entries(effectiveSpec.states).map(([k, v]) => (
                  <div key={k} className="item">
                    <span className="dot" style={{ background: v.color }} />{v.label}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "rooms" && (
            <>
              <h3>Room Types <span className="count">{typesList.length}</span></h3>
              <div className="legend">
                {typesList.map(k => {
                  const tp = effectiveSpec.types[k];
                  const on = dimRoomTypes[k] !== false;
                  const count = effectiveSpec.rooms.filter(r => r.type === k).length;
                  return (
                    <div
                      key={k}
                      className={`item ${on ? "" : "dim"}`}
                      onClick={() => setDimRoomTypes(prev => ({...prev, [k]: !on}))}
                    >
                      <span className="sw" style={{ background: tp.fill }} />
                      <span>{tp.label} <span style={{color:"var(--panel-mute)", fontSize: 10}}>x {count}</span></span>
                    </div>
                  );
                })}
              </div>
              <h3 style={{marginTop: 14}}>Rooms <span className="count">{effectiveSpec.rooms.length}</span></h3>
              <div className="roster" style={{maxHeight: 240}}>
                {effectiveSpec.rooms.map(r => {
                  const tp = effectiveSpec.types[r.type];
                  return (
                    <div
                      key={r.id}
                      className={`agent-row ${selectedRoomId === r.id ? "selected" : ""}`}
                      onClick={() => { setSelectedRoomId(selectedRoomId === r.id ? null : r.id); setSelectedAgentId(null); }}
                    >
                      <div className="chip" style={{ background: tp.fill, color: tp.ink, fontSize: 9 }}>
                        {r.id.slice(0,3).toUpperCase()}
                      </div>
                      <div className="meta">
                        <div className="name">{r.name}</div>
                        <div className="sub">{r.id} * {tp.label}</div>
                      </div>
                      <div className="where">{fmtCoord(r.x, r.y)}<br/><span style={{color:"var(--panel-mute)"}}>{r.w}x{r.h}</span></div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "spec" && (
            <>
              <div className="spec-head">
                <h3 style={{margin: 0, flex: 1}}>YAML Spec</h3>
                <button onClick={resetSpec}>Reset</button>
                <button onClick={exportYAML}>&darr; YAML</button>
                <button className="primary" onClick={() => exportSVG(false)}>&darr; SVG</button>
              </div>
              {parsed.error && (
                <div className="spec-error">&#x26A0; {parsed.error}</div>
              )}
              <textarea
                className="spec-editor"
                value={specText}
                onChange={(e) => setSpecText(e.target.value)}
                spellCheck={false}
              />
              <div className="hint">
                Edit the YAML and the board updates live. Each room rect is emitted with
                <kbd>data-zone-id</kbd>, <kbd>data-x</kbd>, <kbd>data-y</kbd>, <kbd>data-w</kbd>, <kbd>data-h</kbd> so a simulation engine can consume the exported SVG directly.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tweaks (toggle from toolbar) */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Display" />
        <TweakRadio label="Hull" value={t.hull_style} options={[{value:"rounded", label:"Rounded"}, {value:"square", label:"Square"}]} onChange={v => setTweak("hull_style", v)} />
        <TweakToggle label="Tile grid" value={t.show_grid} onChange={v => setTweak("show_grid", v)} />
        <TweakToggle label="Door markers" value={t.show_doors} onChange={v => setTweak("show_doors", v)} />
        <TweakToggle label="Coord tags" value={t.show_coord_tags} onChange={v => setTweak("show_coord_tags", v)} />
        <TweakSection label="Agents" />
        <TweakToggle label="Show agents" value={t.show_agents} onChange={v => setTweak("show_agents", v)} />
        <TweakSlider label="Agent size" value={t.agent_size} min={6} max={18} step={1} onChange={v => setTweak("agent_size", v)} />
        <TweakSection label="Export" />
        <TweakButton label="Download board SVG" onClick={() => exportSVG(false)} />
        <TweakButton label="Snapshot SVG (with agents)" onClick={() => exportSVG(true)} />
        <TweakButton label="Download YAML spec" onClick={exportYAML} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
