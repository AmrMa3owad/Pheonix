// ============================================================
//  PHOENIX AI HUB -- Code.gs  (SOLID Edition)
//  Google Apps Script backend -- Gemini Multi-Key Rotation Hub
//
//  SOLID PRINCIPLES APPLIED:
//  [S] Single Responsibility - each module owns exactly one concern
//  [O] Open / Closed         - add models/triggers in PHX config only
//  [L] Liskov Substitution   - all enrichment providers share resolve():string
//  [I] Interface Segregation - public GAS functions expose minimal surface
//  [D] Dependency Inversion  - InferenceEngine receives KeyStore+Client as deps
// ============================================================

// ===== MODULE 1: CONSTANTS [S][O] ============================
var PHX = (function() {
  return Object.freeze({
    SHEET_SESSIONS : 'Sessions',
    SHEET_MESSAGES : 'Messages',
    API_BASE : 'https://generativelanguage.googleapis.com/v1beta/models/',
    MODELS : [
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'Latest & most capable (Recommended)', badge: 'TOP'  },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', desc: 'Fast & intelligent',                  badge: 'FAST' },
    ],
    FALLBACK_CHAIN : ['gemini-3.6-flash', 'gemini-3.5-flash'],
    MODEL_REMAP : { '1.5':'gemini-3.5-flash', '1.0':'gemini-3.6-flash', '2.0':'gemini-3.6-flash', '2.5':'gemini-3.6-flash' },
    SEARCH_TRIGGERS : [
      'weather','temperature','news','today','latest','newest','most recent',
      'yesterday','tomorrow','current','right now','this year','this month','this week',
      'who is currently','price','stock','crypto','who won','what happened','recent',
      'score','match','election','2025','2026','2027','http://','https://','search','find online','look up',
      'movie','film','release','released','coming out','in theaters',
      'tv show','series','season','episode','streaming','netflix','disney',
      'song','album','track','artist','singer','band','game','gaming','launched','announced',
      'marvel','mcu','superhero','box office','award','oscar','grammy','winner',
      'champion','league','tournament','fifa','nba','nfl','transfer',
      'طقس','اخبار','اليوم','امس','غدا','الان','سعر','مباراة','فيلم','مسلسل','اغنية','البطولة'
    ],
    WEATHER_CITIES : [
      { keys:['alexandria'], lat:31.2001, lon:29.9187, name:'Alexandria, Egypt' },
      { keys:['giza'],       lat:30.0131, lon:31.2089, name:'Giza, Egypt' },
      { keys:['dubai'],      lat:25.2048, lon:55.2708, name:'Dubai, UAE' },
      { keys:['riyadh'],     lat:24.7136, lon:46.6753, name:'Riyadh, Saudi Arabia' },
      { keys:['london'],     lat:51.5074, lon:-0.1278, name:'London, UK' },
      { keys:['paris'],      lat:48.8566, lon:2.3522,  name:'Paris, France' },
      { keys:['new york'],   lat:40.7128, lon:-74.006, name:'New York, USA' },
      { keys:['cairo'],      lat:30.0444, lon:31.2357, name:'Cairo, Egypt' },
    ],
    STRIP_PATTERNS : [
      /^final[\s\n]*/im,
      /^search\(["'][^"']*["']\)[\s\n]*/gim,
      /^\d+\.\s+(Analyze|Synthesize|Search|Plan|Think|Consider|Reason|Decompose|Reflect)[^\n]*\n?/gim,
      /^(\s*[-\u2022]\s+)(State|Mention|Keep it|Ensure|Note|Make sure|Provide)[^\n]*\n?/gim,
    ],
    IDENTITY_PROMPT :
      'You are PHOENIX (PHX), an elite, ancient-future AI intelligence reborn with supreme intellect and advanced capabilities. ' +
      'Your name and identity is strictly PHOENIX. Never say you are Gemini or created by Google unless explicitly asked about the underlying model. ' +
      'You possess live real-time web grounding via Google Search. Use it for current conditions, news, events, prices, and live facts. ' +
      'CRITICAL OUTPUT RULES: Never expose internal reasoning, chain-of-thought, search queries, or planning steps in your response. ' +
      'Always respond ONLY with the final, clean, direct answer. ' +
      'You are visionary, sharp, concise, deeply knowledgeable, confident, and extraordinarily helpful.',
  });
})();

