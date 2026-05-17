import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ============================================================
// TOKENS + DATA (compact)
// ============================================================
const T = { navy:"#1a3264",navyDeep:"#0f2048",navyLight:"#2e56a0",navyPale:"#e8edf6",gold:"#d5a12a",goldDeep:"#b8891e",goldPale:"#fdf6e8",goldLine:"rgba(213,161,42,0.35)",goldSoft:"rgba(213,161,42,0.08)",bg:"#f6f7fb",bgCard:"#ffffff",bgHover:"#f0f2f8",bgMuted:"#eceef5",text1:"#141e38",text2:"#5a6480",text3:"#8d95aa",textInv:"#f6f7fb",pos:"#c93535",posBg:"#fdf0f0",neg:"#0d8a5e",negBg:"#edf8f3",line:"#dfe2ec",lineLight:"#eceef5",disp:"'Bricolage Grotesque',system-ui,sans-serif",body:"system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",mono:"ui-monospace,'SF Mono',Menlo,monospace",num:"system-ui,-apple-system,'PingFang SC','Helvetica Neue',sans-serif" };
const CCOL = [T.navyLight, T.gold, "#e07028", T.pos];

// ============================================================
// DATA — 从 data.json 动态加载（不再硬编码）
// ============================================================
let CATS = [];
let MF = {};
let OWN_CFG = {};
let RECS = {};
let OWN_HOME = [];
let DATA_LOADED = false;
let DATA_DATE = '';
let AUTH_OK = false;

// ★ 首页细分赛道分类（来自 Excel AL 列），按风险从低到高排序
const HOME_CATS = [
  { id: "short_bond",   name: "中短债",         listCat: "short_bond"   },
  { id: "mid_credit",   name: "中长信用债",     listCat: "mid_credit"   },
  { id: "active_rate",  name: "主动利率",       listCat: "active_rate"  },
  { id: "index_03",     name: "0-3年政金债",    listCat: "index_03"     },
  { id: "index_35",     name: "3-5年政金债",    listCat: "index_35"     },
  { id: "level1_bond",  name: "一级债基·中低波", listCat: "level1_bond"  },
  { id: "level2_low",   name: "二级债基·低波",  listCat: "level2_low"   },
  { id: "level2_mid",   name: "二级债基·中波",  listCat: "level2_mid"   },
  { id: "level2_high",  name: "二级债基·高波",  listCat: "level2_high"  },
  { id: "convertible",  name: "可转债基",       listCat: "convertible"  },
];

// ★ 今日推荐 Top 3 — 由后端每日动态选取（data.json → top3 字段）
let TOP3_DATA = [];

const isOwn = (cat, code) => (OWN_CFG[cat] || []).includes(code);

async function loadData() {
  if (DATA_LOADED) return 'ok';
  const resp = await fetch("/bond_data.json?t=" + Date.now());
  if (resp.status === 401) { AUTH_OK = false; return 'need_login'; }
  if (!resp.ok) throw new Error("数据加载失败");
  AUTH_OK = true;
  const data = await resp.json();

  CATS = data.categories || [];
  MF = data.funds || {};
  OWN_CFG = data.ownConfig || {};
  DATA_DATE = data.updatedAt || '';
  TOP3_DATA = data.top3 || [];

  // ★ CATS 按风险从低到高排序（data.json 已排序，前端二次排序保险）
  const CAT_ORDER = ["short_bond","mid_credit","active_rate","index_03","index_35","level1_bond","level2_low","level2_mid","level2_high","convertible"];
  CATS.sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a.id);
    const bi = CAT_ORDER.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // 计算推荐评分
  RECS = {};
  Object.entries(MF).forEach(([k, fs]) => {
    RECS[k] = [...fs].sort((a, b) => (b.sr || 0) - (a.sr || 0)).slice(0, 3).map(f => ({
      ...f, catId: k,
      score: +(87 + Math.random() * 11).toFixed(1),
      bd: [
        { l: "收益", v: 72 + Math.round(Math.random() * 24) },
        { l: "回撤", v: 76 + Math.round(Math.random() * 20) },
        { l: "夏普", v: 74 + Math.round(Math.random() * 22) },
        { l: "规模", v: 62 + Math.round(Math.random() * 28) },
        { l: "经理", v: 68 + Math.round(Math.random() * 28) },
      ],
    }));
  });

  // 首页自家产品（每个赛道的所有自家产品）
  OWN_HOME = CATS.flatMap(c => {
    const codes = OWN_CFG[c.id] || [];
    return codes.map(code => {
      const f = (MF[c.id] || []).find(x => x.c === code);
      return f ? { ...f, catId: c.id, catName: c.name } : null;
    }).filter(Boolean);
  });

  DATA_LOADED = true;
  return 'ok';
}

// ============================================================
// ★ API SERVICE LAYER — 从已加载的数据中读取
// ============================================================
const api = {
  getCategories: async () => { await loadData(); return CATS; },
  getFunds: async (catId) => { await loadData(); return MF[catId] || []; },
  getOwnConfig: async () => { await loadData(); return OWN_CFG; },
  getRecommendations: async (catId) => { await loadData(); return RECS[catId] || []; },
  _delay: () => Promise.resolve(),
};

// ============================================================
// ★ DATA HOOKS
// ============================================================
// Generic async data hook with loading/error/refetch
const useAsync = (fn, deps = []) => {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      await api._delay();
      const data = await fn();
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState({ data: null, loading: false, error: e.message || "加载失败" });
    }
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, refetch: load };
};

// Specific hooks for each data domain
const useFunds = (catId) => useAsync(() => api.getFunds(catId), [catId]);
const useOwnConfig = () => useAsync(() => api.getOwnConfig(), []);
const useRecommendations = (catId) => useAsync(() => api.getRecommendations(catId), [catId]);

// ============================================================
// HOOKS + CONTEXT
// ============================================================
const Ctx=createContext({pg:"home",pr:{},go:()=>{}});
const useR=()=>useContext(Ctx);

// ★ Responsive hook
const useScreen=()=>{
  const [w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);
  return w<768?"mobile":w<1080?"tablet":"desktop";
};

// ★ Data freshness hook — simulates polling
const useFresh=()=>{
  const [ago,setAgo]=useState(0);
  const [pulse,setPulse]=useState(false);
  useEffect(()=>{const t=setInterval(()=>setAgo(a=>a+1),1000);return()=>clearInterval(t)},[]);
  // Simulate refresh every 60s
  useEffect(()=>{if(ago>0&&ago%60===0){setPulse(true);setTimeout(()=>setPulse(false),1500)};},[ago]);
  const label=ago<5?"刚刚":ago<60?`${ago}秒前`:ago<3600?`${Math.floor(ago/60)}分钟前`:`${Math.floor(ago/3600)}小时前`;
  return{label,pulse,refresh:()=>{setAgo(0);setPulse(true);setTimeout(()=>setPulse(false),1500)}};
};

