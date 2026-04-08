// ==UserScript==
// @name        로어 인젝터
// @namespace   로어-인젝터
// @version     1.0.0
// @description RP 로어 자동 주입 및 추출
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-toastify-injection@v1.0.0/crack/libraries/toastify-injection.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.0.0/crack/libraries/crack-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@chasm-shared-core@v1.0.0/libraries/chasm-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@decentralized-pre-1.0.15/decentralized-modal.js
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @connect     generativelanguage.googleapis.com
// @connect     googleapis.com
// @connect     oauth2.googleapis.com
// @run-at      document-start
// ==/UserScript==

// WebSocket(Socket.IO) 인터셉터
// document-start 시점에서 wrtn JS보다 먼저 실행하는 것이 목적. 안되면 에리 때림
(function(){
  'use strict';
  const _w=(typeof unsafeWindow!=='undefined')?unsafeWindow:window;
  const _origFetch = _w.fetch.bind(_w);
  const _origWsSend = _w.WebSocket.prototype.send;
  let _injectFn = null;

  // Socket.IO 인터셉터
  _w.WebSocket.prototype.send=function(data){
    const ws=this;
    if(_injectFn&&typeof data==='string'&&data.length>10){
      const bi=data.indexOf('[');
      if(bi>0){
        try{
          const prefix=data.slice(0,bi),arr=JSON.parse(data.slice(bi));
          if(Array.isArray(arr)&&arr[0]==='send'&&arr[1]&&typeof arr[1].message==='string'&&arr[1].message.length>0){
            if(!arr[1].message.includes('OOC:')){
              const orig=arr[1].message;
              (async()=>{
                try{
                  const mod=await _injectFn(orig);
                  if(orig!==mod){
                    arr[1].message=mod;
                    const nd=prefix+JSON.stringify(arr);
                    console.log('[Lore] WS 주입완료, len:',nd.length,'msg[0..100]:',mod.slice(0,100));
                    _origWsSend.call(ws,nd);
                  }else{
                    _origWsSend.call(ws,data);
                  }
                }catch(e){console.error('[Lore] WS inject err:',e);_origWsSend.call(ws,data);}
              })();
              return;
            }
          }
        }catch(e){}
      }
    }
    return _origWsSend.call(this,data);
  };

  // fetch 인터셉터 (WebSocket으로 전환)
  _w.fetch = async function(...args){
    return _origFetch.apply(this, args); // DISABLED — WebSocket 사용
    try {
      let reqUrl='',isReq=false;
      if(args[0] instanceof Request){reqUrl=args[0].url;isReq=true;}
      else{reqUrl=String(args[0]||'');}
      const method=isReq?args[0].method:((args[1]||{}).method||'GET');

      if(method==='POST'){
        let bodyText=null;
        if(isReq){try{bodyText=await args[0].clone().text();}catch(e){}}
        else if(args[1]?.body){if(typeof args[1].body==='string')bodyText=args[1].body;else try{bodyText=await new Response(args[1].body).text();}catch(e){}}

        if(bodyText){
          let body;try{body=JSON.parse(bodyText);}catch(e){}
          if(body){
            let injected=false;

            // messages 배열
            if(Array.isArray(body.messages)){
              for(let i=body.messages.length-1;i>=0;i--){
                const m=body.messages[i];
                if(m.role==='user'&&typeof m.content==='string'){
                  if(!m.content.includes('OOC:')){
                    const orig=m.content;
                    m.content=await _injectFn(orig);
                    if(orig!==m.content)injected=true;
                  }
                  break;
                }
              }
            }

            // 직접 필드
            if(!injected){
              for(const k of['content','message','text','prompt','query']){
                if(typeof body[k]==='string'&&!body[k].includes('OOC:')){
                  const orig=body[k];body[k]=await _injectFn(orig);
                  if(orig!==body[k])injected=true;break;
                }
              }
            }

            // GraphQL variables
            if(!injected&&body.variables&&typeof body.variables==='object'){
              for(const k of['content','message','text','prompt','query']){
                if(typeof body.variables[k]==='string'&&!body.variables[k].includes('OOC:')){
                  const orig=body.variables[k];body.variables[k]=await _injectFn(orig);
                  if(orig!==body.variables[k])injected=true;break;
                }
              }
            }

            if(injected){
              const nb=JSON.stringify(body);
              console.log('[Lore] 주입 완료, len:',nb.length,'body[0..200]:',nb.slice(0,200));
              try{
                if(isReq){
                  const req=args[0];const h={};try{for(const[k,v]of req.headers.entries())h[k]=v;}catch(e){h['content-type']='application/json';}
                  args[0]=req.url;args[1]={method:req.method||'POST',headers:h,body:nb,credentials:req.credentials||'same-origin'};
                }else{
                  args[1]=Object.assign({},args[1],{body:nb});
                }
              }catch(e){console.error('[Lore] body 교체 실패:',e);}
            }
          }
        }
      }
            }catch(e){console.error('[Lore] intercept error:',e);}
    return _origFetch.apply(this,args);
  };

  _w.__loreRegister=function(fn){
    _injectFn=fn;
    console.log('[Lore] 핸들러 등록 완료 ('+new Date().toLocaleTimeString()+')');
  };
  console.log('[Lore] WebSocket 인터셉터 설치 완료 ('+(typeof unsafeWindow!=='undefined'?'unsafeWindow':'window')+', '+new Date().toLocaleTimeString()+')');
})();

const _GM_xhr = (typeof GM_xmlhttpRequest !== 'undefined')
  ? GM_xmlhttpRequest
  : (typeof GM !== 'undefined' && GM.xmlHttpRequest)
    ? GM.xmlHttpRequest.bind(GM)
    : null;