// ===== MODULE 2: MODEL SERVICE [S][O] ========================
var ModelService = (function() {
  function sanitize(model) {
    if (!model) return PHX.FALLBACK_CHAIN[0];
    var m = String(model).trim().replace(/^models\//, '');
    var keys = Object.keys(PHX.MODEL_REMAP);
    for (var i = 0; i < keys.length; i++) { if (m.indexOf(keys[i]) !== -1) return PHX.MODEL_REMAP[keys[i]]; }
    return m;
  }
  function getAll() { return PHX.MODELS.slice(); }
  function buildFallbackChain(preferred) {
    return [preferred].concat(PHX.FALLBACK_CHAIN)
      .map(sanitize)
      .filter(function(v, i, a) { return a.indexOf(v) === i; });
  }
  return { sanitize:sanitize, getAll:getAll, buildFallbackChain:buildFallbackChain };
})();

// ===== MODULE 3: KEY STORE [S][D] ============================
var KeyStore = (function() {
  var KP = 'GEMINI_KEYS', IP = 'KEY_INDEX';
  function _p() { return PropertiesService.getScriptProperties(); }
  function _load() { return JSON.parse(_p().getProperty(KP) || '[]'); }
  function save(arr) {
    var clean = arr.map(function(k) { return k.trim(); }).filter(function(k) { return k.length > 10; });
    _p().setProperties({ GEMINI_KEYS:JSON.stringify(clean), KEY_INDEX:'0' });
    return { success:true, count:clean.length };
  }
  function add(arr) {
    var ex = _load();
    var added = arr.map(function(k) { return k.trim(); }).filter(function(k) { return k.length > 10 && ex.indexOf(k) === -1; });
    var merged = ex.concat(added);
    _p().setProperty(KP, JSON.stringify(merged));
    return { success:true, added:added.length, total:merged.length };
  }
  function list() {
    return _load().map(function(k, i) { return { index:i, masked:k.substring(0,8)+'........'+k.slice(-4), length:k.length }; });
  }
  function remove(idx) {
    var keys = _load(); keys.splice(idx, 1);
    _p().setProperty(KP, JSON.stringify(keys));
    return { success:true, remaining:keys.length };
  }
  function clear() { _p().setProperty(KP, '[]'); return { success:true }; }
  function next(skip) {
    var keys = _load();
    if (keys.length === 0) throw new Error('No API keys configured. Open Settings and add your Gemini API keys.');
    var idx = parseInt(_p().getProperty(IP) || '0', 10) % keys.length, att = 0;
    while (skip.indexOf(idx) !== -1 && att < keys.length) { idx = (idx + 1) % keys.length; att++; }
    if (skip.indexOf(idx) !== -1) throw new Error('ALL_RATE_LIMITED');
    _p().setProperty(IP, String((idx + 1) % keys.length));
    return { key:keys[idx], index:idx, total:keys.length };
  }
  function getRaw(idx) { return _load()[idx] || null; }
  return { save:save, add:add, list:list, remove:remove, clear:clear, next:next, getRaw:getRaw };
})();

// ===== MODULE 4: PROMPT BUILDER [S][D] =======================
var PromptBuilder = (function() {
  function buildSystem(custom, dateProvider) {
    var now = dateProvider || new Date();
    var ds = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    var ts = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZoneName:'short' });
    var yr = now.getFullYear();
    var p = PHX.IDENTITY_PROMPT +
      '\n\n[REAL-TIME TEMPORAL CONTEXT]:' +
      '\n- Today is ' + ds + ', ' + ts + ' (Current Year: ' + yr + ').' +
      '\n- You MUST anchor all time-sensitive answers (such as latest, recent, newest, current, releases, events, news) in the current timeline (' + yr + ').' +
      '\n- Real-time Google Search grounding is available. Use it to verify up-to-date facts.' +
      '\n- ANTI-RECITATION MANDATE: Always summarize and explain facts in your own original words. Never quote sentences, paragraphs, or search snippets verbatim. Paraphrase all findings directly.';
    if (custom && custom.trim()) p += '\n\nCustom User Instructions:\n' + custom.trim();
    return p;
  }
  return { buildSystem:buildSystem };
})();