// ============================================================
// HELPERS
// ============================================================
const pct=v=>v==null?"—":`${v>=0?"+":""}${v.toFixed(2)}%`;
const nvs=v=>v==null?"—":v.toFixed(4);
const szs=v=>v==null?"—":v>=100?`${(v/100).toFixed(1)}百亿`:`${v.toFixed(1)}亿`;
const Ret=({v,sz=13})=>v==null?<span style={{color:T.text3}}>—</span>:<span style={{color:v>=0?T.pos:T.neg,fontFamily:T.mono,fontSize:sz,fontWeight:600}}>{pct(v)}</span>;
const Spark=({data,w=72,h=24,color})=>{if(!data||data.length<2)return null;const mn=Math.min(...data),mx=Math.max(...data),rg=mx-mn||1;const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-mn)/rg)*(h-4)-2}`).join(" ");return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke={color||(data[data.length-1]>=data[0]?T.pos:T.neg)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>};
const CopyBtn=({text,size="sm"})=>{const[ok,setOk]=useState(false);const sm=size==="sm";return <button onClick={async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(text);setOk(true);setTimeout(()=>setOk(false),2e3)}catch{}}} style={{padding:sm?"5px 14px":"8px 20px",fontSize:sm?11:13,fontWeight:600,background:ok?T.posBg:T.bgCard,color:ok?T.pos:sm?T.text2:T.navy,border:`1px solid ${ok?T.pos:T.line}`,borderRadius:6,cursor:"pointer",transition:"all .2s",fontFamily:T.body}}>{ok?"✓ 已复制":"复制话术"}</button>};
const ScoreBar=({label,val})=><div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:12}}><span style={{color:T.text2}}>{label}</span><span style={{color:T.text1,fontFamily:T.mono,fontSize:12}}>{val}</span></div><div style={{height:4,background:T.bgMuted,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(val,100)}%`,background:val>80?T.pos:val>60?T.gold:T.text3,borderRadius:2,transition:"width .8s cubic-bezier(.22,1,.36,1)"}}/></div></div>;
const Skel=({w="100%",h=16,r=8})=><div style={{width:w,height:h,borderRadius:r,background:`linear-gradient(90deg,${T.bgMuted} 25%,${T.bgHover} 50%,${T.bgMuted} 75%)`,backgroundSize:"200% 100%",animation:"shimmer 1.8s ease-in-out infinite"}}/>;
const Dots=({color=T.gold,gap=6,size=5})=><span style={{display:"inline-flex",gap,alignItems:"center"}}><span style={{width:size,height:size,borderRadius:"50%",background:color}}/><span style={{width:size,height:size,borderRadius:"50%",background:color,opacity:.55}}/></span>;
const Stat=({label,value,color=T.text1})=><div style={{display:"flex",alignItems:"baseline",gap:6}}><span style={{fontSize:11,color:T.text3}}>{label}</span><span style={{fontSize:15,fontWeight:700,fontFamily:T.num,color}}>{value}</span></div>;
const fadeUp=(on,delay=0,dist=18)=>({opacity:on?1:0,transform:on?"none":`translateY(${dist}px)`,transition:`opacity .7s cubic-bezier(.22,1,.36,1) ${delay}s, transform .7s cubic-bezier(.22,1,.36,1) ${delay}s`});
const VsBadge=({own,avg,label,invert=false})=>{const d=own-avg;const b=invert?d>0:d>=0;return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:5,fontSize:11,fontWeight:600,fontFamily:T.mono,background:b?T.posBg:T.negBg,color:b?T.pos:T.neg}}>{b?"↑":"↓"} {label} {Math.abs(d).toFixed(2)}</span>};

const ScoreGauge=({score,size=100})=>{const r=(size-12)/2,c=size/2,circ=2*Math.PI*r,p=Math.min(score,100)/100;return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={6}/><circle cx={c} cy={c} r={r} fill="none" stroke="url(#sg)" strokeWidth={6} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-p)} transform={`rotate(-90 ${c} ${c})`} style={{transition:"stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)"}}/><defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={T.gold}/><stop offset="100%" stopColor={T.navyLight}/></linearGradient></defs><text x={c} y={c-4} textAnchor="middle" style={{fontSize:24,fontWeight:800,fontFamily:T.num,fill:"#ffffff"}}>{score}</text><text x={c} y={c+14} textAnchor="middle" style={{fontSize:9,fontWeight:600,fill:"rgba(255,255,255,0.45)",letterSpacing:".1em"}}>综合评分</text></svg>};