// 초기화 및 실행
!(async function(){
  'use strict';
  if(document.readyState==='loading')
    await new Promise(r=>document.addEventListener('DOMContentLoaded',r));
  console.log('[Lore] DOM ready, 초기화 시작...');

  const VER='v4.7.0';
  const _gHost='generativelanguage'+'.googleapis.com';
  const _gBase='https://'+_gHost+'/v1beta/models/';
  const SAFETY=[{category:'HARM_CATEGORY_HARASSMENT',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_HATE_SPEECH',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_DANGEROUS_CONTENT',threshold:'BLOCK_NONE'},{category:'HARM_CATEGORY_CIVIC_INTEGRITY',threshold:'BLOCK_NONE'}];

  const DEFAULT_EXTRACT_PROMPT=`Extract entity names and keywords from this conversation that relate to fictional characters, locations, events, factions, items, or settings.
Return a JSON array of strings.

Conversation:
{context}

Return:["keyword1", "keyword2"]`;

  // 기본 자동 추출 프롬프트 (DB 미포함)
  const DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB=`You are a Lore Archivist for RP.
Analyze the following conversation log and extract NEW established lore, character developments, relationship changes, and promises/contracts.

RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited RP)

EXTRACTION PRIORITIES (in order of importance):
1. RELATIONSHIP EVENTS: Track ALL significant interactions between characters — relationship shifts, physical actions, emotional moments, conflicts, intimate encounters, shared experiences, nickname/호칭 changes. Record how characters address each other in "nicknames".
2. PROMISE LIFECYCLE: Track promises/contracts/oaths between characters. Output with structured status tracking.
3. CHARACTER STATE: Update each character's current situation, emotional/physical state, and last interaction. Use "current_state" and "last_interaction" detail fields. Do NOT duplicate relationship info here.

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown, no explanations. Empty array [] if nothing new.
2. NATIVE LANGUAGE: The 'name' and 'triggers' MUST strictly use the exact language used in the conversation (e.g., Korean text -> Korean triggers). NO arbitrary English translation.
3. EXACT TRIGGERS: Provide 3 to 5 highly relevant triggers.
   - Use exact keywords.
   - For relationships, use BIDIRECTIONAL compound triggers: \`CharA&&CharB\` AND \`CharB&&CharA\`.
   - For events/promises, use the compound operator \`&&\` with the character's name (e.g., \`Alice&&Promise\`, \`Hero&&Contract\`).
4. CONTENT DEPTH: Capture relationship evolution, group dynamics, promises made, and event fulfillment. Keep summaries terse (use noun/stem endings like -함, -임 in Korean) but DO NOT omit crucial details or conditions.
5. STATE REPLACEMENT: When a relationship status or promise status CHANGES, describe ONLY the current state in "summary". The system will replace the old state. Do NOT describe outdated states as current.

Schema:
[
  {
    "type": "character|location|item|event|concept|setting",
    "name": "Entity Name",
    "triggers": ["keyword1", "CharName&&keyword2", "keyword3"],
    "scan_range": 5,
    "summary": "Terse but detailed summary of the fact",
    "detail": {
      "attributes": "traits, status, or conditions",
      "current_state": "Current situation/emotional state (replaced on update)",
      "last_interaction": "What happened last (replaced on update)",
      "relations": ["(extraction reference only)"],
      "background_or_history": "(extraction reference only)"
    }
  },
  {
    "type": "relationship",
    "name": "CharA↔CharB",
    "triggers": ["CharA&&CharB", "CharB&&CharA"],
    "scan_range": 5,
    "summary": "Current relationship state (one sentence, CURRENT status only)",
    "detail": {
      "parties": ["CharA", "CharB"],
      "current_status": "one-word status (e.g., allied, hostile, romantic, estranged)",
      "nicknames": { "CharA→CharB": "how A addresses B", "CharB→CharA": "how B addresses A" },
      "arc": [
        { "phase": "status_word", "summary": "what happened", "approx_turn": "~N" }
      ]
    }
  },
  {
    "type": "promise",
    "name": "Descriptive promise title (→ target)",
    "triggers": ["Maker&&keyword", "Target&&keyword"],
    "scan_range": 5,
    "summary": "Promise content and current status",
    "detail": {
      "maker": "Who made the promise",
      "target": "Who receives/benefits",
      "condition": "What triggers fulfillment",
      "status": "pending|fulfilled|broken|expired|modified",
      "made_approx": "~turn N or context",
      "resolved_approx": null,
      "resolution": null
    }
  }
]

Conversation Log:
{context}`;

  // 기본 자동 추출 프롬프트 (DB 포함 - 병합 목적)
  const DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB=`You are a Lore Archivist for RP.
Analyze the following conversation log ALONGSIDE the EXISTING Lore Database.
Extract NEW or UPDATED lore, character developments, relationship changes, and promise status updates.

RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited RP)

EXTRACTION PRIORITIES (in order of importance):
1. RELATIONSHIP EVENTS: Track ALL significant interactions — relationship shifts, actions, emotional moments, conflicts, intimate encounters, nickname/호칭 changes. Update arc, current_status, and nicknames from existing DB.
2. PROMISE LIFECYCLE: If a promise/contract status changed, output the UPDATED entry. Check existing DB.
3. CHARACTER STATE: Update current situation, emotional/physical state, last interaction. Use "current_state" and "last_interaction". Do NOT duplicate relationship info here.

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if nothing new.
2. INTEGRATE AND UPDATE: If the entity/event already exists in the provided Lore Database, DO NOT duplicate it. Keep the exact same "name". For "relationship" and "promise" types, include the COMPLETE updated entry (the system will replace the old one). For other types, output ONLY new/changed information.
3. NATIVE LANGUAGE: The 'name' and 'triggers' MUST use the exact language of the conversation (e.g., Korean). DO NOT translate triggers to English.
4. EXACT TRIGGERS: Provide 3 to 5 highly relevant triggers.
   - For relationships, use BIDIRECTIONAL compound triggers: \`CharA&&CharB\` AND \`CharB&&CharA\`.
   - Use the compound operator \`&&\` to link characters to events/promises.
5. CONTENT DEPTH: Capture relationship evolution, faction dynamics, 1-on-1 relations, promises made, and whether tasks were fulfilled. Summaries must be terse (noun/stem endings like -함, -임) but comprehensive.
6. STATE REPLACEMENT: For relationship and promise types, describe ONLY the CURRENT state. The merge system will replace old states — writing outdated info will cause contradictions.

Schema:
[
  {
    "type": "character|location|item|event|concept|setting",
    "name": "Entity Name",
    "triggers": ["keyword1", "CharName&&keyword2", "keyword3"],
    "scan_range": 5,
    "summary": "Terse but detailed summary of new/updated info",
    "detail": {
      "attributes": "new traits, status, or conditions",
      "current_state": "Current situation/emotional state (replaced on update)",
      "last_interaction": "What happened last (replaced on update)",
      "relations": ["(extraction reference only)"],
      "background_or_history": "(extraction reference only)"
    }
  },
  {
    "type": "relationship",
    "name": "CharA↔CharB",
    "triggers": ["CharA&&CharB", "CharB&&CharA"],
    "scan_range": 5,
    "summary": "Current relationship state (CURRENT only, not historical)",
    "detail": {
      "parties": ["CharA", "CharB"],
      "current_status": "one-word status",
      "nicknames": { "CharA→CharB": "how A addresses B", "CharB→CharA": "how B addresses A" },
      "arc": [
        { "phase": "status_word", "summary": "what happened", "approx_turn": "~N" }
      ]
    }
  },
  {
    "type": "promise",
    "name": "Descriptive promise title (→ target)",
    "triggers": ["Maker&&keyword", "Target&&keyword"],
    "scan_range": 5,
    "summary": "Promise content and current status",
    "detail": {
      "maker": "Who made the promise",
      "target": "Who receives/benefits",
      "condition": "What triggers fulfillment",
      "status": "pending|fulfilled|broken|expired|modified",
      "made_approx": "~turn N or context",
      "resolved_approx": null,
      "resolution": null
    }
  }
]

Existing Lore Database:
{entries}

Conversation Log:
{context}`;

  // DB
  const db=new Dexie('lore-injector');
  db.version(1).stores({entries:'++id, name, type, packName, *triggers',packs:'name, entryCount'});
  db.version(2).stores({entries:'++id, name, type, packName, project, *triggers',packs:'name, entryCount, project'});

  // Settings
  const _SKEY='lore-injector-v5';
  const _ls=(typeof unsafeWindow!=='undefined')?unsafeWindow.localStorage:localStorage;

  const defaultSettings = {
    enabled:true, position:'before',
    prefix:'**[OOC: Reference — factual background data. Incorporate naturally, never repeat verbatim.]**',
    suffix:'**[End of reference data]**', scanRange:6, scanOffset:5, maxEntries:3,
    cooldownEnabled:true, cooldownTurns:6,
    strictMatch:true, similarityMatch:true,
    activeProject:'',
    geminiApiType:'key', geminiVertexJson:'', geminiVertexLocation:'global', geminiVertexProjectId:'',
    geminiKey:'', geminiModel:'gemini-3-flash-preview',
    geminiCustomModel:'', geminiReasoning:'medium', geminiBudget:2048,
    extractPrompt:DEFAULT_EXTRACT_PROMPT,
    autoExtEnabled:false, autoExtTurns:11, autoExtScanRange:6, autoExtOffset:5, autoExtPack:'자동추출', autoExtMaxRetries:1,
    autoExtPromptWithoutDb:DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    autoExtPromptWithDb:DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
    autoExtApiType:'key', autoExtVertexJson:'', autoExtVertexLocation:'global', autoExtVertexProjectId:'',
    autoExtKey:'', autoExtModel:'gemini-3-flash-preview', autoExtCustomModel:'', autoExtReasoning:'medium', autoExtBudget:2048,
    autoExtPrefix:'', autoExtSuffix:'', autoExtIncludeDb:false, autoExtIncludePersona:false,
    autoPacks:['자동추출'],
    urlPacks:{}, urlDisabledEntries:{},
    urlTurnCounters:{}, urlCooldownMaps:{},
    urlAutoExtPacks:{}, urlExtLogs:{}, urlInjLogs:{}
  };

  const settings = {
    config: JSON.parse(JSON.stringify(defaultSettings)),
    _lastSaveTime: 0,
    save: function() {
      try { this._lastSaveTime = Date.now(); _ls.setItem(_SKEY, JSON.stringify(this.config)); } catch(e){}
    },
    load: function() {
      try {
        const saved = _ls.getItem(_SKEY);
        if (saved) {
          const p = JSON.parse(saved);
          if (p && typeof p === 'object') {
            for (const k in p) { if (p[k] !== undefined) this.config[k] = p[k]; }
            // 마이그레이션 호환성
            if(p.autoExtPrompt && !p.autoExtPromptWithoutDb) this.config.autoExtPromptWithoutDb = p.autoExtPrompt;
            if(this.config.autoExtMaxRetries === undefined) this.config.autoExtMaxRetries = 1;
            if(this.config.geminiApiType === undefined) this.config.geminiApiType = 'key';
            if(this.config.autoExtApiType === undefined) this.config.autoExtApiType = 'key';
          }
        }
      } catch(e) { console.warn('[Lore] 설정 로드 실패:', e); }
    }
  };
  settings.load();

  // 탭 간 설정 동기화
  window.addEventListener('storage', (e) => {
    if (e.key === _SKEY) settings.load();
  });
  window.addEventListener('focus', () => {
    // 자신이 최근에 저장한 경우 reload 스킵 (다른 탭 변경만 반영)
    if (Date.now() - (settings._lastSaveTime || 0) < 3000) return;
    settings.load();
  });

  // UI 상태 배지
  let _statusBadge = null;

  function showStatusBadge(text) {
    if (!_statusBadge) {
      _statusBadge = document.createElement('div');
      _statusBadge.id = 'lore-status-badge';
      _statusBadge.style.cssText = [
        'position:fixed', 'bottom:70px', 'right:20px', 'z-index:999998',
        'background:#1a1a1a', 'border:1px solid #333', 'border-radius:20px',
        'padding:8px 16px', 'font-size:12px', 'color:#ccc',
        'box-shadow:0 4px 12px rgba(0,0,0,0.4)', 'display:flex',
        'align-items:center', 'gap:8px', 'font-family:inherit',
        'transition:opacity .3s', 'opacity:0', 'pointer-events:none'
      ].join(';');
      document.body.appendChild(_statusBadge);
    }
    _statusBadge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:lore-pulse 1s infinite"></span> ${text}`;
    _statusBadge.style.opacity = '1';
    _statusBadge.style.pointerEvents = 'auto';
  }

  function hideStatusBadge() {
    if (_statusBadge) {
      _statusBadge.style.opacity = '0';
      _statusBadge.style.pointerEvents = 'none';
    }
  }

  // 펄스 애니메이션
  GM_addStyle(`
    @keyframes lore-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `);

  // 유틸리티
  function getCurUrl(){return window.location.pathname;}

  async function getAutoExtPackForUrl(url) {
    if(!settings.config.urlAutoExtPacks) settings.config.urlAutoExtPacks = {};
    if(settings.config.urlAutoExtPacks[url]) return settings.config.urlAutoExtPacks[url];

    let baseName = '자동추출';
    try {
      let chatId = null;
      try { chatId = CrackUtil.path().chatRoom(); } catch(e){}
      if(!chatId) {
        const match = url.match(/\/episodes\/([a-f0-9]+)/);
        if(match) chatId = match[1];
      }
      if(chatId) {
        const room = await CrackUtil.chatRoom().roomData(chatId);
        if(room && !(room instanceof Error)) {
          baseName = room.story?.name || room.title || '자동추출';
        }
      }
    } catch(e) {
      console.warn('[Lore] 작품 이름 획득 실패:', e);
    }

    let finalName = baseName;
    let counter = 1;
    const existingPacksInSettings = Object.values(settings.config.urlAutoExtPacks || {});

    while (true) {
      const checkName = counter === 1 ? baseName : `${baseName} ${counter}`;
      const inDb = await db.packs.get(checkName);
      const inSettings = existingPacksInSettings.includes(checkName);

      if (!inDb && !inSettings) {
        finalName = checkName;
        break;
      }
      counter++;
    }

    settings.config.urlAutoExtPacks[url] = finalName;
    settings.save();
    return finalName;
  }
  function setAutoExtPackForUrl(url, packName) {
    if(!settings.config.urlAutoExtPacks) settings.config.urlAutoExtPacks = {};
    settings.config.urlAutoExtPacks[url] = packName;
    settings.save();
  }

  function getExtLog(url) {
    if(!settings.config.urlExtLogs) settings.config.urlExtLogs = {};
    return settings.config.urlExtLogs[url] || [];
  }
  function addExtLog(url, logItem) {
    if(!settings.config.urlExtLogs) settings.config.urlExtLogs = {};
    let logs = settings.config.urlExtLogs[url] || [];
    logs.unshift(logItem);
    if(logs.length > 30) logs.length = 30;
    settings.config.urlExtLogs[url] = logs;
    settings.save();
  }
  function clearExtLog(url) {
    if(!settings.config.urlExtLogs) settings.config.urlExtLogs = {};
    settings.config.urlExtLogs[url] = [];
    settings.save();
  }

  function getInjLog(url) {
    if(!settings.config.urlInjLogs) settings.config.urlInjLogs = {};
    return settings.config.urlInjLogs[url] || [];
  }
  function addInjLog(url, logItem) {
    if(!settings.config.urlInjLogs) settings.config.urlInjLogs = {};
    let logs = settings.config.urlInjLogs[url] || [];
    logs.unshift(logItem);
    if(logs.length > 100) logs.length = 100;
    settings.config.urlInjLogs[url] = logs;
    settings.save();
  }
  function clearInjLog(url) {
    if(!settings.config.urlInjLogs) settings.config.urlInjLogs = {};
    settings.config.urlInjLogs[url] = [];
    settings.save();
  }

  function getTurnCounter(url) {
    if(!settings.config.urlTurnCounters) settings.config.urlTurnCounters = {};
    return settings.config.urlTurnCounters[url] || 0;
  }
  function setTurnCounter(url, val) {
    if(!settings.config.urlTurnCounters) settings.config.urlTurnCounters = {};
    settings.config.urlTurnCounters[url] = val;
    settings.save();
  }
  function getCooldownMap(url) {
    if(!settings.config.urlCooldownMaps) settings.config.urlCooldownMaps = {};
    return settings.config.urlCooldownMaps[url] || {};
  }
  function setCooldownLastTurn(url, id, turn) {
    if(!settings.config.urlCooldownMaps) settings.config.urlCooldownMaps = {};
    if(!settings.config.urlCooldownMaps[url]) settings.config.urlCooldownMaps[url] = {};
    settings.config.urlCooldownMaps[url][id] = turn;
    settings.save();
  }

  function isEntryEnabledForUrl(entry){
    const curUrl=getCurUrl();
    const packs=settings.config.urlPacks?.[curUrl]||[];
    const disabled=settings.config.urlDisabledEntries?.[curUrl]||[];
    return packs.includes(entry.packName)&&!disabled.includes(entry.id);
  }

  async function setPackEnabled(packName,state){
    const curUrl=getCurUrl();
    const up=JSON.parse(JSON.stringify(settings.config.urlPacks||{}));
    const ud=JSON.parse(JSON.stringify(settings.config.urlDisabledEntries||{}));
    up[curUrl]=up[curUrl]||[];ud[curUrl]=ud[curUrl]||[];
    if(state){
      if(!up[curUrl].includes(packName))up[curUrl].push(packName);
      const its=await db.entries.where('packName').equals(packName).toArray();
      const ids=its.map(x=>x.id);
      ud[curUrl]=ud[curUrl].filter(id=>!ids.includes(id));
    }else{
      up[curUrl]=up[curUrl].filter(p=>p!==packName);
    }
    settings.config.urlPacks=up;settings.config.urlDisabledEntries=ud;settings.save();
    console.log('[Lore] 팩 상태:',packName,'→',state?'ON':'OFF','URL:',curUrl,'활성팩:',JSON.stringify(up[curUrl]));
  }

  function setEntryEnabled(entry,state){
    const curUrl=getCurUrl();
    const up=JSON.parse(JSON.stringify(settings.config.urlPacks||{}));
    const ud=JSON.parse(JSON.stringify(settings.config.urlDisabledEntries||{}));
    up[curUrl]=up[curUrl]||[];ud[curUrl]=ud[curUrl]||[];
    if(state){
      ud[curUrl]=ud[curUrl].filter(id=>id!==entry.id);
      if(!up[curUrl].includes(entry.packName))up[curUrl].push(entry.packName);
    }else{
      if(!ud[curUrl].includes(entry.id))ud[curUrl].push(entry.id);
    }
    settings.config.urlPacks=up;settings.config.urlDisabledEntries=ud;settings.save();
  }

  function getSimilarity(s1,s2){
    if(s1===s2)return 1.0;
    if(s1.length<2||s2.length<2)return 0.0;
    const bigrams=(str)=>{const bg=[];for(let i=0;i<str.length-1;i++)bg.push(str.slice(i,i+2));return bg;};
    const bg1=bigrams(s1),bg2=bigrams(s2);
    let intersection=0;
    for(let i=0;i<bg1.length;i++){for(let j=0;j<bg2.length;j++){if(bg1[i]===bg2[j]){intersection++;bg2[j]=null;break;}}}
    return(2.0*intersection)/(bg1.length+bg2.length);
  }

  // GM_xmlhttpRequest 래퍼
  function gmFetch(url, opts) {
    if (!_GM_xhr) {
      console.warn('[Lore] GM_xmlhttpRequest 미사용 — fetch 폴백');
      return fetch(url, {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body || null,
      });
    }

    return new Promise((resolve, reject) => {
      _GM_xhr({
        method: opts.method || 'GET',
        url,
        headers: opts.headers || {},
        data: opts.body || null,
        responseType: 'text',
        onload: (r) => resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          text: () => Promise.resolve(r.responseText),
          json: () => Promise.resolve(JSON.parse(r.responseText)),
        }),
        onerror: (e) => reject(new Error(`GM_xmlhttpRequest 네트워크 오류: ${JSON.stringify(e)}`)),
        ontimeout: () => reject(new Error('GM_xmlhttpRequest 타임아웃')),
      });
    });
  }

  // 서비스 계정 파싱
  function parseServiceAccountJson(jsonStr) {
    try {
      const obj = JSON.parse(jsonStr);
      if (!obj.client_email || !obj.private_key) {
        return { ok: false, error: 'client_email 또는 private_key 누락' };
      }
      return {
        ok: true,
        projectId: obj.project_id || '',
        clientEmail: obj.client_email,
        privateKey: obj.private_key,
        tokenUri: obj.token_uri || 'https://oauth2.googleapis.com/token',
      };
    } catch (e) {
      return { ok: false, error: 'JSON 파싱 실패: ' + e.message };
    }
  }

  let vertexTokenCache = { token: null, expiry: 0 };
  let autoExtVertexTokenCache = { token: null, expiry: 0 };

  function pemToArrayBuffer(pem) {
    const b64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/[\r\n\s]/g, '');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function b64url(buf) {
    if (typeof buf === 'string') buf = new TextEncoder().encode(buf);
    if (buf instanceof ArrayBuffer) buf = new Uint8Array(buf);
    let s = '';
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function getVertexAccessToken(sa, cache) {
    const now = Math.floor(Date.now() / 1000);
    if (cache.token && cache.expiry > now + 60) return cache.token;

    const iat = now;
    const exp = iat + 3600;

    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      iss: sa.clientEmail,
      sub: sa.clientEmail,
      aud: sa.tokenUri,
      iat,
      exp,
      scope: 'https://www.googleapis.com/auth/cloud-platform'
    }));

    const signingInput = header + '.' + payload;
    const keyData = pemToArrayBuffer(sa.privateKey);
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );
    const sigBuf = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', cryptoKey,
      new TextEncoder().encode(signingInput)
    );
    const jwt = signingInput + '.' + b64url(sigBuf);

    const resp = await gmFetch(sa.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`토큰 교환 실패 (${resp.status}): ${errText.slice(0, 100)}`);
    }

    const tokenData = await resp.json();
    cache.token = tokenData.access_token;
    cache.expiry = exp;
    return cache.token;
  }

  function getVertexUrl(model, location, projectId) {
    const isGemini3 = model.includes('gemini-3');
    const host = isGemini3
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`;
    const loc = isGemini3 ? 'global' : location;
    return `https://${host}/v1/projects/${projectId}/locations/${loc}/publishers/google/models/${model}:generateContent`;
  }

  async function callGeminiApi(prompt, opts = {}) {
    const {
      apiType = 'key', key = '', vertexJson = '',
      vertexLocation = 'global', vertexProjectId = '',
      model, thinkingConfig, maxRetries = 0,
      tokenCache = vertexTokenCache
    } = opts;

    const isVertex = apiType === 'vertex';
    let url, headers;

    if (isVertex) {
      const sa = parseServiceAccountJson(vertexJson);
      if (!sa.ok) return { text: null, status: 0, error: sa.error, retries: 0 };
      const projId = vertexProjectId || sa.projectId;
      if (!projId) return { text: null, status: 0, error: 'project_id 누락', retries: 0 };

      try {
        const accessToken = await getVertexAccessToken(sa, tokenCache);
        url = getVertexUrl(model, vertexLocation, projId);
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        };
      } catch (e) {
        return { text: null, status: 0, error: e.message, retries: 0 };
      }
    } else {
      if (!key) return { text: null, status: 0, error: 'API 키 누락', retries: 0 };
      url = _gBase + model + ':generateContent?key=' + key;
      headers = { 'Content-Type': 'application/json' };
    }

    const body = JSON.stringify({
      safetySettings: SAFETY,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { thinkingConfig }
    });

    let lastStatus = 0, lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const r = isVertex
          ? await gmFetch(url, { method: 'POST', headers, body })
          : await fetch(url, { method: 'POST', headers, body })
              .then(resp => ({
                ok: resp.ok,
                status: resp.status,
                text: () => resp.text(),
                json: () => resp.json(),
              }));
        lastStatus = r.status;

        if (r.status === 401 && isVertex) {
          tokenCache.token = null;
          tokenCache.expiry = 0;
          if (attempt < maxRetries) {
            try {
              const sa = parseServiceAccountJson(vertexJson);
              const projId = vertexProjectId || sa.projectId;
              const newToken = await getVertexAccessToken(sa, tokenCache);
              headers['Authorization'] = `Bearer ${newToken}`;
            } catch (e) { lastError = e.message; break; }
            continue;
          }
        }

        if (!r.ok) {
          const errBody = await r.text().catch(() => '');
          lastError = `HTTP ${r.status} ${errBody.slice(0, 500).replace(/\n/g, ' ')}`;
          if ([400, 403, 404].includes(r.status)) break;
        } else {
          const json = await r.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
          if (text) return { text, status: r.status, error: null, retries: attempt };
          lastError = '응답 파싱 실패 (텍스트 없음)';
        }
      } catch (e) { lastError = e.message; }
      if (attempt < maxRetries) await new Promise(res => setTimeout(res, 2000));
    }
    return { text: null, status: lastStatus, error: lastError, retries: maxRetries };
  }

  // Gemini 헬퍼 (스마트 주입용 - 재시도 로직 포함)
  function getGeminiModel(){const m=settings.config.geminiModel;return m==='_custom'?settings.config.geminiCustomModel:m;}

  function getInjectorThinkingConfig(){
    const model=getGeminiModel(),is3x=model.includes('gemini-3'),isPro=model.includes('pro'),sel=settings.config.geminiReasoning||'medium';
    if(is3x){
      if(sel==='off'||sel==='minimal')return{thinkingLevel:isPro?'low':'minimal'};
      if(sel==='budget'){const b=settings.config.geminiBudget||0;if(b<=512)return{thinkingLevel:isPro?'low':'minimal'};if(b<=2048)return{thinkingLevel:'low'};if(b<=4096)return{thinkingLevel:'medium'};return{thinkingLevel:'high'};}
      return{thinkingLevel:sel};
    }else{
      if(sel==='off')return{thinkingBudget:0};
      if(sel==='minimal')return{thinkingBudget:256};
      if(sel==='budget')return{thinkingBudget:settings.config.geminiBudget||0};
      const map={low:1024,medium:2048,high:4096};return{thinkingBudget:map[sel]||2048};
    }
  }

  async function gemini(prompt, maxRetries = 0){
    return callGeminiApi(prompt, {
      apiType: settings.config.geminiApiType || 'key',
      key: settings.config.geminiKey,
      vertexJson: settings.config.geminiVertexJson,
      vertexLocation: settings.config.geminiVertexLocation || 'global',
      vertexProjectId: settings.config.geminiVertexProjectId,
      model: getGeminiModel(),
      thinkingConfig: getInjectorThinkingConfig(),
      maxRetries,
      tokenCache: vertexTokenCache
    });
  }

  // Gemini 헬퍼 (자동 추출용 - 재시도 로직 포함)
  function getAutoExtGeminiModel(){const m=settings.config.autoExtModel;return m==='_custom'?settings.config.autoExtCustomModel:m;}

  function getAutoExtThinkingConfig(){
    const model=getAutoExtGeminiModel(),is3x=model.includes('gemini-3'),isPro=model.includes('pro'),sel=settings.config.autoExtReasoning||'medium';
    if(is3x){
      if(sel==='off'||sel==='minimal')return{thinkingLevel:isPro?'low':'minimal'};
      if(sel==='budget'){const b=settings.config.autoExtBudget||0;if(b<=512)return{thinkingLevel:isPro?'low':'minimal'};if(b<=2048)return{thinkingLevel:'low'};if(b<=4096)return{thinkingLevel:'medium'};return{thinkingLevel:'high'};}
      return{thinkingLevel:sel};
    }else{
      if(sel==='off')return{thinkingBudget:0};
      if(sel==='minimal')return{thinkingBudget:256};
      if(sel==='budget')return{thinkingBudget:settings.config.autoExtBudget||0};
      const map={low:1024,medium:2048,high:4096};return{thinkingBudget:map[sel]||2048};
    }
  }

  async function autoExtGemini(prompt, maxRetries = 0){
    return callGeminiApi(prompt, {
      apiType: settings.config.autoExtApiType || settings.config.geminiApiType || 'key',
      key: settings.config.autoExtKey || settings.config.geminiKey,
      vertexJson: settings.config.autoExtVertexJson || settings.config.geminiVertexJson,
      vertexLocation: settings.config.autoExtVertexLocation || settings.config.geminiVertexLocation || 'global',
      vertexProjectId: settings.config.autoExtVertexProjectId || settings.config.geminiVertexProjectId,
      model: getAutoExtGeminiModel(),
      thinkingConfig: getAutoExtThinkingConfig(),
      maxRetries,
      tokenCache: autoExtVertexTokenCache
    });
  }

  // TriggerScanner
  class TriggerScanner {
    static scan(input,msgs,entries,overrideRange=0,config){
      const matched=[];
      const range=overrideRange>0?overrideRange:6;
      const offset=config.scanOffset||0;
      let historyMsgs=[];
      if(offset>0&&msgs.length>offset){
        historyMsgs=msgs.slice(-(range+offset),-offset).map(m=>m.message);
      }else{
        historyMsgs=msgs.slice(-range).map(m=>m.message);
      }
      const textBlocks=[];
      const hLen=historyMsgs.length;

      for(let i=0;i<hLen;i++){
        textBlocks.push({text:historyMsgs[i].toLowerCase(),weight:10+((i+1)/hLen)*40});
      }
      textBlocks.push({text:input.toLowerCase(),weight:100});

      const strict=config.strictMatch!==false;
      const simMatch=config.similarityMatch===true;

      for(const e of entries){
        let bestScoreForEntry=0;

        for(const t of e.triggers){
          if(!t||t.length<2)continue;

          const andParts=t.split('&&').map(p=>p.trim().toLowerCase());
          let andMatched=true;
          let minScoreForThisTrigger=1000;

          for(const part of andParts){
            let partMatched=false;
            let bestScoreForPart=0;

            for(const block of textBlocks){
              const fullCorpus=block.text;
              let isExact=false;
              let simScore=0;

              if(strict){
                try{
                  const escapedT=part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
                  const regex=new RegExp(`(^|[\\s\\.,!?\\'\\"])${escapedT}(은|는|이|가|을|를|의|에|에게|한테|로|으로|과|와|다|도|만|부터|까지|조차|마저|치고|서야|이라도|조차도|로서|로써|[\\s\\.,!?\\'\\"]|$)`,'i');
                  if(regex.test(fullCorpus)||fullCorpus.includes(` ${part} `)||fullCorpus===part){
                    isExact=true;
                  }
                }catch{
                  if(fullCorpus.includes(part))isExact=true;
                }
              }else{
                if(fullCorpus.includes(part))isExact=true;
              }

              if(!isExact&&simMatch){
                const words=fullCorpus.split(/[\s\.,!?\'\"]+/);
                for(const w of words){
                  if(w.length>=2){
                    const s=getSimilarity(part,w);
                    if(s>=0.75&&s>simScore)simScore=s;
                  }
                }
              }

              if(isExact||simScore>0){
                partMatched=true;
                let currentScore=block.weight*(isExact?1.0:(simScore*0.7));
                if(currentScore>bestScoreForPart)bestScoreForPart=currentScore;
              }
            }

            if(!partMatched){andMatched=false;break;}
            else{if(bestScoreForPart<minScoreForThisTrigger)minScoreForThisTrigger=bestScoreForPart;}
          }

          if(andMatched&&minScoreForThisTrigger>0){
            if(minScoreForThisTrigger>bestScoreForEntry)bestScoreForEntry=minScoreForThisTrigger;
          }
        }

        if(bestScoreForEntry>0){
          matched.push({entry:e,score:bestScoreForEntry});
        }
      }

      matched.sort((a,b)=>b.score-a.score);
      return matched.map(m=>m.entry);
    }
  }

  // 포매터
  class Fmt{
    // 자동추출용: 하드코딩 렌더러 (토큰 절약)
    static formatAuto(entries,opts={}){
      if(!entries.length)return'';
      const{prefix='',suffix=''}=opts;
      const blocks=entries.map(e=>{
        const d=e.detail||{};
        // relationship 타입: 현재 상태 + arc 서사
        if(e.type==='relationship'){
          let line='* ['+e.name+']: '+(e.summary||'');
          if(d.current_status) line+=' ('+d.current_status+')';
          if(d.nicknames&&typeof d.nicknames==='object'){const nk=Object.entries(d.nicknames).map(([k,v])=>k+': "'+v+'"').join(' / ');if(nk) line+='\n  호칭: '+nk;}
          if(Array.isArray(d.arc)&&d.arc.length>0){
            line+='\n  ↳ '+d.arc.map(a=>a.phase+(a.summary?': '+a.summary:'')).join(' → ');
          }
          return line;
        }
        // promise 타입: 상태 + 조건 + 시점
        if(e.type==='promise'){
          let line='* ['+e.name+']: '+(e.summary||'');
          const meta=[];
          if(d.status) meta.push('상태: '+d.status);
          if(d.condition) meta.push('조건: '+d.condition);
          if(d.resolution) meta.push('결과: '+d.resolution);
          if(meta.length>0) line+='\n  ↳ '+meta.join(' | ');
          return line;
        }
        // 기타 타입 (character, location, item 등): 개인 속성만 (관계/배경 제외)
        let details=[];
        if(d.personality)details.push('성격: '+d.personality);
        if(d.attributes)details.push('특성: '+d.attributes);
        if(d.abilities?.length)details.push('능력: '+(Array.isArray(d.abilities)?d.abilities.join(', '):d.abilities));
        const detailStr = details.length ? ' (' + details.join(', ') + ')' : '';
        let line='* ['+e.name+']: '+(e.summary||'')+detailStr;
        if(d.current_state) line+='\n  현재: '+d.current_state;
        if(d.last_interaction) line+='\n  최근: '+d.last_interaction;
        return line;
      });
      const parts=[];if(prefix.trim())parts.push(prefix.trim());parts.push(blocks.join('\n'));if(suffix.trim())parts.push(suffix.trim());
      return'\n'+parts.join('\n')+'\n';
    }

    // 수동/전처리용: 범용 렌더러 (전 도메인 커버)
    static formatManual(entries,opts={}){
      if(!entries.length)return'';
      const{prefix='',suffix=''}=opts;
      const LABEL={personality:'성격',attributes:'특성',abilities:'능력',current_state:'현재',last_interaction:'최근',current_status:'현재 상태',nicknames:'호칭',relations:'관계',background_or_history:'배경',ingredients:'재료',steps:'순서',tips:'참고',rules:'규칙',conditions:'조건',effects:'효과',geography:'지리',climate:'기후',population:'인구',maker:'약속자',target:'대상',condition:'발동 조건',status:'상태',resolution:'결과',parties:'관계자'};
      const blocks=entries.map(e=>{
        const d=e.detail||{};
        let line='* ['+e.name+']: '+(e.summary||'');
        const lines=[];
        for(const[key,val]of Object.entries(d)){
          if(val==null||val==='')continue;
          const label=LABEL[key]||key;
          if(Array.isArray(val)){
            if(val.length===0)continue;
            if(typeof val[0]==='object'){
              lines.push('  '+label+': '+val.map(v=>Object.values(v).filter(Boolean).join(' / ')).join(' → '));
            }else{
              lines.push('  '+label+': '+val.join(', '));
            }
          }else if(typeof val==='object'){
            const flat=Object.entries(val).map(([k2,v2])=>k2+': '+v2).join(' / ');
            if(flat)lines.push('  '+label+': '+flat);
          }else{
            lines.push('  '+label+': '+String(val));
          }
        }
        if(lines.length>0)line+='\n'+lines.join('\n');
        return line;
      });
      const parts=[];if(prefix.trim())parts.push(prefix.trim());parts.push(blocks.join('\n'));if(suffix.trim())parts.push(suffix.trim());
      return'\n'+parts.join('\n')+'\n';
    }
  }

  // 데이터 병합
  async function mergeExtractedData(entries, url){
    const packName=await getAutoExtPackForUrl(url);
    let ap = [...(settings.config.autoPacks || [])];
    if(!ap.includes(packName)) {
      ap.push(packName);
      settings.config.autoPacks = ap;
      settings.save();
    }
    const proj=settings.config.activeProject||'';
    let pack=await db.packs.get(packName);
    if(!pack)await db.packs.put({name:packName,entryCount:0,project:proj});
    let addedCount=0;
    for(const e of entries){
      if(!e.name)continue;
      let existing=await db.entries.where('name').equals(e.name).first();
      if(existing){
        existing.triggers=[...new Set([...(existing.triggers||[]),...(e.triggers||[])])];
        // relationship/promise 타입: 상태 전이형 → 최신 상태로 교체
        if(['relationship','promise'].includes(e.type)){
          if(e.summary) existing.summary=e.summary;
          if(e.detail){
            existing.detail=existing.detail||{};
            // 상태 필드는 교체
            if(e.detail.current_status!==undefined) existing.detail.current_status=e.detail.current_status;
            if(e.detail.status!==undefined) existing.detail.status=e.detail.status;
            if(e.detail.resolved_approx!==undefined) existing.detail.resolved_approx=e.detail.resolved_approx;
            if(e.detail.resolution!==undefined) existing.detail.resolution=e.detail.resolution;
            if(e.detail.parties) existing.detail.parties=e.detail.parties;
            if(e.detail.maker) existing.detail.maker=e.detail.maker;
            if(e.detail.target) existing.detail.target=e.detail.target;
            if(e.detail.condition!==undefined) existing.detail.condition=e.detail.condition;
            if(e.detail.made_approx) existing.detail.made_approx=e.detail.made_approx;
            if(e.detail.nicknames) existing.detail.nicknames=e.detail.nicknames;
            // arc는 기존 항목 유지 + 새 항목 추가 (phase+approx_turn 기준 중복 제거)
            if(Array.isArray(e.detail.arc)){
              existing.detail.arc=existing.detail.arc||[];
              for(const newArc of e.detail.arc){
                const dup=existing.detail.arc.find(a=>a.phase===newArc.phase&&a.approx_turn===newArc.approx_turn);
                if(dup){Object.assign(dup,newArc);}
                else{existing.detail.arc.push(newArc);}
              }
            }
            // 나머지 detail 필드는 기존 append 로직
            for(const k in e.detail){
              if(['current_status','status','resolved_approx','resolution','arc','parties','maker','target','condition','made_approx','nicknames'].includes(k)) continue;
              if(!existing.detail[k]){existing.detail[k]=e.detail[k];}
              else if(Array.isArray(e.detail[k])){existing.detail[k]=[...new Set([...(existing.detail[k]||[]),...e.detail[k]])];
              }else{if(typeof existing.detail[k]==='string'&&typeof e.detail[k]==='string'&&!existing.detail[k].includes(e.detail[k]))existing.detail[k]+=' '+e.detail[k];}
            }
          }
        }else{
          // 기존 타입: 누적 병합, 단 상태성 필드는 교체
          if(e.summary&&(!existing.summary||!existing.summary.includes(e.summary))){
            existing.summary=existing.summary?existing.summary+' / '+e.summary:e.summary;
          }
          if(e.detail){
            existing.detail=existing.detail||{};
            if(e.detail.current_state!==undefined) existing.detail.current_state=e.detail.current_state;
            if(e.detail.last_interaction!==undefined) existing.detail.last_interaction=e.detail.last_interaction;
            for(const k in e.detail){
              if(['current_state','last_interaction'].includes(k)) continue;
              if(!existing.detail[k]){existing.detail[k]=e.detail[k];}
              else if(Array.isArray(e.detail[k])){existing.detail[k]=[...new Set([...(existing.detail[k]||[]),...e.detail[k]])];
              }else{if(typeof existing.detail[k]==='string'&&typeof e.detail[k]==='string'&&!existing.detail[k].includes(e.detail[k]))existing.detail[k]+=' '+e.detail[k];}
            }
          }
        }
        await db.entries.put(existing);
      }else{
        e.packName=packName;e.project=proj;e.enabled=true;
        await db.entries.put(e);addedCount++;
      }
    }
    if(addedCount>0){
      const count=await db.entries.where('packName').equals(packName).count();
      await db.packs.update(packName,{entryCount:count});
      await setPackEnabled(packName,true);
    }
    return entries.length;
  }

  // 대화 로그 획득
  async function fetchLogsFallback(fetchCount){
    let recentMsgs=[];
    try{
      let chatId=null;
      try{chatId=CrackUtil.path().chatRoom();}catch(e){}
      if(!chatId){
        const match=window.location.pathname.match(/\/episodes\/([a-f0-9]+)/);
        if(match)chatId=match[1];
      }
      if(chatId){
        const items=await CrackUtil.chatRoom().extractLogs(chatId,{maxCount:fetchCount});
        if(!(items instanceof Error)&&Array.isArray(items)){
          recentMsgs=items.map(m=>({role:m.role,message:m.content}));
        }
      }
    }catch(e){
      console.error('[Lore] fetchLogsFallback error:', e);
    }
    return recentMsgs;
  }

  // 자동 추출
  let _isExtracting = false;
  async function runAutoExtract(isManual=false){
    if (!isManual && _isExtracting) {
      console.log('[Lore] 추출 이미 진행 중, 스킵');
      return;
    }
    _isExtracting = true;
    showStatusBadge('대화 분석 중...');
    try {
      const _url = getCurUrl();
      const apiType = settings.config.autoExtApiType || settings.config.geminiApiType || 'key';
      const isVertex = apiType === 'vertex';
      const hasKey = settings.config.autoExtKey || settings.config.geminiKey;
      const hasJson = settings.config.autoExtVertexJson || settings.config.geminiVertexJson;

      if(isVertex ? !hasJson : !hasKey){
        if(isManual)alert('API 설정이 완료되지 않음 (Key 또는 Vertex JSON 누락).');
        return;
      }

      const scanR=settings.config.autoExtScanRange||6;
      const fetchCount=(scanR+settings.config.autoExtOffset)*2;
      let recentMsgs=await fetchLogsFallback(fetchCount>0?fetchCount:20);
      console.log(`[Lore] 자동 추출 시도: 획득한 메시지 ${recentMsgs.length}개`);
      if(!recentMsgs.length){
        if(isManual)alert('분석할 대화 기록이 없음 (또는 채팅방 인식 실패).');
        return;
      }
      const offsetCount=settings.config.autoExtOffset*2;
      if(offsetCount>0){
        if(recentMsgs.length>offsetCount){
          recentMsgs=recentMsgs.slice(0,recentMsgs.length-offsetCount);
          console.log(`[Lore] 오프셋 적용 후 남은 메시지: ${recentMsgs.length}개`);
        }else{
          console.log(`[Lore] 메시지 부족(${recentMsgs.length} <= ${offsetCount})으로 오프셋을 최소화합니다.`);
          // 오프셋을 적용하지 않고 최소한의 스캔 범위를 확보함 (혹은 무시)
        }
      }
      const context=recentMsgs.map(m=>m.role+': '+m.message).join('\n');
      let entriesText = '[]';

      const isInclude = settings.config.autoExtIncludeDb;
      if(isInclude){
        const packName=await getAutoExtPackForUrl(_url);
        const existingEntries=await db.entries.where('packName').equals(packName).toArray();
        if(existingEntries&&existingEntries.length>0){
          const clean=existingEntries.map(({id,packName,project,enabled,...rest})=>rest);
          entriesText=JSON.stringify(clean,null,2);
        }
      }

      // 유저 페르소나 정보 추가
      let personaPrefix='';
      if(settings.config.autoExtIncludePersona){
        try{
          let _chatId=null;
          try{_chatId=CrackUtil.path().chatRoom();}catch(e){}
          if(!_chatId){
            const match=window.location.pathname.match(/\/episodes\/([a-f0-9]+)/);
            if(match)_chatId=match[1];
          }
          if(_chatId){
            const persona=await CrackUtil.chatRoom().currentPersona(_chatId);
            if(persona&&!(persona instanceof Error)&&persona.name){
              personaPrefix='[User Persona: "'+persona.name+'"] All "user" role messages in this conversation are from this character. Use "'+persona.name+'" as the character name in extractions, NOT "user" or "유저".\n\n';
            }
          }
        }catch(e){console.warn('[Lore] 페르소나 조회 실패:',e);}
      }
      const promptTpl = isInclude ? (settings.config.autoExtPromptWithDb || DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB) : (settings.config.autoExtPromptWithoutDb || DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB);
      const prompt=personaPrefix+promptTpl.replace('{context}',context).replace('{entries}',entriesText);

      let apiLog = null;
      try{
        const res=await autoExtGemini(prompt, settings.config.autoExtMaxRetries || 1);
        apiLog = { status: res.status, error: res.error, retries: res.retries };

        if(!res.text) throw new Error(`AI 응답없음 (상태코드: ${res.status}, 오류: ${res.error || '알 수 없음'})`);

        let raw=res.text.replace(/^```json\s*/i,'').replace(/\s*```$/i,'').trim();
        const s=raw.indexOf('['),e=raw.lastIndexOf(']');
        if(s===-1||e===-1)throw new Error('유효한 JSON 형태가 아님');
        const parsed=JSON.parse(raw.slice(s,e+1));

        if(Array.isArray(parsed)&&parsed.length>0){
          const cnt=await mergeExtractedData(parsed, _url);
          addExtLog(_url, {time:new Date().toLocaleTimeString(),count:cnt,msgs:recentMsgs.length,isManual:isManual,status:'성공', api:apiLog});
          if(isManual)alert(`${cnt}개 로어 추출 및 병합됨.`);
        }else{
          addExtLog(_url, {time:new Date().toLocaleTimeString(),count:0,msgs:recentMsgs.length,isManual:isManual,status:'추출 내용 없음', api:apiLog});
          if(isManual)alert('새로운 설정 정보 발견되지 않음.');
        }
      }catch(err){
        addExtLog(_url, {time:new Date().toLocaleTimeString(),count:0,msgs:recentMsgs.length,isManual:isManual,status:'실패',error:err.message, api:apiLog});
        if(isManual)alert(`추출 실패: ${err.message}`);
      }
    } finally {
      _isExtracting = false;
      hideStatusBadge();
    }
  }

  // 메인 주입 로직
  async function inject(userInput){
    console.log('[Lore] inject() 호출, enabled:',settings.config.enabled,'길이:',userInput?.length);
    if(!settings.config.enabled){console.log('[Lore] 비활성화 상태');return userInput;}

    const _url=getCurUrl();
    let turnCounter=getTurnCounter(_url)+1;
    setTurnCounter(_url, turnCounter);

    if(settings.config.autoExtEnabled&&turnCounter>0&&turnCounter%settings.config.autoExtTurns===0){
      setTimeout(()=>runAutoExtract(false),1000);
    }

    const all=await db.entries.toArray();
    const _packs=settings.config.urlPacks?.[_url]||[];
    console.log('[Lore] DB:',all.length,'개 | URL:',_url,'| 활성팩:',JSON.stringify(_packs));
    let enabled=all.filter(e=>isEntryEnabledForUrl(e));
    console.log('[Lore] 필터후:',enabled.length,'개 활성');
    if(!enabled.length){console.log('[Lore] 활성항목 0 → 주입 건너뜀');return userInput;}

    const fetchCount=Math.max(10,(settings.config.smartTurns||5)*2);
    let recentMsgs=await fetchLogsFallback(fetchCount);
    console.log('[Lore] 최근대화:',recentMsgs.length,'개 (요청:',fetchCount,') | 입력길이:',userInput?.length);

    let matched=TriggerScanner.scan(userInput,recentMsgs,enabled,settings.config.scanRange,settings.config);
    console.log('[Lore] 트리거매치:',matched.length,'개',matched.slice(0,5).map(e=>e.name));
    matched=matched.slice(0,settings.config.maxEntries);
    if(!matched.length){console.log('[Lore] 매치 없음');return userInput;}

    if(settings.config.cooldownEnabled){
      const cMap=getCooldownMap(_url);
      matched=matched.filter(e=>{const last=cMap[e.id];return last===undefined||(turnCounter-last)>=settings.config.cooldownTurns;});
      if(!matched.length)return userInput;
    }

    for(const e of matched)setCooldownLastTurn(_url,e.id,turnCounter);

    const autoExtPack=await getAutoExtPackForUrl(_url);
    let autoPacks = [...(settings.config.autoPacks || [])];
    if(!autoPacks.includes(autoExtPack)) {
      autoPacks.push(autoExtPack);
    }

    const autoMatched=matched.filter(e=>autoPacks.includes(e.packName));
    const normalMatched=matched.filter(e=>!autoPacks.includes(e.packName));

    let finalInjectText='';
    if(normalMatched.length>0){
      const nPref=settings.config.prefix||'**[OOC: Lore — incorporate naturally, never repeat verbatim]**';
      const nSuff=settings.config.suffix||'';
      finalInjectText+=Fmt.formatManual(normalMatched,{prefix:nPref,suffix:nSuff});
    }
    if(autoMatched.length>0){
      const aPref=settings.config.autoExtPrefix||'**[OOC: Established facts — maintain consistency]**';
      const aSuff=settings.config.autoExtSuffix||'';
      finalInjectText+=Fmt.formatAuto(autoMatched,{prefix:aPref,suffix:aSuff});
    }

    addInjLog(_url, {time:new Date().toLocaleTimeString(),turn:turnCounter,matched:matched.map(e=>e.name),count:matched.length});
    console.log('[Lore] 주입완료!',matched.length+'개, 위치:',settings.config.position);
    return settings.config.position==='before'?finalInjectText+'\n\n'+userInput:userInput+'\n\n'+finalInjectText;
  }

  // 핸들러 등록 폴백
  const _w2=(typeof unsafeWindow!=='undefined')?unsafeWindow:window;
  if(_w2.__loreRegister){
    _w2.__loreRegister(inject);
  }
  // fetch 인터셉터 항상 설치 (WS + REST 동시 지원 — wrtn이 REST API로 전환한 경우 대비)
  {console.log('[Lore] fetch 인터셉터 설치 (REST API 대비)');
    const origFetch=_w2.fetch.bind(_w2);
    _w2.fetch=async function(...args){
      if(!settings.config.enabled)return origFetch.apply(this,args);
      try{
        let reqUrl='',isReq=false;
        if(args[0] instanceof Request){reqUrl=args[0].url;isReq=true;}
        else{reqUrl=args[0];}
        const method=isReq?args[0].method:((args[1]||{}).method||'GET');
        if(method==='POST'&&reqUrl&&(reqUrl.includes('/messages')||reqUrl.includes('/chat')||reqUrl.includes('wrtn.ai'))){
          let bodyText=null;
          if(isReq){try{bodyText=await args[0].clone().text();}catch(e){}}
          else if(args[1]?.body&&typeof args[1].body==='string'){bodyText=args[1].body;}
          if(bodyText){
            let body=null;try{body=JSON.parse(bodyText);}catch(e){}
            if(body){
              let injected=false;
              if(Array.isArray(body.messages)){
                for(let i=body.messages.length-1;i>=0;i--){
                  if(body.messages[i].role==='user'&&typeof body.messages[i].content==='string'){
                    if(!body.messages[i].content.includes('OOC:')){
                      const original=body.messages[i].content;
                      body.messages[i].content=await inject(original);
                      if(original!==body.messages[i].content)injected=true;
                    }
                    break;
                  }
                }
              }
              if(!injected){
                for(const key of['content','message','text','prompt','query']){
                  if(body[key]!==undefined&&typeof body[key]==='string'){
                    if(!body[key].includes('OOC:')){const original=body[key];body[key]=await inject(original);if(original!==body[key])injected=true;}
                    break;
                  }
                }
              }
              if(!injected&&body.variables&&typeof body.variables==='object'){
                for(const key of['content','message','text','prompt','query']){
                  if(body.variables[key]!==undefined&&typeof body.variables[key]==='string'){
                    if(!body.variables[key].includes('OOC:')){const original=body.variables[key];body.variables[key]=await inject(original);if(original!==body.variables[key])injected=true;}
                    break;
                  }
                }
              }
              if(injected){
                const newBodyText=JSON.stringify(body);
                if(isReq){args[0]=new Request(args[0],{body:newBodyText});}
                else{args[1]=args[1]||{};args[1].body=newBodyText;}
              }
            }
          }
        }
      }catch(e){console.error('[Lore] fallback intercept error:',e);}
      return origFetch.apply(this,args);
    };
  }

  // UI 헬퍼
  function setFullWidth(node){
    const p=node.parentElement;
    if(p){p.style.display='block';p.style.padding='0';p.style.border='none';p.style.background='transparent';Array.from(p.children).forEach(c=>{if(c!==node)c.style.display='none';});}
    node.style.cssText='width:100%;display:block;padding:10px 14px;box-sizing:border-box;background:transparent;border:none;margin-bottom:12px;';
    node.innerHTML='';
  }

  function createToggleRow(title,desc,isChecked,onChange){
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
    const left=document.createElement('div');
    left.style.cssText='display:flex;flex-direction:column;gap:4px;flex:1;';
    const t=document.createElement('div');t.textContent=title;t.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
    const d=document.createElement('div');d.textContent=desc;d.style.cssText='font-size:11px;color:#888;line-height:1.4;word-break:keep-all;';
    left.appendChild(t);left.appendChild(d);
    const right=document.createElement('div');right.style.cssText='display:flex;align-items:center;gap:8px;';
    const swLabel=document.createElement('span');
    swLabel.textContent=isChecked?'ON':'OFF';
    swLabel.style.cssText='font-size:12px;color:#ccc;font-weight:bold;width:22px;text-align:center;';
    const sw=document.createElement('div');
    sw.style.cssText=`width:36px;height:20px;border-radius:10px;cursor:pointer;background:${isChecked?'#285':'#444'};position:relative;flex-shrink:0;`;
    const dot=document.createElement('div');
    dot.style.cssText=`width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${isChecked?'18px':'2px'};transition:left .2s;`;
    sw.appendChild(dot);
    sw.onclick=()=>{
      isChecked=!isChecked;onChange(isChecked);
      swLabel.textContent=isChecked?'ON':'OFF';
      sw.style.background=isChecked?'#285':'#444';
      dot.style.left=isChecked?'18px':'2px';
    };
    right.appendChild(swLabel);right.appendChild(sw);
    wrap.appendChild(left);wrap.appendChild(right);
    return wrap;
  }

  // API 타입 선택 (key vs vertex) + 입력란 생성 헬퍼
  function createApiInput(config, prefix, nd) {
    const apiTypeKey = prefix + 'ApiType';
    const keyKey = prefix === 'gemini' ? 'geminiKey' : 'autoExtKey';
    const jsonKey = prefix + 'VertexJson';
    const locKey = prefix + 'VertexLocation';
    const projKey = prefix + 'VertexProjectId';
    const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';

    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    const btnKey = document.createElement('button');
    const btnVertex = document.createElement('button');
    const isVertex = () => (config[apiTypeKey] || 'key') === 'vertex';

    const updateTypeBtns = () => {
      const v = isVertex();
      btnKey.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!v?'#285':'#444'};background:${!v?'#285':'transparent'};color:${!v?'#fff':'#ccc'};`;
      btnVertex.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${v?'#285':'#444'};background:${v?'#285':'transparent'};color:${v?'#fff':'#ccc'};`;
      keyArea.style.display = v ? 'none' : '';
      vertexArea.style.display = v ? '' : 'none';
    };
    btnKey.textContent = 'API Key';
    btnVertex.textContent = 'Vertex AI (JSON)';
    btnKey.onclick = () => { config[apiTypeKey] = 'key'; settings.save(); updateTypeBtns(); };
    btnVertex.onclick = () => { config[apiTypeKey] = 'vertex'; settings.save(); updateTypeBtns(); };
    typeRow.appendChild(btnKey);
    typeRow.appendChild(btnVertex);
    nd.appendChild(typeRow);

    const keyArea = document.createElement('div');
    const ki = document.createElement('input');
    ki.type = 'text';
    ki.value = config[keyKey] || '';
    ki.placeholder = 'AIzaSy... (또는 여기에 Service Account JSON을 붙여넣기)';
    ki.setAttribute('autocomplete', 'off');
    ki.style.cssText = S + '-webkit-text-security: disc;';
    ki.onchange = () => {
      const val = ki.value.trim();
      if (val.startsWith('{') && val.includes('client_email')) {
        config[apiTypeKey] = 'vertex';
        config[jsonKey] = val;
        ki.value = '';
        jta.value = val;
        settings.save();
        updateTypeBtns();
        updateStatus();
        return;
      }
      config[keyKey] = val;
      settings.save();
    };
    keyArea.appendChild(ki);
    nd.appendChild(keyArea);

    const vertexArea = document.createElement('div');
    const jta = document.createElement('textarea');
    jta.value = config[jsonKey] || '';
    jta.placeholder = `{\n  "type": "service_account",\n  "project_id": "my-project-123",\n  "private_key_id": "abc123...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",\n  "client_email": "my-sa@my-project.iam.gserviceaccount.com",\n  "client_id": "123456789",\n  ...\n}`;
    jta.style.cssText = S + 'height:120px;font-family:monospace;resize:vertical;';
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'font-size:11px;margin-top:4px;margin-bottom:8px;';

    const projInput = document.createElement('input');

    const updateStatus = () => {
      const val = jta.value.trim();
      if (!val) { statusDiv.textContent = ''; return; }
      const parsed = parseServiceAccountJson(val);
      if (parsed.ok) {
        statusDiv.textContent = `✅ 인식됨 — project: ${parsed.projectId}, email: ${parsed.clientEmail}`;
        statusDiv.style.color = '#4a9';
        if (parsed.projectId && !config[projKey]) {
          config[projKey] = parsed.projectId;
          projInput.value = parsed.projectId;
          settings.save();
        }
      } else {
        statusDiv.textContent = `❌ ${parsed.error}`;
        statusDiv.style.color = '#d66';
      }
    };

    jta.onchange = () => { config[jsonKey] = jta.value; settings.save(); updateStatus(); };
    jta.oninput = updateStatus;
    vertexArea.appendChild(jta);
    vertexArea.appendChild(statusDiv);

    const locRow = document.createElement('div');
    locRow.style.cssText = 'display:flex;gap:12px;margin-bottom:8px;';
    const locDiv = document.createElement('div'); locDiv.style.flex = '1';
    const ll = document.createElement('div');
    ll.textContent = 'Location (지역/리전)';
    ll.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;';
    const locInput = document.createElement('input');
    locInput.value = config[locKey] || 'global';
    locInput.placeholder = 'global (일부 모델 미지원 시 us-central1 시도)';
    locInput.style.cssText = S;
    locInput.onchange = () => { config[locKey] = locInput.value || 'global'; settings.save(); };
    locDiv.appendChild(ll); locDiv.appendChild(locInput);

    const projDiv = document.createElement('div'); projDiv.style.flex = '1';
    const pl = document.createElement('div');
    pl.textContent = 'Project ID (자동 감지, 수동 오버라이드)';
    pl.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;';
    projInput.value = config[projKey] || '';
    projInput.placeholder = 'JSON에서 자동 추출됨';
    projInput.style.cssText = S;
    projInput.onchange = () => { config[projKey] = projInput.value; settings.save(); };
    projDiv.appendChild(pl); projDiv.appendChild(projInput);

    locRow.appendChild(locDiv); locRow.appendChild(projDiv);
    vertexArea.appendChild(locRow);
    nd.appendChild(vertexArea);

    updateTypeBtns();
    if (config[jsonKey]) updateStatus();
  }

  // 메뉴 통합
  function setupUI(){
    const modal=ModalManager.getOrCreateManager('c2');

    modal.createMenu('로어 인젝션',(m)=>{
      m.replaceContentPanel(async(panel)=>{
        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);
          nd.appendChild(createToggleRow('로어 인젝션 활성화','대화에 설정 정보를 자동 삽입함.',settings.config.enabled,(val)=>{settings.config.enabled=val;settings.save();}));
        }});

        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);
          const wrap=document.createElement('div');
          wrap.style.cssText='display:flex;justify-content:space-between;align-items:center;width:100%;';
          const left=document.createElement('div');
          left.style.cssText='display:flex;flex-direction:column;gap:4px;flex:1;';
          const title=document.createElement('div');title.textContent='주입 위치';title.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
          const desc=document.createElement('div');desc.textContent='메시지 기준 설정 삽입 위치 선택.';desc.style.cssText='font-size:11px;color:#888;';
          left.appendChild(title);left.appendChild(desc);
          const right=document.createElement('div');right.style.cssText='display:flex;gap:6px;';
          const b1=document.createElement('button');const b2=document.createElement('button');
          const updateBtns=()=>{
            const isB=settings.config.position==='before';
            b1.style.cssText=`padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${isB?'#285':'#444'};background:${isB?'#285':'transparent'};color:${isB?'#fff':'#ccc'};`;
            b2.style.cssText=`padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!isB?'#285':'#444'};background:${!isB?'#285':'transparent'};color:${!isB?'#fff':'#ccc'};`;
          };
          b1.textContent='메시지 앞';b1.onclick=()=>{settings.config.position='before';settings.save();updateBtns();};
          b2.textContent='메시지 뒤';b2.onclick=()=>{settings.config.position='after';settings.save();updateBtns();};
          updateBtns();
          right.appendChild(b1);right.appendChild(b2);
          wrap.appendChild(left);wrap.appendChild(right);nd.appendChild(wrap);
        }});

        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);
          const title1=document.createElement('div');title1.textContent='[일반 로어] 출력 설정';title1.style.cssText='font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;';nd.appendChild(title1);

          const prefLbl=document.createElement('div');prefLbl.textContent='접두사 (Prefix)';prefLbl.style.cssText='font-size:12px;color:#ccc;font-weight:bold;margin-bottom:4px;';
          const prefDesc=document.createElement('div');prefDesc.textContent='수동으로 추가한 일반 로어 텍스트 시작 부분 삽입 문구.';prefDesc.style.cssText='font-size:11px;color:#888;margin-bottom:6px;';
          const prefInp=document.createElement('input');prefInp.value=settings.config.prefix||'';
          prefInp.style.cssText='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;';
          prefInp.onchange=()=>{settings.config.prefix=prefInp.value;settings.save();};
          nd.appendChild(prefLbl);nd.appendChild(prefDesc);nd.appendChild(prefInp);

          const suffLbl=document.createElement('div');suffLbl.textContent='접미사 (Suffix)';suffLbl.style.cssText='font-size:12px;color:#ccc;font-weight:bold;margin-bottom:4px;';
          const suffInp=document.createElement('input');suffInp.value=settings.config.suffix||'';
          suffInp.style.cssText='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:20px;';
          suffInp.onchange=()=>{settings.config.suffix=suffInp.value;settings.save();};
          nd.appendChild(suffLbl);nd.appendChild(suffInp);

          const title2=document.createElement('div');title2.textContent='[자동 추출 로어] 출력 설정';title2.style.cssText='font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;';nd.appendChild(title2);

          const aPrefLbl=document.createElement('div');aPrefLbl.textContent='전용 접두사';aPrefLbl.style.cssText='font-size:12px;color:#ccc;font-weight:bold;margin-bottom:4px;';
          const aPrefDesc=document.createElement('div');aPrefDesc.textContent='대화 분석으로 자동 추가된 로어 텍스트 시작 부분 삽입 문구 (비워둘 시 기본값).';aPrefDesc.style.cssText='font-size:11px;color:#888;margin-bottom:6px;';
          const aPrefInp=document.createElement('input');aPrefInp.value=settings.config.autoExtPrefix||'';aPrefInp.placeholder='[OOC: New lore established:]';
          aPrefInp.style.cssText='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;';
          aPrefInp.onchange=()=>{settings.config.autoExtPrefix=aPrefInp.value;settings.save();};
          nd.appendChild(aPrefLbl);nd.appendChild(aPrefDesc);nd.appendChild(aPrefInp);

          const aSuffLbl=document.createElement('div');aSuffLbl.textContent='전용 접미사';aSuffLbl.style.cssText='font-size:12px;color:#ccc;font-weight:bold;margin-bottom:4px;';
          const aSuffInp=document.createElement('input');aSuffInp.value=settings.config.autoExtSuffix||'';aSuffInp.placeholder='[End of new lore]';
          aSuffInp.style.cssText='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
          aSuffInp.onchange=()=>{settings.config.autoExtSuffix=aSuffInp.value;settings.save();};
          nd.appendChild(aSuffLbl);nd.appendChild(aSuffInp);
        }});

        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);

          const makeNumRow=(title,desc,val,min,max,onChange)=>{
            const wrap=document.createElement('div');wrap.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:12px;';
            const left=document.createElement('div');left.style.cssText='display:flex;flex-direction:column;gap:4px;flex:1;';
            const t=document.createElement('div');t.textContent=title;t.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
            const d=document.createElement('div');d.textContent=desc;d.style.cssText='font-size:11px;color:#888;line-height:1.4;word-break:keep-all;';
            left.appendChild(t);left.appendChild(d);
            const right=document.createElement('div');right.style.cssText='display:flex;align-items:center;';
            const inp=document.createElement('input');inp.type='number';inp.value=val;inp.min=min;inp.max=max;
            inp.style.cssText='width:60px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;box-sizing:border-box;';
            inp.onchange=()=>{let v=parseInt(inp.value);if(isNaN(v))v=val;onChange(v);};
            right.appendChild(inp);
            wrap.appendChild(left);wrap.appendChild(right);
            return wrap;
          };

          nd.appendChild(makeNumRow('문맥 검색 범위','최근 참조 턴 수 (0: 현재 입력만 검사).',settings.config.scanRange,0,50,(v)=>{settings.config.scanRange=v;settings.save();}));
          nd.appendChild(makeNumRow('문맥 검색 범위 오프셋','최근 N턴을 건너뛰고 이전부터 검색함.',settings.config.scanOffset||0,0,50,(v)=>{settings.config.scanOffset=v;settings.save();}));
          nd.appendChild(makeNumRow('최대 주입 개수','메시지당 최대 로어 주입 개수.',settings.config.maxEntries,1,30,(v)=>{settings.config.maxEntries=v;settings.save();}));
        }});

        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);
          const wrap=document.createElement('div');wrap.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;';
          const left=document.createElement('div');left.style.cssText='display:flex;flex-direction:column;gap:4px;flex:1;';
          const title=document.createElement('div');title.textContent='재주입 쿨다운';title.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
          const desc=document.createElement('div');desc.textContent='주입된 로어가 지정 턴 동안 중복 주입되지 않게 제한함.';desc.style.cssText='font-size:11px;color:#888;';
          left.appendChild(title);left.appendChild(desc);
          const right=document.createElement('div');right.style.cssText='display:flex;flex-direction:column;align-items:flex-end;gap:8px;';
          const swWrap=document.createElement('div');swWrap.style.cssText='display:flex;align-items:center;gap:8px;';
          const swLabel=document.createElement('span');swLabel.textContent=settings.config.cooldownEnabled?'ON':'OFF';swLabel.style.cssText='font-size:12px;color:#ccc;font-weight:bold;';
          const sw=document.createElement('div');sw.style.cssText='width:36px;height:20px;border-radius:10px;cursor:pointer;background:'+(settings.config.cooldownEnabled?'#285':'#444')+';position:relative;flex-shrink:0;';
          const dot=document.createElement('div');dot.style.cssText='width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:'+(settings.config.cooldownEnabled?'18px':'2px')+';transition:left .2s;';
          sw.appendChild(dot);
          sw.onclick=()=>{
            settings.config.cooldownEnabled=!settings.config.cooldownEnabled;settings.save();
            sw.style.background=settings.config.cooldownEnabled?'#285':'#444';dot.style.left=settings.config.cooldownEnabled?'18px':'2px';
            swLabel.textContent=settings.config.cooldownEnabled?'ON':'OFF';
          };
          swWrap.appendChild(swLabel);swWrap.appendChild(sw);
          const turnsWrap=document.createElement('div');turnsWrap.style.cssText='display:flex;align-items:center;gap:6px;';
          const ti=document.createElement('input');ti.type='number';ti.value=settings.config.cooldownTurns||10;ti.min=1;ti.max=100;
          ti.style.cssText='width:50px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
          ti.onchange=()=>{settings.config.cooldownTurns=parseInt(ti.value)||10;settings.save();};
          const tu=document.createElement('span');tu.textContent='턴 금지';tu.style.cssText='font-size:11px;color:#999;';
          turnsWrap.appendChild(ti);turnsWrap.appendChild(tu);
          right.appendChild(swWrap);right.appendChild(turnsWrap);
          wrap.appendChild(left);wrap.appendChild(right);nd.appendChild(wrap);
        }});

        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);
          const title=document.createElement('div');title.textContent='자체 스마트 필터 (고급 설정)';title.style.cssText='font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;';nd.appendChild(title);
          nd.appendChild(createToggleRow('한국어 조사 필터','문맥에 맞는 조사 결합 형태만 식별.',settings.config.strictMatch,(val)=>{settings.config.strictMatch=val;settings.save();}));
          nd.appendChild(createToggleRow('오타 허용 설정','단어 오타 시 형태 유사도 분석 후 반영.',settings.config.similarityMatch,(val)=>{settings.config.similarityMatch=val;settings.save();}));

          const resetBtn = document.createElement('button');
          resetBtn.textContent = '모든 로그/설정 초기화 및 삭제';
          resetBtn.style.cssText = 'width:100%;padding:10px;margin-top:20px;background:#833;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;';
          resetBtn.onclick = () => {
            if(confirm('모든 로어 설정, URL 상태, 로그를 삭제하고 초기화 (로어 DB 데이터는 유지됨)')){
              _ls.removeItem(_SKEY);
              alert('초기화 완료. 페이지 새로고침됨.');
              location.reload();
            }
          };
          nd.appendChild(resetBtn);
        }});
      },'로어 인젝션 메인');
    })

    .createSubMenu('활성화된 로어 관리',(m)=>{
      const renderPanel=async(panel)=>{
        const _url = getCurUrl();
        const activePacks = settings.config.urlPacks?.[_url] || [];

        if (!activePacks.length) {
          panel.addText('현재 대화방에 활성화된 로어 없음.');
          panel.addText('로어 불러오기/관리 메뉴에서 활성화 필요.');
          return;
        }

        const entries=await db.entries.toArray();
        const filtered = entries.filter(e => activePacks.includes(e.packName));

        if (!filtered.length) {
          panel.addText('활성화된 로어 항목 없음.');
          return;
        }

        const byPack={};
        filtered.forEach(e=>{const pk=e.packName||'(미분류)';(byPack[pk]=byPack[pk]||[]).push(e);});

        for(const[pk,items]of Object.entries(byPack)){
          panel.addBoxedField('','',{onInit:(nd)=>{
            const p=nd.parentElement;
            if(p){p.style.display='block';p.style.padding='0';p.style.border='none';p.style.background='transparent';Array.from(p.children).forEach(c=>{if(c!==nd)c.style.display='none';});}
            nd.style.cssText='width:100%;display:block;padding:10px 14px;box-sizing:border-box;background:#1a1a1a;border:1px solid #333;border-radius:4px;margin-bottom:12px;';
            nd.innerHTML='';

            const headerRow=document.createElement('div');
            headerRow.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #333;padding-bottom:6px;cursor:pointer;';
            const title=document.createElement('div');
            title.style.cssText='font-size:14px;font-weight:bold;color:#ccc;';
            title.textContent=`${pk} (${items.length}개)`;

            const rightGroup=document.createElement('div');
            rightGroup.style.cssText='display:flex;align-items:center;gap:10px;';

            const allEnabled = items.every(item => isEntryEnabledForUrl(item));

            const swWrap=document.createElement('div');
            swWrap.style.cssText='display:flex;align-items:center;gap:6px;cursor:pointer;background:#111;padding:2px 8px;border-radius:12px;border:1px solid #333;flex-shrink:0;';
            const swLabel=document.createElement('span');
            swLabel.textContent=allEnabled?'ON':'OFF';
            swLabel.style.cssText=`font-size:10px;font-weight:bold;width:42px;text-align:center;color:${allEnabled?'#4a7':'#777'};`;
            const sw=document.createElement('div');
            sw.style.cssText=`width:24px;height:12px;border-radius:6px;background:${allEnabled?'#285':'#444'};position:relative;`;
            const dot=document.createElement('div');
            dot.style.cssText=`width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${allEnabled?'14px':'2px'};transition:left .2s;`;
            sw.appendChild(dot);swWrap.appendChild(swLabel);swWrap.appendChild(sw);

            const arrow=document.createElement('span');
            arrow.textContent='▼';
            arrow.style.cssText='font-size:12px;color:#888;transition:transform 0.2s;margin-left:4px;';

            rightGroup.appendChild(swWrap);
            rightGroup.appendChild(arrow);
            headerRow.appendChild(title);
            headerRow.appendChild(rightGroup);
            nd.appendChild(headerRow);

            items.sort((a,b)=>(a.type||'').localeCompare(b.type||''));
            const listContainer=document.createElement('div');
            listContainer.style.cssText='display:none;flex-direction:column;gap:0;';

            let isExpanded=false;
            headerRow.onclick=(e)=>{
              isExpanded=!isExpanded;
              listContainer.style.display=isExpanded?'flex':'none';
              arrow.style.transform=isExpanded?'rotate(180deg)':'rotate(0deg)';
            };

            swWrap.onclick=async(e)=>{
              e.stopPropagation();
              const targetState = !allEnabled;
              for(const item of items){
                setEntryEnabled(item, targetState);
              }
              m.replaceContentPanel(renderPanel,'활성화된 로어 관리');
            };

            for(const e of items){
              const row=document.createElement('div');
              row.style.cssText='padding:8px 0;border-bottom:1px solid #222;display:flex;flex-direction:column;';

              const header=document.createElement('div');
              header.style.cssText='display:flex;justify-content:space-between;align-items:center;';

              const left=document.createElement('div');
              left.style.cssText='display:flex;align-items:center;gap:8px;flex:1;';

              const isEnabled=isEntryEnabledForUrl(e);
              const swWrap=document.createElement('div');
              swWrap.style.cssText='display:flex;align-items:center;gap:6px;cursor:pointer;background:#111;padding:2px 8px;border-radius:12px;border:1px solid #333;flex-shrink:0;';
              const swLabel=document.createElement('span');
              swLabel.textContent=isEnabled?'ON':'OFF';
              swLabel.style.cssText=`font-size:10px;font-weight:bold;width:20px;text-align:center;color:${isEnabled?'#4a7':'#777'};`;
              const sw=document.createElement('div');
              sw.style.cssText=`width:24px;height:12px;border-radius:6px;background:${isEnabled?'#285':'#444'};position:relative;`;
              const dot=document.createElement('div');
              dot.style.cssText=`width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${isEnabled?'14px':'2px'};transition:left .2s;`;
              sw.appendChild(dot);swWrap.appendChild(swLabel);swWrap.appendChild(sw);
              swWrap.onclick=(ev)=>{
                ev.stopPropagation();
                const newState=!isEntryEnabledForUrl(e);
                setEntryEnabled(e,newState);
                swLabel.textContent=newState?'ON':'OFF';
                swLabel.style.color=newState?'#4a7':'#777';
                sw.style.background=newState?'#285':'#444';
                dot.style.left=newState?'14px':'2px';
              };

              const nameSpan=document.createElement('span');
              nameSpan.textContent=`[${e.type}] ${e.name}`;
              nameSpan.style.cssText='font-size:13px;color:#ccc;font-weight:bold;cursor:pointer;flex:1;';

              left.appendChild(swWrap);left.appendChild(nameSpan);

              const right=document.createElement('div');
              right.style.cssText='display:flex;gap:6px;';
              const B='font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
              const copyBtn=document.createElement('button');copyBtn.textContent='복사';copyBtn.style.cssText=B+'color:#4a9;border-color:#264;';
              copyBtn.onclick=(ev)=>{
                ev.stopPropagation();
                const clean={...e};delete clean.id;delete clean.packName;delete clean.project;delete clean.enabled;
                navigator.clipboard.writeText(JSON.stringify(clean,null,2)).then(()=>alert('클립보드에 복사됨.')).catch(()=>alert('복사 실패'));
              };
              const editBtn=document.createElement('button');editBtn.textContent='수정';editBtn.style.cssText=B+'color:#88c;border-color:#446;';
              const delBtn=document.createElement('button');delBtn.textContent='삭제';delBtn.style.cssText=B+'color:#a55;border-color:#633;';
              right.appendChild(copyBtn);right.appendChild(editBtn);right.appendChild(delBtn);
              header.appendChild(left);header.appendChild(right);
              row.appendChild(header);

              const editContainer=document.createElement('div');
              editContainer.style.cssText='display:none;margin-top:8px;flex-direction:column;gap:8px;';
              const ta=document.createElement('textarea');
              ta.style.cssText='width:100%;height:200px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;';
              const editableObj={...e};delete editableObj.id;delete editableObj.packName;delete editableObj.project;delete editableObj.enabled;
              ta.value=JSON.stringify(editableObj,null,2);
              const btnRow=document.createElement('div');btnRow.style.cssText='display:flex;justify-content:flex-end;gap:6px;';
              const saveBtn=document.createElement('button');saveBtn.textContent='저장';saveBtn.style.cssText=B+'background:#285;border-color:#285;color:#fff;';
              const cancelBtn=document.createElement('button');cancelBtn.textContent='닫기';cancelBtn.style.cssText=B;
              btnRow.appendChild(cancelBtn);btnRow.appendChild(saveBtn);
              editContainer.appendChild(ta);editContainer.appendChild(btnRow);
              row.appendChild(editContainer);

              const toggleEdit=()=>{const isHidden=editContainer.style.display==='none';editContainer.style.display=isHidden?'flex':'none';};
              nameSpan.onclick=toggleEdit;editBtn.onclick=toggleEdit;cancelBtn.onclick=toggleEdit;

              saveBtn.onclick=async()=>{
                try{const parsed=JSON.parse(ta.value);const updated={...e,...parsed};await db.entries.put(updated);alert('수정됨.');nameSpan.textContent=`[${updated.type}] ${updated.name}`;toggleEdit();}
                catch(err){alert('JSON 파싱 오류: '+err.message);}
              };

              delBtn.onclick=async()=>{
                if(confirm(`[${e.name}] 삭제함?`)){
                  await db.entries.delete(e.id);
                  const count=await db.entries.where('packName').equals(e.packName).count();
                  await db.packs.update(e.packName,{entryCount:count});
                  row.remove();
                  title.textContent=`${pk} (${count}개)`;
                }
              };

              listContainer.appendChild(row);
            }
            nd.appendChild(listContainer);
          }});
        }
      };
      m.replaceContentPanel(renderPanel,'활성화된 로어 관리');
    })

    .createSubMenu('재주입 쿨다운 상태',(m)=>{
      const renderPanel = async (panel) => {
        const _url = getCurUrl();
        const curTurn = getTurnCounter(_url);
        const urlMap = getCooldownMap(_url);
        const cooldownTurns = settings.config.cooldownTurns || 10;

        let onCooldown = [];
        for (const [idStr, lastTurn] of Object.entries(urlMap)) {
          const id = parseInt(idStr);
          const elapsed = curTurn - lastTurn;
          const rem = cooldownTurns - elapsed;
          if (rem > 0) {
            const entry = await db.entries.get(id);
            if(entry) onCooldown.push({id, entry, rem, lastTurn});
          }
        }

        if(onCooldown.length === 0) {
          panel.addBoxedField('','',{onInit:(nd)=>{
            setFullWidth(nd);
            const title=document.createElement('div');title.textContent=`[현재 세션] 쿨다운 상태 (현재 턴: ${curTurn})`;title.style.cssText='font-size:14px;color:#ccc;font-weight:bold;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #333;';
            nd.appendChild(title);
            const empty=document.createElement('div');empty.textContent='현재 쿨다운 적용 중인 로어 없음.';empty.style.cssText='font-size:12px;color:#888;';
            nd.appendChild(empty);
          }});
          return;
        }

        onCooldown.sort((a,b) => b.rem - a.rem);

        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);
          const title=document.createElement('div');title.textContent=`[현재 세션] 쿨다운 상태 (현재 턴: ${curTurn})`;title.style.cssText='font-size:14px;color:#ccc;font-weight:bold;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #333;';
          nd.appendChild(title);

          for(const item of onCooldown) {
            const row=document.createElement('div');
            row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #222;';

            const nameEl=document.createElement('div');
            nameEl.textContent=`[${item.entry.packName}] ${item.entry.name}`;
            nameEl.style.cssText='font-size:12px;color:#ccc;';

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; gap:8px; align-items:center;';

            const remEl=document.createElement('div');
            remEl.textContent=`${item.rem}턴 남음`;
            remEl.style.cssText='font-size:12px;color:#a55;font-weight:bold;background:#311;padding:2px 6px;border-radius:4px;';

            const delBtn = document.createElement('button');
            delBtn.textContent = '해제';
            delBtn.style.cssText = 'font-size:11px; padding:2px 6px; border-radius:3px; background:transparent; border:1px solid #633; color:#a55; cursor:pointer;';
            delBtn.onclick = () => {
              delete settings.config.urlCooldownMaps[_url][item.id];
              if (Object.keys(settings.config.urlCooldownMaps[_url]).length === 0) {
                setTurnCounter(_url, 0);
              }
              settings.save();
              m.replaceContentPanel(renderPanel, '재주입 쿨다운 상태');
            };

            actions.appendChild(remEl);
            actions.appendChild(delBtn);

            row.appendChild(nameEl);
            row.appendChild(actions);
            nd.appendChild(row);
          }
        }});
      };

      m.replaceContentPanel(renderPanel, '재주입 쿨다운 상태');
    })

    .createSubMenu('로어 불러오기/관리',(m)=>{
      m.replaceContentPanel((panel)=>renderPackUI(panel,m),'로어 불러오기/관리');
    })

    .createSubMenu('대화 자동 DB화',(m)=>{
      m.replaceContentPanel((panel)=>renderAutoExtractUI(panel,m),'대화 자동 DB화');
    })

    .createSubMenu('실행 로그',(m)=>{
      const renderInjLogPanel = async (panel) => {
        const _url = getCurUrl();
        const currentInjLog = getInjLog(_url);

        panel.addBoxedField('','',{onInit:(nd)=>{
          setFullWidth(nd);
          const headerRow = document.createElement('div');
          headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid #333;margin-bottom:8px;';

          const title = document.createElement('div');
          title.textContent = '최근 로어 주입 기록';
          title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;';

          const delBtn = document.createElement('button');
          delBtn.textContent = '로그 초기화';
          delBtn.style.cssText = 'padding:4px 10px;font-size:11px;border-radius:4px;cursor:pointer;background:transparent;color:#d66;border:1px solid #d66;font-weight:bold;';
          delBtn.onclick = () => {
            if(confirm('이 대화방의 모든 주입 로그를 삭제하시겠습니까?')){
              clearInjLog(_url);
              m.replaceContentPanel(renderInjLogPanel, '실행 로그');
            }
          };

          headerRow.appendChild(title);
          if (currentInjLog.length > 0) headerRow.appendChild(delBtn);
          nd.appendChild(headerRow);

          if(!currentInjLog.length){
            const empty = document.createElement('div');
            empty.textContent = '실행 기록 없음.';
            empty.style.cssText = 'font-size:12px;color:#888;padding:10px 0;';
            nd.appendChild(empty);
          }
        }});

        if(currentInjLog.length){
          for(const l of currentInjLog.slice(0,30)){
            panel.addBoxedField('','',{onInit:(nd)=>{
            setFullWidth(nd);
            const t=document.createElement('div');t.textContent=`${l.turn}번째 턴 (${l.time})`;t.style.cssText='font-size:13px;color:#ccc;font-weight:bold;margin-bottom:4px;';
            const c=document.createElement('div');
            if(l.count > 0) {
              c.textContent=`주입 로어 ${l.count}개: ${l.matched.join(', ')}`;
            } else {
              c.textContent='매치된 로어 없음 (또는 쿨다운/필터링됨)';
            }
            c.style.cssText='font-size:12px;color:#888;';
            nd.appendChild(t);nd.appendChild(c);
          }});
          }
        }
      };
      m.replaceContentPanel(renderInjLogPanel,'실행 로그');
    })

    .createSubMenu('도움말',(m)=>{
      m.replaceContentPanel((panel)=>{
        const addHelpBox=(title,lines)=>{
          panel.addBoxedField('','',{onInit:(node)=>{
            setFullWidth(node);
            const t=document.createElement('div');t.textContent=title;t.style.cssText='font-size:13px;color:#ccc;font-weight:bold;margin-bottom:4px;color:#4a9;';node.appendChild(t);
            lines.forEach(l=>{const d=document.createElement('div');d.style.cssText='font-size:12px;color:#aaa;line-height:1.5;word-break:keep-all;margin-bottom:2px;';d.innerHTML=l;node.appendChild(d);});
          }});
        };
        addHelpBox('로어 인젝션 개요',['세계관, 등장인물 정보 등을 대화에 자동 주입하는 기능임.','대화 내 등록된 키워드 발동 시 로어 데이터를 찾아 AI 메시지 앞/뒤에 추가함.']);
        addHelpBox('1. 초기 추천 설정 예시',[
          '<b>[주입 옵션]</b>',
          '- 주입 위치: 메시지 앞',
          '- 문맥 검색 범위: 6 / 범위 오프셋: 5 / 최대 주입 개수: 3-5',
          '- 재주입 쿨다운: ON (10턴 금지)',
          '- 한국어 조사 필터: ON / 오타 허용: ON',
          '<br/><b>[자동 추출 옵션]</b>',
          '- 대화 자동 DB화 활성화: ON (주기: 6, 범위: 6, 오프셋: 5)',
          '- 기존 로어 데이터 전송: ON (중복 맥락 추출 방지용)'
        ]);
        addHelpBox('2. 설정 항목 안내',[
          '<b>재주입 쿨다운</b>: 주입된 로어가 매턴 반복해서 불필요하게 낭비되는 것을 막음.',
          '<b>문맥 검색 범위</b>: 최근 대화 중 몇 턴 전까지의 대화에서 키워드를 찾을지 설정함.',
          '<b>오프셋</b>: 가장 최근 대화 N턴을 건너뛰고 검색함.',
          '<b>스마트 주입(중복 제외)</b>: 로어가 이미 AI의 맥락에 있다고 판단되면 주입을 생략함.'
        ]);
        addHelpBox('3. 대화 자동 DB화 상세',[
          '진행 중인 대화를 분석하여 새롭게 만들어진 정보(약속, 설정)를 백그라운드에서 자동 추출해 DB에 추가함.',
          '<br/><b>[턴 설정 예시]</b>',
          '- 자동 추출 주기: 6턴 / 추출 범위: 6턴 / 제외 오프셋: 5턴',
          '▶ 현재 대화가 11턴이라면 마지막 5턴(7~12)은 제외하고, 앞의 6턴(1~6) 대화를 분석해 DB에 반영함.'
        ]);
      },'도움말');
    });

    modal.addLicenseDisplay((panel)=>{panel.addTitleText('로어-인젝터').addText('by 로컬AI | decentralized-modal.js by milkyway0308');});
  }

  // renderAutoExtractUI
  function renderAutoExtractUI(panel,m){
    panel.addBoxedField('','',{onInit:(nd)=>{
      setFullWidth(nd);
      nd.appendChild(createToggleRow('대화 자동 DB화 활성화','대화를 백그라운드에서 주기적으로 분석하여 새로운 설정을 DB에 추가함.',settings.config.autoExtEnabled,(val)=>{settings.config.autoExtEnabled=val;settings.save();}));
      nd.appendChild(createToggleRow('기존 로어 데이터 함께 전송','현재 대상 그룹의 전체 JSON 데이터를 AI에게 함께 전송하여 중복 추출을 방지하고 정확도를 높임. (토큰 사용량 증가)',settings.config.autoExtIncludeDb,(val)=>{
        settings.config.autoExtIncludeDb=val;
        settings.save();
      }));
      nd.appendChild(createToggleRow('유저 페르소나 이름 포함','추출 시 현재 채팅방의 유저 페르소나 이름을 AI에게 전달하여 "user" 대신 실제 캐릭터명으로 추출함.',settings.config.autoExtIncludePersona,(val)=>{
        settings.config.autoExtIncludePersona=val;
        settings.save();
      }));

      const row1=document.createElement('div');row1.style.cssText='display:flex;gap:12px;margin-bottom:8px;align-items:center;';

      const f0=document.createElement('div');f0.style.flex='1';
      const l0=document.createElement('div');l0.textContent='자동 추출 주기(턴)';l0.style.cssText='font-size:12px;color:#888;margin-bottom:4px;';
      const i0=document.createElement('input');i0.type='number';i0.min=1;i0.value=settings.config.autoExtTurns||6;
      i0.style.cssText='width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      i0.onchange=()=>{settings.config.autoExtTurns=parseInt(i0.value)||6;settings.save();};
      f0.appendChild(l0);f0.appendChild(i0);

      const f1=document.createElement('div');f1.style.flex='1';
      const l1=document.createElement('div');l1.textContent='추출 범위(턴)';l1.style.cssText='font-size:12px;color:#888;margin-bottom:4px;';
      const i1=document.createElement('input');i1.type='number';i1.min=1;i1.value=settings.config.autoExtScanRange||6;
      i1.style.cssText='width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      i1.onchange=()=>{settings.config.autoExtScanRange=parseInt(i1.value)||6;settings.save();};
      f1.appendChild(l1);f1.appendChild(i1);

      const f2=document.createElement('div');f2.style.flex='1';
      const l2=document.createElement('div');l2.textContent='제외(오프셋) 턴';l2.style.cssText='font-size:12px;color:#888;margin-bottom:4px;';
      const i2=document.createElement('input');i2.type='number';i2.min=0;i2.value=settings.config.autoExtOffset||5;
      i2.style.cssText='width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      i2.onchange=()=>{settings.config.autoExtOffset=parseInt(i2.value)||0;settings.save();};
      f2.appendChild(l2);f2.appendChild(i2);

      const fRetry=document.createElement('div');fRetry.style.flex='1';
      const lRetry=document.createElement('div');lRetry.textContent='API 재시도 횟수';lRetry.style.cssText='font-size:12px;color:#888;margin-bottom:4px;';
      const iRetry=document.createElement('input');iRetry.type='number';iRetry.min=0;iRetry.max=5;iRetry.value=settings.config.autoExtMaxRetries||0;
      iRetry.style.cssText='width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      iRetry.onchange=()=>{settings.config.autoExtMaxRetries=parseInt(iRetry.value)||0;settings.save();};
      fRetry.appendChild(lRetry);fRetry.appendChild(iRetry);

      row1.appendChild(f0);row1.appendChild(f1);row1.appendChild(f2);row1.appendChild(fRetry);nd.appendChild(row1);

      const row2=document.createElement('div');row2.style.cssText='display:flex;gap:12px;margin-bottom:12px;align-items:center;';
      const f3=document.createElement('div');f3.style.flex='1';
      const l3=document.createElement('div');l3.textContent='저장될 로어명';l3.style.cssText='font-size:12px;color:#888;margin-bottom:4px;';

      const inputWrap=document.createElement('div');inputWrap.style.cssText='display:flex;gap:6px;';
      const i3=document.createElement('input');i3.type='text';
      getAutoExtPackForUrl(getCurUrl()).then(name => i3.value=name);
      i3.style.cssText='flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      i3.onchange=()=>{
        const val=i3.value||'자동추출';
        settings.config.autoExtPack=val;
        setAutoExtPackForUrl(getCurUrl(), val);
      };

      const s3=document.createElement('select');
      s3.style.cssText='width:100px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
      db.packs.toArray().then(packs=>{
        const opt=document.createElement('option');opt.value='';opt.textContent='기존 로어 선택';s3.appendChild(opt);
        packs.forEach(p=>{const o=document.createElement('option');o.value=p.name;o.textContent=p.name;s3.appendChild(o);});
      });
      s3.onchange=()=>{if(s3.value){
        i3.value=s3.value;
        settings.config.autoExtPack=s3.value;
        setAutoExtPackForUrl(getCurUrl(), s3.value);
        s3.value='';
      }};

      inputWrap.appendChild(i3);inputWrap.appendChild(s3);
      f3.appendChild(l3);f3.appendChild(inputWrap);

      const f4=document.createElement('div');f4.style.cssText='display:flex;flex:1;align-items:flex-end;justify-content:flex-end;';
      const btnRun=document.createElement('button');btnRun.textContent='수동 추출 실행';
      btnRun.style.cssText='padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:1px solid #285;font-weight:bold;transition:0.2s;';
      btnRun.onclick=async()=>{
        if(!confirm('대화 자동 추출을 시작?')) return;
        const orig=btnRun.textContent;
        btnRun.textContent='추출 중...';
        btnRun.disabled=true;
        btnRun.style.opacity='0.7';
        await runAutoExtract(true);
        btnRun.textContent=orig;
        btnRun.disabled=false;
        btnRun.style.opacity='1';

        m.replaceContentPanel((p)=>renderAutoExtractUI(p,m),'대화 자동 DB화');
      };
      f4.appendChild(btnRun);
      row2.appendChild(f3);row2.appendChild(f4);nd.appendChild(row2);
    }});

    panel.addBoxedField('','',{onInit:(nd)=>{
      setFullWidth(nd);
      const title=document.createElement('div');title.textContent='Gemini / Vertex AI API 설정';title.style.cssText='font-size:13px;color:#ccc;font-weight:bold;margin-bottom:4px;';nd.appendChild(title);
      const S='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';

      createApiInput(settings.config, 'autoExt', nd);

      const ml=document.createElement('div');ml.textContent='사용 모델';ml.style.cssText='font-size:11px;color:#999;margin:10px 0 4px;';nd.appendChild(ml);
      const ms=document.createElement('select');ms.style.cssText=S;
      [['Gemini 3.x',[['3.0 Flash','gemini-3-flash-preview'],['3.1 Pro','gemini-3.1-pro-preview'],['3.1 Flash Lite','gemini-3.1-flash-lite-preview']]],['Gemini 2.x',[['2.5 Pro','gemini-2.5-pro'],['2.0 Flash','gemini-2.0-flash'],['2.0 Flash Lite','gemini-2.0-flash-lite']]],['기타',[['직접 입력','_custom']]]].forEach(([g,opts])=>{const og=document.createElement('optgroup');og.label=g;opts.forEach(([l,v])=>{const o=document.createElement('option');o.value=v;o.textContent=l;og.appendChild(o);});ms.appendChild(og);});
      ms.value=settings.config.autoExtModel||'gemini-3-flash-preview';
      const cl=document.createElement('div');cl.textContent='직접 입력 모델 ID';cl.style.cssText='font-size:11px;color:#999;margin:10px 0 4px;'+(ms.value==='_custom'?'':'display:none;');nd.appendChild(cl);
      const ci=document.createElement('input');ci.value=settings.config.autoExtCustomModel||'';ci.style.cssText=S+(ms.value==='_custom'?'':'display:none;');
      ci.onchange=()=>{settings.config.autoExtCustomModel=ci.value;settings.save();};
      ms.onchange=()=>{settings.config.autoExtModel=ms.value;settings.save();const show=ms.value==='_custom';cl.style.display=show?'':'none';ci.style.display=show?'':'none';};
      nd.appendChild(ms);nd.appendChild(cl);nd.appendChild(ci);
    }});

    panel.addBoxedField('','',{onInit:(node)=>{
      setFullWidth(node);
      const title=document.createElement('div');title.textContent='추론 및 접두사 설정';title.style.cssText='font-size:13px;color:#ccc;font-weight:bold;margin-bottom:4px;';node.appendChild(title);
      const sel=document.createElement('select');sel.style.cssText='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
      ['off:사용 안 함 (OFF)','minimal:Minimal (3.1 flash lite에서만 동작)','low:Low','medium:Medium','high:High','budget:토큰 직접 지정 (2.x 전용)'].forEach(o=>{const[v,l]=o.split(':');const opt=document.createElement('option');opt.value=v;opt.textContent=l;sel.appendChild(opt);});
      sel.value=settings.config.autoExtReasoning||'medium';node.appendChild(sel);
      const bWrap=document.createElement('div');bWrap.style.cssText='margin-top:8px;'+(sel.value!=='budget'?'display:none;':'');
      const bLbl=document.createElement('div');bLbl.textContent='토큰 예산 설정';bLbl.style.cssText='font-size:11px;color:#666;margin-bottom:4px;';bWrap.appendChild(bLbl);
      const bInp=document.createElement('input');bInp.type='number';bInp.value=settings.config.autoExtBudget||2048;bInp.min=0;bInp.max=32768;bInp.style.cssText='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      bInp.onchange=()=>{settings.config.autoExtBudget=parseInt(bInp.value)||0;settings.save();};bWrap.appendChild(bInp);node.appendChild(bWrap);
      sel.onchange=()=>{settings.config.autoExtReasoning=sel.value;settings.save();bWrap.style.display=sel.value==='budget'?'':'none';};

      const testRow=document.createElement('div');testRow.style.cssText='margin-top:12px;display:flex;gap:8px;align-items:center;';
      const testBtn=document.createElement('button');testBtn.textContent='API 키 테스트';
      testBtn.style.cssText='padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;';
      const testResult=document.createElement('span');testResult.style.cssText='font-size:12px;color:#888;word-break:break-all;';
      testBtn.onclick=async()=>{
        const isVertex = (settings.config.autoExtApiType || settings.config.geminiApiType || 'key') === 'vertex';
        const hasKey = settings.config.autoExtKey || settings.config.geminiKey;
        const hasJson = settings.config.autoExtVertexJson || settings.config.geminiVertexJson;
        if(isVertex ? !hasJson : !hasKey){alert('API 키 또는 서비스 계정 JSON을 입력할 것.');return;}
        testBtn.disabled=true;testResult.textContent='테스트 중...';
        try{const r=await autoExtGemini('Say "OK" in one word.', 0);testResult.textContent=r.text?'✅ 성공: '+r.text.trim().slice(0,50):'❌ 실패: '+r.error;testResult.style.color=r.text?'#4a9':'#d66';}
        catch(e){testResult.textContent='❌ 오류: '+e.message;testResult.style.color='#d66';}
        testBtn.disabled=false;
      };
      testRow.appendChild(testBtn);testRow.appendChild(testResult);node.appendChild(testRow);
    }});

    panel.addBoxedField('','',{onInit:(nd)=>{
      setFullWidth(nd);

      // DB 미포함 프롬프트 (항상 표시)
      const hdr1=document.createElement('div');hdr1.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-top:1px solid #333;padding-top:12px;';
      const lbl1=document.createElement('div');lbl1.textContent='추출 프롬프트 (기존 로어 미포함 시)';lbl1.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
      const resetBtn1=document.createElement('button');resetBtn1.textContent='기본값 복원';resetBtn1.style.cssText='font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
      hdr1.appendChild(lbl1);hdr1.appendChild(resetBtn1);nd.appendChild(hdr1);

      const ta1=document.createElement('textarea');ta1.value=settings.config.autoExtPromptWithoutDb || DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB;
      ta1.style.cssText='width:100%;height:180px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:10px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;margin-bottom:16px;';
      ta1.onchange=()=>{settings.config.autoExtPromptWithoutDb=ta1.value;settings.save();};
      resetBtn1.onclick=()=>{if(confirm('기본값으로 복원함?')){ta1.value=DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB;settings.config.autoExtPromptWithoutDb=DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB;settings.save();}};
      nd.appendChild(ta1);

      // DB 포함 프롬프트 (항상 표시)
      const hdr2=document.createElement('div');hdr2.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;border-top:1px solid #333;padding-top:12px;';
      const lbl2=document.createElement('div');lbl2.textContent='추출 프롬프트 (기존 로어 함께 전송 시)';lbl2.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
      const resetBtn2=document.createElement('button');resetBtn2.textContent='기본값 복원';resetBtn2.style.cssText='font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
      hdr2.appendChild(lbl2);hdr2.appendChild(resetBtn2);nd.appendChild(hdr2);

      const ta2=document.createElement('textarea');ta2.value=settings.config.autoExtPromptWithDb || DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB;
      ta2.style.cssText='width:100%;height:180px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:10px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;';
      ta2.onchange=()=>{settings.config.autoExtPromptWithDb=ta2.value;settings.save();};
      resetBtn2.onclick=()=>{if(confirm('기본값으로 복원함?')){ta2.value=DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB;settings.config.autoExtPromptWithDb=DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB;settings.save();}};
      nd.appendChild(ta2);

      const logHdrRow=document.createElement('div');logHdrRow.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px;';
      const logHdr=document.createElement('div');logHdr.textContent='추출 실행 기록';logHdr.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
      const clearBtn=document.createElement('button');clearBtn.textContent='로그 초기화';
      clearBtn.style.cssText='font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #d66;color:#d66;cursor:pointer;';

      logHdrRow.appendChild(logHdr);
      logHdrRow.appendChild(clearBtn);
      nd.appendChild(logHdrRow);

      const logBox=document.createElement('div');
      logBox.style.cssText='width:100%;height:120px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:11px;font-family:monospace;overflow-y:auto;box-sizing:border-box;';

      const currentExtLogs = getExtLog(getCurUrl());

      clearBtn.onclick = () => {
        if(confirm('추출 실행 기록을 삭제하시겠습니까?')){
          clearExtLog(getCurUrl());
          m.replaceContentPanel((p)=>renderAutoExtractUI(p,m),'대화 자동 DB화');
        }
      };

      if(!currentExtLogs.length){
        logBox.textContent='기록 없음.';
        clearBtn.style.display='none';
      }else{
        currentExtLogs.forEach(l=>{
          const div=document.createElement('div');
          div.style.marginBottom='6px';
          div.style.borderBottom='1px dashed #222';
          div.style.paddingBottom='4px';

          let msg=`[${l.time}] ${l.isManual?'수동':'자동'} - ${l.status}`;
          if(l.count>0) msg+=` (${l.count}개 병합됨)`;
          if(l.msgs) msg+=` | 분석 대상: ${l.msgs}개`;

          const p1 = document.createElement('span');
          p1.textContent = msg;
          if(l.status==='실패') p1.style.color='#d66';
          else if(l.status==='성공') p1.style.color='#4a9';
          div.appendChild(p1);

          if (l.api) {
            const apiSpan = document.createElement('div');
            let apiTxt = `API 상태: ${l.api.status}`;
            if (l.api.retries > 0) apiTxt += ` (재시도 ${l.api.retries}회)`;
            if (l.api.error) apiTxt += ` | 오류: ${l.api.error}`;
            apiSpan.textContent = apiTxt;
            apiSpan.style.cssText = `color: ${l.api.error ? '#d66' : '#69b'}; margin-top:2px;`;
            div.appendChild(apiSpan);
          }

          if(l.error) {
            const errSpan = document.createElement('div');
            errSpan.textContent = `시스템 오류: ${l.error}`;
            errSpan.style.cssText = 'color: #d66; margin-top:2px;';
            div.appendChild(errSpan);
          }

          logBox.appendChild(div);
        });
      }
      nd.appendChild(logBox);
    }});
  }

  // renderGeminiUI - Gemini 스마트 주입 설정
  function renderGeminiUI(panel){
    panel.addBoxedField('','',{onInit:(nd)=>{
      setFullWidth(nd);
      nd.appendChild(createToggleRow('Gemini API 활성화','스마트 주입 및 자동 추출 등 Gemini API를 사용하는 기능을 켜거나 끔.',settings.config.geminiEnabled,(val)=>{settings.config.geminiEnabled=val;settings.save();}));
      nd.appendChild(createToggleRow('스마트 주입 (중복 제외)','이미 반영된 설정을 판단하여 제외 처리함.',settings.config.smartInjection,(val)=>{settings.config.smartInjection=val;settings.save();}));

      const row=document.createElement('div');row.style.cssText='display:flex;gap:12px;margin-top:8px;align-items:center;';

      const f1=document.createElement('div');f1.style.flex='1';
      const l1=document.createElement('div');l1.textContent='판단 시 참조 턴 수';l1.style.cssText='font-size:12px;color:#888;margin-bottom:4px;';
      const i1=document.createElement('input');i1.type='number';i1.min=1;i1.max=20;i1.value=settings.config.smartTurns||5;
      i1.style.cssText='width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      i1.onchange=()=>{settings.config.smartTurns=parseInt(i1.value)||5;settings.save();};
      f1.appendChild(l1);f1.appendChild(i1);

      const fRetry=document.createElement('div');fRetry.style.flex='1';
      const lRetry=document.createElement('div');lRetry.textContent='API 재시도 횟수';lRetry.style.cssText='font-size:12px;color:#888;margin-bottom:4px;';
      const iRetry=document.createElement('input');iRetry.type='number';iRetry.min=0;iRetry.max=5;iRetry.value=settings.config.smartMaxRetries||0;
      iRetry.style.cssText='width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
      iRetry.onchange=()=>{settings.config.smartMaxRetries=parseInt(iRetry.value)||0;settings.save();};
      fRetry.appendChild(lRetry);fRetry.appendChild(iRetry);

      row.appendChild(f1);row.appendChild(fRetry);nd.appendChild(row);
    }});

    panel.addBoxedField('','',{onInit:(nd)=>{
      setFullWidth(nd);
      const title=document.createElement('div');title.textContent='Gemini / Vertex AI API 설정 (스마트 주입용)';title.style.cssText='font-size:13px;color:#ccc;font-weight:bold;margin-bottom:8px;';nd.appendChild(title);
      const S='width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';

      createApiInput(settings.config, 'gemini', nd);

      const ml=document.createElement('div');ml.textContent='사용 모델';ml.style.cssText='font-size:11px;color:#999;margin:10px 0 4px;';nd.appendChild(ml);
      const ms=document.createElement('select');ms.style.cssText=S;
      [['Gemini 3.x',[['3.0 Flash','gemini-3-flash-preview'],['3.1 Pro','gemini-3.1-pro-preview'],['3.1 Flash Lite','gemini-3.1-flash-lite-preview']]],['Gemini 2.x',[['2.5 Pro','gemini-2.5-pro'],['2.0 Flash','gemini-2.0-flash'],['2.0 Flash Lite','gemini-2.0-flash-lite']]],['기타',[['직접 입력','_custom']]]].forEach(([g,opts])=>{const og=document.createElement('optgroup');og.label=g;opts.forEach(([l,v])=>{const o=document.createElement('option');o.value=v;o.textContent=l;og.appendChild(o);});ms.appendChild(og);});
      ms.value=settings.config.geminiModel||'gemini-3-flash-preview';

      const cl=document.createElement('div');cl.textContent='직접 입력 모델 ID';cl.style.cssText='font-size:11px;color:#999;margin:10px 0 4px;'+(ms.value==='_custom'?'':'display:none;');nd.appendChild(cl);
      const ci=document.createElement('input');ci.value=settings.config.geminiCustomModel||'';ci.style.cssText=S+(ms.value==='_custom'?'':'display:none;');
      ci.onchange=()=>{settings.config.geminiCustomModel=ci.value;settings.save();};
      ms.onchange=()=>{settings.config.geminiModel=ms.value;settings.save();const show=ms.value==='_custom';cl.style.display=show?'':'none';ci.style.display=show?'':'none';};
      nd.appendChild(ms);nd.appendChild(cl);nd.appendChild(ci);

      const rl=document.createElement('div');rl.textContent='추론 (Thinking) 수준';rl.style.cssText='font-size:11px;color:#999;margin:10px 0 4px;';nd.appendChild(rl);
      const rs=document.createElement('select');rs.style.cssText=S;
      ['off:사용 안 함 (OFF)','minimal:Minimal (3.1 flash lite에서만 동작)','low:Low','medium:Medium','high:High','budget:토큰 직접 지정 (2.x 전용)'].forEach(o=>{const[v,l]=o.split(':');const opt=document.createElement('option');opt.value=v;opt.textContent=l;rs.appendChild(opt);});
      rs.value=settings.config.geminiReasoning||'medium';nd.appendChild(rs);

      const bWrap=document.createElement('div');bWrap.style.cssText='margin-top:8px;'+(rs.value!=='budget'?'display:none;':'');
      const bLbl=document.createElement('div');bLbl.textContent='토큰 예산 설정';bLbl.style.cssText='font-size:11px;color:#666;margin-bottom:4px;';bWrap.appendChild(bLbl);
      const bInp=document.createElement('input');bInp.type='number';bInp.value=settings.config.geminiBudget||2048;bInp.min=0;bInp.max=32768;bInp.style.cssText=S;
      bInp.onchange=()=>{settings.config.geminiBudget=parseInt(bInp.value)||0;settings.save();};bWrap.appendChild(bInp);nd.appendChild(bWrap);
      rs.onchange=()=>{settings.config.geminiReasoning=rs.value;settings.save();bWrap.style.display=rs.value==='budget'?'':'none';};

      const testRow=document.createElement('div');testRow.style.cssText='margin-top:12px;display:flex;gap:8px;align-items:center;';
      const testBtn=document.createElement('button');testBtn.textContent='API 키 테스트';
      testBtn.style.cssText='padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;';
      const testResult=document.createElement('span');testResult.style.cssText='font-size:12px;color:#888;word-break:break-all;';
      testBtn.onclick=async()=>{
        const isVertex = (settings.config.geminiApiType || 'key') === 'vertex';
        if(isVertex ? !settings.config.geminiVertexJson : !settings.config.geminiKey){alert('API 키 또는 서비스 계정 JSON을 입력할 것.');return;}
        testBtn.disabled=true;testResult.textContent='테스트 중...';
        try{const r=await gemini('Say "OK" in one word.', 0);testResult.textContent=r.text?'✅ 성공: '+r.text.trim().slice(0,50):'❌ 실패: '+r.error;testResult.style.color=r.text?'#4a9':'#d66';}
        catch(e){testResult.textContent='❌ 오류: '+e.message;testResult.style.color='#d66';}
        testBtn.disabled=false;
      };
      testRow.appendChild(testBtn);testRow.appendChild(testResult);nd.appendChild(testRow);
    }});

    panel.addBoxedField('','',{onInit:(nd)=>{
      setFullWidth(nd);
      const hdr1=document.createElement('div');hdr1.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
      const lbl1=document.createElement('div');lbl1.textContent='키워드 추출 프롬프트';lbl1.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
      const rst1=document.createElement('button');rst1.textContent='기본값 복원';rst1.style.cssText='font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
      hdr1.appendChild(lbl1);hdr1.appendChild(rst1);nd.appendChild(hdr1);
      const ta1=document.createElement('textarea');ta1.value=settings.config.extractPrompt;
      ta1.style.cssText='width:100%;height:120px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;';
      ta1.onchange=()=>{settings.config.extractPrompt=ta1.value;settings.save();};
      rst1.onclick=()=>{if(confirm('기본값으로 복원함?')){ta1.value=DEFAULT_EXTRACT_PROMPT;settings.config.extractPrompt=DEFAULT_EXTRACT_PROMPT;settings.save();}};
      nd.appendChild(ta1);

      const hdr2=document.createElement('div');hdr2.style.cssText='display:flex;justify-content:space-between;align-items:center;margin:16px 0 4px;';
      const lbl2=document.createElement('div');lbl2.textContent='스마트 필터 프롬프트';lbl2.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';
      const rst2=document.createElement('button');rst2.textContent='기본값 복원';rst2.style.cssText='font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
      hdr2.appendChild(lbl2);hdr2.appendChild(rst2);nd.appendChild(hdr2);
      const ta2=document.createElement('textarea');ta2.value=settings.config.smartPrompt;
      ta2.style.cssText='width:100%;height:120px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;';
      ta2.onchange=()=>{settings.config.smartPrompt=ta2.value;settings.save();};
      rst2.onclick=()=>{if(confirm('기본값으로 복원함?')){ta2.value=DEFAULT_SMART_PROMPT;settings.config.smartPrompt=DEFAULT_SMART_PROMPT;settings.save();}};
      nd.appendChild(ta2);
    }});
  }

  // renderPackUI - 설정 모음 관리
  function renderPackUI(panel,m){
    // 가져오기 섹션
    panel.addBoxedField('','',{onInit:(nd)=>{
      setFullWidth(nd);
      const title=document.createElement('div');title.textContent='로어 가져오기';title.style.cssText='font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;';nd.appendChild(title);

      const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:8px;';
      const nameInput=document.createElement('input');nameInput.placeholder='로어 이름';nameInput.style.cssText='flex:1;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
      row.appendChild(nameInput);

      const fileInput=document.createElement('input');fileInput.type='file';fileInput.accept='.json';fileInput.style.display='none';
      const importBtn=document.createElement('button');importBtn.textContent='📥 JSON 파일 가져오기';
      importBtn.style.cssText='padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;white-space:nowrap;';
      importBtn.onclick=()=>fileInput.click();

      const doImport=async(file)=>{
        const packName=nameInput.value.trim()||file.name.replace('.json','');
        try{
          const text=await file.text();const data=JSON.parse(text);const arr=Array.isArray(data)?data:[data];
          let count=0;
          for(const e of arr){
            if(!e.name)continue;if(!e.triggers)e.triggers=[e.name];
            e.packName=packName;e.project=settings.config.activeProject||'';
            const existing=await db.entries.where('name').equals(e.name).first();
            if(existing){await db.entries.update(existing.id,e);}else{await db.entries.add(e);count++;}
          }
          const totalCount=await db.entries.where('packName').equals(packName).count();
          let pack=await db.packs.get(packName);
          if(pack)await db.packs.update(packName,{entryCount:totalCount});
          else await db.packs.put({name:packName,entryCount:totalCount,project:settings.config.activeProject||''});
          await setPackEnabled(packName,true);
          alert(`${arr.length}개 항목 처리 완료 (신규 ${count}개)`);
          m.replaceContentPanel((p)=>renderPackUI(p,m),'로어 불러오기/관리');
        }catch(err){alert('가져오기 실패: '+err.message);}
      };

      fileInput.onchange=async(ev)=>{const file=ev.target.files[0];if(file)await doImport(file);fileInput.value='';};
      row.appendChild(fileInput);row.appendChild(importBtn);nd.appendChild(row);

      const dropZone=document.createElement('div');
      dropZone.textContent='또는 여기에 JSON 파일을 드래그 앤 드롭';
      dropZone.style.cssText='width:100%;padding:20px;border:2px dashed #333;border-radius:6px;text-align:center;color:#666;font-size:12px;box-sizing:border-box;cursor:pointer;transition:0.2s;';
      dropZone.ondragover=(e)=>{e.preventDefault();dropZone.style.borderColor='#285';dropZone.style.color='#4a9';};
      dropZone.ondragleave=()=>{dropZone.style.borderColor='#333';dropZone.style.color='#666';};
      dropZone.ondrop=async(e)=>{e.preventDefault();dropZone.style.borderColor='#333';dropZone.style.color='#666';const file=e.dataTransfer.files[0];if(file)await doImport(file);};
      nd.appendChild(dropZone);

      const manualLbl=document.createElement('div');manualLbl.textContent='또는 직접 JSON 입력';manualLbl.style.cssText='font-size:12px;color:#888;margin:12px 0 4px;';nd.appendChild(manualLbl);
      const manualTa=document.createElement('textarea');
      manualTa.placeholder='[{"name":"이름","triggers":["키워드"],"type":"character","summary":"설명","detail":{}}]';
      manualTa.style.cssText='width:100%;height:100px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;';
      nd.appendChild(manualTa);
      const manualBtnRow=document.createElement('div');manualBtnRow.style.cssText='display:flex;justify-content:flex-end;margin-top:6px;';
      const manualBtn=document.createElement('button');manualBtn.textContent='📋 JSON 수동 추가';
      manualBtn.style.cssText='padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:1px solid #285;font-weight:bold;';
      manualBtn.onclick=async()=>{
        const pn=nameInput.value.trim()||'수동추가';
        try{
          const txt=manualTa.value.trim();if(!txt){alert('JSON을 입력할 것.');return;}
          const data=JSON.parse(txt);const arr=Array.isArray(data)?data:[data];
          let cnt=0;
          for(const e of arr){if(!e.name)continue;if(!e.triggers)e.triggers=[e.name];e.packName=pn;e.project=settings.config.activeProject||'';const ex=await db.entries.where('name').equals(e.name).first();if(ex){await db.entries.update(ex.id,e);}else{await db.entries.add(e);cnt++;}}
          const tc=await db.entries.where('packName').equals(pn).count();let pk=await db.packs.get(pn);if(pk)await db.packs.update(pn,{entryCount:tc});else await db.packs.put({name:pn,entryCount:tc,project:settings.config.activeProject||''});
          await setPackEnabled(pn,true);
          alert(arr.length+'개 처리 (신규 '+cnt+'개)');manualTa.value='';
          m.replaceContentPanel((p)=>renderPackUI(p,m),'로어 불러오기/관리');
        }catch(err){alert('JSON 파싱 실패: '+err.message);}
      };
      manualBtnRow.appendChild(manualBtn);nd.appendChild(manualBtnRow);
    }});

    // 팩 리스트
    panel.addBoxedField('','',{onInit:async(nd)=>{
      setFullWidth(nd);
      const packs=await db.packs.toArray();
      if(!packs.length){
        const empty=document.createElement('div');empty.textContent='등록된 로어가 없음. JSON 파일을 가져올 것.';empty.style.cssText='color:#666;text-align:center;padding:20px;font-size:12px;';
        nd.appendChild(empty);return;
      }

      const curUrl=getCurUrl();
      const enabledPacks=settings.config.urlPacks?.[curUrl]||[];

      for(const pack of packs){
        const packDiv=document.createElement('div');packDiv.style.cssText='margin-bottom:8px;border:1px solid #333;border-radius:4px;overflow:hidden;';

        const header=document.createElement('div');header.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#111;';

        const leftSide=document.createElement('div');leftSide.style.cssText='display:flex;align-items:center;gap:8px;flex:1;';

        const isEnabled=enabledPacks.includes(pack.name);
        const swWrap=document.createElement('div');swWrap.style.cssText='display:flex;align-items:center;gap:6px;cursor:pointer;';
        const swLabel=document.createElement('span');swLabel.textContent=isEnabled?'ON':'OFF';swLabel.style.cssText='font-size:10px;font-weight:bold;width:20px;text-align:center;color:'+(isEnabled?'#4a7':'#777')+';';
        const sw=document.createElement('div');sw.style.cssText='width:24px;height:12px;border-radius:6px;background:'+(isEnabled?'#285':'#444')+';position:relative;';
        const dot=document.createElement('div');dot.style.cssText='width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;top:2px;left:'+(isEnabled?'14px':'2px')+';transition:left .2s;';
        sw.appendChild(dot);swWrap.appendChild(swLabel);swWrap.appendChild(sw);
        swWrap.onclick=async()=>{
          const curEnabled=(settings.config.urlPacks?.[getCurUrl()]||[]).includes(pack.name);
          await setPackEnabled(pack.name,!curEnabled);
          const nowEnabled=(settings.config.urlPacks?.[getCurUrl()]||[]).includes(pack.name);
          swLabel.textContent=nowEnabled?'ON':'OFF';swLabel.style.color=nowEnabled?'#4a7':'#777';
          sw.style.background=nowEnabled?'#285':'#444';dot.style.left=nowEnabled?'14px':'2px';
        };
        leftSide.appendChild(swWrap);

        const nameEl=document.createElement('span');nameEl.textContent=`${pack.name} (${pack.entryCount||0}개)`;nameEl.style.cssText='font-size:13px;color:#ccc;font-weight:bold;';leftSide.appendChild(nameEl);
        header.appendChild(leftSide);

        const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;';
        const B='font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';

        const autoExtPackName=settings.config.autoExtPack||'자동추출';
        let autoPacks = [...(settings.config.autoPacks || [])];
        if(!autoPacks.includes(autoExtPackName)) {
          autoPacks.push(autoExtPackName);
        }

        const isAuto = autoPacks.includes(pack.name);
        const convBtn=document.createElement('button');
        convBtn.textContent=isAuto?'[추출DB]':'[고정DB]';
        convBtn.style.cssText=B+(isAuto?'color:#f88;border-color:#844;':'color:#88f;border-color:#448;');
        convBtn.title=isAuto?'현재 자동 추출 전용 접두사 사용. 클릭 시 고정DB 전환.':'현재 일반 접두사 사용. 클릭 시 자동 추출 전용 지정.';
        convBtn.onclick=()=>{
          let ap = [...(settings.config.autoPacks || [])];
          if(!ap.includes(autoExtPackName)) ap.push(autoExtPackName);

          if(ap.includes(pack.name)){
            ap = ap.filter(n => n !== pack.name);
          } else {
            ap.push(pack.name);
          }
          settings.config.autoPacks = ap;
          settings.save();
          m.replaceContentPanel((p)=>renderPackUI(p,m),'로어 불러오기/관리');
        };

        const renameBtn=document.createElement('button');renameBtn.textContent='이름 변경';renameBtn.style.cssText=B+'color:#8c8;border-color:#464;';
        renameBtn.onclick=async()=>{
          const newName=prompt(`[${pack.name}]의 새 이름을 입력할 것:`, pack.name);
          if(!newName||newName===pack.name)return;
          const exists=await db.packs.get(newName);
          if(exists){alert('이미 존재하는 이름임.');return;}

          await db.transaction('rw', db.packs, db.entries, async()=>{
            await db.packs.add({...pack, name:newName});
            await db.packs.delete(pack.name);
            const entries = await db.entries.where('packName').equals(pack.name).toArray();
            for(const e of entries){
              await db.entries.update(e.id, {packName: newName});
            }
          });

          const up=JSON.parse(JSON.stringify(settings.config.urlPacks||{}));
          let changed=false;
          for(const url in up){
            const idx=up[url].indexOf(pack.name);
            if(idx!==-1){up[url][idx]=newName;changed=true;}
          }
          if(changed){settings.config.urlPacks=up;settings.save();}

          let ap = [...(settings.config.autoPacks || [])];
          if(ap.includes(pack.name)){
            ap = ap.filter(n => n !== pack.name);
            if(!ap.includes(newName)) ap.push(newName);
            settings.config.autoPacks = ap;
            settings.save();
          }

          m.replaceContentPanel((p)=>renderPackUI(p,m),'로어 불러오기/관리');
        };

        const exportBtn=document.createElement('button');exportBtn.textContent='내보내기';exportBtn.style.cssText=B;
        exportBtn.onclick=async()=>{
          const entries=await db.entries.where('packName').equals(pack.name).toArray();
          if(!entries.length){alert('내보낼 항목이 없음.');return;}
          const clean=entries.map(({id,packName,project,enabled,...rest})=>rest);
          const blob=new Blob([JSON.stringify(clean,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${pack.name}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
        };

        const delBtn=document.createElement('button');delBtn.textContent='삭제';delBtn.style.cssText=B+'color:#a55;border-color:#633;';
        delBtn.onclick=async()=>{
          if(!confirm(`[${pack.name}] 로어와 모든 항목을 삭제?`))return;
          await db.entries.where('packName').equals(pack.name).delete();
          await db.packs.delete(pack.name);
          m.replaceContentPanel((p)=>renderPackUI(p,m),'로어 불러오기/관리');
        };

        actions.appendChild(convBtn);actions.appendChild(renameBtn);actions.appendChild(exportBtn);actions.appendChild(delBtn);
        header.appendChild(actions);
        packDiv.appendChild(header);
        nd.appendChild(packDiv);
      }
    }});
  }

  // UI 초기화
  try{
    setupUI();
    console.log('[Lore] 초기화 완료 - UI 준비됨 ('+VER+')');
  }catch(e){
    console.error('[Lore] UI 초기화 실패:',e);
  }

  // 모달 메뉴 및 버튼 주입 로직 (ignitor 독립성 목적, 아 존나 하기 싫다)
  function __updateModalMenu() {
    const modal = document.getElementById("web-modal");
    if (modal && !document.getElementById("chasm-decentral-menu")) {
      const itemFound = modal.getElementsByTagName("a");
      for (let item of itemFound) {
        if (item.getAttribute("href") === "/setting") {
          const clonedElement = item.cloneNode(true);
          clonedElement.id = "chasm-decentral-menu";
          const textElement = clonedElement.getElementsByTagName("span")[0];
          if(textElement) textElement.innerText = "결정화 캐즘";
          clonedElement.setAttribute("href", "javascript: void(0)");
          clonedElement.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
          };
          item.parentElement?.append(clonedElement);
          break;
        }
      }
    } else if (!document.getElementById("chasm-decentral-menu") && !window.matchMedia("(min-width: 768px)").matches) {
      const selected = document.getElementsByTagName("a");
      for (const element of selected) {
        if (element.getAttribute("href") === "/my-page") {
          const clonedElement = element.cloneNode(true);
          clonedElement.id = "chasm-decentral-menu";
          const textElement = clonedElement.getElementsByTagName("span")[0];
          if(textElement) textElement.innerText = "결정화 캐즘";
          clonedElement.setAttribute("href", "javascript: void(0)");
          clonedElement.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
          };
          element.parentElement?.append(clonedElement);
        }
      }
    }
  }

  async function injectBannerButton() {
    const selected = document.getElementsByClassName("burner-button");
    if (selected && selected.length > 0) return;
    try {
      const isStory = /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname);
      const topPanel = document.getElementsByClassName(isStory ? "css-1c5w7et" : "css-l8r172");
      if (topPanel && topPanel.length > 0) {
        const topContainer = topPanel[0].childNodes[topPanel.length - 1]?.getElementsByTagName("div");
        if (!topContainer || topContainer.length <= 0) return;
        const topList = topContainer[0].children[0].children;
        const top = topList[topList.length - 1];
        if(!top) return;
        const buttonCloned = document.createElement("button");
        buttonCloned.innerHTML = "<p></p>";
        buttonCloned.style.cssText = "margin-right: 10px";
        buttonCloned.className = "burner-button";
        const textNode = buttonCloned.getElementsByTagName("p");
        top.insertBefore(buttonCloned, top.childNodes[0]);
        textNode[0].innerText = "🔥  Chasm Tools";
        buttonCloned.removeAttribute("onClick");
        buttonCloned.addEventListener("click", () => {
          ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
        });
      }
    } catch(e){}
  }

  async function injectInputbutton() {
    const selected = document.getElementsByClassName("burner-input-button");
    if (selected && selected.length > 0) return;
    try {
      const top = document.querySelector('textarea[placeholder="메시지 보내기"]')?.nextElementSibling;
      if (top) {
        const expectedTop = top.children[0]?.children[0];
        if(!expectedTop || !expectedTop.childNodes[0]) return;
        const buttonCloned = expectedTop.childNodes[0].cloneNode(true);
        buttonCloned.className = "burner-input-button " + buttonCloned.className;
        buttonCloned.innerHTML = '<svg width="24px" height="24px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <title>fire_fill</title> <g id="页面-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"> <g id="System" transform="translate(-480.000000, -48.000000)" fill-rule="nonzero"> <g id="fire_fill" transform="translate(480.000000, 48.000000)"> <path d="M24,0 L24,24 L0,24 L0,0 L24,0 Z M12.5934901,23.257841 L12.5819402,23.2595131 L12.5108777,23.2950439 L12.4918791,23.2987469 L12.4918791,23.2987469 L12.4767152,23.2950439 L12.4056548,23.2595131 C12.3958229,23.2563662 12.3870493,23.2590235 12.3821421,23.2649074 L12.3780323,23.275831 L12.360941,23.7031097 L12.3658947,23.7234994 L12.3769048,23.7357139 L12.4804777,23.8096931 L12.4953491,23.8136134 L12.4953491,23.8136134 L12.5071152,23.8096931 L12.6106902,23.7357139 L12.6232938,23.7196733 L12.6232938,23.7196733 L12.6266527,23.7031097 L12.609561,23.275831 C12.6075724,23.2657013 12.6010112,23.2592993 12.5934901,23.257841 L12.5934901,23.257841 Z M12.8583906,23.1452862 L12.8445485,23.1473072 L12.6598443,23.2396597 L12.6498822,23.2499052 L12.6498822,23.2499052 L12.6471943,23.2611114 L12.6650943,23.6906389 L12.6699349,23.7034178 L12.6699349,23.7034178 L12.678386,23.7104931 L12.8793402,23.8032389 C12.8914285,23.8068999 12.9022333,23.8029875 12.9078286,23.7952264 L12.9118235,23.7811639 L12.8776777,23.1665331 C12.8752882,23.1545897 12.8674102,23.1470016 12.8583906,23.1452862 L12.8583906,23.1452862 Z M12.1430473,23.1473072 C12.1332178,23.1423925 12.1221763,23.1452606 12.1156365,23.1525954 L12.1099173,23.1665331 L12.0757714,23.7811639 C12.0751323,23.7926639 12.0828099,23.8018602 12.0926481,23.8045676 L12.108256,23.8032389 L12.3092106,23.7104931 L12.3186497,23.7024347 L12.3186497,23.7024347 L12.3225043,23.6906389 L12.340401,23.2611114 L12.337245,23.2485176 L12.337245,23.2485176 L12.3277531,23.2396597 L12.1430473,23.1473072 Z" id="MingCute" fill-rule="nonzero"> </path> <path d="M11.5144,2.14236 L10.2549,1.38672 L10.0135,2.83553 C9.63231,5.12379 8.06881,7.25037 6.34517,8.74417 C2.96986,11.6694 2.23067,14.8487 3.27601,17.4753 C4.27565,19.987 6.81362,21.7075 9.3895,21.9938 L9.98632,22.0601 C8.51202,21.1585 7.56557,19.0535 7.89655,17.4813 C8.22199,15.9355 9.33405,14.4869 11.4701,13.1519 L12.5472,12.4787 L12.9488,13.6836 C13.1863,14.3963 13.5962,14.968 14.0129,15.5492 C14.2138,15.8294 14.4162,16.1118 14.6018,16.4132 C15.2447,17.4581 15.415,18.6196 14.9999,19.7722 C14.6222,20.8211 13.9985,21.6446 13.1401,22.1016 L14.1105,21.9938 C16.5278,21.7252 18.3031,20.8982 19.4557,19.515 C20.5986,18.1436 20.9999,16.379 20.9999,14.4999 C20.9999,12.7494 20.2812,10.946 19.433,9.44531 C18.4392,7.68697 17.1418,6.22748 15.726,4.8117 C15.481,5.30173 15.5,5.5 14.9953,6.28698 C14.4118,4.73216 13.2963,3.21139 11.5144,2.14236 Z" id="路径" fill="var(--icon_tertiary)"> </path> </g> </g> </g> </g></svg>';
        buttonCloned.removeAttribute("onClick");
        buttonCloned.addEventListener("click", () => {
          ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
        });
        expectedTop.insertBefore(buttonCloned, expectedTop.childNodes[0]);
      }
    } catch(e){}
  }

  async function doInjection() {
    if (!/\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname) && !/\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) && !/\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname)) {
      return;
    }
    await injectBannerButton();
    await injectInputbutton();
  }

  function __doModalMenuInit() {
    if (document.c2InjectorModalInit) return;
    document.c2InjectorModalInit = true;

    if(typeof GenericUtil !== 'undefined' && GenericUtil.attachObserver) {
      GenericUtil.attachObserver(document, () => {
        __updateModalMenu();
      });
    } else {
      const observer = new MutationObserver(() => {
        __updateModalMenu();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", doInjection);
      window.addEventListener("load", doInjection);
    } else {
      doInjection();
    }

    setInterval(doInjection, 2000);
  }

  __doModalMenuInit();

})();