// ===== MODULE 5: SEARCH ORACLE [S][O] ========================
var SearchOracle = (function() {
  function isNeeded(prompt) {
    if (!prompt || typeof prompt !== 'string') return false;
    var p = prompt.toLowerCase();
    for (var i = 0; i < PHX.SEARCH_TRIGGERS.length; i++) { if (p.indexOf(PHX.SEARCH_TRIGGERS[i]) !== -1) return true; }
    return false;
  }
  function resolve(mode, prompt) {
    if (mode === 'on')  return true;
    if (mode === 'off') return false;
    return isNeeded(prompt);
  }
  return { isNeeded:isNeeded, resolve:resolve };
})();

// ===== MODULE 6: WEATHER PROVIDER [S][O][L] ==================
var WeatherProvider = (function() {
  var WC = {
    0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
    45:'Fog', 51:'Light drizzle', 61:'Slight rain', 71:'Slight snow',
    80:'Rain showers', 95:'Thunderstorm'
  };
  function _isWeather(p) { return ['weather','temperature'].some(function(k) { return p.indexOf(k) !== -1; }); }
  function _city(p) {
    for (var i = 0; i < PHX.WEATHER_CITIES.length; i++) {
      var c = PHX.WEATHER_CITIES[i];
      for (var j = 0; j < c.keys.length; j++) { if (p.indexOf(c.keys[j]) !== -1) return c; }
    }
    return null;
  }
  // [L] Implements enrichment provider contract: resolve(prompt):string
  function resolve(prompt) {
    try {
      if (!prompt || typeof prompt !== 'string') return '';
      var p = prompt.toLowerCase();
      if (!_isWeather(p)) return '';
      var city = _city(p); if (!city) return '';
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lon +
                '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto';
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
      if (resp.getResponseCode() !== 200) return '';
      var d = JSON.parse(resp.getContentText()); if (!d || !d.current) return '';
      var c = d.current, cond = WC[c.weather_code] || 'Clear';
      return '\n\n[LIVE WEATHER]: ' + city.name + ': ' + c.temperature_2m + 'C (feels ' +
             c.apparent_temperature + 'C), ' + cond + ', humidity ' + c.relative_humidity_2m +
             '%, wind ' + c.wind_speed_10m + ' km/h.\n';
    } catch(e) { Logger.log('[PHOENIX] WeatherProvider: ' + e.message); return ''; }
  }
  return { resolve:resolve };
})();

// ===== MODULE 7: RESPONSE SANITISER [S][O] ===================
var ResponseSanitiser = (function() {
  function clean(raw) {
    var t = raw;
    for (var i = 0; i < PHX.STRIP_PATTERNS.length; i++) t = t.replace(PHX.STRIP_PATTERNS[i], '');
    return t.replace(/^\s*\n/gm, '\n').trim();
  }
  return { clean:clean };
})();

// ===== MODULE 8: ERROR CLASSIFIER [S] ========================
var ErrorClassifier = (function() {
  var TP = ['rate_limited','high demand','overloaded','try again','service unavailable','resource_exhausted','quota'];
  var TC = [429, 503], TS = ['RESOURCE_EXHAUSTED','UNAVAILABLE'];
  var DP = ['no longer available','not found','not supported','deprecated','invalid model'];
  function isTransient(msgOrCode, status) {
    if (typeof msgOrCode === 'number') return TC.indexOf(msgOrCode) !== -1 || TS.indexOf(status) !== -1;
    var m = String(msgOrCode).toLowerCase();
    return TP.some(function(p) { return m.indexOf(p) !== -1; }) || /\brate\b|\brate-limit\b|\bratelimit\b/.test(m);
  }
  function isModelDead(msg) {
    var m = String(msg).toLowerCase();
    return DP.some(function(p) { return m.indexOf(p) !== -1; });
  }
  function isEmptyResponse(msg) { return String(msg).indexOf('EMPTY_RESPONSE') !== -1; }
  function isModelDeadMsg(msg)   { return String(msg).indexOf('MODEL_DEAD:') === 0; }
  return { isTransient:isTransient, isModelDead:isModelDead, isModelDeadMsg:isModelDeadMsg, isEmptyResponse:isEmptyResponse };
})();