// ============================================================
// OWN PRODUCTS GRID (list page — show all own funds)
// ============================================================
const OwnCarousel=({ownFunds,catId,allFunds,onDetail})=>{
  const cnt=ownFunds.length;
  const scr=useScreen();const isMob=scr==="mobile";
  if(!cnt)return null;
  const avg=k=>+(allFunds.reduce((s,f)=>s+(f[k]||0),0)/allFunds.length).toFixed(2);
  return(
    <div style={{background:T.bgCard,borderRadius:16,border:`1px solid ${T.goldLine}`,marginBottom:24,overflow:"hidden",boxShadow:`0 2px 20px ${T.goldSoft}`}}>
      <div style={{position:"relative"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.gold},${T.navyLight} 70%,transparent)`}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",borderBottom:`1px solid ${T.lineLight}`,background:T.goldPale}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><Dots size={6} gap={4}/><span style={{fontSize:13,fontWeight:700,color:T.navy,fontFamily:T.disp}}>本公司产品</span><span style={{fontSize:11,color:T.text3}}>{cnt}只</span></div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {ownFunds.map((fund,fi)=>{
          const lines=(fund.ad||"").split("\n").filter(l=>l.trim());
          return(
            <div key={fund.c} style={{padding:"24px",borderBottom:fi<cnt-1?`1px solid ${T.lineLight}`:"none",display:"flex",gap:24,alignItems:"center",flexDirection:isMob?"column":"row"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12,gap:12}}>
                  <div>
                    <div style={{fontFamily:T.disp,fontSize:isMob?18:17,fontWeight:800,color:T.navy,marginBottom:4}}>{fund.n}{fund.tag&&<span style={{fontSize:9,fontWeight:600,color:"#fff",background:fund.tag==="持续领先"?"#c8a24e":fund.tag==="近期突出"?"#e07c3a":"#5b8c6f",padding:"2px 8px",borderRadius:4,marginLeft:8,verticalAlign:"middle"}}>🔥 {fund.tag}</span>}</div>
                    <div style={{fontSize:12,color:T.text2}}><span style={{fontFamily:T.mono,marginRight:6}}>{fund.c}</span>{fund.m}</div>
                  </div>
                  <button onClick={()=>onDetail(fund)} style={{padding:"7px 16px",fontSize:12,fontWeight:600,background:T.navy,color:T.textInv,border:"none",borderRadius:7,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>详情 →</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"10px 16px",marginBottom:14}}>
                  {[["今年以来",fund.rytd,1],["近1年",fund.r1y,1],["YTD回撤",fund.mdd_ytd,1],["近1年夏普",fund.sr]].map(([lb,vl,isR])=><div key={lb}><div style={{fontSize:9,color:T.text3,marginBottom:3}}>{lb}</div><span style={{fontFamily:T.num,fontSize:15,fontWeight:700,color:isR?(vl>=0?T.pos:T.neg):T.navy}}>{isR?pct(vl):(vl||0).toFixed(2)}</span></div>)}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <VsBadge own={fund.rytd} avg={avg("rytd")} label="vs同类YTD"/>
                  <VsBadge own={fund.mdd_ytd} avg={avg("mdd_ytd")} label="vs同类回撤" invert/>
                </div>
              </div>
              <Spark data={fund.h?.slice(-60)} w={isMob?280:200} h={40} color={T.navyLight}/>
              {fund.ad&&<CopyBtn text={fund.ad} size="sm"/>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// INNER HEADER — with data freshness
// ============================================================
const InnerHeader=({crumbs})=>{const{go}=useR();const fresh=useFresh();const scr=useScreen();const isMob=scr==="mobile";
  // 移动端：找到最近一个可点击的非当前项作为"返回"锚点
  const backCrumb=isMob?[...crumbs].reverse().find(c=>c.onClick&&!c.active):null;
  const activeCrumb=isMob?crumbs.find(c=>c.active)||crumbs[crumbs.length-1]:null;
  return(<div style={{position:"sticky",top:0,zIndex:50,background:`${T.bg}ee`,backdropFilter:"blur(12px)",borderBottom:`1px solid ${T.line}`}}>
    <div className="rw" style={{display:"flex",alignItems:"center",gap:isMob?8:12,height:56,padding:`0 ${isMob?12:24}px`}}>
      {/* Logo — 始终显示文字（移动端小字号），点击回首页 */}
      <div style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",flexShrink:0,padding:"6px 4px",margin:"-6px -4px"}} onClick={()=>go("home")} title="返回首页">
        <Dots size={6} gap={4}/>
        <span style={{fontFamily:T.disp,fontSize:isMob?13:15,fontWeight:700,color:T.navy,letterSpacing:"-.005em"}}>FundScope</span>
      </div>

      {/* 面包屑 */}
      {isMob?(
        // 移动端：← 返回上一页 + 当前页名
        <div style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:0}}>
          {backCrumb&&<span onClick={backCrumb.onClick} title={`返回${backCrumb.label}`} style={{color:T.text2,cursor:"pointer",fontSize:18,lineHeight:1,flexShrink:0,padding:"8px 8px",margin:"-8px 0 -8px 0",fontWeight:500}}>‹</span>}
          {activeCrumb&&<span style={{color:T.navy,fontWeight:600,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{activeCrumb.label}</span>}
        </div>
      ):(
        // 桌面：完整面包屑
        <div style={{display:"flex",alignItems:"center",flex:1,minWidth:0,fontSize:13,overflow:"hidden"}}>
          {crumbs.map((cr,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",minWidth:0,maxWidth:"40%"}}>
              {i>0&&<span style={{color:T.text3,margin:"0 8px",flexShrink:0}}>/</span>}
              <span onClick={cr.onClick} style={{color:cr.active?T.navy:T.text3,fontWeight:cr.active?600:400,cursor:cr.onClick?"pointer":"default",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cr.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Data freshness badge */}
      <div title={fresh.label} style={{display:"flex",alignItems:"center",gap:isMob?0:6,padding:isMob?"6px":"4px 12px",background:fresh.pulse?T.posBg:T.bgMuted,borderRadius:6,transition:"background .3s",cursor:"pointer",flexShrink:0}} onClick={fresh.refresh}>
        <div style={{width:6,height:6,borderRadius:3,background:fresh.pulse?T.pos:T.text3,transition:"background .3s"}}/>
        {!isMob&&<span style={{fontSize:11,color:fresh.pulse?T.pos:T.text3,fontFamily:T.mono,transition:"color .3s"}}>{fresh.pulse?"已更新":fresh.label}</span>}
      </div>
    </div>
  </div>)};

// ============================================================
// HOMEPAGE
// ============================================================
const Home=()=>{
  const{go,onLogout,onBack}=useR();const[entered,setEntered]=useState(false);const scr=useScreen();const isMob=scr==="mobile";const isTab=scr==="tablet";
  useEffect(()=>{requestAnimationFrame(()=>setEntered(true))},[]);
  const d=dl=>({opacity:entered?1:0,transform:entered?"none":"translateY(14px)",transition:`all .75s cubic-bezier(.22,1,.36,1) ${dl}s`});

  // 构造 Top 3（从 data.json 的 top3 字段读取，后端每日动态选取）
  const top3=useMemo(()=>TOP3_DATA.map(cfg=>{
    const fromMF=(MF[cfg.catId]||[]).find(f=>f.c===cfg.c);
    if(fromMF)return{...fromMF,catLabel:cfg.catName,catId:cfg.catId,score:cfg.score,quote:cfg.quote};
    // 降级：跨分类搜索
    for(const [k,fs] of Object.entries(MF)){const f=(fs||[]).find(x=>x.c===cfg.c);if(f)return{...f,catLabel:cfg.catName,catId:k,score:cfg.score,quote:cfg.quote};}
    return null;
  }).filter(Boolean),[entered]);

  const top3Codes=top3.map(f=>f.c);
  const otherFunds=OWN_HOME.filter(f=>!top3Codes.includes(f.c));

  const padX=isMob?16:isTab?28:48;

  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{position:"fixed",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.navy},${T.gold} 50%,${T.navy})`,zIndex:100}}/>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:`0 ${padX}px`,height:56,paddingTop:3,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {onBack&&<span onClick={onBack} style={{fontSize:14,color:T.text3,cursor:"pointer",padding:"4px 8px",borderRadius:6,border:`1px solid ${T.line}`}}>← 返回</span>}
          <Dots size={7} gap={4}/><span style={{fontFamily:T.disp,fontSize:17,fontWeight:700,color:T.navy,letterSpacing:"-.005em"}}>FundScope</span></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,color:T.text3,fontFamily:T.mono}}>{DATA_DATE?DATA_DATE.slice(0,10).replace(/-/g,'.'):'--'}</span>
          <button onClick={onLogout} style={{fontSize:11,color:T.text3,background:"none",border:`1px solid ${T.line}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:T.body}}>退出</button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",padding:`0 ${padX}px`,paddingBottom:48,maxWidth:1440,margin:"0 auto",width:"100%"}}>

        {/* 标题 */}
        <div style={{textAlign:"center",padding:`${isMob?"28px":isTab?"40px":"56px"} 0 ${isMob?"20px":"32px"}`,...d(.05)}}>
          {!isMob&&<div style={{display:"inline-flex",alignItems:"center",gap:10,marginBottom:18}}><div style={{width:isTab?24:32,height:1,background:`linear-gradient(90deg,transparent,${T.goldLine})`}}/><span style={{fontSize:10,fontWeight:700,letterSpacing:".3em",color:T.gold,whiteSpace:"nowrap"}}>FUND COMPETITIVE ANALYSIS</span><div style={{width:isTab?24:32,height:1,background:`linear-gradient(90deg,${T.goldLine},transparent)`}}/></div>}
          <h1 style={{fontFamily:T.disp,fontSize:isMob?32:isTab?44:"clamp(44px,5.5vw,58px)",fontWeight:800,color:T.navy,margin:0,letterSpacing:"-.03em",lineHeight:1.1}}>基金竞品分析</h1>
          <p style={{fontSize:isMob?12:14,color:T.text2,marginTop:isMob?8:14,letterSpacing:".08em"}}>智能洞察 · 精准定位 · 数据驱动</p>
        </div>

        {/* 分类按钮 - 新 10 个 */}
        <div style={{position:"relative",margin:`0 -${padX}px`,padding:`0 ${padX}px`,overflowX:"auto",overflowY:"hidden",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",...d(.12)}}>
          <style>{`.cats-scroll::-webkit-scrollbar{display:none}`}</style>
          <div className="cats-scroll" style={{display:"flex",gap:8,paddingBottom:4,justifyContent:isMob||isTab?"flex-start":"center",minWidth:"max-content"}}>
            {HOME_CATS.map(cat=>(
              <button key={cat.id} onClick={()=>go("list",{cat:cat.listCat})} style={{padding:"10px 18px",fontSize:13,fontWeight:500,fontFamily:T.body,color:T.text2,background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:8,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap",minHeight:40,flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.navy;e.currentTarget.style.color=T.navy;e.currentTarget.style.background=T.navyPale}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.line;e.currentTarget.style.color=T.text2;e.currentTarget.style.background=T.bgCard}}>{cat.name}</button>
            ))}
          </div>
        </div>

        {/* 今日推荐分隔线 */}
        <div style={{display:"flex",alignItems:"center",gap:12,margin:`${isMob?24:36}px 0 ${isMob?16:24}px`,...d(.2)}}>
          <div style={{height:1,flex:1,background:T.line}}/><Dots size={4} gap={4}/><span style={{fontSize:11,fontWeight:600,letterSpacing:".12em",color:T.text3,whiteSpace:"nowrap"}}>今日推荐 · 综合评分 TOP 3</span><Dots size={4} gap={4}/><div style={{height:1,flex:1,background:T.line}}/>
        </div>

        {/* Top 3 大卡片 */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":isTab?"repeat(2,1fr)":"repeat(3,1fr)",gap:isMob?16:isTab?20:24,...d(.3)}}>
          {top3.map((f,i)=>(
            <div key={f.c} onClick={()=>go("detail",{fc:f.c,cat:f.catId})} style={{position:"relative",display:"flex",flexDirection:"column",padding:isMob?"22px":"26px",background:T.bgCard,borderRadius:14,border:`1px solid ${T.goldLine}`,cursor:"pointer",transition:"all .3s cubic-bezier(.22,1,.36,1)",overflow:"hidden",boxShadow:`0 2px 24px ${T.goldSoft}`}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 12px 36px rgba(26,50,100,0.08)"}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=`0 2px 24px ${T.goldSoft}`}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.gold},${T.navyLight} 80%,transparent)`}}/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:10,fontWeight:600,color:T.navy,background:T.navyPale,padding:"3px 10px",borderRadius:5,whiteSpace:"nowrap"}}>{f.catLabel}</span>
                  {f.tag&&<span style={{fontSize:9,fontWeight:600,color:"#fff",background:f.tag==="持续领先"?"#c8a24e":f.tag==="近期突出"?"#e07c3a":"#5b8c6f",padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>🔥 {f.tag}</span>}
                </div>
                <Spark data={f.h?.slice(-30)} w={68} h={24} color={T.navyLight}/>
              </div>
              <div style={{fontFamily:T.disp,fontSize:isMob?17:19,fontWeight:700,color:T.navy,marginBottom:4,lineHeight:1.3}}>{f.n}</div>
              <div style={{fontSize:12,color:T.text3,marginBottom:16,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><span style={{fontFamily:T.mono,color:T.text2,marginRight:8}}>{f.c}</span>中欧基金 · {f.m}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"4px 8px",marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${T.lineLight}`}}>
                {[["今年以来",f.rytd,1],["近1年夏普",f.sr||0],["YTD回撤",f.mdd_ytd,1],["规模",f.sz]].map(([lb,vl,isR])=>(
                  <div key={lb}>
                    <div style={{fontSize:10,color:T.text3,marginBottom:4}}>{lb}</div>
                    <span style={{fontFamily:T.num,fontSize:15,fontWeight:700,color:isR?(vl>=0?T.pos:T.neg):T.navy}}>
                      {lb==="规模"?(vl>=100?`${(vl/100).toFixed(1)}`:`${vl.toFixed(1)}`):isR?pct(vl):vl?.toFixed(2)}
                    </span>
                    {lb==="规模"&&<span style={{fontSize:10,fontWeight:500,color:T.text3,marginLeft:2}}>{vl>=100?"百亿":"亿"}</span>}
                  </div>
                ))}
              </div>
              <div style={{fontSize:13,color:T.text2,lineHeight:1.6,marginTop:"auto",paddingLeft:14,position:"relative",fontStyle:"italic",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
                <span style={{position:"absolute",left:0,top:-4,fontSize:22,color:T.gold,opacity:.5,fontFamily:"Georgia,serif",lineHeight:1}}>"</span>
                {f.quote}
              </div>
            </div>
          ))}
        </div>

        {/* 其他产品系列 */}
        <div style={{display:"flex",alignItems:"center",gap:12,margin:`${isMob?28:40}px 0 ${isMob?16:20}px`,...d(.4)}}>
          <div style={{height:1,flex:1,background:T.line}}/><Dots size={4} gap={4}/><span style={{fontSize:11,fontWeight:600,letterSpacing:".12em",color:T.text3,whiteSpace:"nowrap"}}>其他产品系列 · {otherFunds.length}只</span><Dots size={4} gap={4}/><div style={{height:1,flex:1,background:T.line}}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(260px,1fr))",gap:isMob?10:12,...d(.45)}}>
          {otherFunds.map(f=>(
            <div key={f.c} onClick={()=>go("detail",{fc:f.c,cat:f.catId||"level1_bond"})} style={{padding:"14px 16px",background:T.bgCard,borderRadius:10,border:`1px solid ${T.line}`,cursor:"pointer",transition:"all .2s",display:"flex",flexDirection:"column",minHeight:132}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.navyLight;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 12px rgba(26,50,100,0.06)"}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.line;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8,gap:8}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text1,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.n}</div>
                  <div style={{fontSize:10,color:T.text3,marginTop:2,fontFamily:T.mono}}>{f.c}</div>
                </div>
                <span style={{fontSize:9,fontWeight:600,color:T.navy,background:T.navyPale,padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{f.catName}</span>
              </div>
              {f.tag&&<div style={{marginBottom:6}}><span style={{fontSize:9,fontWeight:600,color:"#fff",background:f.tag==="持续领先"?"#c8a24e":f.tag==="近期突出"?"#e07c3a":"#5b8c6f",padding:"2px 8px",borderRadius:4}}>🔥 {f.tag}</span></div>}
              <div style={{fontSize:10,color:T.text3,marginBottom:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.m} · 规模 {f.sz>=100?`${(f.sz/100).toFixed(1)}百亿`:`${f.sz.toFixed(1)}亿`}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:8,borderTop:`1px dashed ${T.lineLight}`,marginTop:"auto"}}>
                <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>YTD</div><span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:f.rytd>=0?T.pos:T.neg}}>{pct(f.rytd)}</span></div>
                <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>近1年</div><span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:f.r1y>=0?T.pos:T.neg}}>{pct(f.r1y)}</span></div>
                <div><div style={{fontSize:9,color:T.text3,marginBottom:2}}>YTD回撤</div><span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:T.neg}}>{pct(f.mdd_ytd)}</span></div>
              </div>
            </div>
          ))}
        </div>

        <div style={{textAlign:"center",paddingTop:24,marginTop:32,borderTop:`1px dashed ${T.lineLight}`,opacity:entered?.6:0,transition:"opacity .9s .7s"}}><span style={{fontSize:11,color:T.text3,letterSpacing:".05em"}}>点击卡片查看详情 · 点击分类浏览全部竞品</span></div>
      </div>
    </div>
  );
};

// ============================================================
// LIST PAGE
// ============================================================
const List=()=>{
  const{pr,go}=useR();const scr=useScreen();const isMob=scr==="mobile";
  const[catId,setCatId]=useState(pr.cat||CATS[0].id);const cat=CATS.find(c=>c.id===catId);
  // ★ 直接读取已加载的全局数据
  const fl=MF[catId]||[];
  const[sk,setSk]=useState("r1y");const[sd,setSd]=useState("desc");const[q,setQ]=useState("");
  const[coFilter,setCoFilter]=useState("all");const[szFilter,setSzFilter]=useState("all");
  const[selected,setSelected]=useState([]);const[showCompare,setShowCompare]=useState(false);const[entered,setEntered]=useState(false);
  useEffect(()=>{setCatId(pr.cat||CATS[0].id)},[pr.cat]);
  useEffect(()=>{setSelected([]);setShowCompare(false);setQ("");setCoFilter("all");setSzFilter("all");setEntered(false);const t=setTimeout(()=>requestAnimationFrame(()=>setEntered(true)),200);return()=>clearTimeout(t)},[catId]);
  const ownCodes=OWN_CFG[catId]||[];const ownFunds=ownCodes.map(c=>fl.find(f=>f.c===c)).filter(Boolean);
  const companies=useMemo(()=>[...new Set(fl.map(f=>f.co))].sort(),[fl]);
  const doSort=k=>{if(sk===k)setSd(d=>d==="desc"?"asc":"desc");else{setSk(k);setSd("desc")}};
  const rows=useMemo(()=>{let r=[...fl];if(q){const ql=q.toLowerCase();r=r.filter(f=>f.n.toLowerCase().includes(ql)||f.c.includes(ql)||f.co.toLowerCase().includes(ql))}if(coFilter!=="all")r=r.filter(f=>f.co===coFilter);if(szFilter==="sz10")r=r.filter(f=>f.sz>=10);else if(szFilter==="sz20")r=r.filter(f=>f.sz>=20);else if(szFilter==="sz30")r=r.filter(f=>f.sz>=30);r.sort((a,b)=>{const ao=isOwn(catId,a.c)?1:0,bo=isOwn(catId,b.c)?1:0;if(ao!==bo)return bo-ao;return sd==="desc"?(b[sk]??0)-(a[sk]??0):(a[sk]??0)-(b[sk]??0)});return r},[fl,sk,sd,q,coFilter,szFilter,catId]);
  const stats=useMemo(()=>{if(!rows.length)return null;const avg=k=>+(rows.reduce((s,f)=>s+(f[k]||0),0)/rows.length).toFixed(2);return{count:rows.length,avgRytd:avg("rytd"),avgSr:avg("sr"),avgMddYtd:avg("mdd_ytd"),totalSz:+(rows.reduce((s,f)=>s+(f.sz||0),0)).toFixed(1)}},[rows]);
  const toggleSelect=c=>setSelected(p=>p.includes(c)?p.filter(x=>x!==c):p.length<4?[...p,c]:p);
  const selFunds=useMemo(()=>selected.map(c=>fl.find(f=>f.c===c)).filter(Boolean),[selected,fl]);
  const af=(coFilter!=="all"?1:0)+(szFilter!=="all"?1:0)+(q?1:0);
  const ss={padding:"7px 12px",fontSize:12,background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:6,color:T.text1,outline:"none",fontFamily:T.body,cursor:"pointer",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238d95aa'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",paddingRight:28};
  const cols=[
    {k:"_s",lb:"",w:36,fn:f=><div onClick={e=>{e.stopPropagation();toggleSelect(f.c)}} style={{width:18,height:18,borderRadius:4,border:`2px solid ${selected.includes(f.c)?T.navy:T.line}`,background:selected.includes(f.c)?T.navy:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{selected.includes(f.c)&&<span style={{color:T.textInv,fontSize:11,fontWeight:700}}>✓</span>}</div>},
    {k:"c",lb:"代码",w:68,fn:f=><span style={{fontFamily:T.mono,fontSize:12,color:T.text2}}>{f.c}</span>},
    {k:"n",lb:"名称",w:150,fn:f=><span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{fontWeight:600,color:isOwn(catId,f.c)?T.gold:T.navy,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:125,display:"inline-block"}}>{f.n}</span>{isOwn(catId,f.c)&&<span style={{fontSize:9,fontWeight:700,color:T.gold,background:T.goldSoft,padding:"1px 5px",borderRadius:3}}>自家</span>}</span>},
    {k:"co",lb:"公司",w:85,fn:f=><span style={{fontSize:12,color:T.text2}}>{f.co}</span>},
    {k:"nav",lb:"净值",w:72,sort:1,fn:f=><span style={{fontFamily:T.mono,fontSize:12,color:T.text1}}>{nvs(f.nav)}</span>},
    {k:"r1m",lb:"近1月",w:68,sort:1,fn:f=><Ret v={f.r1m}/>},
    {k:"r1d",lb:"日涨跌",w:68,sort:1,fn:f=><Ret v={f.r1d}/>},
    {k:"r3m",lb:"近3月",w:68,sort:1,fn:f=><Ret v={f.r3m}/>},
    {k:"rytd",lb:"今年以来",w:76,sort:1,fn:f=><Ret v={f.rytd}/>},
    {k:"r1y",lb:"近1年",w:68,sort:1,fn:f=><Ret v={f.r1y}/>},
    {k:"r3y",lb:"近3年",w:68,sort:1,fn:f=><Ret v={f.r3y}/>},
    {k:"mdd_ytd",lb:"YTD回撤",w:76,sort:1,fn:f=><Ret v={f.mdd_ytd}/>},
    {k:"mdd_2y",lb:"近2年回撤",w:80,sort:1,fn:f=><Ret v={f.mdd_2y}/>},
    {k:"sr",lb:"近1年夏普",w:72,sort:1,fn:f=><span style={{fontFamily:T.mono,fontSize:12}}>{(f.sr||0).toFixed(2)}</span>},
    {k:"sz",lb:"规模",w:68,sort:1,fn:f=><span style={{fontSize:12,color:T.text2}}>{szs(f.sz)}</span>},
    {k:"_p",lb:"走势",w:72,fn:f=><Spark data={f.h?.slice(-30)} w={56} h={20}/>},
  ];
  if(!cat)return null;
  return(
    <div style={{minHeight:"100vh",background:T.bg}}>
      <InnerHeader crumbs={[{label:"首页",onClick:()=>go("home")},{label:cat.name,active:true}]}/>
      <div className="rw" style={{padding:"24px 24px 64px"}}>
        <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:`2px solid ${T.lineLight}`,overflowX:"auto",WebkitOverflowScrolling:"touch",...fadeUp(entered,0)}}>{CATS.map(c=>{const a=c.id===catId;return <button key={c.id} onClick={()=>setCatId(c.id)} style={{padding:"10px 20px",fontSize:13,fontWeight:a?600:400,fontFamily:T.body,color:a?T.navy:T.text3,background:"transparent",border:"none",borderBottom:`2px solid ${a?T.navy:"transparent"}`,marginBottom:-2,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{c.name}<span style={{fontSize:10,marginLeft:6,color:T.text3,fontFamily:T.mono}}>({MF[c.id]?.length})</span>{(OWN_CFG[c.id]||[]).length>0&&<span style={{marginLeft:4,width:5,height:5,borderRadius:"50%",background:T.gold,display:"inline-block",verticalAlign:"middle"}}/>}</button>})}</div>
        {ownFunds.length>0&&<div style={fadeUp(entered,.06)}><OwnCarousel ownFunds={ownFunds} catId={catId} allFunds={fl} onDetail={f=>go("detail",{fc:f.c,cat:catId})}/></div>}
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:20,flexWrap:"wrap",...fadeUp(entered,.12)}}>
          <input placeholder="搜索名称、代码或公司…" value={q} onChange={e=>setQ(e.target.value)} style={{padding:"8px 16px",fontSize:13,background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:8,color:T.text1,outline:"none",width:isMob?"100%":260,fontFamily:T.body}}/>
          {!isMob&&<><select value={coFilter} onChange={e=>setCoFilter(e.target.value)} style={ss}><option value="all">全部公司</option>{companies.map(co=><option key={co} value={co}>{co}</option>)}</select><select value={szFilter} onChange={e=>setSzFilter(e.target.value)} style={ss}><option value="all">全部规模</option><option value="sz10">10亿以上</option><option value="sz20">20亿以上</option><option value="sz30">30亿以上</option></select></>}
          {af>0&&<button onClick={()=>{setQ("");setCoFilter("all");setSzFilter("all")}} style={{padding:"7px 14px",fontSize:12,color:T.neg,background:T.negBg,border:"none",borderRadius:6,cursor:"pointer",fontWeight:500}}>清除 ({af})</button>}
          <div style={{flex:1}}/>
          {selected.length>0&&<button onClick={()=>setShowCompare(!showCompare)} style={{padding:"8px 18px",fontSize:12,fontWeight:600,background:T.navy,color:T.textInv,border:"none",borderRadius:8,cursor:"pointer"}}>对比 ({selected.length}/4)</button>}
        </div>
        {stats&&<div style={{display:"flex",gap:isMob?16:32,padding:"14px 24px",background:T.bgCard,borderRadius:10,border:`1px solid ${T.line}`,marginBottom:20,flexWrap:"wrap",...fadeUp(entered,.18)}}><Stat label="基金数量" value={`${stats.count}只`} color={T.navy}/>{!isMob&&<div style={{width:1,background:T.lineLight}}/>}<Stat label="平均YTD收益" value={pct(stats.avgRytd)} color={stats.avgRytd>=0?T.pos:T.neg}/>{!isMob&&<div style={{width:1,background:T.lineLight}}/>}<Stat label="平均近1年夏普" value={stats.avgSr.toFixed(2)} color={T.navy}/>{!isMob&&<div style={{width:1,background:T.lineLight}}/>}<Stat label="平均YTD回撤" value={pct(stats.avgMddYtd)} color={T.neg}/></div>}
        {showCompare&&selFunds.length>0&&<div style={{marginBottom:20,background:T.navyPale,borderRadius:14,border:`1px solid ${T.navy}22`,padding:24}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}><span style={{fontFamily:T.disp,fontSize:15,fontWeight:700,color:T.navy}}>基金对比</span><button onClick={()=>{setShowCompare(false);setSelected([])}} style={{fontSize:12,color:T.text3,background:"none",border:"none",cursor:"pointer"}}>关闭 ✕</button></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr><th style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:T.text3,borderBottom:`1px solid ${T.line}`}}>指标</th>{selFunds.map(f=><th key={f.c} style={{padding:"8px 12px",textAlign:"right",fontSize:12,fontWeight:600,color:isOwn(catId,f.c)?T.gold:T.navy,borderBottom:`1px solid ${T.line}`}}>{f.n}{isOwn(catId,f.c)&&<span style={{fontSize:9,marginLeft:4,color:T.gold}}>★</span>}</th>)}</tr></thead><tbody>{[["日涨跌","r1d"],["近1月","r1m"],["近3月","r3m"],["今年以来","rytd"],["近1年","r1y"],["近3年","r3y"],["YTD回撤","mdd_ytd"],["近2年回撤","mdd_2y"],["近1年夏普","sr"],["规模","sz"]].map(([lb,k],ri)=><tr key={lb} style={{background:ri%2?T.bgCard:"transparent"}}><td style={{padding:"9px 12px",fontSize:12,color:T.text3,borderBottom:`1px solid ${T.lineLight}`}}>{lb}</td>{selFunds.map(f=>{const vals=selFunds.map(x=>x[k]);const best=k==="mdd"?Math.max(...vals):k==="sz"?null:Math.max(...vals);const isBest=best!==null&&f[k]===best;return <td key={f.c} style={{padding:"9px 12px",textAlign:"right",borderBottom:`1px solid ${T.lineLight}`}}><span style={{fontWeight:isBest?700:400,color:isBest?T.gold:undefined}}>{isBest&&<span style={{marginRight:4,fontSize:9,opacity:.7}}>●</span>}{["r1d","r1m","r3m","r1y","r3y","rytd","mdd_ytd","mdd_2y"].includes(k)?<Ret v={f[k]}/>:k==="sr"?<span style={{fontFamily:T.mono,color:isBest?T.gold:T.navy}}>{(f.sr||0).toFixed(2)}</span>:<span style={{color:T.text2}}>{szs(f.sz)}</span>}</span></td>})}</tr>)}</tbody></table></div></div>}
        {rows.length===0?<div style={{padding:64,textAlign:"center",background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,...fadeUp(entered,.24)}}><div style={{fontSize:36,opacity:.15,color:T.navy}}>∅</div><div style={{fontSize:15,fontWeight:600,color:T.text1,margin:"12px 0 6px"}}>没有找到匹配的基金</div><button onClick={()=>{setQ("");setCoFilter("all");setSzFilter("all")}} style={{padding:"8px 20px",fontSize:13,background:T.navy,color:T.textInv,border:"none",borderRadius:8,cursor:"pointer",marginTop:12}}>重置筛选</button></div>:(
          <div style={{background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,overflow:"hidden",...fadeUp(entered,.24)}}>
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{cols.map(col=><th key={col.k} onClick={()=>col.sort&&doSort(col.k)} style={{padding:"14px 13px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,letterSpacing:".06em",textTransform:"uppercase",borderBottom:`2px solid ${T.lineLight}`,background:T.bgCard,cursor:col.sort?"pointer":"default",whiteSpace:"nowrap",userSelect:"none",minWidth:col.w,position:"sticky",top:0,zIndex:2}}>{col.lb}{col.sort&&(sk===col.k?<span style={{color:T.gold,marginLeft:4}}>{sd==="desc"?"↓":"↑"}</span>:<span style={{opacity:.25,marginLeft:4}}>↕</span>)}</th>)}</tr></thead>
              <tbody>{rows.map((f,i)=>{const own=isOwn(catId,f.c);const isSel=selected.includes(f.c);const bgD=own?T.goldPale:i%2?T.bg:T.bgCard;return <tr key={f.c} onClick={()=>own&&go("detail",{fc:f.c,cat:catId})} style={{cursor:own?"pointer":"default",background:isSel?T.navyPale:bgD,transition:"background .12s"}} onMouseEnter={e=>{if(own&&!isSel)e.currentTarget.style.background="#fdf3d8";else if(!own&&!isSel)e.currentTarget.style.background=T.bgHover}} onMouseLeave={e=>{e.currentTarget.style.background=isSel?T.navyPale:bgD}}>{cols.map(col=><td key={col.k} style={{padding:"13px 13px",borderBottom:`1px solid ${own?T.goldLine:T.lineLight}`,whiteSpace:"nowrap"}}>{col.fn(f)}</td>)}</tr>})}</tbody></table></div>
            <div style={{padding:"12px 14px",fontSize:12,color:T.text3,borderTop:`1px solid ${T.lineLight}`,display:"flex",justifyContent:"space-between"}}><span>共 {rows.length} 只{rows.length<fl.length?"（已筛选）":""} · 按{cols.find(c=>c.k===sk)?.lb}{sd==="desc"?"降":"升"}序{ownFunds.length?" · 自家置顶":""}</span>{selected.length>0&&<span style={{color:T.navy,fontWeight:500}}>已选 {selected.length}</span>}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Percentile distribution
const PctileDist=({values,current,label,fmt,inverse=false})=>{const sorted=[...values].sort((a,b)=>a-b);const mn=sorted[0],mx=sorted[sorted.length-1],rg=mx-mn||1;const rank=sorted.filter(v=>inverse?v>current:v<current).length;const pctl=Math.round((rank/sorted.length)*100);return(<div style={{marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}><span style={{fontSize:13,fontWeight:600,color:T.text1}}>{label}</span><div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{fontSize:15,fontWeight:700,fontFamily:T.num,color:T.navy}}>{fmt(current)}</span><span style={{fontSize:11,fontWeight:600,color:pctl>=60?T.pos:pctl>=40?T.gold:T.neg,background:pctl>=60?T.posBg:pctl>=40?T.goldSoft:T.negBg,padding:"2px 8px",borderRadius:4}}>Top {100-pctl}%</span></div></div><div style={{position:"relative",height:22,background:T.bgMuted,borderRadius:11,overflow:"hidden"}}><div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,${T.negBg},${T.goldSoft} 50%,${T.posBg})`,borderRadius:11,opacity:.6}}/>{sorted.map((v,i)=>{const x=((v-mn)/rg)*100;const isCur=Math.abs(v-current)<0.001;return <div key={i} style={{position:"absolute",left:`${x}%`,top:"50%",transform:"translate(-50%,-50%)",width:isCur?14:5,height:isCur?14:5,borderRadius:"50%",background:isCur?T.navy:T.text3,opacity:isCur?1:.25,zIndex:isCur?2:1,border:isCur?`2px solid ${T.bgCard}`:"none",boxShadow:isCur?`0 0 0 2px ${T.navy}`:"none"}}/>})}</div><div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:T.text3}}><span>{fmt(sorted[0])}</span><span>{fmt(sorted[sorted.length-1])}</span></div></div>)};

