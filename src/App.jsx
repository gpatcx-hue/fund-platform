import { useState, useEffect, useCallback } from "react";
import BondApp from "./BondApp";
import QuantApp from "./QuantApp";

const T = { navy:"#1a3264",navyDeep:"#0f2048",navyLight:"#2e56a0",navyPale:"#e8edf6",gold:"#d5a12a",goldPale:"#fdf6e8",goldLine:"rgba(213,161,42,0.35)",goldSoft:"rgba(213,161,42,0.08)",bg:"#f6f7fb",bgCard:"#ffffff",text1:"#141e38",text2:"#5a6480",text3:"#8d95aa",textInv:"#f6f7fb",line:"#dfe2ec",lineLight:"#eceef5",disp:"'Bricolage Grotesque',system-ui,sans-serif",body:"system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",mono:"ui-monospace,'SF Mono',Menlo,monospace" };

// ============================================================
// 登录
// ============================================================
let AUTH_OK = false;

async function doLogin(username, password) {
  const resp = await fetch("/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await resp.json();
  if (data.ok) AUTH_OK = true;
  return data;
}

async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  AUTH_OK = false;
}

async function checkAuth() {
  try {
    const resp = await fetch("/bond_data.json?t=" + Date.now(), { method: "HEAD" });
    if (resp.status === 401) return false;
    AUTH_OK = true;
    return true;
  } catch { return false; }
}

const Login = ({ onSuccess }) => {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [msg, setMsg] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!u.trim() || !p) return;
    setLoading(true); setMsg("");
    try {
      const res = await doLogin(u.trim(), p);
      if (res.ok) onSuccess();
      else setMsg(res.msg || "登录失败");
    } catch { setMsg("网络错误"); }
    setLoading(false);
  };
  return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:T.body}}>
      <div style={{width:360,padding:40,background:T.bgCard,borderRadius:16,border:`1px solid ${T.line}`,boxShadow:"0 8px 32px rgba(26,50,100,0.08)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"inline-flex",gap:6,marginBottom:12}}><div style={{width:7,height:7,borderRadius:"50%",background:T.gold}}/><div style={{width:7,height:7,borderRadius:"50%",background:T.gold,opacity:.5}}/></div>
          <div style={{fontFamily:T.disp,fontSize:22,fontWeight:800,color:T.navy}}>中欧基金竞品分析</div>
          <div style={{fontSize:12,color:T.text3,marginTop:6}}>请登录后查看</div>
        </div>
        <input value={u} onChange={e=>setU(e.target.value)} placeholder="账号" onKeyDown={e=>e.key==="Enter"&&submit()} style={{width:"100%",padding:"10px 14px",fontSize:14,border:`1px solid ${T.line}`,borderRadius:8,marginBottom:12,outline:"none",boxSizing:"border-box",fontFamily:T.body}}/>
        <input value={p} onChange={e=>setP(e.target.value)} type="password" placeholder="密码" onKeyDown={e=>e.key==="Enter"&&submit()} style={{width:"100%",padding:"10px 14px",fontSize:14,border:`1px solid ${T.line}`,borderRadius:8,marginBottom:16,outline:"none",boxSizing:"border-box",fontFamily:T.body}}/>
        {msg && <div style={{fontSize:12,color:"#c93535",marginBottom:12,textAlign:"center"}}>{msg}</div>}
        <button onClick={submit} disabled={loading} style={{width:"100%",padding:"11px 0",fontSize:14,fontWeight:600,color:T.textInv,background:T.navy,border:"none",borderRadius:8,cursor:loading?"wait":"pointer",fontFamily:T.body,opacity:loading?.7:1}}>{loading?"登录中...":"登 录"}</button>
      </div>
    </div>
  );
};