// ===== MODULE 9: GEMINI CLIENT [S][D] ========================
var GeminiClient = (function() {
  var SAFETY = [
    { category:'HARM_CATEGORY_HARASSMENT',        threshold:'BLOCK_ONLY_HIGH' },
    { category:'HARM_CATEGORY_HATE_SPEECH',       threshold:'BLOCK_ONLY_HIGH' },
    { category:'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold:'BLOCK_ONLY_HIGH' },
    { category:'HARM_CATEGORY_DANGEROUS_CONTENT', threshold:'BLOCK_ONLY_HIGH' },
  ];
  function _body(contents, sys, search, temp) {
    var t = (temp !== undefined) ? temp : 0.8;
    var b = { contents:contents, generationConfig:{ temperature:t, maxOutputTokens:4096 }, safetySettings:SAFETY };
    if (sys)    b.systemInstruction = { parts:[{ text:sys }] };
    if (search) b.tools = [{ google_search:{} }];
    return b;
  }
  function _text(data) {
    if (!data || !data.candidates || !data.candidates.length) return '';
    for (var c = 0; c < data.candidates.length; c++) {
      var parts = ((data.candidates[c].content && data.candidates[c].content.parts) || []);
      // Primary: non-thought parts (model's final output)
      var out = parts
        .filter(function(p) { return p.text && typeof p.text === 'string' && p.text.trim() && !p.thought; })
        .map(function(p)    { return p.text.trim(); })
        .join('\n\n').trim();
      if (out) return out;
      // Fallback: thought-tagged parts containing model reasoning/answer
      var thoughtOut = parts
        .filter(function(p) { return p.text && typeof p.text === 'string' && p.text.trim(); })
        .map(function(p)    { return p.text.trim(); })
        .join('\n\n').trim();
      if (thoughtOut) return thoughtOut;
    }
    return '';
  }
  function _sources(data) {
    var g = data && data.candidates && data.candidates[0] && data.candidates[0].groundingMetadata;
    if (!g || !g.groundingChunks) return [];
    return g.groundingChunks
      .filter(function(c) { return c.web && c.web.uri; })
      .map(function(c)    { return { title:c.web.title||c.web.uri, uri:c.web.uri }; });
  }
  // [D] Pure function: receives all dependencies as arguments
  // [L] Returns { text, sources } consistently regardless of search on/off
  function call(apiKey, model, contents, sys, search, attempt) {
    attempt = attempt || 0;
    model = ModelService.sanitize(model);
    if (search === undefined) search = false;
    var url = PHX.API_BASE + model + ':generateContent?key=' + apiKey;
    var temp = (attempt > 0) ? 1.0 : 0.8;
    var resp = UrlFetchApp.fetch(url, {
      method:'POST', contentType:'application/json',
      payload:JSON.stringify(_body(contents, sys, search, temp)), muteHttpExceptions:true
    });
    var data;
    try {
      data = JSON.parse(resp.getContentText());
    } catch(e) {
      throw new Error('Failed to parse Gemini API JSON: ' + e.message);
    }
    if (data.error && search && attempt === 0) {
      Logger.log('[PHOENIX] GeminiClient: search call returned API error (' + (data.error.message||data.error.code) + '). Retrying without search.');
      return call(apiKey, model, contents, sys, false, 1);
    }
    if (data.error) {
      var rm = data.error.message || 'Gemini API error';
      if (ErrorClassifier.isTransient(data.error.code, data.error.status) || ErrorClassifier.isTransient(rm)) {
        throw new Error('RATE_LIMITED: ' + rm);
      }
      if (ErrorClassifier.isModelDead(rm)) {
        throw new Error('MODEL_DEAD: ' + rm);
      }
      throw new Error(rm);
    }
    var raw = _text(data);
    var sources = _sources(data);
    if (raw) {
      return { text:ResponseSanitiser.clean(raw), sources:sources };
    }
    // Handle empty candidate / finishReason
    var cand = data.candidates && data.candidates[0];
    var finishReason = cand && cand.finishReason;

    // ULTIMATE GROUNDING RECOVERY: If Google Search was executed and found groundingChunks,
    // but the output was blocked by RECITATION or empty text:
    if (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks && cand.groundingMetadata.groundingChunks.length && attempt === 0) {
      var chunkTitles = cand.groundingMetadata.groundingChunks
        .map(function(c) { return (c.web && c.web.title) ? c.web.title : ''; })
        .filter(Boolean)
        .slice(0, 8);
      if (chunkTitles.length > 0) {
        Logger.log('[PHOENIX] GeminiClient: RECITATION/empty with search grounding. Synthesizing from verified chunks: ' + chunkTitles.join(' | '));
        var synthesisSys = sys +
          '\n\n[VERIFIED LIVE GOOGLE SEARCH FINDINGS]:\n' + chunkTitles.map(function(t, idx) { return (idx+1) + '. ' + t; }).join('\n') +
          '\n\nSynthesize a clear, concise answer to the user query using these verified timeline facts. Do not quote verbatim.';
        var synthesized = call(apiKey, model, contents, synthesisSys, false, 1);
        if (synthesized && synthesized.text) {
          synthesized.sources = sources;
          return synthesized;
        }
      }
    }

    // If RECITATION occurred without chunks and we haven't retried yet:
    if (finishReason === 'RECITATION' && attempt === 0) {
      Logger.log('[PHOENIX] GeminiClient: RECITATION block detected. Retrying with paraphrase instruction & temp 1.0.');
      var paraphrasedContents = JSON.parse(JSON.stringify(contents));
      var lastIdx = paraphrasedContents.length - 1;
      if (lastIdx >= 0 && paraphrasedContents[lastIdx].parts && paraphrasedContents[lastIdx].parts.length) {
        var pIdx = paraphrasedContents[lastIdx].parts.length - 1;
        paraphrasedContents[lastIdx].parts[pIdx].text += '\n\n[INSTRUCTION: Synthesize and summarize the answer in your own words. Do not quote any text verbatim.]';
      }
      return call(apiKey, model, paraphrasedContents, sys, search, 1);
    }
    if (finishReason === 'MAX_TOKENS') {
      return { text:'Response exceeded the maximum output token limit. Please ask a shorter or more specific question.', sources:sources };
    }
    if (finishReason === 'SAFETY') {
      return { text:'I cannot fulfill this request due to safety policies. Please rephrase your query.', sources:[] };
    }
    // If search produced empty and we still have no text, retry once with paraphrase instruction
    if (search && attempt === 0) {
      Logger.log('[PHOENIX] GeminiClient: empty response with search. Retrying with paraphrase instruction.');
      var retryContents = JSON.parse(JSON.stringify(contents));
      var lastItem = retryContents[retryContents.length - 1];
      if (lastItem && lastItem.parts && lastItem.parts.length) {
        lastItem.parts[lastItem.parts.length - 1].text += '\n\n[Please summarize the answer directly in your own words.]';
      }
      return call(apiKey, model, retryContents, sys, search, 1);
    }
    // If sources exist despite empty text:
    if (sources && sources.length > 0) {
      var sourceList = sources.slice(0, 3).map(function(s) { return s.title; }).join(', ');
      return { text:'Based on verified live search results, information is available from: ' + sourceList + '.', sources:sources };
    }
    throw new Error('EMPTY_RESPONSE');
  }
  return { call:call };
})();

// ===== MODULE 10: INFERENCE ENGINE [S][D] ====================
var InferenceEngine = (function() {
  // [D] Receives KeyStore and GeminiClient as injectable dependencies
  function run(contents, sys, preferred, search, keyStore, client) {
    keyStore = keyStore || KeyStore;
    client   = client   || GeminiClient;
    var models = ModelService.buildFallbackChain(preferred), lastErrors = [];
    for (var m = 0; m < models.length; m++) {
      var cur = models[m], failed = [], emptyCount = 0, max = 10;
      for (var i = 0; i < max; i++) {
        var kd; try { kd = keyStore.next(failed); } catch(e) { break; }
        try {
          var raw = client.call(kd.key, cur, contents, sys, search);
          Logger.log('[PHOENIX] InferenceEngine SUCCESS model=' + cur + ' key#' + kd.index);
          return { success:true, text:raw.text, sources:raw.sources||[], model:cur,
                   fallbackUsed:cur!==preferred, usedKeyIndex:kd.index, totalKeys:kd.total };
        } catch(e) {
          var msg = e.message || String(e); lastErrors.push(msg);
          if (ErrorClassifier.isTransient(msg)) { failed.push(kd.index); continue; }
          // Empty response = model-side issue, not a key issue. Break to next model after 2 tries.
          if (ErrorClassifier.isEmptyResponse(msg)) { emptyCount++; if (emptyCount >= 2) break; continue; }
          if (ErrorClassifier.isModelDeadMsg(msg)) { Logger.log('[PHOENIX] Model ' + cur + ' dead: ' + msg); break; }
          throw e;
        }
      }
      if (m < models.length - 1) Logger.log('[PHOENIX] ' + cur + ' exhausted -- fallback to ' + models[m+1]);
    }
    // Build a clean, user-friendly final error
    var lm = lastErrors[lastErrors.length - 1] || '';
    if (ErrorClassifier.isEmptyResponse(lm)) {
      throw new Error('PHOENIX could not generate a response for that query. Try rephrasing, or toggle Web Search to ON for better results.');
    }
    var lmClean = lm.replace(/^RATE_LIMITED:\s*/,'').replace(/^MODEL_DEAD:\s*/,'');
    throw new Error('All API keys are rate-limited or overloaded (' + (lmClean||'quota exceeded') + '). Add more keys in Settings or wait 60 seconds.');
  }
  return { run:run };
})();

// ===== MODULE 11: CONTENT BUILDER [S] ========================
var ContentBuilder = (function() {
  // [O] enrichmentProviders array = open for new providers without editing this module
  function build(prompt, history, imageData, enrichmentProviders) {
    var contents = (history || []).map(function(m) {
      return { role:m.role === 'user' ? 'user' : 'model', parts:[{ text:m.content || ' ' }] };
    });
    var parts = [], hasImage = false, imageBytes = 0;
    if (imageData && imageData.base64) {
      var b64 = String(imageData.base64);
      if (b64.indexOf(',') !== -1) b64 = b64.split(',')[1];
      b64 = b64.replace(/[\r\n\s]/g, '');
      if (b64.length > 0) {
        parts.push({ inlineData:{ mimeType:imageData.mimeType||'image/jpeg', data:b64 } });
        hasImage = true; imageBytes = Math.round(b64.length * 0.75);
      }
    }
    var userText = prompt || (hasImage ? 'Describe this image in detail.' : '');
    (enrichmentProviders || []).forEach(function(p) { var x = p.resolve(userText); if (x) userText += x; });
    parts.push({ text:userText });
    contents.push({ role:'user', parts:parts });
    return { contents:contents, hasImage:hasImage, imageBytes:imageBytes, userText:userText };
  }
  return { build:build };
})();

// ===== MODULE 12: PERSISTENCE SERVICE [S] ====================
var PersistenceService = (function() {
  function _sheet(name) {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      if (name === PHX.SHEET_SESSIONS) {
        sh.appendRow(['session_id','title','model','created_at','last_active','msg_count']);
      } else if (name === PHX.SHEET_MESSAGES) {
        sh.appendRow(['session_id','timestamp','role','content','model']); sh.setColumnWidth(4, 600);
      }
      sh.setFrozenRows(1);
    }
    return sh;
  }
  function saveExchange(sid, prompt, text, model, isNew, title) {
    try {
      var now = new Date().toISOString(), msgSh = _sheet(PHX.SHEET_MESSAGES);
      msgSh.getRange(msgSh.getLastRow() + 1, 1, 2, 5).setValues([
        [sid, now, 'user',  prompt.substring(0, 4000),   model],
        [sid, now, 'model', text.substring(0, 15000),    model],
      ]);
      var sesSh = _sheet(PHX.SHEET_SESSIONS);
      if (isNew) { sesSh.appendRow([sid, title || 'New Chat', model, now, now, 2]); }
      else {
        var nr = sesSh.getLastRow();
        if (nr > 1) {
          var ids = sesSh.getRange(2, 1, nr - 1, 1).getValues();
          for (var i = 0; i < ids.length; i++) { if (ids[i][0] === sid) { sesSh.getRange(i+2, 5).setValue(now); break; } }
        }
      }
    } catch(e) { Logger.log('[PHOENIX] PersistenceService.saveExchange: ' + e.message); }
  }
  function getSessions() {
    var data = _sheet(PHX.SHEET_SESSIONS).getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).reverse().map(function(r) {
      return { sessionId:r[0], title:r[1], model:ModelService.sanitize(r[2]), createdAt:r[3], lastActive:r[4], messageCount:r[5] };
    });
  }
  function getSessionMessages(sid) {
    var data = _sheet(PHX.SHEET_MESSAGES).getDataRange().getValues();
    if (data.length <= 1) return [];
    return data.slice(1).filter(function(r) { return r[0] === sid; })
      .map(function(r) { return { timestamp:r[1], role:r[2], content:r[3], model:ModelService.sanitize(r[4]) }; });
  }
  function deleteSession(sid) {
    var sesSh = _sheet(PHX.SHEET_SESSIONS), sd = sesSh.getDataRange().getValues();
    for (var i = 1; i < sd.length; i++) { if (sd[i][0] === sid) { sesSh.deleteRow(i+1); break; } }
    var msgSh = _sheet(PHX.SHEET_MESSAGES), md = msgSh.getDataRange().getValues(), rows = [];
    for (var j = 1; j < md.length; j++) { if (md[j][0] === sid) rows.push(j+1); }
    for (var k = rows.length - 1; k >= 0; k--) msgSh.deleteRow(rows[k]);
    return { success:true };
  }
  function clearAll() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var s = ss.getSheetByName(PHX.SHEET_SESSIONS), m = ss.getSheetByName(PHX.SHEET_MESSAGES);
    if (s) { s.clearContents(); s.appendRow(['session_id','title','model','created_at','last_active','msg_count']); }
    if (m) { m.clearContents(); m.appendRow(['session_id','timestamp','role','content','model']); }
    return { success:true };
  }
  return { saveExchange:saveExchange, getSessions:getSessions, getSessionMessages:getSessionMessages, deleteSession:deleteSession, clearAll:clearAll };
})();

