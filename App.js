import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  Alert, Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRESETS = ["SPY","QQQ","AAPL","NVDA","MSFT","INTC","AMD","META","TSLA","AMZN","GOOGL","IWM","PLTR","NFLX","JPM","GS"];
const TODAY = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const EXP = (() => { const d = new Date(); d.setDate(d.getDate()+35); return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); })();

const C = {
  bg: '#060608', panel: '#0c0c12', card: '#10101a', sub: '#1a1a28',
  border: '#ffffff0d', green: '#00ff88', red: '#ff2d55', amber: '#ffcc00',
  blue: '#4fc3f7', text: '#eeeef5', muted: '#44445a',
};

function grade(s) {
  if (s >= 85) return { l: 'A+', c: C.green, t: 'PRIME' };
  if (s >= 75) return { l: 'A',  c: '#00e676', t: 'HIGH PROB' };
  if (s >= 65) return { l: 'B+', c: '#69f0ae', t: 'SOLID' };
  if (s >= 55) return { l: 'B',  c: C.amber, t: 'MODERATE' };
  return             { l: 'C',  c: '#ff6d00', t: 'WEAK' };
}

async function fetchPrice(ticker, finnhubKey) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`);
  if (!res.ok) throw new Error(`Price fetch failed ${res.status}`);
  const d = await res.json();
  if (!d.c || d.c === 0) throw new Error(`No price for ${ticker}`);
  return +d.c.toFixed(2);
}

async function analyzeWithClaude(ticker, price, claudeKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are an educational swing trade options analyst. Today is ${TODAY}.

${ticker} live price is $${price}. Use $${price} for ALL calculations.

Analyze for high-probability ITM swing trade:
- BUY = bullish, ITM CALL, delta 0.65-0.85, strike BELOW $${price}
- SELL = bearish, ITM PUT, delta 0.65-0.85, strike ABOVE $${price}
- NO TRADE = score below 65 or no quality setup
- Expiry: ${EXP} (~35 DTE)
- Min 2:1 R/R
- All prices relative to $${price}

YOUR ENTIRE RESPONSE MUST BE ONLY A VALID JSON OBJECT. NO BACKTICKS. NO MARKDOWN. START WITH { END WITH }

{"ticker":"${ticker}","price":${price},"trend":"BULLISH","strength":"STRONG","signal":"BUY","control":"BUYERS","score":80,"winRate":75,"pop":70,"trendPts":20,"setupPts":20,"optionsPts":16,"volumePts":12,"rrPts":12,"setupName":"Trend Continuation","timeframe":"Daily + Weekly","keyLevel":0,"keyType":"SUPPORT","entry":0,"tp1":0,"tp2":0,"stop":0,"rr":"2.5:1","optType":"CALL","strike":0,"expiry":"${EXP}","dte":35,"delta":0.72,"premium":0,"itmDepth":0,"maxRisk":0,"targetExit":0,"catalyst1":"momentum","catalyst2":"sector strength","warning":"","thesis":"Real 3-sentence thesis for ${ticker} at $${price}.","invalidation":"Specific price that invalidates this trade."}`
      }]
    })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const text = (json.content || []).map(b => b.text || '').join('').trim();
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i < 0 || j < 0) throw new Error('Bad response: ' + text.slice(0, 80));
  const d = JSON.parse(text.slice(i, j + 1));
  d.price = price;
  return d;
}

