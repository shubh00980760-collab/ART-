import { useState, useRef, useEffect, useCallback } from "react";

/* ── tiny uid ── */
const uid = () => Math.random().toString(36).slice(2, 9);

/* ════════════════════════════════════════════
   COLOUR PALETTE & GLOBAL STYLES
═══════════════════════════════════════════ */
const G = {
  ink: "#1a1118",
  paper: "#f5f0e8",
  cream: "#ede7d9",
  rust: "#c0472b",
  gold: "#c9963a",
  sage: "#5a7a5e",
  muted: "#8a7f72",
  canvasBg: "#faf7f2",
};

const injectFonts = () => {
  if (document.getElementById("dm-fonts")) return;
  const l = document.createElement("link");
  l.id = "dm-fonts";
  l.rel = "stylesheet";
  l.href =
    "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap";
  document.head.appendChild(l);
};

/* ════════════════════════════════════════════
   SUPABASE CONFIG
═══════════════════════════════════════════ */
const SUPABASE_URL = "https://krvvkulyxmxvbzemufgp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtydnZrdWx5eG14dmJ6ZW11ZmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzE4NjMsImV4cCI6MjA4OTYwNzg2M30.c-jqjlM2uj0M7HvwxMx3GCgBUm0NizDRhl2-r6MsUDw";
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

/* ════════════════════════════════════════════
   STORAGE HELPERS
═══════════════════════════════════════════ */
async function saveArt(payload) {
  const id = uid();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/artworks`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({
      id,
      to_name: payload.to,
      from_name: payload.from,
      message: payload.msg,
      image_data: payload.img,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return id;
}

async function loadArt(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/artworks?id=eq.${id}&select=*`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error("Fetch failed");
  const data = await res.json();
  if (!data.length) return null;
  const row = data[0];
  return { to: row.to_name, from: row.from_name, msg: row.message, img: row.image_data };
}