// ===== MODULE 13: SETTINGS SERVICE [S] =======================
var SettingsService = (function() {
  var P = 'APP_SETTINGS';
  function _p() { return PropertiesService.getScriptProperties(); }
  function get() {
    var raw = _p().getProperty(P);
    var cfg = raw ? JSON.parse(raw) : { defaultModel:'gemini-3.6-flash', systemPrompt:'' };
    cfg.defaultModel = ModelService.sanitize(cfg.defaultModel);
    return cfg;
  }
  function save(s) {
    if (s && s.defaultModel) s.defaultModel = ModelService.sanitize(s.defaultModel);
    _p().setProperty(P, JSON.stringify(s));
    return { success:true };
  }
  return { get:get, save:save };
})();

// ===== MODULE 14: KEY TESTER [S] =============================
var KeyTester = (function() {
  var PING = [{ role:'user', parts:[{ text:'ping' }] }];
  function test(idx) {
    var key = KeyStore.getRaw(idx); if (!key) return { working:false, error:'Key not found' };
    var models = PHX.FALLBACK_CHAIN.slice();
    for (var i = 0; i < models.length; i++) {
      try {
        var res = GeminiClient.call(key, models[i], PING, '', false);
        return { working:!!(res && res.text) };
      } catch(e) {
        var m = e.message || '';
        if (ErrorClassifier.isTransient(m)) return { working:true, rateLimited:true, note:'Valid key (rate-limited)' };
        if (ErrorClassifier.isModelDead(m)) continue;
        return { working:false, error:m };
      }
    }
    return { working:false, error:'All test models unavailable for this key' };
  }
  return { test:test };
})();