// ============================================================
// 门户首页
// ============================================================
const Portal = ({ onSelect, onLogout }) => {
  const [entered, setEntered] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setEntered(true)); }, []);
  const isMob = typeof window !== "undefined" && window.innerWidth < 768;
  const padX = isMob ? 16 : 48;

  const modules = [
    { id: "bond",  title: "固收竞品分析", sub: "FundScope", desc: "10个赛道 · 875只基金 · 收益/回撤/夏普", icon: "📊", color: T.navy, accent: T.gold },
    { id: "quant", title: "量化竞品分析", sub: "QuantScope", desc: "9个赛道 · 411只基金 · 超额收益导向", icon: "🧠", color: T.navyDeep, accent: T.navyLight },
  ];

  const fade = (delay) => ({ opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(18px)", transition: `opacity .7s cubic-bezier(.22,1,.36,1) ${delay}s, transform .7s cubic-bezier(.22,1,.36,1) ${delay}s` });

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",fontFamily:T.body}}>
      <div style={{position:"fixed",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.navy},${T.gold} 50%,${T.navy})`,zIndex:100}}/>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:`0 ${padX}px`,height:56,paddingTop:3}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{display:"inline-flex",gap:6}}><span style={{width:7,height:7,borderRadius:"50%",background:T.gold}}/><span style={{width:7,height:7,borderRadius:"50%",background:T.gold,opacity:.55}}/></span>
          <span style={{fontFamily:T.disp,fontSize:17,fontWeight:700,color:T.navy}}>中欧基金</span>
        </div>
        <button onClick={onLogout} style={{fontSize:12,color:T.text3,background:"none",border:`1px solid ${T.line}`,borderRadius:6,padding:"5px 14px",cursor:"pointer",fontFamily:T.body}}>退出登录</button>
      </div>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:`0 ${padX}px`,paddingBottom:80}}>
        <div style={{textAlign:"center",marginBottom:isMob?32:48,...fade(.05)}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:10,marginBottom:18}}>
            {!isMob && <div style={{width:32,height:1,background:T.goldLine}}/>}
            <span style={{fontSize:10,fontWeight:700,letterSpacing:".3em",color:T.gold}}>ZHONG OU FUND · COMPETITIVE ANALYSIS</span>
            {!isMob && <div style={{width:32,height:1,background:T.goldLine}}/>}
          </div>
          <h1 style={{fontFamily:T.disp,fontSize:isMob?32:52,fontWeight:800,color:T.navy,margin:0,letterSpacing:"-.03em",lineHeight:1.1}}>竞品分析平台</h1>
          <p style={{fontSize:isMob?12:14,color:T.text2,marginTop:14,letterSpacing:".08em"}}>智能洞察 · 精准定位 · 数据驱动</p>
        </div>

        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(2,1fr)",gap:isMob?16:28,width:"100%",maxWidth:820,...fade(.15)}}>
          {modules.map((m, i) => (
            <div key={m.id} onClick={() => onSelect(m.id)}
              style={{padding:isMob?28:40,background:T.bgCard,borderRadius:18,border:`1px solid ${T.goldLine}`,cursor:"pointer",transition:"all .35s cubic-bezier(.22,1,.36,1)",position:"relative",overflow:"hidden",boxShadow:`0 2px 24px ${T.goldSoft}`,...fade(.2 + i * .1)}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-6px)";e.currentTarget.style.boxShadow="0 16px 48px rgba(26,50,100,0.1)"}}
              onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=`0 2px 24px ${T.goldSoft}`}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${m.accent},${T.gold} 80%,transparent)`}}/>
              <div style={{fontSize:40,marginBottom:16}}>{m.icon}</div>
              <div style={{fontFamily:T.disp,fontSize:isMob?22:26,fontWeight:800,color:m.color,marginBottom:6}}>{m.title}</div>
              <div style={{fontSize:12,fontWeight:600,color:T.gold,fontFamily:T.mono,marginBottom:14,letterSpacing:".05em"}}>{m.sub}</div>
              <div style={{fontSize:13,color:T.text2,lineHeight:1.6,marginBottom:20}}>{m.desc}</div>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 20px",background:m.color,color:T.textInv,borderRadius:8,fontSize:13,fontWeight:600}}>
                进入平台 <span style={{fontSize:16}}>→</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{textAlign:"center",padding:"20px 0 32px",fontSize:11,color:T.text3,letterSpacing:".05em"}}>中欧基金 · 内部使用</div>
    </div>
  );
};

// ============================================================
// 主应用
// ============================================================
export default function App() {
  const [module, setModule] = useState(null);  // null=portal, "bond", "quant"
  const [needLogin, setNeedLogin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth().then(ok => { if (!ok) setNeedLogin(true); setChecking(false); });
  }, []);

  const handleLoginSuccess = useCallback(() => { setNeedLogin(false); }, []);

  const handleLogout = useCallback(async () => {
    await doLogout();
    setModule(null);
    setNeedLogin(true);
  }, []);

  if (checking) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:T.bg,fontFamily:T.body}}>
      <div style={{textAlign:"center"}}>
        <div style={{display:"inline-flex",gap:6,marginBottom:16}}><div style={{width:7,height:7,borderRadius:"50%",background:T.gold,animation:"pulse 1s infinite"}}/><div style={{width:7,height:7,borderRadius:"50%",background:T.gold,opacity:.5,animation:"pulse 1s .2s infinite"}}/></div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      </div>
    </div>
  );

  if (needLogin) return <Login onSuccess={handleLoginSuccess}/>;

  if (module === "bond")  return <BondApp onBack={() => setModule(null)} onLogout={handleLogout}/>;
  if (module === "quant") return <QuantApp onBack={() => setModule(null)} onLogout={handleLogout}/>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.line};border-radius:3px}
        ::selection{background:${T.navyPale}}
      `}</style>
      <Portal onSelect={setModule} onLogout={handleLogout}/>
    </>
  );
}