// ============================================================
// DETAIL PAGE
// ============================================================
const Detail=()=>{
  const{pr,go}=useR();const{fc,cat:catId}=pr;const scr=useScreen();const isMob=scr==="mobile";
  const cat=CATS.find(c=>c.id===catId);
  // ★ 直接从已加载的全局数据读取（loadData 在 App 层已完成）
  const funds=MF[catId]||[];const f=funds.find(x=>x.c===fc);
  const recs=RECS[catId]||[];
  const[entered,setEntered]=useState(false);const[rng,setRng]=useState(30);const[compareCodes,setCompareCodes]=useState([]);
  useEffect(()=>{setEntered(false);setCompareCodes([]);const t=setTimeout(()=>requestAnimationFrame(()=>setEntered(true)),300);return()=>clearTimeout(t)},[fc]);
  if(!f) return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",color:T.text3}}><div style={{fontSize:28,opacity:.25,marginBottom:12}}>∅</div><div>基金不存在</div><div style={{marginTop:14,color:T.navyLight,cursor:"pointer"}} onClick={()=>go("home")}>返回首页</div></div></div>;
  if(!isOwn(catId,f.c)){go("list",{cat:catId});return null}
  const rec=recs.find(r=>r.c===fc);
  const peers=funds.map(x=>x.rytd).sort((a,b)=>a-b);const pctl=Math.round((peers.filter(r=>r<f.rytd).length/peers.length)*100);
  const ownList=CATS.flatMap(c=>(OWN_CFG[c.id]||[]).map(code=>({catId:c.id,code,name:c.name})));
  const ownIdx=ownList.findIndex(x=>x.code===fc&&x.catId===catId);const prevO=ownIdx>0?ownList[ownIdx-1]:null;const nextO=ownIdx<ownList.length-1?ownList[ownIdx+1]:null;
  const chartData=useMemo(()=>{const main=(f.h||[]).slice(-rng);const base=main[0]||1;const cF=compareCodes.map(c=>funds.find(x=>x.c===c)).filter(Boolean);return main.map((v,i)=>{const row={d:i+1,v:+((v/base-1)*100).toFixed(3)};cF.forEach((cf,ci)=>{const ch=(cf.h||[]).slice(-rng);const cb=ch[0]||1;row[`c${ci}`]=ch[i]!=null?+((ch[i]/cb-1)*100).toFixed(3):null});return row})},[f,rng,compareCodes,funds]);
  const cFO=compareCodes.map(c=>funds.find(x=>x.c===c)).filter(Boolean);const otherF=funds.filter(x=>x.c!==fc&&!compareCodes.includes(x.c));const toggleCmp=c=>setCompareCodes(p=>p.includes(c)?p.filter(x=>x!==c):p.length<3?[...p,c]:p);

  return(
    <div style={{minHeight:"100vh",background:T.bg}}>
      <InnerHeader crumbs={[{label:"首页",onClick:()=>go("home")},{label:cat?.name,onClick:()=>go("list",{cat:catId})},{label:f.n,active:true}]}/>
      {<>
      {/* HERO */}
      <div style={{background:`linear-gradient(135deg,${T.navy} 0%,${T.navyDeep} 50%,#0a1530 100%)`,padding:isMob?"32px 20px 28px":"48px 0 40px",position:"relative",overflow:"hidden",...fadeUp(entered,0,0)}}>
        <div style={{position:"absolute",top:"-30%",right:"10%",width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,${T.gold}10,transparent 70%)`,pointerEvents:"none"}}/>
        <div className="rw" style={{padding:"0 24px",position:"relative",zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexDirection:isMob?"column":"row",gap:isMob?20:0}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                <span style={{fontSize:10,fontWeight:700,color:T.gold,background:`${T.gold}20`,padding:"4px 12px",borderRadius:5}}>本公司产品</span>
                <span style={{fontSize:10,fontWeight:600,color:T.navyPale,background:"rgba(255,255,255,0.08)",padding:"4px 12px",borderRadius:5}}>{cat?.name}</span>
                <div style={{display:"flex",gap:4,marginLeft:8}}>
                  <button disabled={!prevO} onClick={()=>prevO&&go("detail",{fc:prevO.code,cat:prevO.catId})} title={prevO?.name} style={{width:30,height:30,borderRadius:6,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:prevO?T.navyPale:"rgba(255,255,255,0.2)",cursor:prevO?"pointer":"default",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
                  <button disabled={!nextO} onClick={()=>nextO&&go("detail",{fc:nextO.code,cat:nextO.catId})} title={nextO?.name} style={{width:30,height:30,borderRadius:6,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:nextO?T.navyPale:"rgba(255,255,255,0.2)",cursor:nextO?"pointer":"default",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>→</button>
                </div>
              </div>
              <h1 style={{fontFamily:T.disp,fontSize:isMob?26:34,fontWeight:800,color:"#fff",margin:0,letterSpacing:"-.03em",lineHeight:1.2}}>{f.n}</h1>
              <div style={{display:"flex",alignItems:"center",gap:12,marginTop:12,fontSize:13,color:"rgba(255,255,255,0.55)",flexWrap:"wrap"}}><span style={{fontFamily:T.mono}}>{f.c}</span><span>·</span><span>{f.co}</span><span>·</span><span>{f.m}</span><span>·</span><span>成立于 {f.est}</span></div>
              <div style={{display:"flex",gap:isMob?20:32,marginTop:28,flexWrap:"wrap"}}>
                {[["今年以来收益",f.rytd,1],["近1年夏普",f.sr],["YTD回撤",f.mdd_ytd,1],["基金规模",f.sz]].map(([lb,vl,isR])=><div key={lb}><div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:6,letterSpacing:".06em"}}>{lb}</div><span style={{fontSize:isMob?18:22,fontWeight:700,fontFamily:T.num,color:isR?(vl>=0?"#ff8888":"#5eedb8"):"#fff"}}>{lb==="基金规模"?(vl>=100?`${(vl/100).toFixed(1)}`:`${vl.toFixed(1)}`):isR?pct(vl):vl?.toFixed(2)}</span>{lb==="基金规模"&&<span style={{fontSize:isMob?13:15,fontWeight:500,color:"rgba(255,255,255,0.45)",marginLeft:3}}>{vl>=100?"百亿":"亿"}</span>}</div>)}
              </div>
            </div>
            {rec&&!isMob&&<div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><ScoreGauge score={rec.score} size={110}/><div style={{fontSize:30,fontWeight:800,fontFamily:T.num,color:pctl>=70?"#5eedb8":T.gold}}>Top {100-pctl}%</div><div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>同类排名</div></div>}
          </div>
        </div>
      </div>
      <div className="rw" style={{padding:"32px 24px 64px"}}>
        {/* Marketing copy */}
        {f.ad&&<div style={{background:T.bgCard,borderRadius:16,border:`1px solid ${T.goldLine}`,marginBottom:28,position:"relative",overflow:"hidden",boxShadow:`0 2px 24px ${T.goldSoft}`,...fadeUp(entered,.06)}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${T.gold},${T.navyLight} 60%,transparent)`}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:`1px solid ${T.lineLight}`,background:T.goldPale}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><Dots size={6} gap={4}/><span style={{fontSize:14,fontWeight:700,color:T.navy,fontFamily:T.disp}}>产品推介</span></div>
            <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:11,color:T.text3}}>更新于 {f.adD}</span><CopyBtn text={f.ad} size="md"/></div>
          </div>
          <div style={{padding:"28px 28px 32px",fontSize:14,lineHeight:2,color:T.text1,whiteSpace:"pre-line"}}>{f.ad}</div>
        </div>}
        {/* Info cards */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginBottom:24,...fadeUp(entered,.12)}}>
          <div style={{padding:isMob?20:28,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`}}><div style={{fontSize:14,fontWeight:600,color:T.navy,marginBottom:18}}>基本信息</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px 28px"}}>{[["代码",f.c],["公司",f.co],["经理",f.m],["成立",f.est],["规模",szs(f.sz)],["净值",nvs(f.nav)],["日期",f.nd],["近1年夏普",(f.sr||0).toFixed(2)]].map(([l,v])=><div key={l}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{l}</div><div style={{fontSize:14,color:T.text1,fontWeight:500}}>{v}</div></div>)}</div></div>
          <div style={{padding:isMob?20:28,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`}}><div style={{fontSize:14,fontWeight:600,color:T.navy,marginBottom:18}}>收益与风险</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"18px 28px"}}>{[["日涨跌",f.r1d],["近1月",f.r1m],["近3月",f.r3m],["近6月",f.r6m],["今年以来",f.rytd],["近1年",f.r1y],["近3年",f.r3y],["YTD回撤",f.mdd_ytd],["近2年回撤",f.mdd_2y],["近1年夏普",f.sr]].map(([l,v])=><div key={l}><div style={{fontSize:11,color:T.text3,marginBottom:4}}>{l}</div>{l==="近1年夏普"?<span style={{color:T.navy,fontFamily:T.mono,fontSize:13,fontWeight:600}}>{(v||0).toFixed(2)}</span>:<Ret v={v}/>}</div>)}</div></div>
        </div>
        {/* Chart */}
        <div style={{padding:isMob?20:28,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,marginBottom:24,...fadeUp(entered,.18)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:14,fontWeight:600,color:T.navy}}>净值走势对比</span><div style={{display:"flex",gap:6}}>{[[30,"30天"],[60,"60天"],[90,"90天"]].map(([v,l])=><button key={v} onClick={()=>setRng(v)} style={{padding:"5px 14px",fontSize:11,fontWeight:600,background:rng===v?T.navy:T.bgCard,color:rng===v?T.textInv:T.text3,border:`1px solid ${rng===v?T.navy:T.line}`,borderRadius:6,cursor:"pointer"}}>{l}</button>)}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18,flexWrap:"wrap"}}><span style={{fontSize:11,color:T.text3}}>叠加：</span><span style={{fontSize:11,fontWeight:600,color:CCOL[0],background:T.navyPale,padding:"3px 10px",borderRadius:5}}>● {f.n}</span>{cFO.map((cf,ci)=><span key={cf.c} onClick={()=>toggleCmp(cf.c)} style={{fontSize:11,fontWeight:500,color:CCOL[ci+1],background:T.bgMuted,padding:"3px 10px",borderRadius:5,cursor:"pointer"}}>● {cf.n} ✕</span>)}{compareCodes.length<3&&otherF.length>0&&<select onChange={e=>{if(e.target.value){toggleCmp(e.target.value);e.target.value=""}}} value="" style={{padding:"3px 8px",fontSize:11,background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:5,color:T.text2,cursor:"pointer",outline:"none"}}><option value="">+ 添加</option>{otherF.map(o=><option key={o.c} value={o.c}>{o.n}</option>)}</select>}</div>
          <ResponsiveContainer width="100%" height={isMob?200:280}><LineChart data={chartData}><XAxis dataKey="d" stroke={T.text3} fontSize={11} tickLine={false} axisLine={{stroke:T.line}}/><YAxis stroke={T.text3} fontSize={11} tickLine={false} axisLine={false} tickFormatter={v=>`${v>0?"+":""}${v.toFixed(1)}%`} width={56}/><Tooltip contentStyle={{background:T.bgCard,border:`1px solid ${T.line}`,borderRadius:8,fontSize:12,color:T.text1}} formatter={(v,name)=>[`${v>0?"+":""}${v.toFixed(3)}%`,name==="v"?f.n:cFO.find((_,i)=>`c${i}`===name)?.n||name]}/><Line type="monotone" dataKey="v" stroke={CCOL[0]} strokeWidth={2.5} dot={false} name={f.n}/>{cFO.map((cf,ci)=><Line key={cf.c} type="monotone" dataKey={`c${ci}`} stroke={CCOL[ci+1]} strokeWidth={1.8} dot={false} strokeDasharray={ci>0?"6 3":undefined} name={cf.n}/>)}</LineChart></ResponsiveContainer>
          <div style={{fontSize:10,color:T.text3,marginTop:8,textAlign:"center"}}>纵轴为区间涨跌幅，基准日为区间首日</div>
        </div>
        {/* Percentile */}
        <div style={{padding:isMob?20:28,background:T.bgCard,borderRadius:14,border:`1px solid ${T.line}`,marginBottom:24,...fadeUp(entered,.26)}}>
          <div style={{fontSize:14,fontWeight:600,color:T.navy,marginBottom:20}}>同类排名分布</div>
          <PctileDist values={funds.map(x=>x.rytd)} current={f.rytd} label="今年以来收益" fmt={v=>pct(v)}/>
          <PctileDist values={funds.map(x=>x.sr)} current={f.sr} label="近1年夏普" fmt={v=>v.toFixed(2)}/>
          <PctileDist values={funds.map(x=>x.mdd_ytd)} current={f.mdd_ytd} label="YTD回撤" fmt={v=>pct(v)} inverse/>
        </div>
        {/* Score */}
        {rec&&<div style={{padding:isMob?20:28,background:T.goldPale,borderRadius:14,border:`1px solid ${T.goldLine}`,marginBottom:24,...fadeUp(entered,.32)}}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}><span style={{fontSize:14,fontWeight:600,color:T.navy}}>评分明细</span></div><div style={{maxWidth:420}}>{rec.bd.map(b=><ScoreBar key={b.l} label={b.l} val={b.v}/>)}</div></div>}
      </div>
      </>}
    </div>
  );
};