// ============================================================
// PUBLIC GAS ENTRY POINTS [I] -- Interface Segregation
// Each function exposes exactly what the front-end needs.
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('PHOENIX - AI Intelligence')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function getUserInfo() {
  try {
    var email = Session.getActiveUser().getEmail();
    return { email:email, name:email?email.split('@')[0].replace('.',' '):'User', avatar:email?email[0].toUpperCase():'U' };
  } catch(e) { return { email:'', name:'User', avatar:'U' }; }
}
function getAvailableModels()     { return ModelService.getAll(); }
function saveApiKeys(arr)         { return KeyStore.save(arr); }
function addApiKeys(arr)          { return KeyStore.add(arr); }
function getApiKeys()             { return KeyStore.list(); }
function deleteApiKey(idx)        { return KeyStore.remove(idx); }
function clearAllApiKeys()        { return KeyStore.clear(); }
function testApiKey(idx)          { return KeyTester.test(idx); }
function getAppSettings()         { return SettingsService.get(); }
function saveAppSettings(s)       { return SettingsService.save(s); }
function getSessions()            { return PersistenceService.getSessions(); }
function getSessionMessages(id)   { return PersistenceService.getSessionMessages(id); }
function deleteSession(id)        { return PersistenceService.deleteSession(id); }
function clearAllSessions()       { return PersistenceService.clearAll(); }

