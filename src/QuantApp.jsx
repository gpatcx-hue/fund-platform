import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { ComposedChart, LineChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ============================================================
// TOKENS
// ============================================================
const T = { navy:"#1a3264",navyDeep:"#0f2048",navyLight:"#2e56a0",navyPale:"#e8edf6",gold:"#d5a12a",goldDeep:"#b8891e",goldPale:"#fdf6e8",goldLine:"rgba(213,161,42,0.35)",goldSoft:"rgba(213,161,42,0.08)",bg:"#f6f7fb",bgCard:"#ffffff",bgHover:"#f0f2f8",bgMuted:"#eceef5",text1:"#141e38",text2:"#5a6480",text3:"#8d95aa",textInv:"#f6f7fb",pos:"#c93535",posBg:"#fdf0f0",neg:"#0d8a5e",negBg:"#edf8f3",line:"#dfe2ec",lineLight:"#eceef5",disp:"'Bricolage Grotesque',system-ui,sans-serif",body:"system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",mono:"ui-monospace,'SF Mono',Menlo,monospace",num:"system-ui,-apple-system,'PingFang SC','Helvetica Neue',sans-serif" };
const CCOL = [T.navy, T.gold, "#e07028", T.pos];  // 基金/基准/超额/竞品

// ============================================================
// DATA — 从 data.json 加载
// ============================================================
let CATS = [], MF = {}, OWN_CFG = {}, TOP3 = null, MANAGERS = {}, BENCHMARKS = {};
let DATA_LOADED = false, DATA_DATE = '';

// 9 个赛道（按风险递增排序）
const HOME_CATS = [
  { id: "hs300",      name: "沪深300"  },
  { id: "a500",       name: "中证A500"  },
  { id: "csi800",     name: "中证800"  },
  { id: "biased_mix", name: "偏股混合"  },
  { id: "csi500",     name: "中证500"  },
  { id: "csi1000",    name: "中证1000" },
  { id: "gz2000",     name: "国证2000" },
  { id: "kechuang",   name: "科创综指"  },
  { id: "dividend",   name: "红利"      },
];
const CAT_ORDER = HOME_CATS.map(c => c.id);

// 7 个时间窗口（统一定义）
const TIME_WINDOWS = [
  { k: "r1m",  l: "近1月"   },
  { k: "r3m",  l: "近3月"   },
  { k: "rytd", l: "今年以来" },
  { k: "r1y",  l: "近1年"   },
  { k: "r3y",  l: "近3年"   },
  { k: "2025", l: "2025年"  },
  { k: "2024", l: "2024年"  },
];

const isOwn = (cat, code) => (OWN_CFG[cat] || []).includes(code);

async function loadData() {
  if (DATA_LOADED) return 'ok';
  const resp = await fetch("/quant_data.json?t=" + Date.now());
  if (resp.status === 401) return 'need_login';
  if (!resp.ok) throw new Error("数据加载失败 (data.json)");
  const data = await resp.json();
  CATS = data.categories || [];
  MF = data.funds || {};
  OWN_CFG = data.ownConfig || {};
  TOP3 = data.top3 || null;
  MANAGERS = data.managers || {};
  BENCHMARKS = data.benchmarks || {};
  DATA_DATE = data.updatedAt || '';
  CATS.sort((a, b) => CAT_ORDER.indexOf(a.id) - CAT_ORDER.indexOf(b.id));

  // 超额为空时用绝对收益填充（基准数据缺失时的降级方案）
  for (const funds of Object.values(MF)) {
    for (const f of funds) {
      if (f.abs) {
        if (!f.exc) f.exc = {};
        for (const [k, v] of Object.entries(f.abs)) {
          if (f.exc[k] == null && v != null) f.exc[k] = v;
        }
      }
    }
  }

  DATA_LOADED = true;
}

// ============================================================
// CONTEXT + HOOKS
// ============================================================
const Ctx = createContext({ pg: "home", pr: {}, go: () => {} });
const useR = () => useContext(Ctx);

const useScreen = () => {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return w < 768 ? "mobile" : w < 1080 ? "tablet" : "desktop";
};

const useFresh = () => {
  const [ago, setAgo] = useState(0); const [pulse, setPulse] = useState(false);
  useEffect(() => { const t = setInterval(() => setAgo(a => a + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (ago > 0 && ago % 60 === 0) { setPulse(true); setTimeout(() => setPulse(false), 1500); } }, [ago]);
  const label = ago < 5 ? "刚刚" : ago < 60 ? `${ago}秒前` : ago < 3600 ? `${Math.floor(ago / 60)}分钟前` : `${Math.floor(ago / 3600)}小时前`;
  return { label, pulse, refresh: () => { setAgo(0); setPulse(true); setTimeout(() => setPulse(false), 1500); } };
};

// ============================================================
// HELPERS
// ============================================================
const pct = v => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const nvs = v => v == null ? "—" : v.toFixed(4);
const szs = v => v == null ? "—" : v >= 100 ? `${(v/100).toFixed(1)}百亿` : `${v.toFixed(1)}亿`;
const Ret = ({ v, sz = 13, bold = true }) => v == null ? <span style={{color:T.text3,fontSize:sz}}>—</span> : <span style={{color:v>=0?T.pos:T.neg,fontFamily:T.mono,fontSize:sz,fontWeight:bold?600:400}}>{pct(v)}</span>;
const Rank = ({ rk, sz = 12 }) => !rk || !rk[1] ? <span style={{color:T.text3,fontSize:sz}}>—</span> : <span style={{color:T.text2,fontFamily:T.mono,fontSize:sz}}>{rk[0]}/{rk[1]}</span>;
const Spark = ({ data, w = 72, h = 24, color }) => {
  if (!data || data.length < 2) return null;
  const vals = data.map(p => Array.isArray(p) ? p[1] : p);
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i/(vals.length-1))*w},${h-((v-mn)/rg)*(h-4)-2}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke={color || (vals[vals.length-1] >= vals[0] ? T.pos : T.neg)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>;
};
const Dots = ({ color = T.gold, gap = 6, size = 5 }) => <span style={{display:"inline-flex",gap,alignItems:"center"}}><span style={{width:size,height:size,borderRadius:"50%",background:color}}/><span style={{width:size,height:size,borderRadius:"50%",background:color,opacity:.55}}/></span>;
const Stat = ({ label, value, color = T.text1 }) => <div style={{display:"flex",alignItems:"baseline",gap:6}}><span style={{fontSize:11,color:T.text3}}>{label}</span><span style={{fontSize:15,fontWeight:700,fontFamily:T.num,color}}>{value}</span></div>;
const fadeUp = (on, delay = 0, dist = 18) => ({opacity:on?1:0,transform:on?"none":`translateY(${dist}px)`,transition:`opacity .7s cubic-bezier(.22,1,.36,1) ${delay}s, transform .7s cubic-bezier(.22,1,.36,1) ${delay}s`});
const BenchTag = ({ name, kind, mini = false }) => <span title={kind === "total_return" ? "全收益指数" : "价格指数"} style={{display:"inline-flex",alignItems:"center",gap:3,padding:mini?"1px 5px":"2px 8px",fontSize:mini?9:10,fontWeight:600,color:T.navy,background:T.navyPale,border:`1px solid ${T.navyLight}33`,borderRadius:4,whiteSpace:"nowrap"}}><span style={{width:4,height:4,borderRadius:"50%",background:kind === "total_return" ? T.gold : T.text3}}/>{name}</span>;

const TimelineDot = ({ date, content }) => <div style={{display:"flex",gap:14,position:"relative",paddingLeft:24,paddingBottom:18}}><span style={{position:"absolute",left:0,top:5,width:10,height:10,borderRadius:"50%",background:T.gold,boxShadow:`0 0 0 3px ${T.goldPale}`}}/><span style={{position:"absolute",left:4,top:18,bottom:0,width:1,background:T.lineLight}}/><div><div style={{fontSize:11,fontWeight:700,fontFamily:T.mono,color:T.navy,marginBottom:3}}>{date}</div><div style={{fontSize:12,color:T.text2,lineHeight:1.5}}>{content}</div></div></div>;

// ============================================================
// INNER HEADER
// ============================================================
const InnerHeader = ({ crumbs }) => {
  const { go } = useR(); const fresh = useFresh(); const scr = useScreen(); const isMob = scr === "mobile";
  const backCrumb = isMob ? [...crumbs].reverse().find(c => c.onClick && !c.active) : null;
  const activeCrumb = isMob ? (crumbs.find(c => c.active) || crumbs[crumbs.length - 1]) : null;
  return (
    <div style={{position:"sticky",top:0,zIndex:50,background:`${T.bg}ee`,backdropFilter:"blur(12px)",borderBottom:`1px solid ${T.line}`}}>
      <div className="rw" style={{display:"flex",alignItems:"center",gap:isMob?8:12,height:56,padding:`0 ${isMob?12:24}px`}}>
        <div style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",flexShrink:0,padding:"6px 4px",margin:"-6px -4px"}} onClick={() => go("home")} title="返回首页">
          <Dots size={6} gap={4}/>
          <span style={{fontFamily:T.disp,fontSize:isMob?13:15,fontWeight:700,color:T.navy,letterSpacing:"-.005em"}}>QuantScope</span>
        </div>
        {isMob ? (
          <div style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:0}}>
            {backCrumb && <span onClick={backCrumb.onClick} style={{color:T.text2,cursor:"pointer",fontSize:18,lineHeight:1,flexShrink:0,padding:"8px",margin:"-8px 0",fontWeight:500}}>‹</span>}
            {activeCrumb && <span style={{color:T.navy,fontWeight:600,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{activeCrumb.label}</span>}
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"center",flex:1,minWidth:0,fontSize:13,overflow:"hidden"}}>
            {crumbs.filter(c => c && c.label).map((cr, i, arr) => (
              <span key={i} style={{display:"inline-flex",alignItems:"center",minWidth:0,flexShrink:i === arr.length - 1 ? 1 : 0}}>
                {i > 0 && <span style={{color:T.text3,margin:"0 8px",flexShrink:0}}>/</span>}
                <span onClick={cr.onClick} style={{color:cr.active?T.navy:T.text3,fontWeight:cr.active?600:400,cursor:cr.onClick?"pointer":"default",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:i === arr.length - 1 ? 360 : 200}}>{cr.label}</span>
              </span>
            ))}
          </div>
        )}
        <div title={fresh.label} style={{display:"flex",alignItems:"center",gap:isMob?0:6,padding:isMob?"6px":"4px 12px",background:fresh.pulse?T.posBg:T.bgMuted,borderRadius:6,transition:"background .3s",cursor:"pointer",flexShrink:0}} onClick={fresh.refresh}>
          <div style={{width:6,height:6,borderRadius:3,background:fresh.pulse?T.pos:T.text3,transition:"background .3s"}}/>
          {!isMob && <span style={{fontSize:11,color:fresh.pulse?T.pos:T.text3,fontFamily:T.mono,transition:"color .3s"}}>{fresh.pulse?"已更新":fresh.label}</span>}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// TEAM SECTION (首页底部 — 来自 PPT 内容)
// ============================================================
const LEADERS = [
  { name: "曲径",   title: "投资总监",          bio: "复旦数学&CMU计算金融，曾任职于美国千禧年基金，擅长另类数据和基本面因子" },
  { name: "杨柳",   title: "系统化投资组组长",  bio: "清华计算机系，曾就职于高盛、英国百亿对冲基金Capula，擅长机器学习算法的金融应用" },
  { name: "宋婷",   title: "因子研究负责人",    bio: "曾任千象资产投资经理，3年业绩均列同业前20%，擅长因子研究和中低频选股策略" },
];

const TeamSection = ({ entered }) => {
  const scr = useScreen(); const isMob = scr === "mobile";
  return (
    <div style={{...fadeUp(entered, .5)}}>
      <div style={{display:"flex",alignItems:"center",gap:12,margin:`${isMob?32:48}px 0 ${isMob?16:24}px`}}>
        <div style={{height:1,flex:1,background:T.line}}/><Dots size={4} gap={4}/><span style={{fontSize:11,fontWeight:600,letterSpacing:".12em",color:T.text3,whiteSpace:"nowrap"}}>团队实力 · 量化投研基石</span><Dots size={4} gap={4}/><div style={{height:1,flex:1,background:T.line}}/>
      </div>
      {/* 领军人物 */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:isMob?14:18,marginBottom:24}}>
        {LEADERS.map((p, i) => (
          <div key={p.name} style={{padding:isMob?18:22,background:T.bgCard,borderRadius:12,border:`1px solid ${T.line}`,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${T.gold},${T.navyLight} 80%,transparent)`}}/>
            <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:8}}>
              <span style={{fontFamily:T.disp,fontSize:20,fontWeight:800,color:T.navy}}>{p.name}</span>
              <span style={{fontSize:11,color:T.gold,fontWeight:600}}>{p.title}</span>
            </div>
            <div style={{fontSize:12,color:T.text2,lineHeight:1.7}}>{p.bio}</div>
          </div>
        ))}
      </div>
      {/* 三大基石 */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:isMob?12:14,marginBottom:18}}>
        {[
          { t: "海量因子库",  d: "20,000+ 因子储备，基本面+量价+另类+深度学习特征" },
          { t: "先进算力",    d: "本地高性能算力 + GPU Farm，支持端到端深度学习训练" },
          { t: "Rust-Oxen 框架", d: "替代传统 Python，回测速度提升 1000 倍" },
        ].map(b => (
          <div key={b.t} style={{padding:"14px 16px",background:T.navyPale,borderRadius:8,border:`1px solid ${T.navy}11`}}>
            <div style={{fontSize:13,fontWeight:700,color:T.navy,marginBottom:5}}>{b.t}</div>
            <div style={{fontSize:11,color:T.text2,lineHeight:1.6}}>{b.d}</div>
          </div>
        ))}
      </div>
      {/* 三元低相关策略 + 学术支持 */}
      <div style={{padding:"18px 22px",background:T.bgCard,borderRadius:10,border:`1px solid ${T.goldLine}`,fontSize:12,color:T.text2,lineHeight:1.8}}>
        <span style={{fontWeight:700,color:T.navy,marginRight:8}}>🎯 三元低相关策略</span>
        基本面因子 + 量价因子 + 深度学习端到端，三者相关性低，提供独立的 Alpha 来源，追求长期稳定的超额收益。
        <span style={{display:"block",marginTop:6,fontSize:11,color:T.text3}}>学术支持：上海交大智算学院 · 模型优化提速数十倍</span>
      </div>
    </div>
  );
};

// ============================================================
// HOMEPAGE
// ============================================================
const Home = () => {
  const { go, onBack, onLogout } = useR(); const [entered, setEntered] = useState(false);
  const scr = useScreen(); const isMob = scr === "mobile"; const isTab = scr === "tablet";
  useEffect(() => { requestAnimationFrame(() => setEntered(true)); }, []);

  // Top 3（来自 data.json）
  const top3List = useMemo(() => {
    if (!TOP3 || !TOP3.selected) return [];
    return TOP3.selected.map(t => {
      const f = (MF[t.cat_id] || []).find(x => x.c === t.c);
      return f ? { ...f, ...t } : null;
    }).filter(Boolean);
  }, [entered]);

  // 其他自家产品（去掉 top3 中的）
  const otherOwnFunds = useMemo(() => {
    const top3Codes = new Set(top3List.map(f => f.c));
    return CATS.flatMap(c =>
      (OWN_CFG[c.id] || []).map(code => {
        if (top3Codes.has(code)) return null;
        const f = (MF[c.id] || []).find(x => x.c === code);
        return f ? { ...f, catId: c.id, catName: c.name } : null;
      }).filter(Boolean)
    );
  }, [entered]);

  const padX = isMob ? 16 : isTab ? 28 : 48;

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{position:"fixed",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.navy},${T.gold} 50%,${T.navy})`,zIndex:100}}/>

      {/* Logo + 日期 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:`0 ${padX}px`,height:56,paddingTop:3,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {onBack&&<span onClick={onBack} style={{fontSize:14,color:T.text3,cursor:"pointer",padding:"4px 8px",borderRadius:6,border:`1px solid ${T.line}`}}>← 返回</span>}
          <Dots size={7} gap={4}/><span style={{fontFamily:T.disp,fontSize:17,fontWeight:700,color:T.navy,letterSpacing:"-.005em"}}>QuantScope</span></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,color:T.text3,fontFamily:T.mono}}>{DATA_DATE ? DATA_DATE.slice(0,10).replace(/-/g,'.') : '--'}</span>
          {onLogout&&<button onClick={onLogout} style={{fontSize:11,color:T.text3,background:"none",border:`1px solid ${T.line}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:T.body}}>退出</button>}
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",padding:`0 ${padX}px`,paddingBottom:48,maxWidth:1440,margin:"0 auto",width:"100%"}}>
        {/* 标题 */}
        <div style={{textAlign:"center",padding:`${isMob?"28px":isTab?"40px":"56px"} 0 ${isMob?"20px":"32px"}`,...fadeUp(entered, .05)}}>
          {!isMob && <div style={{display:"inline-flex",alignItems:"center",gap:10,marginBottom:18}}><div style={{width:isTab?24:32,height:1,background:`linear-gradient(90deg,transparent,${T.goldLine})`}}/><span style={{fontSize:10,fontWeight:700,letterSpacing:".3em",color:T.gold,whiteSpace:"nowrap"}}>QUANT FUND COMPETITIVE ANALYSIS</span><div style={{width:isTab?24:32,height:1,background:`linear-gradient(90deg,${T.goldLine},transparent)`}}/></div>}
          <h1 style={{fontFamily:T.disp,fontSize:isMob?32:isTab?44:"clamp(44px,5.5vw,58px)",fontWeight:800,color:T.navy,margin:0,letterSpacing:"-.03em",lineHeight:1.1}}>中欧量化竞品分析</h1>
          <p style={{fontSize:isMob?12:14,color:T.text2,marginTop:isMob?8:14,letterSpacing:".08em"}}>超额能力 · 同类对比 · 数据驱动</p>
        </div>

        {/* 9 个赛道按钮 */}
        <div style={{position:"relative",margin:`0 -${padX}px`,padding:`0 ${padX}px`,overflowX:"auto",overflowY:"hidden",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",...fadeUp(entered, .12)}}>
          <style>{`.cats-scroll::-webkit-scrollbar{display:none}`}</style>
          <div className="cats-scroll" style={{display:"flex",gap:8,paddingBottom:4,justifyContent:isMob||isTab?"flex-start":"center",minWidth:"max-content"}}>
            {HOME_CATS.map(cat => (
              <button key={cat.id} onClick={() => go("list", { cat: cat.id })} style={{padding:"10px 18px",fontSize:13,fontWeight:500,fontFamily:T.body,color:T.text2,background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:8,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap",minHeight:40,flexShrink:0}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.navy;e.currentTarget.style.color=T.navy;e.currentTarget.style.background=T.navyPale}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.line;e.currentTarget.style.color=T.text2;e.currentTarget.style.background=T.bgCard}}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Top 3 分隔线 */}
        <div style={{display:"flex",alignItems:"center",gap:12,margin:`${isMob?24:36}px 0 ${isMob?16:24}px`,...fadeUp(entered, .2)}}>
          <div style={{height:1,flex:1,background:T.line}}/><Dots size={4} gap={4}/>
          <span style={{fontSize:11,fontWeight:600,letterSpacing:".12em",color:T.text3,whiteSpace:"nowrap"}}>今日推荐 · {TOP3?.criterion || '加载中'}</span>
          <Dots size={4} gap={4}/><div style={{height:1,flex:1,background:T.line}}/>
        </div>
        {TOP3?.reason && <div style={{fontSize:12,color:T.text3,fontStyle:"italic",textAlign:"center",marginBottom:isMob?12:18,...fadeUp(entered, .22)}}>— {TOP3.reason}</div>}

        {/* Top 3 大卡片 */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":isTab?"repeat(2,1fr)":"repeat(3,1fr)",gap:isMob?16:isTab?20:24,...fadeUp(entered, .3)}}>
          {top3List.map((f, i) => {
            const exc = f.exc || {}; const rytdExc = exc.rytd, r1yExc = exc.r1y, r3yExc = exc.r3y;
            return (
              <div key={f.c} onClick={() => go("detail", { fc: f.c, cat: f.cat_id })}
                style={{position:"relative",display:"flex",flexDirection:"column",padding:isMob?"22px":"26px",background:T.bgCard,borderRadius:14,border:`1px solid ${T.goldLine}`,cursor:"pointer",transition:"all .3s cubic-bezier(.22,1,.36,1)",overflow:"hidden",boxShadow:`0 2px 24px ${T.goldSoft}`}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 12px 36px rgba(26,50,100,0.08)"}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=`0 2px 24px ${T.goldSoft}`}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.gold},${T.navyLight} 80%,transparent)`}}/>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:8}}>
                  <span style={{fontSize:10,fontWeight:600,color:T.navy,background:T.navyPale,padding:"3px 10px",borderRadius:5,whiteSpace:"nowrap"}}>{f.cat || f.catName}</span>
                  <Spark data={f.h_spark} w={68} h={24} color={T.navyLight}/>
                </div>
                <div style={{fontFamily:T.disp,fontSize:isMob?17:19,fontWeight:700,color:T.navy,marginBottom:4,lineHeight:1.3}}>{f.n}</div>
                <div style={{fontSize:12,color:T.text3,marginBottom:16,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  <span style={{fontFamily:T.mono,color:T.text2,marginRight:8}}>{f.c}</span>{f.co} · {f.m}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"4px 8px",marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${T.lineLight}`}}>
                  {[["YTD超额",rytdExc],["近1年超额",r1yExc],["近3年超额",r3yExc],["规模",f.sz]].map(([lb,vl]) => (
                    <div key={lb}>
                      <div style={{fontSize:10,color:T.text3,marginBottom:4}}>{lb}</div>
                      {lb==="规模" ? <span style={{fontFamily:T.num,fontSize:15,fontWeight:700,color:T.navy}}>{vl >= 100 ? `${(vl/100).toFixed(1)}百亿` : `${(vl||0).toFixed(1)}亿`}</span>
                                  : <Ret v={vl} sz={15}/>}
                    </div>
                  ))}
                </div>
                {f.quote && <div style={{fontSize:13,color:T.text2,lineHeight:1.6,marginTop:"auto",paddingLeft:14,position:"relative",fontStyle:"italic",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical"}}>
                  <span style={{position:"absolute",left:0,top:-4,fontSize:22,color:T.gold,opacity:.5,fontFamily:"Georgia,serif",lineHeight:1}}>"</span>
                  {f.quote}
                </div>}
              </div>
            );
          })}
        </div>

        {/* 其他自家产品 */}
        <div style={{display:"flex",alignItems:"center",gap:12,margin:`${isMob?28:40}px 0 ${isMob?16:20}px`,...fadeUp(entered, .4)}}>
          <div style={{height:1,flex:1,background:T.line}}/><Dots size={4} gap={4}/>
          <span style={{fontSize:11,fontWeight:600,letterSpacing:".12em",color:T.text3,whiteSpace:"nowrap"}}>其他自家产品 · {otherOwnFunds.length}只</span>
          <Dots size={4} gap={4}/><div style={{height:1,flex:1,background:T.line}}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(280px,1fr))",gap:isMob?10:12,...fadeUp(entered, .45)}}>
          {otherOwnFunds.map(f => (
            <div key={f.c} onClick={() => go("detail", { fc: f.c, cat: f.catId })}
              style={{padding:"14px 16px",background:T.bgCard,borderRadius:10,border:`1px solid ${T.line}`,cursor:"pointer",transition:"all .2s",display:"flex",flexDirection:"column",minHeight:138}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.navyLight;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 12px rgba(26,50,100,0.06)"}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.line;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6,gap:8}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text1,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.n}</div>
                  <div style={{fontSize:10,color:T.text3,marginTop:2,fontFamily:T.mono}}>{f.c} · {f.m}</div>
                </div>
                <span style={{fontSize:9,fontWeight:600,color:T.navy,background:T.navyPale,padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{f.catName}</span>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <BenchTag name={f.bench_name || f.bench} kind={f.bench_kind} mini/>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:8,borderTop:`1px dashed ${T.lineLight}`,marginTop:"auto"}}>
                <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>YTD超额</div><Ret v={(f.exc||{}).rytd} sz={13}/></div>
                <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>近1年超额</div><Ret v={(f.exc||{}).r1y} sz={13}/></div>
                <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>规模</div><span style={{fontFamily:T.mono,fontSize:13,fontWeight:600,color:T.navy}}>{szs(f.sz)}</span></div>
              </div>
            </div>
          ))}
        </div>

        <TeamSection entered={entered}/>

        <div style={{textAlign:"center",paddingTop:24,marginTop:32,borderTop:`1px dashed ${T.lineLight}`,opacity:entered?.6:0,transition:"opacity .9s .7s"}}>
          <span style={{fontSize:11,color:T.text3,letterSpacing:".05em"}}>点击卡片查看详情 · 点击分类浏览同类竞品</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// LIST PAGE
// ============================================================
const List = () => {
  const { pr, go } = useR(); const scr = useScreen(); const isMob = scr === "mobile";
  const [catId, setCatId] = useState(pr.cat || CATS[0]?.id);
  const cat = CATS.find(c => c.id === catId);
  const fl = MF[catId] || [];
  const [sk, setSk] = useState("rytd"); const [sd, setSd] = useState("desc");
  const [q, setQ] = useState(""); const [coFilter, setCoFilter] = useState("all"); const [szFilter, setSzFilter] = useState("all");
  const [selected, setSelected] = useState([]); const [showCompare, setShowCompare] = useState(false);
  const [entered, setEntered] = useState(false);
  const [hoverRow, setHoverRow] = useState(null);

  useEffect(() => { setCatId(pr.cat || CATS[0]?.id); }, [pr.cat]);
  useEffect(() => {
    setSelected([]); setShowCompare(false); setQ(""); setCoFilter("all"); setSzFilter("all"); setEntered(false);
    const t = setTimeout(() => requestAnimationFrame(() => setEntered(true)), 200);
    return () => clearTimeout(t);
  }, [catId]);

  const ownCodes = OWN_CFG[catId] || [];
  const ownFunds = ownCodes.map(c => fl.find(f => f.c === c)).filter(Boolean);
  const companies = useMemo(() => [...new Set(fl.map(f => f.co).filter(Boolean))].sort(), [fl]);
  const doSort = k => { if (sk === k) setSd(d => d === "desc" ? "asc" : "desc"); else { setSk(k); setSd("desc"); } };

  const getVal = (f, k) => {
    if (["nav","sz","r1d"].includes(k)) return f[k];
    if (k.startsWith("abs_")) return (f.abs||{})[k.slice(4)];
    if (k.startsWith("exc_")) return (f.exc||{})[k.slice(4)];
    return f[k];
  };

  // 排序 + 自家固定前 5：先全量按业绩排出"真名次"，再把自家产品提到前 5 行（保留真名次显示）
  const { rows, rankMap } = useMemo(() => {
    let r = [...fl];
    if (q) { const ql = q.toLowerCase(); r = r.filter(f => f.n.toLowerCase().includes(ql) || f.c.includes(ql) || (f.co||"").toLowerCase().includes(ql)); }
    if (coFilter !== "all") r = r.filter(f => f.co === coFilter);
    if (szFilter === "sz10") r = r.filter(f => f.sz >= 10);
    else if (szFilter === "sz20") r = r.filter(f => f.sz >= 20);
    else if (szFilter === "sz30") r = r.filter(f => f.sz >= 30);

    // Step 1: 全量按当前排序键排（决定"真名次"）
    const sortedByPerf = [...r].sort((a, b) => {
      const av = getVal(a, sk), bv = getVal(b, sk);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      return sd === "desc" ? bv - av : av - bv;
    });
    // 记录每只基金的真名次
    const rkMap = {};
    sortedByPerf.forEach((f, idx) => { rkMap[f.c] = idx + 1; });

    // Step 2: 自家产品提到最前（保留它们之间的相对名次顺序）
    const ownList = sortedByPerf.filter(f => isOwn(catId, f.c));
    const otherList = sortedByPerf.filter(f => !isOwn(catId, f.c));

    return { rows: [...ownList, ...otherList], rankMap: rkMap };
  }, [fl, sk, sd, q, coFilter, szFilter, catId]);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const validExc = rows.filter(f => (f.exc||{}).rytd != null);
    const avgYtdExc = validExc.length ? validExc.reduce((s,f) => s + f.exc.rytd, 0) / validExc.length : null;
    return { count: rows.length, validExcCnt: validExc.length, avgYtdExc };
  }, [rows]);

  const toggleSelect = c => setSelected(p => p.includes(c) ? p.filter(x => x !== c) : p.length < 4 ? [...p, c] : p);
  const selFunds = useMemo(() => selected.map(c => fl.find(f => f.c === c)).filter(Boolean), [selected, fl]);
  const af = (coFilter !== "all" ? 1 : 0) + (szFilter !== "all" ? 1 : 0) + (q ? 1 : 0);
  const ss = { padding:"7px 12px",fontSize:12,background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:6,color:T.text1,outline:"none",fontFamily:T.body,cursor:"pointer",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238d95aa'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",paddingRight:28 };

  // 表头列：选择 / 排序 / 代码 / 名称 / 对标基准 / 近1月 / 日涨跌 / 近3月 / YTD / 近1年 / 近3年 / 规模 / 超额曲线 spark
  // 左侧 4 列（选择/排序/代码/名称）粘性固定
  const cols = [
    { k: "_s",   lb: "",        w: 36, sticky: 0,   fn: f => <div onClick={e=>{e.stopPropagation();toggleSelect(f.c)}} style={{width:18,height:18,borderRadius:4,border:`2px solid ${selected.includes(f.c)?T.navy:T.line}`,background:selected.includes(f.c)?T.navy:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{selected.includes(f.c)&&<span style={{color:T.textInv,fontSize:11,fontWeight:700}}>✓</span>}</div> },
    { k: "_r",   lb: "排序",     w: 44, sticky: 36,  fn: f => { const r = rankMap[f.c]; return <span style={{fontSize:12,fontFamily:T.mono,fontWeight:600,color:r<=3?T.gold:r<=10?T.navy:T.text2}}>{r ?? "—"}</span>; } },
    { k: "c",    lb: "代码",    w: 64, sticky: 80,  fn: f => <span style={{fontFamily:T.mono,fontSize:12,color:T.text2}}>{f.c}</span> },
    { k: "n",    lb: "名称",    w: 160, sticky: 144,  fn: f => <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{fontWeight:600,color:isOwn(catId,f.c)?T.gold:T.navy,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:138,display:"inline-block"}}>{f.n}</span>{isOwn(catId,f.c)&&<span style={{fontSize:9,fontWeight:700,color:T.gold,background:T.goldSoft,padding:"1px 5px",borderRadius:3}}>自家</span>}</span> },
    { k: "_b",   lb: "基准",    w: 92, fn: f => <BenchTag name={f.bench_name || f.bench} kind={f.bench_kind} mini/> },
    { k: "abs_r1m",  lb: "近1月",   w: 60, sort: 1, fn: f => <Ret v={(f.abs||{}).r1m}/> },
    { k: "r1d",      lb: "日涨跌",  w: 60, sort: 1, fn: f => <Ret v={f.r1d}/> },
    { k: "abs_r3m",  lb: "近3月",   w: 60, sort: 1, fn: f => <Ret v={(f.abs||{}).r3m}/> },
    { k: "abs_rytd", lb: "YTD",     w: 64, sort: 1, fn: f => <Ret v={(f.abs||{}).rytd}/> },
    { k: "abs_r1y",  lb: "近1年",   w: 64, sort: 1, fn: f => <Ret v={(f.abs||{}).r1y}/> },
    { k: "abs_r3y",  lb: "近3年",   w: 64, sort: 1, fn: f => <Ret v={(f.abs||{}).r3y}/> },
    { k: "sz",       lb: "规模",   w: 60, sort: 1, fn: f => <span style={{fontSize:12,color:T.text2}}>{szs(f.sz)}</span> },
    { k: "_p",       lb: "超额走势", w: 76, fn: f => <Spark data={f.h_spark} w={60} h={20} color={T.navyLight}/> },
  ];

  if (!cat) return null;

  return (
    <div style={{minHeight:"100vh",background:T.bg}}>
      <InnerHeader crumbs={[{label:"首页",onClick:()=>go("home")},{label:cat.name,active:true}]}/>
      <div className="rw" style={{padding:"24px 24px 64px"}}>
        {/* 9 赛道 Tabs */}
        <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:`2px solid ${T.lineLight}`,overflowX:"auto",WebkitOverflowScrolling:"touch",...fadeUp(entered, 0)}}>
          {CATS.map(c => {
            const a = c.id === catId;
            return <button key={c.id} onClick={()=>setCatId(c.id)} style={{padding:"10px 20px",fontSize:13,fontWeight:a?600:400,fontFamily:T.body,color:a?T.navy:T.text3,background:"transparent",border:"none",borderBottom:`2px solid ${a?T.navy:"transparent"}`,marginBottom:-2,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
              {c.name}<span style={{fontSize:10,marginLeft:6,color:T.text3,fontFamily:T.mono}}>({MF[c.id]?.length})</span>
              {(OWN_CFG[c.id]||[]).length > 0 && <span style={{marginLeft:4,width:5,height:5,borderRadius:"50%",background:T.gold,display:"inline-block",verticalAlign:"middle"}}/>}
            </button>;
          })}
        </div>

        {/* 自家产品 Carousel */}
        {ownFunds.length > 0 && <div style={fadeUp(entered, .06)}><OwnCarousel ownFunds={ownFunds} catId={catId} allFunds={fl} onDetail={f => go("detail", { fc: f.c, cat: catId })}/></div>}

        {/* 筛选条 */}
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:20,flexWrap:"wrap",...fadeUp(entered, .12)}}>
          <input placeholder="搜索名称、代码或公司…" value={q} onChange={e=>setQ(e.target.value)} style={{padding:"8px 16px",fontSize:13,background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:8,color:T.text1,outline:"none",width:isMob?"100%":260,fontFamily:T.body}}/>
          {!isMob && <>
            <select value={coFilter} onChange={e=>setCoFilter(e.target.value)} style={ss}><option value="all">全部公司</option>{companies.map(co=><option key={co} value={co}>{co}</option>)}</select>
            <select value={szFilter} onChange={e=>setSzFilter(e.target.value)} style={ss}><option value="all">全部规模</option><option value="sz10">10亿以上</option><option value="sz20">20亿以上</option><option value="sz30">30亿以上</option></select>
          </>}
          {af > 0 && <button onClick={()=>{setQ("");setCoFilter("all");setSzFilter("all")}} style={{padding:"7px 14px",fontSize:12,color:T.neg,background:T.negBg,border:"none",borderRadius:6,cursor:"pointer",fontWeight:500}}>清除 ({af})</button>}
          <div style={{flex:1}}/>
          {selected.length > 0 && <button onClick={()=>setShowCompare(!showCompare)} style={{padding:"8px 18px",fontSize:12,fontWeight:600,background:T.navy,color:T.textInv,border:"none",borderRadius:8,cursor:"pointer"}}>对比 ({selected.length}/4)</button>}
        </div>

        {/* 赛道统计：基金数量 + 平均 YTD 超额 */}
        {stats && <div style={{display:"flex",gap:isMob?16:32,padding:"14px 24px",background:T.bgCard,borderRadius:10,border:`1px solid ${T.line}`,marginBottom:20,flexWrap:"wrap",...fadeUp(entered, .18)}}>
          <Stat label="基金数量" value={`${stats.count}只`} color={T.navy}/>
          {!isMob && <div style={{width:1,background:T.lineLight}}/>}
          <Stat label="平均 YTD 超额" value={stats.avgYtdExc != null ? pct(stats.avgYtdExc) : "—"} color={stats.avgYtdExc >= 0 ? T.pos : T.neg}/>
        </div>}

        {/* 对比浮层 */}
        {showCompare && selFunds.length > 0 && <CompareTable selFunds={selFunds} catId={catId} onClose={()=>{setShowCompare(false);setSelected([])}}/>}

        {/* 全量表 */}
        {rows.length === 0 ? (
          <div style={{padding:64,textAlign:"center",background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,...fadeUp(entered, .24)}}>
            <div style={{fontSize:36,opacity:.15,color:T.navy}}>∅</div>
            <div style={{fontSize:15,fontWeight:600,color:T.text1,margin:"12px 0 6px"}}>没有找到匹配的基金</div>
            <button onClick={()=>{setQ("");setCoFilter("all");setSzFilter("all")}} style={{padding:"8px 20px",fontSize:13,background:T.navy,color:T.textInv,border:"none",borderRadius:8,cursor:"pointer",marginTop:12}}>重置筛选</button>
          </div>
        ) : (
          <div style={{background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,overflow:"hidden",...fadeUp(entered, .24)}}>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
              <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0}}>
                <thead><tr>
                  {cols.map(col => {
                    const isSticky = col.sticky !== undefined;
                    return (
                      <th key={col.k} onClick={()=>col.sort&&doSort(col.k)} style={{padding:"14px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,letterSpacing:".06em",textTransform:"uppercase",borderBottom:`2px solid ${T.lineLight}`,background:T.bgCard,cursor:col.sort?"pointer":"default",whiteSpace:"nowrap",userSelect:"none",minWidth:col.w,position:"sticky",top:0,left:isSticky?col.sticky:undefined,zIndex:isSticky?3:2,boxShadow:isSticky&&col.k==="n"?`2px 0 4px rgba(0,0,0,0.04)`:undefined}}>
                        {col.lb}{col.sort && (sk === col.k ? <span style={{color:T.gold,marginLeft:4}}>{sd === "desc" ? "↓" : "↑"}</span> : <span style={{opacity:.25,marginLeft:4}}>↕</span>)}
                      </th>
                    );
                  })}
                </tr></thead>
                <tbody>{rows.map((f, i) => {
                  const own = isOwn(catId, f.c); const isSel = selected.includes(f.c); const bgD = own ? T.goldPale : (i % 2 ? T.bg : T.bgCard);
                  const rowBg = isSel ? T.navyPale : (hoverRow === f.c ? (own ? "#fdf3d8" : T.bgHover) : bgD);
                  return <tr key={f.c} onClick={()=>own&&go("detail",{fc:f.c,cat:catId})} onMouseEnter={()=>setHoverRow(f.c)} onMouseLeave={()=>setHoverRow(null)}
                    style={{cursor:own?"pointer":"default",transition:"background .12s",position:"relative"}}>
                    {cols.map(col => {
                      const isSticky = col.sticky !== undefined;
                      return <td key={col.k} style={{padding:"13px 12px",borderBottom:`1px solid ${own?T.goldLine:T.lineLight}`,whiteSpace:"nowrap",background:rowBg,position:isSticky?"sticky":undefined,left:isSticky?col.sticky:undefined,zIndex:isSticky?1:undefined,boxShadow:isSticky&&col.k==="n"?`2px 0 4px rgba(0,0,0,0.04)`:undefined}}>{col.fn(f)}</td>;
                    })}
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {/* hover 时 浮出超额数据 Tooltip */}
            {hoverRow && (() => {
              const f = rows.find(x => x.c === hoverRow); if (!f || !f.exc) return null;
              return <div style={{position:"sticky",bottom:0,left:0,right:0,padding:"10px 18px",background:T.navy,color:T.textInv,fontSize:11,display:"flex",gap:18,flexWrap:"wrap",justifyContent:"center",borderTop:`2px solid ${T.gold}`}}>
                <span style={{fontWeight:600,color:T.gold,marginRight:8}}>超额 ({f.n.slice(0,12)}):</span>
                {TIME_WINDOWS.map(w => <span key={w.k}>{w.l}: <span style={{fontFamily:T.mono,fontWeight:600,color:(f.exc[w.k] != null && f.exc[w.k] >= 0) ? "#ff8888" : (f.exc[w.k] != null ? "#5eedb8" : "rgba(255,255,255,.3)")}}>{f.exc[w.k] != null ? pct(f.exc[w.k]) : "—"}</span></span>)}
              </div>;
            })()}
            <div style={{padding:"12px 14px",fontSize:12,color:T.text3,borderTop:`1px solid ${T.lineLight}`,display:"flex",justifyContent:"space-between"}}>
              <span>共 {rows.length} 只{rows.length < fl.length ? "（已筛选）" : ""} · 按{cols.find(c=>c.k===sk)?.lb}{sd==="desc"?"降":"升"}序{ownFunds.length?" · 自家置顶":""}</span>
              {selected.length > 0 && <span style={{color:T.navy,fontWeight:500}}>已选 {selected.length}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// OWN PRODUCTS CAROUSEL (列表页置顶)
// ============================================================
const OwnCarousel = ({ ownFunds, catId, allFunds, onDetail }) => {
  const cnt = ownFunds.length; const scr = useScreen(); const isMob = scr === "mobile";
  if (!cnt) return null;
  return (
    <div style={{background:T.bgCard,borderRadius:16,border:`1px solid ${T.goldLine}`,marginBottom:24,overflow:"hidden",boxShadow:`0 2px 20px ${T.goldSoft}`}}>
      <div style={{position:"relative"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.gold},${T.navyLight} 70%,transparent)`}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",borderBottom:`1px solid ${T.lineLight}`,background:T.goldPale}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><Dots size={6} gap={4}/><span style={{fontSize:13,fontWeight:700,color:T.navy,fontFamily:T.disp}}>本公司产品</span><span style={{fontSize:11,color:T.text3}}>{cnt}只</span></div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {ownFunds.map((f, fi) => {
          const rk = (f.rank || {}).rytd;
          return (
            <div key={f.c} style={{padding:"22px 24px",borderBottom:fi < cnt - 1 ? `1px solid ${T.lineLight}` : "none",display:"flex",gap:24,alignItems:"center",flexDirection:isMob?"column":"row"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12,gap:12}}>
                  <div>
                    <div style={{fontFamily:T.disp,fontSize:isMob?17:17,fontWeight:800,color:T.navy,marginBottom:4}}>{f.n}</div>
                    <div style={{fontSize:12,color:T.text2,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontFamily:T.mono}}>{f.c}</span>
                      <BenchTag name={f.bench_name || f.bench} kind={f.bench_kind} mini/>
                      <span>{f.m}</span>
                    </div>
                  </div>
                  <button onClick={() => onDetail(f)} style={{padding:"7px 16px",fontSize:12,fontWeight:600,background:T.navy,color:T.textInv,border:"none",borderRadius:7,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>详情 →</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px 16px",marginBottom:6}}>
                  {[["YTD超额",(f.exc||{}).rytd],["近1年超额",(f.exc||{}).r1y],["近3年超额",(f.exc||{}).r3y],["YTD绝对",(f.abs||{}).rytd],["规模",f.sz]].map(([lb,vl]) => (
                    <div key={lb}>
                      <div style={{fontSize:9,color:T.text3,marginBottom:3}}>{lb}</div>
                      {lb === "规模" ? <span style={{fontFamily:T.num,fontSize:15,fontWeight:700,color:T.navy}}>{szs(vl)}</span>
                                    : <Ret v={vl} sz={15}/>}
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
                  {rk && rk[1] > 0 && <span style={{fontSize:11,color:T.gold,fontWeight:600,background:T.goldSoft,padding:"3px 10px",borderRadius:5}}>同类 {rk[0]}/{rk[1]}（YTD超额）</span>}
                </div>
              </div>
              <Spark data={f.h_spark} w={isMob ? 280 : 200} h={40} color={T.navyLight}/>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// COMPARE TABLE (列表页对比浮层)
// ============================================================
const CompareTable = ({ selFunds, catId, onClose }) => (
  <div style={{marginBottom:20,background:T.navyPale,borderRadius:14,border:`1px solid ${T.navy}22`,padding:24}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}>
      <span style={{fontFamily:T.disp,fontSize:15,fontWeight:700,color:T.navy}}>基金对比（绝对收益 vs 超额收益）</span>
      <button onClick={onClose} style={{fontSize:12,color:T.text3,background:"none",border:"none",cursor:"pointer"}}>关闭 ✕</button>
    </div>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>
          <th style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.line}`}}>指标</th>
          {selFunds.map(f => <th key={f.c} style={{padding:"8px 12px",textAlign:"right",fontSize:12,fontWeight:600,color:isOwn(catId,f.c)?T.gold:T.navy,borderBottom:`1px solid ${T.line}`}}>{f.n}{isOwn(catId,f.c)&&<span style={{fontSize:9,marginLeft:4,color:T.gold}}>★</span>}</th>)}
        </tr></thead>
        <tbody>
          {[
            ["YTD 绝对", "abs", "rytd"],["YTD 超额", "exc", "rytd"],
            ["近1年绝对", "abs", "r1y"],["近1年超额", "exc", "r1y"],
            ["近3年绝对", "abs", "r3y"],["近3年超额", "exc", "r3y"],
            ["2025年超额", "exc", "2025"],["2024年超额", "exc", "2024"],
            ["规模", "sz", null],
          ].map(([lb, g, k], ri) => (
            <tr key={lb} style={{background:ri % 2 ? T.bgCard : "transparent"}}>
              <td style={{padding:"9px 12px",fontSize:12,color:T.text3,borderBottom:`1px solid ${T.lineLight}`}}>{lb}</td>
              {selFunds.map(f => {
                let v;
                if (g === "sz") v = f.sz;
                else v = (f[g] || {})[k];
                return <td key={f.c} style={{padding:"9px 12px",textAlign:"right",borderBottom:`1px solid ${T.lineLight}`}}>
                  {g === "sz" ? <span style={{color:T.text2,fontFamily:T.mono}}>{szs(v)}</span> : <Ret v={v}/>}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ============================================================
// DETAIL PAGE
// ============================================================
const Detail = () => {
  const { pr, go } = useR(); const { fc, cat: catId } = pr;
  const scr = useScreen(); const isMob = scr === "mobile";
  const cat = CATS.find(c => c.id === catId);
  const funds = MF[catId] || [];
  const f = funds.find(x => x.c === fc);
  const [entered, setEntered] = useState(false);
  const [chartMode, setChartMode] = useState("all"); // all / nav_vs_bench / excess_only
  const [compareCodes, setCompareCodes] = useState([]);
  useEffect(() => { setEntered(false); setCompareCodes([]); const t = setTimeout(() => requestAnimationFrame(() => setEntered(true)), 200); return () => clearTimeout(t); }, [fc]);

  if (!f) return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",color:T.text3}}><div style={{fontSize:28,opacity:.25,marginBottom:12}}>∅</div><div>基金不存在</div><div style={{marginTop:14,color:T.navyLight,cursor:"pointer"}} onClick={() => go("home")}>返回首页</div></div></div>;
  if (!isOwn(catId, f.c)) { go("list", { cat: catId }); return null; }

  const rytdExc = (f.exc || {}).rytd; const r1yExc = (f.exc || {}).r1y; const r3yExc = (f.exc || {}).r3y;
  const rkYtd = (f.rank || {}).rytd;

  // 走势图数据（成立以来）
  const chartData = useMemo(() => {
    if (!f.h_fund || f.h_fund.length === 0) return [];
    const f0 = f.h_fund[0][1];
    const benchMap = Object.fromEntries((f.h_bench || []).map(p => [p[0], p[1]]));
    const excMap = Object.fromEntries((f.h || []).map(p => [p[0], p[1]]));
    const b0 = f.h_bench && f.h_bench.length ? f.h_bench[0][1] : 1;
    return f.h_fund.map((p, i) => ({
      d: p[0],
      fund: +(((p[1] / f0) - 1) * 100).toFixed(3),
      bench: benchMap[p[0]] != null ? +(((benchMap[p[0]] / b0) - 1) * 100).toFixed(3) : null,
      excess: excMap[p[0]] != null ? +excMap[p[0]].toFixed(3) : null,
    }));
  }, [f]);

  // 同类排名分布（基于 metrics_map 算的赛道排名）
  const peerYtdExc = useMemo(() => funds.filter(x => (x.exc || {}).rytd != null).map(x => x.exc.rytd), [funds]);
  const peer1y = useMemo(() => funds.filter(x => (x.exc || {}).r1y != null).map(x => x.exc.r1y), [funds]);
  const peer3y = useMemo(() => funds.filter(x => (x.exc || {}).r3y != null).map(x => x.exc.r3y), [funds]);

  return (
    <div style={{minHeight:"100vh",background:T.bg}}>
      <InnerHeader crumbs={[
        { label: "首页", onClick: () => go("home") },
        { label: cat?.name || catId, onClick: () => go("list", { cat: catId }) },
        { label: f.n, active: true },
      ]}/>

      {/* HERO */}
      <div style={{background:`linear-gradient(135deg,${T.navy} 0%,${T.navyDeep} 50%,#0a1530 100%)`,padding:isMob?"32px 20px 28px":"48px 0 40px",position:"relative",overflow:"hidden",...fadeUp(entered, 0, 0)}}>
        <div style={{position:"absolute",top:"-30%",right:"10%",width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${T.gold}10,transparent 70%)`,pointerEvents:"none"}}/>
        <div className="rw" style={{padding:"0 24px",position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <span style={{fontSize:10,fontWeight:700,color:T.gold,background:`${T.gold}20`,padding:"4px 12px",borderRadius:5}}>本公司产品</span>
            <span style={{fontSize:10,fontWeight:600,color:T.navyPale,background:"rgba(255,255,255,0.08)",padding:"4px 12px",borderRadius:5}}>{cat?.name}</span>
            <BenchTag name={f.bench_name || f.bench} kind={f.bench_kind}/>
          </div>
          <h1 style={{fontFamily:T.disp,fontSize:isMob?26:34,fontWeight:800,color:"#fff",margin:0,letterSpacing:"-.03em",lineHeight:1.2}}>{f.n}</h1>
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12,fontSize:13,color:"rgba(255,255,255,0.55)",flexWrap:"wrap"}}>
            <span style={{fontFamily:T.mono}}>{f.c}</span><span>·</span>
            <span>{f.co}</span><span>·</span>
            <span onClick={() => f.m && go("manager", { name: f.m.split(/[、,]/)[0], fromFc: f.c, fromCat: catId })} style={{cursor:f.m?"pointer":"default",borderBottom:f.m?`1px dashed rgba(255,255,255,0.3)`:"none"}}>{f.m}</span>
            {f.est && <><span>·</span><span>成立于 {f.est}</span></>}
          </div>
          <div style={{display:"flex",gap:isMob?20:32,marginTop:28,flexWrap:"wrap"}}>
            {[["YTD超额",rytdExc,1],["近1年超额",r1yExc,1],["近3年超额",r3yExc,1],["规模",f.sz,0],["同类排名",rkYtd,2]].map(([lb,vl,kind]) => (
              <div key={lb}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:6,letterSpacing:".06em"}}>{lb}</div>
                {kind === 1 ? <span style={{fontSize:isMob?18:22,fontWeight:700,fontFamily:T.num,color:vl == null ? "rgba(255,255,255,.3)" : (vl >= 0 ? "#ff8888" : "#5eedb8")}}>{vl == null ? "—" : pct(vl)}</span>
                 : kind === 2 ? <span style={{fontSize:isMob?18:22,fontWeight:700,fontFamily:T.num,color:"#fff"}}>{vl && vl[1] ? `${vl[0]}/${vl[1]}` : "—"}</span>
                 : <><span style={{fontSize:isMob?18:22,fontWeight:700,fontFamily:T.num,color:"#fff"}}>{vl >= 100 ? (vl/100).toFixed(1) : (vl||0).toFixed(1)}</span><span style={{fontSize:isMob?13:15,fontWeight:500,color:"rgba(255,255,255,0.45)",marginLeft:3}}>{vl >= 100 ? "百亿" : "亿"}</span></>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rw" style={{padding:"32px 24px 64px"}}>
        {/* 基本信息 */}
        <div style={{padding:isMob?20:28,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,marginBottom:24,...fadeUp(entered, .06)}}>
          <div style={{fontSize:14,fontWeight:600,color:T.navy,marginBottom:18}}>基本信息</div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:"14px 28px"}}>
            {[["代码",f.c],["公司",f.co],["经理",f.m],["成立",f.est||"—"],["规模",szs(f.sz)],["净值",nvs(f.nav)],["净值日期",f.nd],["对标基准",f.bench_name||f.bench]].map(([l,v])=>(
              <div key={l}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{l}</div><div style={{fontSize:13,color:T.text1,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis"}}>{v||"—"}</div></div>
            ))}
          </div>
        </div>

        {/* 业绩明细 4 × 7 大表 */}
        <div style={{padding:isMob?16:24,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,marginBottom:24,...fadeUp(entered, .1),overflow:"hidden"}}>
          <div style={{fontSize:14,fontWeight:600,color:T.navy,marginBottom:18}}>业绩明细 · 绝对 / 超额 / 基准 / 同类排名</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:680}}>
              <thead><tr>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:T.text3,background:T.bgMuted}}>指标</th>
                {TIME_WINDOWS.map(w => <th key={w.k} style={{padding:"10px 12px",textAlign:"right",fontSize:11,fontWeight:600,color:T.text3,background:T.bgMuted}}>{w.l}</th>)}
              </tr></thead>
              <tbody>
                <tr><td style={{padding:"12px 12px",fontSize:12,color:T.text2,borderBottom:`1px solid ${T.lineLight}`,fontWeight:600}}>基金绝对</td>{TIME_WINDOWS.map(w => <td key={w.k} style={{padding:"12px 12px",textAlign:"right",borderBottom:`1px solid ${T.lineLight}`}}><Ret v={(f.abs||{})[w.k]} bold/></td>)}</tr>
                <tr style={{background:T.goldSoft}}><td style={{padding:"12px 12px",fontSize:12,color:T.gold,borderBottom:`1px solid ${T.lineLight}`,fontWeight:700}}>vs 基准超额</td>{TIME_WINDOWS.map(w => <td key={w.k} style={{padding:"12px 12px",textAlign:"right",borderBottom:`1px solid ${T.lineLight}`}}><Ret v={(f.exc||{})[w.k]} bold/></td>)}</tr>
                <tr><td style={{padding:"12px 12px",fontSize:12,color:T.text2,borderBottom:`1px solid ${T.lineLight}`,fontWeight:600}}>基准同期</td>{TIME_WINDOWS.map(w => {
                  const a = (f.abs||{})[w.k], e = (f.exc||{})[w.k];
                  const benchSame = (a != null && e != null) ? (a - e) : null;
                  return <td key={w.k} style={{padding:"12px 12px",textAlign:"right",borderBottom:`1px solid ${T.lineLight}`}}><Ret v={benchSame} bold={false}/></td>;
                })}</tr>
                <tr><td style={{padding:"12px 12px",fontSize:12,color:T.text2,fontWeight:600}}>同类排名</td>{TIME_WINDOWS.map(w => <td key={w.k} style={{padding:"12px 12px",textAlign:"right"}}><Rank rk={(f.rank||{})[w.k]}/></td>)}</tr>
              </tbody>
            </table>
          </div>
          <div style={{fontSize:11,color:T.text3,marginTop:10}}>* 超额 = 基金绝对 − 基准同期。基准为 {f.bench_name || f.bench}（{f.bench_kind === "total_return" ? "全收益指数" : "价格指数"}）</div>
        </div>

        {/* 走势图 */}
        <div style={{padding:isMob?16:24,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,marginBottom:24,...fadeUp(entered, .14)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <span style={{fontSize:14,fontWeight:600,color:T.navy}}>净值走势（成立以来）</span>
            <div style={{display:"flex",gap:6}}>{[["all","全部"],["nav_vs_bench","净值+基准"],["excess_only","超额"]].map(([v,l]) => (
              <button key={v} onClick={()=>setChartMode(v)} style={{padding:"5px 14px",fontSize:11,fontWeight:600,background:chartMode===v?T.navy:T.bgCard,color:chartMode===v?T.textInv:T.text3,border:`1px solid ${chartMode===v?T.navy:T.line}`,borderRadius:6,cursor:"pointer"}}>{l}</button>
            ))}</div>
          </div>
          <ResponsiveContainer width="100%" height={isMob ? 220 : 320}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="excessFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#9aa3b5" stopOpacity={0.42}/>
                  <stop offset="100%" stopColor="#9aa3b5" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="d" stroke={T.text3} fontSize={11} tickLine={false} axisLine={{stroke:T.line}} tickFormatter={d => d.slice(2, 7)} interval={Math.max(1, Math.floor(chartData.length / 8))}/>
              <YAxis stroke={T.text3} fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${v>0?"+":""}${v.toFixed(0)}%`} width={56}/>
              <Tooltip contentStyle={{background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:8,fontSize:12,color:T.text1}} formatter={(v) => v == null ? "—" : `${v>0?"+":""}${v.toFixed(2)}%`} labelStyle={{color:T.text3,fontSize:11}}/>
              <ReferenceLine y={0} stroke={T.text3} strokeDasharray="3 3" strokeOpacity={0.5}/>
              {/* 累计超额：浅灰面积图，先画作为背景 */}
              {(chartMode === "all" || chartMode === "excess_only") && <Area type="monotone" dataKey="excess" fill="url(#excessFill)" stroke="#9aa3b5" strokeWidth={1.2} name="累计超额"/>}
              {(chartMode === "all" || chartMode === "nav_vs_bench") && <Line type="monotone" dataKey="fund" stroke={CCOL[0]} strokeWidth={2.5} dot={false} name={`基金 ${f.n}`}/>}
              {(chartMode === "all" || chartMode === "nav_vs_bench") && <Line type="monotone" dataKey="bench" stroke={CCOL[1]} strokeWidth={1.8} strokeDasharray="5 3" dot={false} name={`基准 ${f.bench_name||f.bench}`}/>}
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:18,justifyContent:"center",marginTop:10,flexWrap:"wrap",fontSize:11}}>
            <span style={{color:CCOL[0]}}>━ 基金</span><span style={{color:CCOL[1]}}>┅┅ 基准</span><span style={{color:"#9aa3b5"}}>▦ 累计超额</span>
          </div>
        </div>

        {/* 同类排名分布 */}
        <div style={{padding:isMob?20:28,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,marginBottom:24,...fadeUp(entered, .18)}}>
          <div style={{fontSize:14,fontWeight:600,color:T.navy,marginBottom:20}}>同类排名分布（按赛道内超额）</div>
          <PctileDist values={peerYtdExc}  current={(f.exc||{}).rytd} label="YTD 超额" fmt={pct}/>
          <PctileDist values={peer1y}      current={(f.exc||{}).r1y}  label="近1年 超额" fmt={pct}/>
          <PctileDist values={peer3y}      current={(f.exc||{}).r3y}  label="近3年 超额" fmt={pct}/>
        </div>

        {/* 产品目标 KPI + 模型与因子 + 策略迭代时间轴（三块横向并列） */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginBottom:24,...fadeUp(entered, .22)}}>
          {/* 产品目标 KPI */}
          {f.kpi && Object.keys(f.kpi).length > 0 && (
            <div style={{padding:isMob?20:24,background:T.bgCard,borderRadius:12,border:`1px solid ${T.line}`}}>
              <div style={{fontSize:13,fontWeight:600,color:T.navy,marginBottom:14}}>📋 合同 KPI 目标</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {f.kpi.weight    && <KpiRow label="成分股占比"   value={f.kpi.weight}/>}
                {f.kpi.te        && <KpiRow label="跟踪误差上限" value={f.kpi.te}/>}
                {f.kpi.ann_excess && <KpiRow label="年化超额目标" value={f.kpi.ann_excess}/>}
                {f.kpi.win_rate  && <KpiRow label="月度胜率目标" value={f.kpi.win_rate}/>}
              </div>
            </div>
          )}
          {/* 模型与因子 */}
          {(f.model || f.factor) && (
            <div style={{padding:isMob?20:24,background:T.bgCard,borderRadius:12,border:`1px solid ${T.line}`}}>
              <div style={{fontSize:13,fontWeight:600,color:T.navy,marginBottom:14}}>🧠 模型与因子</div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {f.model && <div><div style={{fontSize:11,color:T.text3,marginBottom:4}}>使用模型</div><div style={{fontSize:13,color:T.text1,fontWeight:500,lineHeight:1.6}}>{f.model}</div></div>}
                {f.factor && <div><div style={{fontSize:11,color:T.text3,marginBottom:4}}>因子构成</div><div style={{fontSize:13,color:T.text1,fontWeight:500,lineHeight:1.6}}>{f.factor}</div></div>}
              </div>
            </div>
          )}
        </div>

        {/* 策略迭代 + 经理简介 */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginBottom:24,...fadeUp(entered, .26)}}>
          {f.iter_date && (
            <div style={{padding:isMob?20:24,background:T.bgCard,borderRadius:12,border:`1px solid ${T.line}`}}>
              <div style={{fontSize:13,fontWeight:600,color:T.navy,marginBottom:14}}>🔄 策略迭代</div>
              <TimelineDot date={f.iter_date} content="模型/因子/参数升级节点"/>
              <div style={{fontSize:11,color:T.text3,marginTop:6}}>最新一次策略迭代</div>
            </div>
          )}
          {f.m && (
            <div onClick={() => go("manager", { name: f.m.split(/[、,]/)[0], fromFc: f.c, fromCat: catId })} style={{padding:isMob?20:24,background:T.bgCard,borderRadius:12,border:`1px solid ${T.line}`,cursor:"pointer",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.navyLight;e.currentTarget.style.boxShadow="0 4px 12px rgba(26,50,100,0.06)"}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.line;e.currentTarget.style.boxShadow="none"}}>
              <div style={{fontSize:13,fontWeight:600,color:T.navy,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>👤 基金经理</span>
                <span style={{fontSize:11,color:T.gold,fontWeight:500}}>查看画像 →</span>
              </div>
              <div style={{fontFamily:T.disp,fontSize:18,fontWeight:800,color:T.navy,marginBottom:4}}>{f.m}</div>
              <div style={{fontSize:12,color:T.text2,lineHeight:1.7}}>{MANAGERS[f.m.split(/[、,]/)[0]]?.desc || "点击查看经理详细画像和管理产品列表"}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PCTILE DISTRIBUTION
// ============================================================
const PctileDist = ({ values, current, label, fmt, inverse = false }) => {
  if (!values || !values.length || current == null) return <div style={{marginBottom:16,fontSize:12,color:T.text3}}>{label}：暂无对比数据</div>;
  const sorted = [...values].sort((a, b) => a - b);
  const mn = sorted[0], mx = sorted[sorted.length - 1];
  const rank = sorted.filter(v => inverse ? v > current : v < current).length;
  const pctl = Math.round((rank / sorted.length) * 100);
  return (
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
        <span style={{fontSize:13,fontWeight:600,color:T.text1}}>{label}</span>
        <div style={{display:"flex",alignItems:"baseline",gap:8}}>
          <span style={{fontSize:15,fontWeight:700,fontFamily:T.num,color:T.navy}}>{fmt(current)}</span>
          <span style={{fontSize:11,fontWeight:600,color:pctl >= 60 ? T.pos : pctl >= 40 ? T.gold : T.neg,background:pctl >= 60 ? T.posBg : pctl >= 40 ? T.goldSoft : T.negBg,padding:"2px 8px",borderRadius:4}}>Top {100 - pctl}%</span>
        </div>
      </div>
      <div style={{position:"relative",height:22,background:T.bgMuted,borderRadius:11,overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,${T.negBg},${T.goldSoft} 50%,${T.posBg})`,borderRadius:11,opacity:.6}}/>
        {sorted.map((v, i) => {
          const x = ((v - mn) / (mx - mn || 1)) * 100;
          const isCur = Math.abs(v - current) < 0.001;
          return <div key={i} style={{position:"absolute",left:`${x}%`,top:"50%",transform:"translate(-50%,-50%)",width:isCur?14:5,height:isCur?14:5,borderRadius:"50%",background:isCur?T.navy:T.text3,opacity:isCur?1:.25,zIndex:isCur?2:1,border:isCur?`2px solid ${T.bgCard}`:"none",boxShadow:isCur?`0 0 0 2px ${T.navy}`:"none"}}/>;
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:T.text3}}>
        <span>{fmt(mn)}</span><span>{fmt(mx)}</span>
      </div>
    </div>
  );
};

const KpiRow = ({ label, value }) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px dashed ${T.lineLight}`}}>
    <span style={{fontSize:12,color:T.text2}}>{label}</span>
    <span style={{fontSize:13,fontWeight:600,color:T.navy,fontFamily:T.mono}}>{value}</span>
  </div>
);

// ============================================================
// MANAGER PROFILE PAGE
// ============================================================
const ManagerPage = () => {
  const { pr, go } = useR(); const { name, fromFc, fromCat } = pr;
  const [entered, setEntered] = useState(false);
  useEffect(() => { setEntered(false); const t = setTimeout(() => requestAnimationFrame(() => setEntered(true)), 200); return () => clearTimeout(t); }, [name]);
  const scr = useScreen(); const isMob = scr === "mobile";
  const m = MANAGERS[name];

  // 找出该经理管理的所有产品
  const managedFunds = useMemo(() => {
    const list = [];
    for (const cat of CATS) {
      for (const f of (MF[cat.id] || [])) {
        if (!f.own) continue;
        if ((f.m || "").includes(name)) {
          list.push({ ...f, catId: cat.id, catName: cat.name });
        }
      }
    }
    return list;
  }, [name]);

  // 来自 PPT 的领军人物 bio
  const leaderInfo = LEADERS.find(l => l.name === name);

  // 面包屑：根据来源动态构造（首页 → 赛道 → 产品 → 经理）
  const fromCatObj = fromCat ? CATS.find(c => c.id === fromCat) : null;
  const fromFund = fromFc && fromCat ? (MF[fromCat] || []).find(x => x.c === fromFc) : null;
  const crumbs = [
    { label: "首页", onClick: () => go("home") },
    fromCatObj && { label: fromCatObj.name, onClick: () => go("list", { cat: fromCat }) },
    fromFund   && { label: fromFund.n,     onClick: () => go("detail", { fc: fromFc, cat: fromCat }) },
    { label: name, active: true },
  ].filter(Boolean);

  return (
    <div style={{minHeight:"100vh",background:T.bg}}>
      <InnerHeader crumbs={crumbs}/>
      <div className="rw" style={{padding:"32px 24px 64px"}}>
        {/* 经理 Hero */}
        <div style={{background:`linear-gradient(135deg,${T.navy} 0%,${T.navyDeep} 50%,#0a1530 100%)`,padding:isMob?"32px 20px":"48px",borderRadius:16,marginBottom:24,position:"relative",overflow:"hidden",...fadeUp(entered, 0)}}>
          <div style={{position:"absolute",top:"-40%",right:"5%",width:380,height:380,borderRadius:"50%",background:`radial-gradient(circle,${T.gold}12,transparent 70%)`,pointerEvents:"none"}}/>
          <div style={{position:"relative",zIndex:1}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:".2em",color:T.gold,marginBottom:12}}>FUND MANAGER PROFILE</div>
            <h1 style={{fontFamily:T.disp,fontSize:isMob?32:44,fontWeight:800,color:"#fff",margin:0,letterSpacing:"-.02em"}}>{name}</h1>
            {leaderInfo && <div style={{fontSize:14,color:T.gold,marginTop:8}}>{leaderInfo.title}</div>}
            <div style={{fontSize:13,color:"rgba(255,255,255,0.65)",marginTop:14,lineHeight:1.8,maxWidth:680}}>
              {leaderInfo?.bio || m?.desc || "中欧基金量化团队基金经理"}
            </div>
            <div style={{display:"flex",gap:isMob?20:32,marginTop:28,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:4,letterSpacing:".06em"}}>管理产品</div>
                <span style={{fontSize:isMob?20:24,fontWeight:700,fontFamily:T.num,color:"#fff"}}>{managedFunds.length}</span><span style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.45)",marginLeft:3}}>只</span>
              </div>
              <div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:4,letterSpacing:".06em"}}>总管理规模</div>
                <span style={{fontSize:isMob?20:24,fontWeight:700,fontFamily:T.num,color:"#fff"}}>{szs(managedFunds.reduce((s, f) => s + (f.sz || 0), 0))}</span>
              </div>
              <div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:4,letterSpacing:".06em"}}>平均 YTD 超额</div>
                {(() => {
                  const validExc = managedFunds.filter(f => (f.exc||{}).rytd != null);
                  const avg = validExc.length ? validExc.reduce((s, f) => s + f.exc.rytd, 0) / validExc.length : null;
                  return <span style={{fontSize:isMob?20:24,fontWeight:700,fontFamily:T.num,color:avg == null ? "rgba(255,255,255,.3)" : (avg >= 0 ? "#ff8888" : "#5eedb8")}}>{avg == null ? "—" : pct(avg)}</span>;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* 管理产品列表 */}
        <div style={{padding:isMob?20:28,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,...fadeUp(entered, .1)}}>
          <div style={{fontSize:14,fontWeight:600,color:T.navy,marginBottom:18}}>管理产品（{managedFunds.length} 只）</div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
            {managedFunds.map(f => (
              <div key={f.c} onClick={() => go("detail", { fc: f.c, cat: f.catId })} style={{padding:18,background:T.bg,borderRadius:10,border:`1px solid ${T.lineLight}`,cursor:"pointer",transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.navyLight;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 16px rgba(26,50,100,0.08)"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.lineLight;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:10}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:T.navy,marginBottom:4}}>{f.n}</div>
                    <div style={{fontSize:11,color:T.text3,fontFamily:T.mono}}>{f.c}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:600,color:T.navy,background:T.navyPale,padding:"3px 9px",borderRadius:4,whiteSpace:"nowrap"}}>{f.catName}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:14,paddingTop:12,borderTop:`1px dashed ${T.lineLight}`}}>
                  <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>YTD超额</div><Ret v={(f.exc||{}).rytd}/></div>
                  <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>近1年超额</div><Ret v={(f.exc||{}).r1y}/></div>
                  <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>规模</div><span style={{fontFamily:T.mono,fontSize:13,fontWeight:600,color:T.navy}}>{szs(f.sz)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// QUANT APP (模块入口)
// ============================================================
export default function QuantApp({onBack, onLogout}) {
  const [pg, setPg] = useState("home");
  const [pr, setPr] = useState({});
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const go = useCallback((p, params = {}) => { if(p==="portal"&&onBack){onBack();return;} setPg(p); setPr(params); }, [onBack]);

  useEffect(() => {
    loadData()
      .then(r => { if(r==='need_login'&&onLogout)onLogout(); else setReady(true); })
      .catch(e => { console.error(e); setErr(e.message); });
  }, []);

  if (err) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.body,background:T.bg}}>
      <div style={{textAlign:"center",color:T.text3}}>
        <div style={{fontSize:32,marginBottom:16,opacity:.3}}>⚠</div>
        <div style={{fontSize:15,color:T.text1,marginBottom:8}}>数据加载失败</div>
        <div style={{fontSize:13}}>{err}</div>
        <div style={{fontSize:12,marginTop:16,color:T.navyLight,cursor:"pointer"}} onClick={onBack}>← 返回门户</div>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.body,background:T.bg}}>
      <div style={{textAlign:"center"}}>
        <div style={{display:"inline-flex",gap:6,marginBottom:16}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:T.gold,animation:"shimmer 1s infinite"}}/>
          <div style={{width:7,height:7,borderRadius:"50%",background:T.gold,opacity:.5,animation:"shimmer 1s .2s infinite"}}/>
        </div>
        <div style={{fontSize:13,color:T.text3}}>正在加载量化数据...</div>
      </div>
    </div>
  );

  return (
    <Ctx.Provider value={{ pg, pr, go, onBack, onLogout }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap');
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes progress{0%{width:0%}100%{width:100%}}
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.line};border-radius:3px}
        ::selection{background:${T.navyPale}}
        input::placeholder{color:${T.text3}}
        input:focus,select:focus{border-color:${T.navyLight} !important;box-shadow:0 0 0 3px ${T.navyPale};outline:none}
        .rw{max-width:1400px;margin:0 auto}
        @media(max-width:768px){
          .rw{padding-left:16px !important;padding-right:16px !important}
        }
      `}</style>
      <div style={{height:"100vh",overflow:"auto",background:T.bg,color:T.text2,fontFamily:T.body,WebkitFontSmoothing:"antialiased"}}>
        {pg === "home"    && <Home/>}
        {pg === "list"    && <List/>}
        {pg === "detail"  && <Detail/>}
        {pg === "manager" && <ManagerPage/>}
      </div>
    </Ctx.Provider>
  );
}