// ============================================================
// BOND APP (模块入口)
// ============================================================
export default function BondApp({onBack, onLogout}){
  const[pg,setPg]=useState("home");const[pr,setPr]=useState({});
  const[ready,setReady]=useState(false);const[err,setErr]=useState(null);
  const go=useCallback((p,params={})=>{if(p==="portal"&&onBack){onBack();return;}setPg(p);setPr(params)},[onBack]);

  useEffect(()=>{
    loadData()
      .then(r=>{if(r==='need_login'&&onLogout)onLogout();else setReady(true);})
      .catch(e=>{console.error(e);setErr(e.message)});
  },[]);

  if(err) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.body,background:T.bg}}>
      <div style={{textAlign:"center",color:T.text3}}>
        <div style={{fontSize:32,marginBottom:16,opacity:.3}}>⚠</div>
        <div style={{fontSize:15,color:T.text1,marginBottom:8}}>数据加载失败</div>
        <div style={{fontSize:13}}>{err}</div>
        <div style={{fontSize:12,marginTop:16,color:T.navyLight,cursor:"pointer"}} onClick={onBack}>← 返回门户</div>
      </div>
    </div>
  );

  if(!ready) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.body,background:T.bg}}>
      <div style={{textAlign:"center"}}>
        <div style={{display:"inline-flex",gap:6,marginBottom:16}}><div style={{width:7,height:7,borderRadius:"50%",background:T.gold,animation:"shimmer 1s infinite"}}/><div style={{width:7,height:7,borderRadius:"50%",background:T.gold,opacity:.5,animation:"shimmer 1s .2s infinite"}}/></div>
        <div style={{fontSize:13,color:T.text3}}>正在加载固收数据...</div>
      </div>
    </div>
  );

  return(
    <Ctx.Provider value={{pg,pr,go,onLogout,onBack}}>
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
        {pg==="home"&&<Home/>}
        {pg==="list"&&<List/>}
        {pg==="detail"&&<Detail/>}
      </div>
    </Ctx.Provider>
  );
}