/* ════════════════════════════════════════════
   CANVAS HOOK
═══════════════════════════════════════════ */
function useDrawing(canvasRef) {
  const state = useRef({
    tool: "pen",
    color: "#1a1118",
    size: 4,
    drawing: false,
    sx: 0, sy: 0,
    snapshots: [],
    penSnap: null,
  });

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
  }, [canvasRef]);

  const save = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const s = state.current;
    s.snapshots.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (s.snapshots.length > 50) s.snapshots.shift();
  }, [canvasRef]);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const s = state.current;
    if (s.snapshots.length > 1) {
      s.snapshots.pop();
      ctx.putImageData(s.snapshots[s.snapshots.length - 1], 0, 0);
    }
  }, [canvasRef]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = G.canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    save();
  }, [canvasRef, save]);

  const addImage = useCallback((file) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = canvas.width * 0.6, maxH = canvas.height * 0.6;
        let w = img.width, h = img.height;
        if (w > maxW) { h *= maxW / w; w = maxW; }
        if (h > maxH) { w *= maxH / h; h = maxH; }
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        save();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [canvasRef, save]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = G.canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    save();
  }, [canvasRef, save]);

  // event handlers
  const onDown = useCallback((e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const s = state.current;
    s.drawing = true;
    const pos = getPos(e);
    s.sx = pos.x; s.sy = pos.y;
    s.penSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (s.tool === "pen" || s.tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(s.sx, s.sy);
    }
  }, [canvasRef, getPos]);

  const onMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const s = state.current;
    if (!s.drawing) return;
    const pos = getPos(e);
    ctx.globalCompositeOperation = "source-over";

    if (s.tool === "pen") {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (s.tool === "eraser") {
      ctx.strokeStyle = G.canvasBg;
      ctx.lineWidth = s.size * 3;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (s.tool === "rect" || s.tool === "circle") {
      ctx.putImageData(s.penSnap, 0, 0);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round";
      if (s.tool === "rect") {
        ctx.beginPath();
        ctx.rect(s.sx, s.sy, pos.x - s.sx, pos.y - s.sy);
        ctx.stroke();
      } else {
        const rx = Math.abs(pos.x - s.sx) / 2, ry = Math.abs(pos.y - s.sy) / 2;
        const cx = s.sx + (pos.x - s.sx) / 2, cy = s.sy + (pos.y - s.sy) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [canvasRef, getPos]);

  const onUp = useCallback(() => {
    const s = state.current;
    if (!s.drawing) return;
    s.drawing = false;
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    save();
  }, [canvasRef, save]);

  const setTool = (t) => { state.current.tool = t; };
  const setColor = (c) => { state.current.color = c; };
  const setSize = (n) => { state.current.size = n; };

  return { initCanvas, undo, clear, addImage, onDown, onMove, onUp, setTool, setColor, setSize, state };
}

/* ════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════ */
export default function DrawMail() {
  useEffect(() => { injectFonts(); }, []);

  // routing: check ?id= param
  const params = new URLSearchParams(window.location.search);
  const viewId = params.get("id");

  if (viewId) return <ViewPage artId={viewId} />;
  return <EditorPage />;
}

/* ════════════════════════════════════════════
   LANDING / EDITOR PAGE
═══════════════════════════════════════════ */
function EditorPage() {
  const [screen, setScreen] = useState("landing"); // landing | editor
  const [tool, setToolState] = useState("pen");
  const [color, setColorState] = useState("#1a1118");
  const [size, setSizeState] = useState(4);
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState(null); // null | { link, id }
  const [saving, setSaving] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const colorRef = useRef(null);
  const drawing = useDrawing(canvasRef);

  useEffect(() => {
    if (screen === "editor" && canvasRef.current) {
      drawing.initCanvas();
    }
  }, [screen]);

  const handleTool = (t) => {
    setToolState(t);
    drawing.setTool(t);
  };
  const handleColor = (c) => {
    setColorState(c);
    drawing.setColor(c);
  };
  const handleSize = (n) => {
    setSizeState(n);
    drawing.setSize(n);
  };

  const handleGenerate = async () => {
    setSaving(true);
    try {
      const canvas = canvasRef.current;
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width; tmp.height = canvas.height;
      tmp.getContext("2d").drawImage(canvas, 0, 0);
      const img = tmp.toDataURL("image/jpeg", 0.7);
      const payload = { to: to || "Someone Special", from: from || "A Secret Admirer", msg, img };
      const id = await saveArt(payload);
      const link = `${window.location.origin}${window.location.pathname}?id=${id}`;
      setModal({ link, id, receiver: to || "Someone Special" });
    } catch (e) {
      alert("Could not save. Please try again.");
    }
    setSaving(false);
  };

  const copyLink = () => {
    const text = modal.link;
    const done = () => { setCopyDone(true); setTimeout(() => setCopyDone(false), 2000); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fallbackCopy);
    } else { fallbackCopy(); }
    function fallbackCopy() {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); done(); } catch(_) {}
      document.body.removeChild(ta);
    }
  };

  /* ── LANDING ── */
  if (screen === "landing") return (
    <div style={{ minHeight:"100vh", background:G.ink, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", textAlign:"center", padding:"40px 20px",
      fontFamily:"'DM Sans', sans-serif", position:"relative", overflow:"hidden" }}>
      {/* decorative rings */}
      {[300,500,700].map((s,i) => (
        <div key={i} style={{ position:"absolute", width:s, height:s, borderRadius:"50%",
          border:`1px solid rgba(201,150,58,${0.12 - i*0.03})`,
          top:"50%", left:"50%", transform:"translate(-50%,-50%)", pointerEvents:"none" }}/>
      ))}
      <p style={{ fontSize:11, letterSpacing:4, textTransform:"uppercase", color:G.gold, marginBottom:20 }}>
        DrawMail
      </p>
      <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:"clamp(42px,9vw,88px)",
        color:G.paper, lineHeight:1.05, maxWidth:680, marginBottom:20 }}>
        Send <em style={{ color:G.rust }}>art,</em><br/>not just words.
      </h1>
      <p style={{ fontSize:16, color:"#9a9090", maxWidth:400, lineHeight:1.7, marginBottom:36 }}>
        Draw something beautiful. Write something meaningful.<br/>Share it with a short, clean link.
      </p>
      <button onClick={() => setScreen("editor")} style={{ padding:"16px 44px", borderRadius:12,
        border:"none", background:G.rust, color:"#fff", fontFamily:"'Playfair Display', serif",
        fontSize:18, fontStyle:"italic", cursor:"pointer", letterSpacing:0.5,
        boxShadow:"0 8px 24px rgba(192,71,43,0.35)", transition:"all 0.2s" }}
        onMouseOver={e => e.target.style.transform="translateY(-2px)"}
        onMouseOut={e => e.target.style.transform="translateY(0)"}>
        Start Drawing →
      </button>
    </div>
  );

  /* ── EDITOR ── */
  const toolBtnStyle = (t) => ({
    width:44, height:44, borderRadius:10, border:"none",
    background: tool === t ? G.rust : "transparent",
    color: tool === t ? "#fff" : "#aaa",
    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:19, transition:"all 0.15s",
  });

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", fontFamily:"'DM Sans', sans-serif" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:68, background:G.ink, display:"flex", flexDirection:"column",
        alignItems:"center", padding:"14px 0", gap:6, flexShrink:0 }}>
        <span style={{ fontFamily:"'Playfair Display', serif", color:G.gold, fontSize:10,
          letterSpacing:2, textTransform:"uppercase", writingMode:"vertical-rl",
          transform:"rotate(180deg)", marginBottom:14, opacity:0.85 }}>DrawMail</span>

        {[["pen","✏️"],["eraser","🧹"]].map(([t,icon]) => (
          <button key={t} title={t} style={toolBtnStyle(t)} onClick={() => handleTool(t)}>{icon}</button>
        ))}

        <div style={{ width:32, height:1, background:"#333", margin:"4px 0" }}/>

        {[["rect","▭"],["circle","○"]].map(([t,icon]) => (
          <button key={t} title={t} style={toolBtnStyle(t)} onClick={() => handleTool(t)}>{icon}</button>
        ))}

        <div style={{ width:32, height:1, background:"#333", margin:"4px 0" }}/>

        {/* Color */}
        <div title="Color" onClick={() => colorRef.current?.click()}
          style={{ width:32, height:32, borderRadius:"50%", background:color,
            border:"3px solid #444", cursor:"pointer", position:"relative" }}>
          <input ref={colorRef} type="color" value={color}
            onChange={e => handleColor(e.target.value)}
            style={{ position:"absolute", opacity:0, width:"100%", height:"100%", cursor:"pointer" }}/>
        </div>

        {/* Size */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"8px 0" }}>
          <span style={{ color:"#666", fontSize:9, letterSpacing:1, textTransform:"uppercase" }}>size</span>
          <input type="range" min={1} max={40} value={size}
            onChange={e => handleSize(Number(e.target.value))}
            style={{ writingMode:"vertical-lr", direction:"rtl", width:6, height:80,
              WebkitAppearance:"slider-vertical", cursor:"pointer" }}/>
        </div>

        <div style={{ marginTop:"auto", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
          <label title="Add Image" style={{ width:44, height:44, borderRadius:10, border:"none",
            background:"transparent", color:"#aaa", cursor:"pointer", display:"flex",
            alignItems:"center", justifyContent:"center", fontSize:19 }}>
            🖼️
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
              onChange={e => { if(e.target.files[0]) drawing.addImage(e.target.files[0]); e.target.value=""; }}/>
          </label>
          <button title="Undo (Ctrl+Z)" style={toolBtnStyle("__undo")} onClick={drawing.undo}>↩️</button>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#e8e2d8", overflow:"hidden" }}>
        {/* toolbar */}
        <div style={{ background:G.cream, borderBottom:`1px solid #d4cec4`, padding:"8px 16px",
          display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, color:G.muted, letterSpacing:1, textTransform:"uppercase" }}>Canvas</span>
          {[["pen","Free Draw"],["rect","Rectangle"],["circle","Circle"]].map(([t,label]) => (
            <button key={t} onClick={() => handleTool(t)} style={{
              padding:"4px 12px", borderRadius:6, border:`1.5px solid ${tool===t ? G.rust:"#c8c0b4"}`,
              background: tool===t ? G.rust : "transparent",
              color: tool===t ? "#fff" : G.ink, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans', sans-serif",
            }}>{label}</button>
          ))}
          <label style={{ padding:"4px 14px", borderRadius:6, border:`1.5px dashed #c8c0b4`,
            background:"transparent", color:G.muted, fontSize:12, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>
            📁 Add Image
            <input type="file" accept="image/*" style={{ display:"none" }}
              onChange={e => { if(e.target.files[0]) drawing.addImage(e.target.files[0]); e.target.value=""; }}/>
          </label>
          <div style={{ flex:1 }}/>
          <button onClick={drawing.clear} style={{ padding:"4px 14px", borderRadius:6,
            border:`1.5px solid #ddd`, background:"transparent", color:G.muted,
            fontSize:12, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>Clear All</button>
        </div>

        {/* canvas */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24, overflow:"hidden" }}>
          <canvas ref={canvasRef} width={700} height={480}
            style={{ background:G.canvasBg, boxShadow:"0 8px 40px rgba(0,0,0,0.18)", borderRadius:2,
              cursor: tool==="eraser"?"cell":"crosshair", maxWidth:"100%", maxHeight:"100%", display:"block" }}
            onMouseDown={drawing.onDown}
            onMouseMove={drawing.onMove}
            onMouseUp={drawing.onUp}
            onMouseLeave={drawing.onUp}
            onTouchStart={e => { e.preventDefault(); drawing.onDown(e); }}
            onTouchMove={e => { e.preventDefault(); drawing.onMove(e); }}
            onTouchEnd={drawing.onUp}
          />
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ width:272, background:G.cream, borderLeft:`1px solid #d4cec4`,
        display:"flex", flexDirection:"column", padding:"24px 20px", gap:14,
        overflowY:"auto", flexShrink:0 }}>
        <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:20, fontStyle:"italic",
          borderBottom:`1px solid #d4cec4`, paddingBottom:12 }}>Your Message</h2>

        {[
          ["To", to, setTo, "Receiver's name…"],
          ["From", from, setFrom, "Your name…"],
        ].map(([label, val, setter, ph]) => (
          <div key={label}>
            <span style={{ fontSize:11, letterSpacing:1.5, textTransform:"uppercase", color:G.muted,
              marginBottom:6, display:"block" }}>{label}</span>
            <input value={val} onChange={e => setter(e.target.value)} placeholder={ph}
              style={{ width:"100%", padding:"10px 12px", border:`1.5px solid #d4cec4`,
                borderRadius:8, background:G.paper, color:G.ink, fontFamily:"'DM Sans', sans-serif",
                fontSize:14, outline:"none", boxSizing:"border-box" }}
              onFocus={e => e.target.style.borderColor=G.rust}
              onBlur={e => e.target.style.borderColor="#d4cec4"}/>
          </div>
        ))}

        <div>
          <span style={{ fontSize:11, letterSpacing:1.5, textTransform:"uppercase", color:G.muted,
            marginBottom:6, display:"block" }}>Message</span>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Write something heartfelt…"
            style={{ width:"100%", padding:"10px 12px", border:`1.5px solid #d4cec4`,
              borderRadius:8, background:G.paper, color:G.ink, fontFamily:"'DM Sans', sans-serif",
              fontSize:14, outline:"none", resize:"vertical", minHeight:90,
              lineHeight:1.5, boxSizing:"border-box" }}
            onFocus={e => e.target.style.borderColor=G.rust}
            onBlur={e => e.target.style.borderColor="#d4cec4"}/>
        </div>

        <button onClick={handleGenerate} disabled={saving}
          style={{ width:"100%", padding:14, borderRadius:10, border:"none",
            background: saving ? G.muted : G.rust, color:"#fff",
            fontFamily:"'Playfair Display', serif", fontSize:16, fontStyle:"italic",
            cursor: saving ? "wait" : "pointer", letterSpacing:0.5, marginTop:4,
            transition:"all 0.2s" }}>
          {saving ? "Saving…" : "Generate Share Link ✦"}
        </button>

        <p style={{ fontSize:11, color:G.muted, lineHeight:1.6, textAlign:"center" }}>
          Your drawing is stored securely and the recipient gets a short, clean link.
        </p>
      </div>

      {/* ── Share Modal ── */}
      {modal && (
        <div onClick={e => { if(e.target===e.currentTarget) setModal(null); }}
          style={{ position:"fixed", inset:0, background:"rgba(26,17,24,0.75)",
            backdropFilter:"blur(4px)", display:"flex", alignItems:"center",
            justifyContent:"center", zIndex:100 }}>
          <div style={{ background:G.paper, borderRadius:16, padding:32, maxWidth:440,
            width:"90%", boxShadow:"0 24px 80px rgba(0,0,0,0.35)", position:"relative",
            fontFamily:"'DM Sans', sans-serif" }}>
            <button onClick={() => setModal(null)} style={{ position:"absolute", top:16, right:16,
              background:"none", border:"none", fontSize:22, cursor:"pointer", color:G.muted }}>×</button>
            <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:24, marginBottom:8 }}>
              Your link is ready ✦
            </h2>
            <p style={{ color:G.muted, fontSize:13, marginBottom:20, lineHeight:1.6 }}>
              Share this with <strong>{modal.receiver}</strong>. When they open it, they'll see your drawing and message.
            </p>

            {/* Link box */}
            <div style={{ display:"flex", gap:8, alignItems:"center", background:G.cream,
              border:`1.5px solid #d4cec4`, borderRadius:10, padding:"10px 12px", marginBottom:16 }}>
              <span style={{ flex:1, fontSize:13, color:G.ink, fontFamily:"monospace",
                wordBreak:"break-all" }}>{modal.link}</span>
              <button onClick={copyLink} style={{ padding:"8px 16px", borderRadius:6, border:"none",
                background: copyDone ? G.sage : G.ink, color:"#fff", fontSize:12,
                cursor:"pointer", whiteSpace:"nowrap", fontFamily:"'DM Sans', sans-serif",
                transition:"background 0.2s" }}>
                {copyDone ? "Copied!" : "Copy"}
              </button>
            </div>
            <p style={{ fontSize:11, color:G.muted, textAlign:"center" }}>
              Short link — no login, no app required for the recipient.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   VIEW PAGE
═══════════════════════════════════════════ */
function ViewPage({ artId }) {
  const [art, setArt] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    injectFonts();
    loadArt(artId).then(d => {
      if (d) setArt(d);
      else setErr(true);
    }).catch(() => setErr(true));
  }, [artId]);

  const goCreate = () => {
    const url = window.location.origin + window.location.pathname;
    window.location.href = url;
  };

  if (err) return (
    <div style={{ minHeight:"100vh", background:G.ink, display:"flex",
      alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16,
      fontFamily:"'Playfair Display', serif", color:G.paper }}>
      <span style={{ fontSize:48 }}>🎨</span>
      <p style={{ fontSize:22, fontStyle:"italic" }}>This artwork couldn't be found.</p>
      <button onClick={goCreate} style={{ padding:"10px 28px", borderRadius:8, border:`1.5px solid ${G.rust}`,
        background:"transparent", color:G.rust, fontSize:14, cursor:"pointer",
        fontFamily:"'DM Sans', sans-serif" }}>Create your own</button>
    </div>
  );

  if (!art) return (
    <div style={{ minHeight:"100vh", background:G.ink, display:"flex",
      alignItems:"center", justifyContent:"center", fontFamily:"'Playfair Display', serif",
      color:G.muted, fontSize:18, fontStyle:"italic" }}>
      Loading your artwork…
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:G.ink, display:"flex",
      alignItems:"center", justifyContent:"center", padding:"40px 20px",
      fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ background:G.paper, borderRadius:4, maxWidth:680, width:"100%",
        boxShadow:"0 20px 80px rgba(0,0,0,0.5)", overflow:"hidden" }}>

        {/* header */}
        <div style={{ padding:"28px 32px 16px", borderBottom:`1px solid #e2dbd0`,
          display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <p style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:G.muted }}>
              A drawing for
            </p>
            <h2 style={{ fontFamily:"'Playfair Display', serif", fontSize:28, marginTop:2 }}>
              {art.to}
            </h2>
            <p style={{ fontSize:12, color:G.muted, marginTop:4 }}>
              from <strong>{art.from}</strong>
            </p>
          </div>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:10, color:G.rust,
            border:`2px solid ${G.rust}`, padding:"6px 10px", letterSpacing:1.5,
            textTransform:"uppercase", opacity:0.7, transform:"rotate(3deg)", marginTop:4 }}>
            DrawMail
          </div>
        </div>

        {/* drawing */}
        <div style={{ padding:"20px 32px", background:"#f0ece3",
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <img src={art.img} alt="Drawing" style={{ maxWidth:"100%", borderRadius:2,
            boxShadow:"0 2px 16px rgba(0,0,0,0.12)", display:"block" }}/>
        </div>

        {/* message */}
        {art.msg && (
          <div style={{ padding:"24px 32px" }}>
            <p style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase",
              color:G.muted, marginBottom:10 }}>A message</p>
            <p style={{ fontFamily:"'Playfair Display', serif", fontSize:18, fontStyle:"italic",
              lineHeight:1.7, color:G.ink, whiteSpace:"pre-wrap" }}>{art.msg}</p>
          </div>
        )}

        {/* footer */}
        <div style={{ padding:"16px 32px", background:G.cream, borderTop:`1px solid #e2dbd0`,
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:13,
            fontStyle:"italic", color:G.muted }}>DrawMail — Send art, not just words.</span>
          <button onClick={goCreate} style={{ padding:"8px 20px", borderRadius:8,
            border:`1.5px solid ${G.rust}`, background:"transparent", color:G.rust,
            fontSize:13, cursor:"pointer", fontFamily:"'DM Sans', sans-serif",
            transition:"all 0.15s" }}
            onMouseOver={e => { e.target.style.background=G.rust; e.target.style.color="#fff"; }}
            onMouseOut={e => { e.target.style.background="transparent"; e.target.style.color=G.rust; }}>
            Reply with Art →
          </button>
        </div>
      </div>
    </div>
  );
}