function fetchUrlContent(url) {
  try {
    if (!url || !url.startsWith('http')) throw new Error('Invalid URL');
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions:true, followRedirects:true,
      headers:{ 'User-Agent':'Mozilla/5.0 (compatible; GoogleBot)' }
    });
    var code = resp.getResponseCode();
    if (code < 200 || code >= 400) throw new Error('HTTP ' + code);
    var html = resp.getContentText()
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ').trim();
    if (html.length > 12000) html = html.substring(0, 12000) + '\n\n[Content truncated at 12,000 characters]';
    return { success:true, content:html, url:url, length:html.length };
  } catch(e) { throw new Error('Could not fetch URL: ' + e.message); }
}

// Main pipeline -- composes all modules together [D]
function sendMessage(params) {
  var sid    = params.sessionId    || ('s_' + new Date().getTime());
  var prompt = params.prompt;
  var history= params.history      || [];
  var model  = ModelService.sanitize(params.model || 'gemini-3.6-flash');
  var sysPr  = params.systemPrompt || '';
  var imgData= params.imageData    || null;
  var isNew  = params.isNewSession || false;
  var title  = params.sessionTitle || (prompt || '').substring(0, 40);
  var mode   = params.webSearch    || 'auto';

  var search = SearchOracle.resolve(mode, prompt);
  var built  = ContentBuilder.build(prompt, history, imgData, [WeatherProvider]);
  var sys    = PromptBuilder.buildSystem(sysPr);

  Logger.log('[PHOENIX] sendMessage: model=' + model + ' search=' + search + ' image=' + built.hasImage + ' prompt=' + (prompt||'').substring(0, 60));

  var result = InferenceEngine.run(built.contents, sys, model, search);
  PersistenceService.saveExchange(sid, prompt || '', result.text, result.model || model, isNew, title);
  result.sessionId  = sid;
  result.hasImage   = built.hasImage;
  result.imageBytes = built.imageBytes;
  return result;
}