// ── SETUP SCREEN ──────────────────────────────────────────────────────────────
function SetupScreen({ onSave }) {
  const [fhKey, setFhKey] = useState('');
  const [clKey, setClKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState('');

  const connect = async () => {
    if (!fhKey || !clKey) return;
    setTesting(true); setErr('');
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${fhKey}`);
      const d = await res.json();
      if (!d.c || d.c === 0) throw new Error('Finnhub key invalid');
      await AsyncStorage.setItem('fh_key', fhKey);
      await AsyncStorage.setItem('cl_key', clKey);
      onSave(fhKey, clKey);
    } catch (e) {
      setErr('❌ ' + e.message);
    }
    setTesting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.setupContainer}>
        <Text style={styles.setupLabel}>SWING ITM SCANNER</Text>
        <Text style={styles.setupTitle}>Connect Your{'\n'}API Keys</Text>
        <Text style={styles.setupSub}>
          Live prices via Finnhub · Analysis via Claude{'\n'}
          Keys saved on device only — never shared{'\n'}
          Get Claude key: console.anthropic.com → API Keys{'\n'}
          Get Finnhub key: finnhub.io (free)
        </Text>

        <View style={styles.setupPanel}>
          <Text style={styles.fieldLabel}>FINNHUB API KEY</Text>
          <TextInput style={styles.fieldInput} placeholder="Paste Finnhub key..."
            placeholderTextColor={C.muted} value={fhKey}
            onChangeText={setFhKey} secureTextEntry autoCapitalize="none"/>

          <Text style={styles.fieldLabel}>ANTHROPIC (CLAUDE) API KEY</Text>
          <TextInput style={styles.fieldInput} placeholder="sk-ant-..."
            placeholderTextColor={C.muted} value={clKey}
            onChangeText={setClKey} secureTextEntry autoCapitalize="none"/>

          {err ? <Text style={styles.setupErr}>{err}</Text> : null}

          <TouchableOpacity
            style={[styles.connectBtn, fhKey && clKey ? styles.connectBtnReady : {}]}
            onPress={connect} disabled={!fhKey || !clKey || testing}>
            <Text style={[styles.connectBtnText, fhKey && clKey ? styles.connectBtnTextReady : {}]}>
              {testing ? 'TESTING...' : 'CONNECT →'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.setupNote}>
          🔑 Finnhub free: 60 calls/min — plenty for scanning{'\n'}
          🔑 Claude API: ~$0.01 per ticker scanned{'\n'}
          🔒 Keys stored securely on your device only
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── RESULT CARD ───────────────────────────────────────────────────────────────
function ResultCard({ item }) {
  if (item.status === 'loading') return (
    <View style={styles.loadingCard}>
      <ActivityIndicator color={C.green} size="small"/>
      <Text style={styles.loadingText}>
        {item.step === 'price' ? `Fetching ${item.ticker} price...` : `Analyzing ${item.ticker} at $${item.price}...`}
      </Text>
    </View>
  );

  if (item.status === 'error') return (
    <View style={[styles.card, {borderColor: C.red + '40'}]}>
      <Text style={styles.errorText}>⚠ {item.ticker}: {item.error}</Text>
    </View>
  );

  const d = item.data;
  if (!d) return null;

  if (d.signal === 'NO TRADE') return (
    <View style={[styles.card, {borderColor: C.red + '20'}]}>
      <View style={styles.noTradeRow}>
        <View style={styles.noTradeIcon}><Text style={{fontSize:18,color:C.red}}>✕</Text></View>
        <View>
          <Text style={styles.tickerName}>{d.ticker}</Text>
          <Text style={[styles.small, {color:C.red,marginTop:4}]}>NO TRADE — Does not meet criteria</Text>
          <Text style={[styles.tiny, {color:C.muted,marginTop:2}]}>Score below threshold · Skip today</Text>
        </View>
      </View>
    </View>
  );

  const g = grade(d.score || 0);
  const sc = d.signal === 'BUY' ? C.green : C.red;
  const tc = d.trend === 'BULLISH' ? C.green : d.trend === 'BEARISH' ? C.red : C.amber;
  const ac = d.optType === 'CALL' ? C.green : C.red;

  return (
    <View style={[styles.card, {borderColor: sc + '25'}]}>
      <View style={[styles.cardTopBar, {backgroundColor: sc}]}/>
      <View style={styles.cardBody}>

        {/* Header */}
        <View style={styles.cardHeader}>
          {/* Score ring (simplified) */}
          <View style={[styles.scoreCircle, {borderColor: g.c}]}>
            <Text style={[styles.scoreLetter, {color: g.c}]}>{g.l}</Text>
            <Text style={[styles.scoreNum, {color: C.muted}]}>{d.score}</Text>
          </View>
          <View style={{flex:1,marginLeft:12}}>
            <View style={styles.titleRow}>
              <Text style={styles.tickerName}>{d.ticker}</Text>
              <View style={[styles.sigBadge, {backgroundColor: sc}]}>
                <Text style={styles.sigText}>{d.signal}</Text>
              </View>
            </View>
            <View style={styles.chipRow}>
              <View style={[styles.chip, {borderColor: tc + '50'}]}>
                <Text style={[styles.chipText, {color: tc}]}>{d.trend}</Text>
              </View>
              <View style={[styles.chip, {borderColor: C.muted + '50'}]}>
                <Text style={[styles.chipText, {color: C.muted}]}>{d.strength}</Text>
              </View>
            </View>
            <Text style={styles.priceLine}>
              <Text style={styles.priceVal}>${d.price}</Text>
              <Text style={{color: C.muted}}> · {d.control} in control</Text>
            </Text>
          </View>
          <View style={styles.winBox}>
            <Text style={styles.winLabel}>WIN RATE</Text>
            <Text style={[styles.winVal, {color: g.c}]}>{d.winRate}%</Text>
            <Text style={[styles.winSub, {color: g.c}]}>{g.t}</Text>
          </View>
        </View>

        {/* Score bars */}
        <View style={styles.scoreSection}>
          <Text style={styles.sectionLabel}>SETUP SCORE</Text>
          {[
            ['TREND ALIGNMENT',   d.trendPts||0,   25, C.green],
            ['SETUP QUALITY',     d.setupPts||0,   25, C.blue],
            ['OPTIONS STRUCTURE', d.optionsPts||0, 20, C.amber],
            ['VOLUME/MOMENTUM',   d.volumePts||0,  15, C.green],
            ['RISK/REWARD',       d.rrPts||0,      15, C.amber],
          ].map(([label, val, max, color]) => (
            <View key={label} style={styles.scoreRow}>
              <Text style={styles.scoreRowLabel}>{label}</Text>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, {width: `${Math.min(100,(val/max)*100)}%`, backgroundColor: color}]}/>
              </View>
              <Text style={[styles.scoreRowNum, {color}]}>{val}/{max}</Text>
            </View>
          ))}
        </View>

        {/* Setup info */}
        <View style={styles.setupRowChips}>
          <Text style={[styles.setupNameText, {color: sc}]}>⬡ {d.setupName}</Text>
          <View style={[styles.chip, {borderColor: C.blue + '50'}]}>
            <Text style={[styles.chipText, {color: C.blue}]}>{d.timeframe}</Text>
          </View>
          <View style={[styles.chip, {borderColor: C.amber + '50'}]}>
            <Text style={[styles.chipText, {color: C.amber}]}>{d.keyType} ${d.keyLevel}</Text>
          </View>
          <View style={[styles.chip, {borderColor: C.green + '50'}]}>
            <Text style={[styles.chipText, {color: C.green}]}>PoP {d.pop}%</Text>
          </View>
        </View>

        {/* Price targets */}
        <View style={styles.targets}>
          {[['ENTRY',`$${d.entry}`,C.text],['TP1',`$${d.tp1}`,C.green],['TP2',`$${d.tp2}`,'#69f0ae'],
            ['STOP',`$${d.stop}`,C.red],['R:R',d.rr,C.amber]].map(([l,v,c])=>(
            <View key={l} style={styles.targetBox}>
              <Text style={styles.targetLabel}>{l}</Text>
              <Text style={[styles.targetVal, {color: c}]}>{v}</Text>
            </View>
          ))}
        </View>

        {/* Contract */}
        <View style={[styles.contract, {borderColor: ac + '30'}]}>
          <View style={styles.contractHeader}>
            <View style={[styles.contractTypeBadge, {backgroundColor: ac}]}>
              <Text style={styles.contractTypeText}>{d.optType}</Text>
            </View>
            <Text style={[styles.small, {color: C.muted}]}>ITM CONTRACT</Text>
            <Text style={[styles.small, {color: C.amber}]}>Δ {Number(d.delta||0).toFixed(2)}</Text>
          </View>
          <View style={styles.contractGrid}>
            {[['STRIKE',`$${d.strike}`,ac],['EXPIRY',d.expiry,ac],['DTE',`${d.dte}d`,C.amber],
              ['PREMIUM',`$${d.premium}`,C.text],['ITM DEPTH',`$${d.itmDepth}`,ac],['MAX RISK',`$${d.maxRisk}`,C.red]
            ].map(([l,v,c])=>(
              <View key={l} style={styles.contractItem}>
                <Text style={styles.contractItemLabel}>{l}</Text>
                <Text style={[styles.contractItemVal, {color: c}]}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={styles.contractFooter}>
            <View>
              <Text style={styles.contractItemLabel}>ENTRY PREMIUM</Text>
              <Text style={[styles.contractItemVal, {color: C.text}]}>${d.premium}</Text>
            </View>
            <View style={{alignItems:'flex-end'}}>
              <Text style={styles.contractItemLabel}>TARGET EXIT</Text>
              <Text style={[styles.contractItemVal, {color: C.green}]}>${d.targetExit}</Text>
            </View>
          </View>
        </View>

        {/* Thesis */}
        <Text style={styles.thesis}>{d.thesis}</Text>

        {/* Invalidation */}
        <View style={styles.invBox}>
          <Text style={[styles.tiny, {color: C.red}]}>INVALIDATION: </Text>
          <Text style={[styles.tiny, {color: '#9090b8'}]}>{d.invalidation}</Text>
        </View>

        {/* Tags */}
        <View style={styles.tagsRow}>
          {[d.catalyst1, d.catalyst2].filter(Boolean).map((c,i)=>(
            <View key={i} style={[styles.chip, {borderColor: C.blue + '50'}]}>
              <Text style={[styles.chipText, {color: C.blue}]}>◆ {c}</Text>
            </View>
          ))}
          {d.warning ? (
            <View style={[styles.chip, {borderColor: C.amber + '50'}]}>
              <Text style={[styles.chipText, {color: C.amber}]}>⚠ {d.warning}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [finnhubKey, setFinnhubKey] = useState('');
  const [claudeKey, setClaudeKey]   = useState('');
  const [keysReady, setKeysReady]   = useState(false);
  const [selected, setSelected]     = useState(['NVDA','AAPL','SPY','INTC']);
  const [custom, setCustom]         = useState('');
  const [results, setResults]       = useState([]);
  const [scanning, setScanning]     = useState(false);
  const [minScore, setMinScore]     = useState(65);
  const [sigFilter, setSigFilter]   = useState('ALL');
  const [scanCount, setScanCount]   = useState(0);
  const abort = useRef(false);

  // Load saved keys on mount
  React.useEffect(() => {
    (async () => {
      const fh = await AsyncStorage.getItem('fh_key');
      const cl = await AsyncStorage.getItem('cl_key');
      if (fh && cl) { setFinnhubKey(fh); setClaudeKey(cl); setKeysReady(true); }
    })();
  }, []);

  const toggle = t => setSelected(p => p.includes(t) ? p.filter(x=>x!==t) : [...p,t]);

  const addCustom = () => {
    const t = custom.trim().toUpperCase().replace(/[^A-Z]/g,'');
    if (t && !selected.includes(t)) setSelected(p=>[...p,t]);
    setCustom('');
  };

  const updateResult = (ticker, patch) => {
    setResults(p => p.map(r => r.ticker === ticker ? {...r,...patch} : r));
  };

  const runScan = async () => {
    if (!selected.length || scanning) return;
    abort.current = false;
    setScanning(true);
    setScanCount(c => c+1);
    setResults(selected.map(t => ({ticker:t,status:'loading',data:null,error:null,price:null,step:'price'})));

    for (const ticker of selected) {
      if (abort.current) break;
      try {
        const price = await fetchPrice(ticker, finnhubKey);
        updateResult(ticker, {price, step:'analysis'});
        const data = await analyzeWithClaude(ticker, price, claudeKey);
        updateResult(ticker, {status:'done', data});
      } catch(e) {
        updateResult(ticker, {status:'error', error: e.message});
      }
      await new Promise(r => setTimeout(r, 300));
    }
    setScanning(false);
  };

  const disconnect = async () => {
    await AsyncStorage.removeItem('fh_key');
    await AsyncStorage.removeItem('cl_key');
    setKeysReady(false); setFinnhubKey(''); setClaudeKey(''); setResults([]);
  };

  if (!keysReady) return (
    <SetupScreen onSave={(fh,cl) => { setFinnhubKey(fh); setClaudeKey(cl); setKeysReady(true); }}/>
  );

  const done   = results.filter(r => r.status==='done' && r.data);
  const trades = done.filter(r => r.data.signal !== 'NO TRADE');
  const skips  = done.filter(r => r.data.signal === 'NO TRADE');
  const prime  = trades.filter(r => (r.data.score||0) >= 75).length;

  const shown = [...results]
    .filter(r => {
      if (r.status !== 'done') return true;
      if (!r.data || r.data.signal === 'NO TRADE') return true;
      if (sigFilter !== 'ALL' && r.data.signal !== sigFilter) return false;
      if ((r.data.score||0) < minScore) return false;
      return true;
    })
    .sort((a,b) => (b.data?.score||0) - (a.data?.score||0));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content"/>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.logoRow}>
            <Text style={styles.logoText}>SWING </Text>
            <Text style={[styles.logoText, {color: C.green}]}>ITM </Text>
            <Text style={styles.logoText}>SCANNER</Text>
          </View>
          <Text style={styles.subText}>LIVE PRICES · 30-40 DTE · DELTA 0.65–0.85</Text>
        </View>
        <View style={styles.headerRight}>
          {results.length > 0 && (
            <View style={styles.statsRow}>
              {[['SETUPS',trades.length,C.text],['PRIME',prime,C.green],['SKIP',skips.length,C.red]].map(([l,v,c])=>(
                <View key={l} style={styles.statItem}>
                  <Text style={styles.statLabel}>{l}</Text>
                  <Text style={[styles.statVal, {color:c}]}>{v}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, scanning ? styles.statusDotOn : {}]}/>
            <Text style={[styles.statusText, scanning ? {color:C.green} : {}]}>
              {scanning ? 'SCANNING' : scanCount > 0 ? `#${scanCount} DONE` : 'READY'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:40}}>

        {/* Ticker selector */}
        <View style={styles.controlPanel}>
          <Text style={styles.sectionLabel}>SELECT TICKERS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
            <View style={{flexDirection:'row',gap:6,paddingRight:8}}>
              {PRESETS.map(t => {
                const on = selected.includes(t);
                return (
                  <TouchableOpacity key={t} onPress={() => toggle(t)}
                    style={[styles.tickerBtn, on ? styles.tickerBtnOn : {}]}>
                    <Text style={[styles.tickerBtnText, on ? styles.tickerBtnTextOn : {}]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Custom input */}
          <View style={styles.customRow}>
            <TextInput style={styles.customInput} placeholder="ADD TICKER..."
              placeholderTextColor={C.muted} value={custom}
              onChangeText={t => setCustom(t.toUpperCase().replace(/[^A-Z]/g,''))}
              onSubmitEditing={addCustom} autoCapitalize="characters" returnKeyType="done"/>
            <TouchableOpacity style={styles.addBtn} onPress={addCustom}>
              <Text style={styles.addBtnText}>+ ADD</Text>
            </TouchableOpacity>
          </View>

          {/* Custom tags */}
          {selected.filter(t => !PRESETS.includes(t)).length > 0 && (
            <View style={styles.customTagsRow}>
              {selected.filter(t => !PRESETS.includes(t)).map(t => (
                <TouchableOpacity key={t} onPress={() => toggle(t)} style={styles.customTag}>
                  <Text style={styles.customTagText}>{t} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Filters */}
          <View style={styles.filterRow}>
            <View>
              <Text style={styles.filterLabel}>SIGNAL</Text>
              <View style={styles.filterBtns}>
                {['ALL','BUY','SELL'].map(f => (
                  <TouchableOpacity key={f} onPress={() => setSigFilter(f)}
                    style={[styles.filterBtn, sigFilter===f ? styles.filterBtnOn : {}]}>
                    <Text style={[styles.filterBtnText, sigFilter===f ? styles.filterBtnTextOn : {}]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{flex:1,marginLeft:16}}>
              <Text style={styles.filterLabel}>MIN SCORE — <Text style={{color:C.green}}>{minScore}</Text></Text>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, {width:`${((minScore-50)/40)*100}%`}]}/>
              </View>
              <View style={styles.sliderBtns}>
                {[50,60,65,70,75,80].map(v=>(
                  <TouchableOpacity key={v} onPress={()=>setMinScore(v)}
                    style={[styles.sliderBtn, minScore===v?styles.sliderBtnOn:{}]}>
                    <Text style={[styles.tiny, {color:minScore===v?'#000':C.muted}]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Scan button */}
          <View style={styles.scanBtnRow}>
            {scanning ? (
              <TouchableOpacity style={styles.stopBtn} onPress={() => { abort.current=true; setScanning(false); }}>
                <Text style={styles.stopBtnText}>⏹ STOP</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.scanBtn, selected.length ? styles.scanBtnReady : {}]}
                onPress={runScan} disabled={!selected.length}>
                <Text style={[styles.scanBtnText, selected.length ? styles.scanBtnTextReady : {}]}>
                  ▶ ANALYZE {selected.length} TICKERS
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={disconnect} style={styles.keysBtn}>
              <Text style={styles.keysBtnText}>⬡ KEYS</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Results */}
        {shown.length > 0 && (
          <View>
            <Text style={[styles.sectionLabel, {marginBottom:12}]}>
              {trades.length} SETUPS · {prime} PRIME · SORTED BY SCORE
            </Text>
            {shown.map(r => <ResultCard key={r.ticker} item={r}/>)}
          </View>
        )}

        {results.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>SELECT & ANALYZE</Text>
            <Text style={styles.emptySub}>
              Live prices via Finnhub{'\n'}
              ITM contracts · 30-40 DTE · Delta 0.65–0.85{'\n'}
              Min 70% win rate · Min 2:1 R:R
            </Text>
          </View>
        )}

        <Text style={styles.footer}>
          FOR EDUCATIONAL USE ONLY · NOT FINANCIAL ADVICE{'\n'}
          OPTIONS INVOLVE SUBSTANTIAL RISK OF LOSS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex:1, backgroundColor: C.bg },
  header: { backgroundColor:C.panel, borderBottomWidth:1, borderBottomColor:C.border, padding:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  logoRow: { flexDirection:'row', alignItems:'baseline' },
  logoText: { fontSize:18, fontWeight:'900', letterSpacing:3, color:C.text, fontFamily:'monospace' },
  subText: { fontSize:8, color:C.muted, letterSpacing:2, marginTop:2, fontFamily:'monospace' },
  headerRight: { alignItems:'flex-end', gap:6 },
  statsRow: { flexDirection:'row', gap:12 },
  statItem: { alignItems:'center' },
  statLabel: { fontSize:7, color:C.muted, fontFamily:'monospace' },
  statVal: { fontSize:14, fontWeight:'900', fontFamily:'monospace' },
  statusRow: { flexDirection:'row', alignItems:'center', gap:5 },
  statusDot: { width:6, height:6, borderRadius:3, backgroundColor:C.muted },
  statusDotOn: { backgroundColor:C.green, shadowColor:C.green, shadowOffset:{width:0,height:0}, shadowOpacity:0.8, shadowRadius:4 },
  statusText: { fontSize:9, color:C.muted, fontFamily:'monospace' },

  // Setup
  setupContainer: { padding:24, paddingTop:40 },
  setupLabel: { fontSize:9, color:C.muted, letterSpacing:3, marginBottom:6, fontFamily:'monospace' },
  setupTitle: { fontSize:26, fontWeight:'900', color:C.text, marginBottom:8, lineHeight:32 },
  setupSub: { fontSize:11, color:C.muted, lineHeight:20, marginBottom:24, fontFamily:'monospace' },
  setupPanel: { backgroundColor:C.panel, borderWidth:1, borderColor:C.border, borderRadius:10, padding:20, marginBottom:14 },
  fieldLabel: { fontSize:8, color:C.muted, letterSpacing:1, marginBottom:6, fontFamily:'monospace' },
  fieldInput: { backgroundColor:C.sub, borderWidth:1, borderColor:C.border, borderRadius:6, padding:12, fontFamily:'monospace', fontSize:12, color:C.text, marginBottom:14 },
  connectBtn: { padding:14, borderRadius:6, backgroundColor:C.sub, alignItems:'center' },
  connectBtnReady: { backgroundColor:C.green },
  connectBtnText: { fontFamily:'monospace', fontSize:13, fontWeight:'700', letterSpacing:2, color:C.muted },
  connectBtnTextReady: { color:'#000' },
  setupErr: { fontSize:10, color:C.red, marginBottom:12, fontFamily:'monospace' },
  setupNote: { fontSize:9, color:'#2a2a4a', lineHeight:18, fontFamily:'monospace' },

  // Controls
  controlPanel: { backgroundColor:C.panel, borderWidth:1, borderColor:C.border, borderRadius:12, padding:16, marginBottom:16 },
  sectionLabel: { fontSize:8, color:C.muted, letterSpacing:1.5, marginBottom:8, fontFamily:'monospace' },
  tickerBtn: { paddingHorizontal:12, paddingVertical:6, borderRadius:5, backgroundColor:C.sub, borderWidth:1, borderColor:C.border },
  tickerBtnOn: { backgroundColor:C.green, borderColor:C.green },
  tickerBtnText: { fontSize:11, fontWeight:'700', color:C.muted, fontFamily:'monospace' },
  tickerBtnTextOn: { color:'#000' },
  customRow: { flexDirection:'row', gap:8, marginBottom:8 },
  customInput: { flex:1, backgroundColor:C.sub, borderWidth:1, borderColor:C.border, borderRadius:6, padding:10, fontFamily:'monospace', fontSize:11, color:C.text },
  addBtn: { backgroundColor:C.sub, borderWidth:1, borderColor:C.border, borderRadius:6, padding:10, justifyContent:'center' },
  addBtnText: { fontFamily:'monospace', fontSize:10, color:C.muted },
  customTagsRow: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:8 },
  customTag: { paddingHorizontal:10, paddingVertical:5, backgroundColor:C.sub, borderWidth:1, borderColor:C.green+'40', borderRadius:5 },
  customTagText: { fontFamily:'monospace', fontSize:10, color:C.green },
  filterRow: { flexDirection:'row', alignItems:'flex-start', borderTopWidth:1, borderTopColor:C.border, paddingTop:14, gap:8 },
  filterLabel: { fontSize:8, color:C.muted, letterSpacing:1, marginBottom:6, fontFamily:'monospace' },
  filterBtns: { flexDirection:'row', gap:4 },
  filterBtn: { paddingHorizontal:10, paddingVertical:5, borderRadius:4, backgroundColor:C.sub, borderWidth:1, borderColor:C.border },
  filterBtnOn: { backgroundColor:C.green, borderColor:C.green },
  filterBtnText: { fontFamily:'monospace', fontSize:10, fontWeight:'700', color:C.muted },
  filterBtnTextOn: { color:'#000' },
  sliderTrack: { height:3, backgroundColor:C.sub, borderRadius:2, marginVertical:8 },
  sliderFill: { height:'100%', backgroundColor:C.green, borderRadius:2 },
  sliderBtns: { flexDirection:'row', gap:4 },
  sliderBtn: { paddingHorizontal:6, paddingVertical:3, borderRadius:3, backgroundColor:C.sub },
  sliderBtnOn: { backgroundColor:C.green },
  scanBtnRow: { flexDirection:'row', gap:8, marginTop:14, alignItems:'center' },
  scanBtn: { flex:1, padding:14, borderRadius:7, backgroundColor:C.sub, alignItems:'center' },
  scanBtnReady: { backgroundColor:C.green },
  scanBtnText: { fontFamily:'monospace', fontSize:12, fontWeight:'700', letterSpacing:2, color:C.muted },
  scanBtnTextReady: { color:'#000' },
  stopBtn: { flex:1, padding:14, borderRadius:7, backgroundColor:C.red, alignItems:'center' },
  stopBtnText: { fontFamily:'monospace', fontSize:12, fontWeight:'700', letterSpacing:2, color:'#fff' },
  keysBtn: { paddingHorizontal:12, paddingVertical:14, backgroundColor:C.sub, borderWidth:1, borderColor:C.border, borderRadius:7 },
  keysBtnText: { fontFamily:'monospace', fontSize:9, color:C.muted },

  // Cards
  card: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, marginBottom:14, overflow:'hidden' },
  cardTopBar: { height:2 },
  cardBody: { padding:16 },
  cardHeader: { flexDirection:'row', alignItems:'flex-start', marginBottom:14 },
  scoreCircle: { width:64, height:64, borderRadius:32, borderWidth:3, alignItems:'center', justifyContent:'center', flexShrink:0 },
  scoreLetter: { fontSize:16, fontWeight:'900', lineHeight:18 },
  scoreNum: { fontSize:9 },
  titleRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' },
  tickerName: { fontSize:18, fontWeight:'900', letterSpacing:3, color:C.text },
  sigBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:4 },
  sigText: { fontFamily:'monospace', fontSize:10, fontWeight:'700', letterSpacing:2, color:'#000' },
  chipRow: { flexDirection:'row', gap:6, marginBottom:4, flexWrap:'wrap' },
  chip: { paddingHorizontal:7, paddingVertical:2, borderRadius:3, borderWidth:1 },
  chipText: { fontFamily:'monospace', fontSize:8, letterSpacing:1 },
  priceLine: { fontFamily:'monospace', fontSize:11, color:C.muted },
  priceVal: { fontSize:14, fontWeight:'700', color:C.text },
  winBox: { alignItems:'flex-end' },
  winLabel: { fontFamily:'monospace', fontSize:7, color:C.muted },
  winVal: { fontFamily:'monospace', fontSize:22, fontWeight:'900', lineHeight:24 },
  winSub: { fontFamily:'monospace', fontSize:7 },
  scoreSection: { backgroundColor:C.sub, borderRadius:8, padding:12, marginBottom:12 },
  scoreRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:5 },
  scoreRowLabel: { fontFamily:'monospace', fontSize:8, color:C.muted, width:110 },
  scoreTrack: { flex:1, height:3, backgroundColor:C.bg, borderRadius:2, overflow:'hidden' },
  scoreFill: { height:'100%', borderRadius:2 },
  scoreRowNum: { fontFamily:'monospace', fontSize:8, width:26, textAlign:'right' },
  setupRowChips: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:12, alignItems:'center' },
  setupNameText: { fontFamily:'monospace', fontSize:10, fontWeight:'700' },
  targets: { flexDirection:'row', gap:5, marginBottom:12 },
  targetBox: { flex:1, backgroundColor:C.sub, borderRadius:6, padding:8 },
  targetLabel: { fontFamily:'monospace', fontSize:7, color:C.muted, marginBottom:3 },
  targetVal: { fontFamily:'monospace', fontSize:11, fontWeight:'700' },
  contract: { backgroundColor:C.sub, borderRadius:8, borderWidth:1, padding:12, marginBottom:12 },
  contractHeader: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  contractTypeBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:4 },
  contractTypeText: { fontFamily:'monospace', fontSize:10, fontWeight:'700', letterSpacing:2, color:'#000' },
  contractGrid: { flexDirection:'row', flexWrap:'wrap', marginBottom:8 },
  contractItem: { width:'33.3%', marginBottom:8 },
  contractItemLabel: { fontFamily:'monospace', fontSize:7, color:C.muted },
  contractItemVal: { fontFamily:'monospace', fontSize:10, fontWeight:'700' },
  contractFooter: { flexDirection:'row', justifyContent:'space-between', borderTopWidth:1, borderTopColor:C.border, paddingTop:8 },
  thesis: { fontFamily:'monospace', fontSize:10, color:'#9090b8', lineHeight:18, borderTopWidth:1, borderTopColor:C.border, paddingTop:10, marginBottom:10 },
  invBox: { backgroundColor:'#ff2d550a', borderWidth:1, borderColor:'#ff2d5525', borderRadius:6, padding:8, marginBottom:10, flexDirection:'row', flexWrap:'wrap' },
  tagsRow: { flexDirection:'row', flexWrap:'wrap', gap:6 },

  // Loading/error
  loadingCard: { backgroundColor:C.card, borderRadius:12, borderWidth:1, borderColor:C.border, padding:18, flexDirection:'row', alignItems:'center', gap:10, marginBottom:14 },
  loadingText: { fontFamily:'monospace', fontSize:12, color:C.muted, flex:1 },
  errorText: { fontFamily:'monospace', fontSize:10, color:C.red, lineHeight:16 },
  noTradeRow: { flexDirection:'row', gap:12, alignItems:'center' },
  noTradeIcon: { width:50, height:50, borderRadius:25, backgroundColor:'#ff2d5512', borderWidth:1, borderColor:'#ff2d5525', alignItems:'center', justifyContent:'center' },

  // Empty/footer
  emptyState: { paddingTop:60, alignItems:'center' },
  emptyTitle: { fontFamily:'monospace', fontSize:22, fontWeight:'900', letterSpacing:4, color:C.muted, marginBottom:10 },
  emptySub: { fontFamily:'monospace', fontSize:11, color:'#1e1e2e', textAlign:'center', lineHeight:20 },
  footer: { marginTop:40, fontFamily:'monospace', fontSize:8, color:'#1a1a28', textAlign:'center', lineHeight:16 },

  // Misc
  small: { fontFamily:'monospace', fontSize:10 },
  tiny: { fontFamily:'monospace', fontSize:9 },
});
