/* WoW Imperial - juego de estrategia por razas */
(function () {
  "use strict";

  var ACCOUNTS_KEY = "wowimperial:accounts";
  var SESSION_KEY = "wowimperial:session";
  var SETTINGS_KEY = "wowimperial:settings";
  var MAX_OFFLINE_MINUTES = 8 * 60;
  var GATHER_COOLDOWN_MS = 30 * 1000;
  var SAVE_EVERY_MS = 8000;

  var SUPABASE_URL = "https://upvqpyxscajqoszqsowa.supabase.co";
  var SUPABASE_KEY = "sb_publishable_SVq_ig5V7naKJojtdy78IA_uLLMntrI";

  var RESOURCES = ["oro", "madera", "comida", "piedra"];
  var RES_LABEL = { oro: "Oro", madera: "Madera", comida: "Comida", piedra: "Piedra" };
  var RES_ICON = { oro: "◈", madera: "❖", comida: "❁", piedra: "▲" };

  var RACES = {
    horda: {
      id: "horda",
      name: "Horda",
      motto: "La fuerza no espera",
      desc:
        "Tus tropas golpean más fuerte y resisten más, pero tus trabajadores producen recursos más despacio.",
      prod: 0.8,
      gather: 1.0,
      atk: 1.25,
      def: 1.25,
      hp: 1.25,
      troops: 92,
      eco: 34,
    },
    alianza: {
      id: "alianza",
      name: "Alianza",
      motto: "Orden, acero y equilibrio",
      desc:
        "Sin extremos: tropas competentes y una economía estable. La opción más flexible para empezar.",
      prod: 1.0,
      gather: 1.0,
      atk: 1.0,
      def: 1.0,
      hp: 1.0,
      troops: 66,
      eco: 66,
    },
    enanos: {
      id: "enanos",
      name: "Enanos",
      motto: "La montaña todo lo da",
      desc:
        "Tus tropas son más frágiles en combate, pero extraes y generas muchísimos más recursos por minuto.",
      prod: 1.25,
      gather: 1.35,
      atk: 0.8,
      def: 0.8,
      hp: 0.8,
      troops: 38,
      eco: 94,
    },
  };

  var BUILDINGS = {
    ayuntamiento: {
      name: "Ayuntamiento",
      base: { oro: 180, madera: 140, comida: 90, piedra: 110 },
      desc: function (lvl) {
        return "Centro de mando. +" + Math.round((lvl - 1) * 10) + "% producción global y +" +
          (lvl * 800) + " de almacenamiento.";
      },
      unlocks: true,
    },
    aserradero: {
      name: "Aserradero",
      base: { oro: 60, madera: 80, comida: 30, piedra: 20 },
      res: "madera",
      rate: 18,
    },
    cantera: {
      name: "Cantera",
      base: { oro: 70, madera: 50, comida: 30, piedra: 60 },
      res: "piedra",
      rate: 14,
    },
    granja: {
      name: "Granja",
      base: { oro: 50, madera: 60, comida: 70, piedra: 20 },
      res: "comida",
      rate: 16,
    },
    mina: {
      name: "Mina de oro",
      base: { oro: 90, madera: 70, comida: 40, piedra: 80 },
      res: "oro",
      rate: 12,
    },
    cuartel: {
      name: "Cuartel",
      base: { oro: 150, madera: 120, comida: 80, piedra: 100 },
      desc: function (lvl) {
        return "Permite entrenar tropas. Capacidad del ejército: " + troopCap(lvl) + " unidades.";
      },
    },
    granero: {
      name: "Granero",
      base: { oro: 120, madera: 160, comida: 60, piedra: 90 },
      desc: function (lvl) {
        return "Amplía el almacenamiento en " + Number(lvl * 1500).toLocaleString("es-ES") + ".";
      },
    },
  };

  var TROOPS = {
    lanceros: {
      name: "Lanceros",
      cost: { oro: 40, madera: 20, comida: 10, piedra: 0 },
      atk: 6,
      def: 8,
      hp: 30,
      time: 3,
      desc: "Baratos y defensivos. La base de cualquier ejército.",
    },
    arqueros: {
      name: "Arqueros",
      cost: { oro: 60, madera: 45, comida: 15, piedra: 10 },
      atk: 11,
      def: 4,
      hp: 22,
      time: 5,
      desc: "Gran ataque a distancia, pero frágiles en primera línea.",
    },
    jinetes: {
      name: "Jinetes",
      cost: { oro: 110, madera: 30, comida: 70, piedra: 20 },
      atk: 18,
      def: 10,
      hp: 55,
      time: 9,
      desc: "Unidad de élite. Caros, pero devastadores en incursiones.",
    },
  };

  var QUEUE_LIMIT = 4;
  var DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

  var CAMP_NAMES = [
    ["Campamento saqueador", "easy"],
    ["Ruinas de Ventorroto", "easy"],
    ["Fortaleza de Khar", "mid"],
    ["Guarida de la Grieta", "mid"],
    ["Ciudadela de Ceniza", "hard"],
    ["Trono del Déspota", "hard"],
    ["Abismo de Hierro", "hard"],
  ];

  var app = document.getElementById("app");
  var session = null;
  var account = null;
  var state = null;
  var view = "aldea";
  var authMode = "login";
  var pendingRace = null;
  var authError = "";
  var authInfo = "";
  var lastRender = 0;
  var tickHandle = null;
  var saveHandle = null;
  var dirty = false;

  /* ---------------- storage ---------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn("No se pudo guardar", err);
    }
  }

  function hashPassword(text) {
    var h1 = 5381;
    var h2 = 52711;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      h1 = (h1 * 33) ^ c;
      h2 = (h2 * 31) ^ (c + 7);
    }
    return (h1 >>> 0).toString(36) + "." + (h2 >>> 0).toString(36) + "." + text.length.toString(36);
  }

  function getAccounts() {
    return readJSON(ACCOUNTS_KEY, {});
  }

  function saveAccounts(accounts) {
    writeJSON(ACCOUNTS_KEY, accounts);
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  /* ---------------- helpers ---------------- */

  function now() {
    return Date.now();
  }

  function num(value) {
    return Number(value || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function troopCap(cuartelLevel) {
    return 50 + cuartelLevel * 30;
  }

  function prodBonus(ayuntamientoLevel) {
    return 1 + (ayuntamientoLevel - 1) * 0.1;
  }

  function storageLimit(b) {
    return 2000 + b.granero * 1500 + b.ayuntamiento * 800;
  }

  function upgradeCost(key, level) {
    var base = BUILDINGS[key].base;
    var factor = Math.pow(1.55, level - 1);
    var cost = {};
    RESOURCES.forEach(function (res) {
      cost[res] = Math.round(base[res] * factor);
    });
    return cost;
  }

  function canAfford(cost) {
    return RESOURCES.every(function (res) {
      return state.res[res] >= (cost[res] || 0);
    });
  }

  function pay(cost) {
    RESOURCES.forEach(function (res) {
      state.res[res] -= cost[res] || 0;
    });
    dirty = true;
  }

  function addLog(text, kind) {
    state.log.unshift({ t: now(), text: text, kind: kind || "" });
    state.log = state.log.slice(0, 40);
    dirty = true;
  }

  function troopMult(race) {
    return { atk: race.atk, def: race.def, hp: race.hp };
  }

  function armyPower(s) {
    var race = RACES[s.race];
    var mult = troopMult(race);
    var total = 0;
    Object.keys(TROOPS).forEach(function (key) {
      var def = TROOPS[key];
      var count = s.troops[key] || 0;
      total += count * ((def.atk * mult.atk) + (def.def * mult.def) + (def.hp * mult.hp) / 4);
    });
    return Math.round(total);
  }

  function armyCount(s) {
    return Object.keys(TROOPS).reduce(function (sum, key) {
      return sum + (s.troops[key] || 0);
    }, 0);
  }

  function productionPerMinute(s, key) {
    var def = BUILDINGS[key];
    if (!def.res) return 0;
    var level = s.buildings[key] || 0;
    var race = RACES[s.race];
    return def.rate * level * race.prod * prodBonus(s.buildings.ayuntamiento);
  }

  function totalProduction(s) {
    var out = { oro: 0, madera: 0, comida: 0, piedra: 0 };
    Object.keys(BUILDINGS).forEach(function (key) {
      if (BUILDINGS[key].res) {
        out[BUILDINGS[key].res] += productionPerMinute(s, key);
      }
    });
    return out;
  }

  /* ---------------- state creation ---------------- */

  function newState(raceId) {
    var t = now();
    var res = { oro: 600, madera: 600, comida: 600, piedra: 600 };
    return {
      race: raceId,
      createdAt: t,
      lastTick: t,
      lastGather: 0,
      res: res,
      buildings: {
        ayuntamiento: 1,
        aserradero: 1,
        cantera: 1,
        granja: 1,
        mina: 1,
        cuartel: 1,
        granero: 1,
      },
      troops: { lanceros: 6, arqueros: 2, jinetes: 0 },
      campsCleared: 0,
      lastDaily: 0,
      buildQueue: [],
      trainQueue: [],
      map: { camps: {}, village: null },
      log: [
        { t: t, text: "Se fundó tu aldea. La " + RACES[raceId].name + " domina estas tierras.", kind: "good" },
      ],
    };
  }

  function migrateState(s) {
    if (!s) return s;
    var base = newState(s.race || "alianza");
    s.res = Object.assign({}, base.res, s.res || {});
    s.buildings = Object.assign({}, base.buildings, s.buildings || {});
    s.troops = Object.assign({}, base.troops, s.troops || {});
    s.log = Array.isArray(s.log) ? s.log : [];
    s.campsCleared = Number(s.campsCleared || 0);
    s.lastGather = Number(s.lastGather || 0);
    s.lastDaily = Number(s.lastDaily || 0);
    s.buildQueue = Array.isArray(s.buildQueue) ? s.buildQueue : [];
    s.trainQueue = Array.isArray(s.trainQueue) ? s.trainQueue : [];
    s.map = s.map && typeof s.map === "object" ? s.map : { camps: {}, village: null };
    s.map.camps = s.map.camps && typeof s.map.camps === "object" ? s.map.camps : {};
    return s;
  }

  function applyOffline(s) {
    var t = now();
    var minutes = (t - Number(s.lastTick || t)) / 60000;
    if (!isFinite(minutes) || minutes <= 0) {
      s.lastTick = t;
      return { minutes: 0 };
    }
    minutes = Math.min(minutes, MAX_OFFLINE_MINUTES);
    var prod = totalProduction(s);
    var limit = storageLimit(s.buildings);
    RESOURCES.forEach(function (res) {
      var gain = prod[res] * minutes;
      s.res[res] = Math.min(limit, s.res[res] + gain);
    });
    s.lastTick = t;
    return { minutes: minutes };
  }

  /* ---------------- persistence of game ---------------- */

  var cloudSaveHandle = null;
  var cloudStorage = readJSON(SETTINGS_KEY, {});
  var cloudState = cloudStorage.cloud || "unknown"; // unknown | ready | missing | offline

  function saveGame() {
    if (!session || !account || !state) return;
    if (session.mode === "cloud") {
      scheduleCloudSave();
      return;
    }
    var accounts = getAccounts();
    if (!accounts[account]) return;
    accounts[account].state = state;
    accounts[account].race = state.race;
    saveAccounts(accounts);
    dirty = false;
  }

  function mirrorLocal(email, pass, race, gameState) {
    var accounts = getAccounts();
    accounts[email] = {
      email: email,
      pass: pass || (accounts[email] && accounts[email].pass) || "",
      race: race,
      createdAt: (accounts[email] && accounts[email].createdAt) || now(),
      state: gameState,
    };
    saveAccounts(accounts);
  }

  /* ---------------- supabase cloud ---------------- */

  function api(path, options) {
    var opts = options || {};
    var headers = {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    };
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    else headers.Authorization = "Bearer " + SUPABASE_KEY;
    Object.assign(headers, opts.headers || {});
    return fetch(SUPABASE_URL + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (err) {
            data = text;
          }
        }
        return { ok: response.ok, status: response.status, data: data };
      });
    });
  }

  function cloudErrorMessage(result) {
    var data = result.data;
    if (!data) return "Error de conexión (" + result.status + ").";
    if (typeof data === "string") return data;
    return (
      data.msg ||
      data.message ||
      data.error_description ||
      data.error ||
      data.hint ||
      "Error de conexión (" + result.status + ")."
    );
  }

  function setCloudState(next) {
    cloudState = next;
    var settings = readJSON(SETTINGS_KEY, {});
    settings.cloud = next;
    writeJSON(SETTINGS_KEY, settings);
  }

  function checkCloud() {
    return api("/rest/v1/profiles?select=id&limit=1").then(function (result) {
      if (result.ok) {
        setCloudState("ready");
      } else if (result.status === 404) {
        setCloudState("missing");
      } else {
        setCloudState("offline");
      }
      return cloudState;
    }).catch(function () {
      setCloudState("offline");
      return cloudState;
    });
  }

  function cloudSignUp(email, password) {
    return api("/auth/v1/signup", { method: "POST", body: { email: email, password: password } });
  }

  function cloudSignIn(email, password) {
    return api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: email, password: password },
    });
  }

  function cloudRefresh(refreshToken) {
    return api("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
  }

  function cloudUser(accessToken) {
    return api("/auth/v1/user", { token: accessToken });
  }

  function cloudLoadProfile(token, userId) {
    return api(
      "/rest/v1/profiles?id=eq." + encodeURIComponent(userId) + "&select=race,state,username,x,y",
      { token: token }
    );
  }

  function cloudWriteProfile(token, userId, username, race, gameState) {
    return api("/rest/v1/profiles", {
      method: "POST",
      token: token,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: [
        {
          id: userId,
          username: username,
          race: race,
          state: gameState,
          updated_at: new Date().toISOString(),
        },
      ],
    });
  }

  function scheduleCloudSave() {
    if (cloudSaveHandle) return;
    cloudSaveHandle = setTimeout(function () {
      cloudSaveHandle = null;
      flushCloudSave();
    }, 1500);
  }

  function flushCloudSave() {
    if (!session || session.mode !== "cloud" || !state || !session.token) return Promise.resolve(false);
    var token = session.token;
    var userId = session.userId;
    var username = session.username || account;
    return cloudWriteProfile(token, userId, username, state.race, state).then(function (result) {
      if (result.ok) {
        setCloudState("ready");
        dirty = false;
        return true;
      }
      if (result.status === 401) {
        return cloudRefresh(session.refreshToken).then(function (refresh) {
          if (!refresh.ok || !refresh.data || !refresh.data.access_token) return false;
          session.token = refresh.data.access_token;
          session.refreshToken = refresh.data.refresh_token || session.refreshToken;
          writeJSON(SESSION_KEY, session);
          return flushCloudSave();
        });
      }
      if (result.status === 404) setCloudState("missing");
      return false;
    }).catch(function () {
      setCloudState("offline");
      return false;
    });
  }

  function startCloudSession(auth, email, password) {
    session = {
      mode: "cloud",
      email: email,
      token: auth.access_token,
      refreshToken: auth.refresh_token,
      userId: auth.user.id,
      username: (auth.user.user_metadata && auth.user.user_metadata.username) || email.split("@")[0],
      expiresAt: now() + (auth.expires_in || 3600) * 1000,
    };
    account = email;
    writeJSON(SESSION_KEY, session);

    return cloudLoadProfile(session.token, session.userId).then(function (result) {
      if (result.status === 404) {
        setCloudState("missing");
        session = null;
        account = null;
        localStorage.removeItem(SESSION_KEY);
        authError =
          "Las tablas de Supabase aún no existen. Ejecuta supabase/schema.sql en el SQL Editor del dashboard y vuelve a intentar.";
        renderAuth();
        return;
      }
      if (result.ok) setCloudState("ready");
      var row = Array.isArray(result.data) ? result.data[0] : null;
      if (!row) {
        pendingRace = { mode: "cloud", email: email, pass: password || "", token: session.token };
        renderRaceSelection();
        return;
      }
      state = migrateState(row.state && row.state.race ? row.state : newState(row.race));
      state.race = row.race || state.race;
      session.username = row.username || session.username;
      if (row.x != null) session.village = { x: Number(row.x), y: Number(row.y) };
      writeJSON(SESSION_KEY, session);
      var offline = applyOffline(state);
      if (offline.minutes >= 1) {
        addLog(
          "Mientras estabas fuera (" + Math.round(offline.minutes) + " min) tu aldea produjo recursos.",
          ""
        );
      }
      mirrorLocal(email, password, state.race, state);
      enterGame();
    });
  }

  /* ---------------- auth screens ---------------- */

  var authCloud = (readJSON(SETTINGS_KEY, {}).cloudMode !== false);

  function translateCloudError(result) {
    var message = cloudErrorMessage(result);
    var lower = String(message).toLowerCase();
    if (lower.indexOf("invalid login credentials") !== -1) return "Correo o contraseña incorrectos.";
    if (lower.indexOf("email not confirmed") !== -1)
      return "Debes confirmar tu correo antes de entrar. Revisa tu bandeja de entrada (o desactiva la confirmación por correo en Supabase).";
    if (lower.indexOf("user already registered") !== -1)
      return "Ya existe una cuenta con ese correo. Inicia sesión.";
    if (lower.indexOf("password should be") !== -1) return "La contraseña es demasiado débil (mínimo 6 caracteres).";
    if (lower.indexOf("rate limit") !== -1 || lower.indexOf("too many") !== -1)
      return "Demasiados intentos. Espera un minuto y vuelve a probar.";
    return message;
  }

  function renderAuth() {
    var isLogin = authMode === "login";
    var networkNote = "";
    if (authCloud) {
      if (cloudState === "missing") {
        networkNote =
          '<div class="msg error">Falta el esquema en Supabase. Abre el SQL Editor del dashboard, ejecuta el archivo ' +
          "<b>supabase/schema.sql</b> y recarga esta página.</div>";
      } else if (cloudState === "offline") {
        networkNote = '<div class="msg error">No se pudo conectar con Supabase. Revisa tu conexión o usa el modo local.</div>';
      } else {
        networkNote = '<div class="msg ok">Conectado a Supabase. Tus partidas se guardan en la nube.</div>';
      }
    }
    app.innerHTML =
      '<div class="auth-screen">' +
        '<div class="auth-card">' +
          '<div class="auth-head">' +
            "<h1>WoW Imperial</h1>" +
            "<p>Forja tu imperio. Elige tu raza y domina.</p>" +
          "</div>" +
          '<div class="auth-modes">' +
            '<button type="button" class="mode-tab' + (authCloud ? " active" : "") + '" data-mode="cloud">Nube</button>' +
            '<button type="button" class="mode-tab' + (!authCloud ? " active" : "") + '" data-mode="local">Local</button>' +
          "</div>" +
          '<form class="auth-form" id="auth-form" novalidate>' +
            networkNote +
            (authError ? '<div class="msg error">' + escapeHtml(authError) + "</div>" : "") +
            (authInfo ? '<div class="msg ok">' + escapeHtml(authInfo) + "</div>" : "") +
            '<label class="field">Correo electrónico' +
              '<input type="email" name="email" autocomplete="email" placeholder="tu@correo.com" required />' +
            "</label>" +
            '<label class="field">Contraseña' +
              '<input type="password" name="password" autocomplete="' +
                (isLogin ? "current-password" : "new-password") +
              '" placeholder="Mínimo 6 caracteres" minlength="6" required />' +
            "</label>" +
            '<button class="btn-primary" type="submit"' + (authBusy ? " disabled" : "") + ">" +
              (authBusy ? "Conectando…" : isLogin ? "Entrar" : "Crear cuenta y elegir raza") +
            "</button>" +
            '<div class="auth-foot">' +
              "<span>" + (isLogin ? "¿Sin cuenta?" : "¿Ya tienes cuenta?") + "</span>" +
              '<button type="button" class="link" id="toggle-mode">' +
                (isLogin ? "Registrarse" : "Iniciar sesión") +
              "</button>" +
            "</div>" +
          "</form>" +
        "</div>" +
      "</div>";

    Array.prototype.forEach.call(app.querySelectorAll("[data-mode]"), function (button) {
      button.addEventListener("click", function () {
        authCloud = button.getAttribute("data-mode") === "cloud";
        var settings = readJSON(SETTINGS_KEY, {});
        settings.cloudMode = authCloud;
        writeJSON(SETTINGS_KEY, settings);
        authError = "";
        authInfo = "";
        renderAuth();
      });
    });

    document.getElementById("toggle-mode").addEventListener("click", function () {
      authMode = isLogin ? "register" : "login";
      authError = "";
      authInfo = "";
      renderAuth();
    });

    document.getElementById("auth-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var email = normalizeEmail(form.elements.email.value);
      var password = String(form.elements.password.value || "");
      authError = "";
      authInfo = "";

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        authError = "Introduce un correo electrónico válido.";
        renderAuth();
        return;
      }
      if (password.length < 6) {
        authError = "La contraseña debe tener al menos 6 caracteres.";
        renderAuth();
        return;
      }

      if (authCloud) {
        cloudAuthFlow(email, password, isLogin);
        return;
      }

      var accounts = getAccounts();
      if (isLogin) {
        var existing = accounts[email];
        if (!existing) {
          authError = "No existe una cuenta con ese correo.";
          renderAuth();
          return;
        }
        if (existing.pass !== hashPassword(password)) {
          authError = "Contraseña incorrecta.";
          renderAuth();
          return;
        }
        startSession(email);
        return;
      }

      if (accounts[email]) {
        authError = "Ya existe una cuenta con ese correo. Inicia sesión.";
        renderAuth();
        return;
      }
      pendingRace = { mode: "local", email: email, pass: hashPassword(password) };
      renderRaceSelection();
    });
  }

  var authBusy = false;

  function cloudAuthFlow(email, password, isLogin) {
    authBusy = true;
    renderAuth();

    function done() {
      authBusy = false;
    }

    function fail(result) {
      done();
      authError = translateCloudError(result);
      renderAuth();
    }

    function afterSignUp(result) {
      if (!result.ok) return fail(result);
      var data = result.data || {};
      if (data.access_token) {
        done();
        startCloudSession(data, email, password).catch(function () {
          authBusy = false;
          authError = "No se pudo cargar tu perfil. Inténtalo de nuevo.";
          renderAuth();
        });
        return;
      }
      // Confirmación de correo activada: intentamos entrar directamente por si está desactivada.
      cloudSignIn(email, password).then(function (signIn) {
        if (signIn.ok && signIn.data && signIn.data.access_token) {
          done();
          startCloudSession(signIn.data, email, password).catch(function () {
            authBusy = false;
            authError = "No se pudo cargar tu perfil. Inténtalo de nuevo.";
            renderAuth();
          });
          return;
        }
        done();
        authMode = "login";
        authInfo =
          "Cuenta creada. Si Supabase pide confirmación por correo, revisa tu email y luego inicia sesión.";
        renderAuth();
      });
    }

    if (isLogin) {
      cloudSignIn(email, password).then(function (result) {
        if (!result.ok) return fail(result);
        done();
        startCloudSession(result.data, email, password).catch(function () {
          authBusy = false;
          authError = "No se pudo cargar tu perfil. Inténtalo de nuevo.";
          renderAuth();
        });
      }).catch(function () {
        done();
        authError = "No se pudo conectar con Supabase.";
        renderAuth();
      });
      return;
    }

    cloudSignUp(email, password).then(afterSignUp).catch(function () {
      done();
      authError = "No se pudo conectar con Supabase.";
      renderAuth();
    });
  }

  function startSession(email) {
    var accounts = getAccounts();
    var record = accounts[email];
    if (!record) {
      authError = "Cuenta no encontrada.";
      renderAuth();
      return;
    }
    session = { email: email };
    account = email;
    state = migrateState(record.state || newState(record.race || "alianza"));
    writeJSON(SESSION_KEY, session);
    var offline = applyOffline(state);
    if (offline.minutes >= 1) {
      addLog(
        "Mientras estabas fuera (" + Math.round(offline.minutes) + " min) tu aldea produjo recursos.",
        ""
      );
    }
    enterGame();
  }

  function logout() {
    var closing = session;
    saveGame();
    if (closing && closing.mode === "cloud" && closing.token) {
      flushCloudSave();
      api("/auth/v1/logout", { method: "POST", token: closing.token }).catch(function () {});
    }
    session = null;
    account = null;
    state = null;
    pendingRace = null;
    localStorage.removeItem(SESSION_KEY);
    authMode = "login";
    authError = "";
    authInfo = "";
    if (tickHandle) clearInterval(tickHandle);
    if (saveHandle) clearInterval(saveHandle);
    stopWorldSync();
    mapFitted = false;
    renderAuth();
  }

  /* ---------------- race selection ---------------- */

  function renderRaceSelection() {
    var cards = Object.keys(RACES)
      .map(function (key) {
        var race = RACES[key];
        return (
          '<article class="race-card ' + race.id + '">' +
            '<div class="race-head">' +
              "<h2>" + race.name + "</h2>" +
              '<div class="motto">' + race.motto + "</div>" +
            "</div>" +
            '<div class="race-body">' +
              '<p class="race-desc">' + race.desc + "</p>" +
              '<div class="stat-row">' +
                '<div class="stat">' +
                  "<span>Fuerza de tropas</span>" +
                  '<div class="bar troops"><span style="width:' + race.troops + '%"></span></div>' +
                  "<b>" + race.troops + "%</b>" +
                "</div>" +
                '<div class="stat">' +
                  "<span>Producción de recursos</span>" +
                  '<div class="bar eco"><span style="width:' + race.eco + '%"></span></div>' +
                  "<b>" + race.eco + "%</b>" +
                "</div>" +
              "</div>" +
              '<div class="balance-list">' +
                '<div class="balance-row"><span>Ataque</span><b>x' + race.atk.toFixed(2) + "</b></div>" +
                '<div class="balance-row"><span>Defensa</span><b>x' + race.def.toFixed(2) + "</b></div>" +
                '<div class="balance-row"><span>Vida</span><b>x' + race.hp.toFixed(2) + "</b></div>" +
                '<div class="balance-row"><span>Producción/min</span><b>x' + race.prod.toFixed(2) + "</b></div>" +
                '<div class="balance-row"><span>Recolección</span><b>x' + race.gather.toFixed(2) + "</b></div>" +
              "</div>" +
              '<button class="btn-primary" data-pick-race="' + race.id + '">Jugar como ' + race.name + "</button>" +
            "</div>" +
          "</article>"
        );
      })
      .join("");

    app.innerHTML =
      '<div class="race-screen">' +
        '<div class="race-title">' +
          "<h1>Elige tu raza</h1>" +
          "<p>Esta decisión es permanente. Cada raza cambia por completo tu forma de jugar: " +
            "no hay una mejor que otra, solo estilos distintos.</p>" +
        "</div>" +
        (authError ? '<div class="msg error">' + escapeHtml(authError) + "</div>" : "") +
        '<div class="notice">' +
          "<b>Información importante:</b> la <b>Horda</b> tiene tropas más fuertes pero produce recursos más lento. " +
          "La <b>Alianza</b> es el punto medio. Los <b>Enanos</b> tienen tropas más débiles pero recolectan muchos más recursos." +
        "</div>" +
        '<div class="race-grid">' + cards + "</div>" +
      "</div>";

    Array.prototype.forEach.call(app.querySelectorAll("[data-pick-race]"), function (button) {
      button.addEventListener("click", function () {
        var raceId = button.getAttribute("data-pick-race");
        if (pendingRace && pendingRace.mode === "cloud") {
          var cloudPending = pendingRace;
          pendingRace = null;
          var freshState = newState(raceId);
          cloudWriteProfile(cloudPending.token, session.userId, session.username, raceId, freshState)
            .then(function (result) {
              if (!result.ok) {
                pendingRace = cloudPending;
                authError =
                  result.status === 404
                    ? "Faltan las tablas en Supabase. Ejecuta supabase/schema.sql en el SQL Editor."
                    : "No se pudo guardar tu raza: " + cloudErrorMessage(result);
                renderRaceSelection();
                return;
              }
              state = freshState;
              mirrorLocal(cloudPending.email, "", raceId, state);
              session.username = session.username || cloudPending.email.split("@")[0];
              return cloudLoadProfile(session.token, session.userId).then(function (profile) {
                var row = profile.ok && Array.isArray(profile.data) ? profile.data[0] : null;
                if (row && row.x != null) session.village = { x: Number(row.x), y: Number(row.y) };
                writeJSON(SESSION_KEY, session);
                enterGame();
              });
            })
            .catch(function () {
              pendingRace = cloudPending;
              authError = "No se pudo conectar con Supabase. Inténtalo de nuevo.";
              renderRaceSelection();
            });
          return;
        }
        if (pendingRace) {
          var email = pendingRace.email;
          var accounts = getAccounts();
          accounts[email] = {
            email: email,
            pass: pendingRace.pass,
            race: raceId,
            createdAt: now(),
            state: newState(raceId),
          };
          saveAccounts(accounts);
          pendingRace = null;
          startSession(email);
          return;
        }
        if (!state) return;
        state.race = raceId;
        dirty = true;
        saveGame();
        enterGame();
      });
    });
  }

  /* ---------------- game view ---------------- */

  function enterGame() {
    view = "aldea";
    mapFitted = false;
    pvpTarget = null;
    pvpResult = null;
    renderGame();
    if (tickHandle) clearInterval(tickHandle);
    if (saveHandle) clearInterval(saveHandle);
    tickHandle = setInterval(tick, 1000);
    saveHandle = setInterval(saveGame, SAVE_EVERY_MS);
    startWorldSync();
  }

  function buildTimeMs(key, level) {
    var seconds = Math.round(20 * Math.pow(1.45, level - 1)) + (key === "ayuntamiento" ? 12 : 0);
    return seconds * 1000;
  }

  function queuedTroops() {
    return (state.trainQueue || []).reduce(function (sum, entry) {
      return sum + entry.count;
    }, 0);
  }

  function processQueues() {
    var t = now();
    var changed = false;
    while (state.buildQueue.length && state.buildQueue[0].endsAt <= t) {
      var job = state.buildQueue.shift();
      state.buildings[job.key] = job.toLevel;
      addLog(BUILDINGS[job.key].name + " terminado: nivel " + job.toLevel + ".", "good");
      changed = true;
    }
    while (state.trainQueue.length && state.trainQueue[0].endsAt <= t) {
      var order = state.trainQueue.shift();
      state.troops[order.key] = (state.troops[order.key] || 0) + order.count;
      addLog("Entrenamiento completado: " + order.count + " " + TROOPS[order.key].name + ".", "good");
      changed = true;
    }
    if (changed) {
      saveGame();
      renderGame();
    }
    return changed;
  }

  function tick() {
    if (!state) return;
    var t = now();
    var minutes = (t - state.lastTick) / 60000;
    if (minutes > 0.0005) {
      var prod = totalProduction(state);
      var limit = storageLimit(state.buildings);
      RESOURCES.forEach(function (res) {
        state.res[res] = Math.min(limit, state.res[res] + prod[res] * minutes);
      });
      state.lastTick = t;
      refreshNumbers();
    }
    if (!processQueues()) {
      updateTimers();
    }
    var gatherButton = document.getElementById("gather-btn");
    if (gatherButton) {
      var left = Math.ceil((GATHER_COOLDOWN_MS - (t - state.lastGather)) / 1000);
      if (left > 0) {
        gatherButton.disabled = true;
        gatherButton.textContent = "Recolectar en " + left + "s";
      } else {
        gatherButton.disabled = false;
        gatherButton.textContent = "Recolectar recursos";
      }
    }
    var dailyButton = document.getElementById("daily-btn");
    if (dailyButton) {
      var dailyLeft = DAILY_COOLDOWN_MS - (t - (state.lastDaily || 0));
      if (dailyLeft > 0) {
        dailyButton.disabled = true;
        dailyButton.textContent = "Bonus diario en " + formatDuration(dailyLeft);
      } else {
        dailyButton.disabled = false;
        dailyButton.textContent = "Reclamar bonus diario";
      }
    }
  }

  function formatDuration(ms) {
    var totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    if (hours > 0) return hours + "h " + minutes + "m";
    if (minutes > 0) return minutes + "m " + seconds + "s";
    return seconds + "s";
  }

  function updateTimers() {
    var nodes = document.querySelectorAll("[data-timer]");
    Array.prototype.forEach.call(nodes, function (node) {
      var endsAt = Number(node.getAttribute("data-timer"));
      var startedAt = Number(node.getAttribute("data-start"));
      var left = endsAt - now();
      var progressNode = document.getElementById(node.getAttribute("data-bar"));
      if (left <= 0) {
        node.textContent = "Listo";
        if (progressNode) progressNode.style.width = "100%";
        return;
      }
      node.textContent = formatDuration(left);
      if (progressNode && endsAt > startedAt) {
        var pct = clamp(((now() - startedAt) / (endsAt - startedAt)) * 100, 1, 99);
        progressNode.style.width = pct.toFixed(1) + "%";
      }
    });
  }

  function claimDaily() {
    if (!state) return;
    var t = now();
    if (t - (state.lastDaily || 0) < DAILY_COOLDOWN_MS) return;
    state.lastDaily = t;
    var prod = totalProduction(state);
    var limit = storageLimit(state.buildings);
    var gained = 0;
    RESOURCES.forEach(function (res) {
      var bonus = prod[res] * 60;
      var applied = Math.min(bonus, Math.max(0, limit - state.res[res]));
      state.res[res] += applied;
      gained += applied;
    });
    addLog("Bonus diario reclamado: +" + num(gained) + " recursos.", "good");
    saveGame();
    renderGame();
  }

  function gather() {
    if (!state) return;
    var t = now();
    if (t - state.lastGather < GATHER_COOLDOWN_MS) return;
    state.lastGather = t;
    var race = RACES[state.race];
    var limit = storageLimit(state.buildings);
    var total = 0;
    RESOURCES.forEach(function (res) {
      var gain = Math.round(30 * race.gather);
      var applied = Math.min(gain, Math.max(0, limit - state.res[res]));
      state.res[res] += applied;
      total += applied;
    });
    addLog("Recolectaste " + num(total) + " recursos con tus trabajadores.", "good");
    renderGame();
  }

  function upgradeBuilding(key) {
    if (!state) return;
    if (state.buildQueue.length >= 1) {
      addLog("Ya hay una obra en curso. Espera a que termine.", "bad");
      renderGame();
      return;
    }
    var level = state.buildings[key];
    var target = level + 1;
    var townhall = state.buildings.ayuntamiento;
    if (key !== "ayuntamiento" && target > townhall) {
      addLog("Necesitas subir el Ayuntamiento al nivel " + target + " primero.", "bad");
      renderGame();
      return;
    }
    var cost = upgradeCost(key, level);
    if (!canAfford(cost)) {
      addLog("Recursos insuficientes para mejorar " + BUILDINGS[key].name + ".", "bad");
      renderGame();
      return;
    }
    pay(cost);
    var startedAt = now();
    var duration = buildTimeMs(key, level);
    state.buildQueue.push({
      key: key,
      toLevel: target,
      startedAt: startedAt,
      endsAt: startedAt + duration,
    });
    addLog(
      "Obra iniciada: " + BUILDINGS[key].name + " a nivel " + target + " (" + formatDuration(duration) + ").",
      ""
    );
    saveGame();
    renderGame();
  }

  function trainTroop(key, amount) {
    if (!state) return;
    var def = TROOPS[key];
    var cap = troopCap(state.buildings.cuartel);
    var current = armyCount(state) + queuedTroops();
    var space = Math.max(0, cap - current);
    if (space <= 0) {
      addLog("Tu ejército está al máximo. Mejora el Cuartel.", "bad");
      renderGame();
      return;
    }
    if (state.trainQueue.length >= QUEUE_LIMIT) {
      addLog("La cola de entrenamiento está llena.", "bad");
      renderGame();
      return;
    }
    var count = Math.min(amount, space);
    var cost = {};
    RESOURCES.forEach(function (res) {
      cost[res] = (def.cost[res] || 0) * count;
    });
    while (count > 0 && !canAfford(cost)) {
      count -= 1;
      RESOURCES.forEach(function (res) {
        cost[res] = (def.cost[res] || 0) * count;
      });
    }
    if (count <= 0) {
      addLog("Recursos insuficientes para entrenar " + def.name + ".", "bad");
      renderGame();
      return;
    }
    pay(cost);
    var duration = count * def.time * 1000;
    var lastEnd = state.trainQueue.length
      ? state.trainQueue[state.trainQueue.length - 1].endsAt
      : now();
    var startedAt = Math.max(now(), lastEnd);
    state.trainQueue.push({
      key: key,
      count: count,
      startedAt: startedAt,
      endsAt: startedAt + duration,
      duration: duration,
    });
    addLog("Encolado: " + count + " " + def.name + " (" + formatDuration(duration) + ").", "");
    saveGame();
    renderGame();
  }

  function campList() {
    var townhall = state.buildings.ayuntamiento;
    var basePower = 90 + (townhall - 1) * 130 + state.campsCleared * 25;
    return CAMP_NAMES.map(function (entry, index) {
      var tier = entry[1];
      var factor = tier === "easy" ? 1 : tier === "mid" ? 1.9 : 3.1;
      var power = Math.round(basePower * factor + index * 45);
      var loot = Math.round(power * 1.5 + 150);
      return {
        id: index,
        name: entry[0],
        tier: tier,
        power: power,
        loot: loot,
      };
    });
  }

  function raid(campId) {
    if (!state) return;
    var camp = campList()[campId];
    if (!camp) return;
    var power = armyPower(state);
    if (power <= 0) {
      addLog("No tienes tropas. Entrena un ejército en el Cuartel.", "bad");
      renderGame();
      return;
    }
    var roll = 0.9 + Math.random() * 0.2;
    var effective = power * roll;
    var total = armyCount(state);
    var won = effective > camp.power;
    var lossFraction;
    if (won) {
      lossFraction = clamp((camp.power / effective) * 0.3, 0.02, 0.55);
    } else {
      lossFraction = clamp(0.45 + (camp.power / effective) * 0.25, 0.45, 0.85);
    }

    var losses = 0;
    Object.keys(TROOPS).forEach(function (key) {
      var count = state.troops[key] || 0;
      var dead = Math.min(count, Math.round(count * lossFraction));
      state.troops[key] = count - dead;
      losses += dead;
    });

    if (won) {
      var limit = storageLimit(state.buildings);
      var share = Math.round(camp.loot / 4);
      var gained = 0;
      RESOURCES.forEach(function (res) {
        var applied = Math.min(share, Math.max(0, limit - state.res[res]));
        state.res[res] += applied;
        gained += applied;
      });
      state.campsCleared += 1;
      addLog(
        "Victoria en " + camp.name + ": saqueaste " + num(gained) + " recursos. Bajas: " + losses + "/" + total + ".",
        "good"
      );
    } else {
      addLog(
        "Derrota en " + camp.name + ". Perdiste " + losses + " de " + total + " tropas y no hubo botín.",
        "bad"
      );
    }
    saveGame();
    renderGame();
  }

  /* ---------------- rendering ---------------- */

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resourcePanel() {
    var prod = totalProduction(state);
    var limit = storageLimit(state.buildings);
    var race = RACES[state.race];
    return (
      '<aside class="col">' +
        '<div class="panel">' +
          '<div class="panel-head">' +
            "<h2>Recursos</h2>" +
            '<span class="hint">x' + race.prod.toFixed(2) + " prod.</span>" +
          "</div>" +
          '<div class="panel-body">' +
            '<div class="res-grid">' +
              RESOURCES.map(function (res) {
                return (
                  '<div class="res">' +
                    '<div class="name">' + RES_ICON[res] + " " + RES_LABEL[res] + "</div>" +
                    '<div class="amount" id="res-' + res + '">' + num(state.res[res]) + "</div>" +
                    '<div class="rate">+' + Math.round(prod[res]) + " /min</div>" +
                  "</div>"
                );
              }).join("") +
            "</div>" +
            '<div class="info-line"><span>Almacenamiento</span><b id="storage-line">' +
              num(Math.floor(Math.max.apply(null, RESOURCES.map(function (r) { return state.res[r]; })))) +
              " / " + num(limit) + "</b></div>" +
            '<button class="btn" id="gather-btn">Recolectar recursos</button>' +
            '<button class="btn" id="daily-btn">Reclamar bonus diario</button>' +
            '<div class="mini-note">Recolectar da <b>' + Math.round(30 * race.gather) +
              "</b> de cada recurso cada 30s (bonus de raza x" + race.gather.toFixed(2) +
              "). El bonus diario entrega 1 minuto de producción por recurso cada 20h.</div>" +
          "</div>" +
        "</div>" +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Registro</h2></div>' +
          '<div class="panel-body">' +
            '<div class="log">' +
              (state.log.length
                ? state.log
                    .map(function (entry) {
                      var time = new Date(entry.t).toLocaleTimeString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return (
                        '<div class="log-item ' + entry.kind + '">' +
                          '<div class="time">' + time + "</div>" +
                          "<div>" + escapeHtml(entry.text) + "</div>" +
                        "</div>"
                      );
                    })
                    .join("")
                : '<div class="log-item">Aún no hay acontecimientos.</div>') +
            "</div>" +
          "</div>" +
        "</div>" +
      "</aside>"
    );
  }

  function villagers() {
    var power = armyPower(state);
    var camp = campList();
    return (
      '<aside class="col">' +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Ejército</h2></div>' +
          '<div class="panel-body">' +
            '<div class="info-line"><span>Poder de combate</span><b id="army-power">' + num(power) + "</b></div>" +
            '<div class="info-line"><span>Unidades</span><b>' + num(armyCount(state)) + " / " + num(troopCap(state.buildings.cuartel)) + "</b></div>" +
            '<div class="info-line"><span>Incursiones ganadas</span><b>' + num(state.campsCleared) + "</b></div>" +
            '<div class="mini-note">La ' + RACES[state.race].name + " aplica x" + RACES[state.race].atk.toFixed(2) +
              " a ataque, x" + RACES[state.race].def.toFixed(2) + " a defensa y x" + RACES[state.race].hp.toFixed(2) + " a vida.</div>" +
          "</div>" +
        "</div>" +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Objetivo cercano</h2></div>' +
          '<div class="panel-body">' +
            '<div class="info-line"><span>' + camp[0].name + "</span><b>" + num(camp[0].power) + " poder</b></div>" +
            '<div class="mini-note">Poder recomendado: ' + num(Math.round(camp[0].power / 1.1)) + " o más.</div>" +
          "</div>" +
        "</div>" +
      "</aside>"
    );
  }

  function buildingsView() {
    var keys = Object.keys(BUILDINGS);
    var job = state.buildQueue[0] || null;
    var cards = keys
      .map(function (key) {
        var def = BUILDINGS[key];
        var level = state.buildings[key];
        var cost = upgradeCost(key, level);
        var affordable = canAfford(cost);
        var townhall = state.buildings.ayuntamiento;
        var blocked = key !== "ayuntamiento" && level + 1 > townhall;
        var busy = !!job;
        var desc = def.desc
          ? def.desc(level)
          : "Produce " + Math.round(productionPerMinute(state, key)) + " " + RES_LABEL[def.res] + " por minuto.";
        var costHtml = RESOURCES.filter(function (res) {
          return cost[res] > 0;
        })
          .map(function (res) {
            var miss = state.res[res] < cost[res];
            return '<span class="' + (miss ? "miss" : "") + '">' + RES_ICON[res] + " " + num(cost[res]) + "</span>";
          })
          .join("");
        var underWork = job && job.key === key;
        var statusHtml = "";
        if (underWork) {
          statusHtml =
            '<div class="progress"><span id="bar-' + key + '" style="width:1%"></span></div>' +
            '<div class="mini-note">Termina en <b data-timer="' + job.endsAt + '" data-start="' + job.startedAt +
            '" data-bar="bar-' + key + '">' + formatDuration(job.endsAt - now()) + "</b></div>";
        }
        return (
          '<article class="bcard">' +
            '<div class="btop"><span class="bname">' + def.name + '</span><span class="lvl">Nv. ' + level + "</span></div>" +
            '<div class="bdesc">' + desc + "</div>" +
            (underWork
              ? statusHtml
              : '<div class="cost">' + costHtml + "</div>" +
                '<button class="btn" data-upgrade="' + key + '"' + (affordable && !blocked && !busy ? "" : " disabled") + ">" +
                  (blocked
                    ? "Requiere Ayuntamiento " + (level + 1)
                    : busy
                    ? "Obra en curso"
                    : "Mejorar a Nv. " + (level + 1)) +
                "</button>") +
          "</article>"
        );
      })
      .join("");

    return (
      '<div class="panel">' +
        '<div class="panel-head"><h2>Aldea</h2><span class="hint">7 edificios</span></div>' +
        '<div class="panel-body"><div class="building-grid">' + cards + "</div></div>" +
      "</div>"
    );
  }

  function queuePanel() {
    if (!state.trainQueue.length) return "";
    var rows = state.trainQueue
      .map(function (order, index) {
        var name = order.count + " x " + TROOPS[order.key].name;
        return (
          '<div class="queue-item">' +
            '<div class="qrow"><span>' + name + '</span><b data-timer="' + order.endsAt +
              '" data-start="' + order.startedAt + '" data-bar="qbar-' + index + '">' +
              formatDuration(order.endsAt - now()) + "</b></div>" +
            '<div class="progress"><span id="qbar-' + index + '" style="width:1%"></span></div>' +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="panel">' +
        '<div class="panel-head"><h2>Cola de entrenamiento</h2><span class="hint">' +
          state.trainQueue.length + " / " + QUEUE_LIMIT + "</span></div>" +
        '<div class="panel-body"><div class="queue-list">' + rows + "</div></div>" +
      "</div>"
    );
  }

  function troopsView() {
    var cap = troopCap(state.buildings.cuartel);
    var current = armyCount(state);
    var cards = Object.keys(TROOPS)
      .map(function (key) {
        var def = TROOPS[key];
        var race = RACES[state.race];
        var atk = def.atk * race.atk;
        var dfn = def.def * race.def;
        var hp = def.hp * race.hp;
        var costHtml = RESOURCES.filter(function (res) {
          return (def.cost[res] || 0) > 0;
        })
          .map(function (res) {
            var miss = state.res[res] < def.cost[res];
            return '<span class="' + (miss ? "miss" : "") + '">' + RES_ICON[res] + " " + num(def.cost[res]) + "</span>";
          })
          .join("");
        return (
          '<div class="troop">' +
            '<div class="trow"><span class="tname">' + def.name + '</span><span class="tcount">x' + num(state.troops[key] || 0) + "</span></div>" +
            '<div class="tstats"><span>Ataque ' + atk.toFixed(1) + "</span><span>Defensa " + dfn.toFixed(1) + "</span><span>Vida " + hp.toFixed(0) + "</span><span>" + def.time + "s /ud</span></div>" +
            '<div class="cost">' + costHtml + "</div>" +
            '<div class="buy">' +
              '<button class="btn" data-train="' + key + '" data-amount="1">+1</button>' +
              '<button class="btn" data-train="' + key + '" data-amount="5">+5</button>' +
              '<button class="btn" data-train="' + key + '" data-amount="25">+25</button>' +
            "</div>" +
          "</div>"
        );
      })
      .join("");

    return (
      '<div class="col" style="gap:1rem;">' +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Cuartel</h2><span class="hint">' +
            num(current) + " / " + num(cap) + " unidades · " +
            (state.trainQueue.length ? "entrenando" : "inactivo") + "</span></div>" +
          '<div class="panel-body"><div class="troop-list">' + cards + "</div></div>" +
        "</div>" +
        queuePanel() +
      "</div>"
    );
  }

  function campsView() {
    var power = armyPower(state);
    var cards = campList()
      .map(function (camp) {
        var odds = Math.round(clamp((power / camp.power) * 100, 1, 99));
        return (
          '<div class="camp">' +
            '<div class="crow"><span class="cname">' + camp.name + '</span><span class="tag ' + camp.tier + '">' +
              (camp.tier === "easy" ? "Fácil" : camp.tier === "mid" ? "Medio" : "Difícil") + "</span></div>" +
            '<div class="info-line"><span>Poder enemigo</span><b>' + num(camp.power) + "</b></div>" +
            '<div class="info-line"><span>Botín estimado</span><b>' + num(camp.loot) + "</b></div>" +
            '<div class="info-line"><span>Probabilidad</span><b>' + odds + "%</b></div>" +
            '<button class="btn" data-raid="' + camp.id + '">Atacar</button>' +
          "</div>"
        );
      })
      .join("");

    return (
      '<div class="panel">' +
        '<div class="panel-head"><h2>Incursiones</h2><span class="hint">Tu poder: ' + num(power) + "</span></div>" +
        '<div class="panel-body"><div class="building-grid">' + cards + "</div></div>" +
      "</div>"
    );
  }

  /* ---------------- mundo compartido ---------------- */

  var world = { players: [], events: [], online: 0, at: 0, error: "" };
  var worldTimer = null;
  var pvpTarget = null;
  var pvpResult = null;
  var pvpBusy = false;
  var mapFitted = false;

  function isCloud() {
    return !!(session && session.mode === "cloud" && session.token);
  }

  function syncWorld() {
    if (!isCloud()) return Promise.resolve();
    return api("/rest/v1/rpc/world_snapshot", { method: "POST", token: session.token, body: {} })
      .then(function (result) {
        if (!result.ok) {
          world.error =
            result.status === 404
              ? "El mundo compartido no está configurado. Ejecuta supabase/schema.sql."
              : "No se pudo cargar el mundo (" + result.status + ").";
          if (result.status === 404) setCloudState("missing");
          return;
        }
        var data = result.data || {};
        world.players = Array.isArray(data.players) ? data.players : [];
        world.events = Array.isArray(data.events) ? data.events : [];
        world.online = Number(data.online || 0);
        world.at = now();
        world.error = "";
        if (view === "mapa" && !mapEdit) renderGame();
      })
      .catch(function () {
        world.error = "Sin conexión con el mundo compartido.";
      });
  }

  function startWorldSync() {
    stopWorldSync();
    if (!isCloud()) return;
    syncWorld();
    worldTimer = setInterval(function () {
      if (!document.hidden) syncWorld();
    }, 10000);
  }

  function stopWorldSync() {
    if (worldTimer) clearInterval(worldTimer);
    worldTimer = null;
    world = { players: [], events: [], online: 0, at: 0, error: "" };
    pvpTarget = null;
    pvpResult = null;
  }

  function refreshOwnProfile() {
    if (!isCloud()) return Promise.resolve();
    return api(
      "/rest/v1/profiles?id=eq." + encodeURIComponent(session.userId) + "&select=race,state,username,x,y",
      { token: session.token }
    ).then(function (result) {
      if (!result.ok || !Array.isArray(result.data) || !result.data[0]) return;
      var row = result.data[0];
      state = migrateState(row.state);
      state.race = row.race || state.race;
      session.username = row.username || session.username;
      if (row.x != null) session.village = { x: Number(row.x), y: Number(row.y) };
      writeJSON(SESSION_KEY, session);
      refreshNumbers();
      updateTimers();
    });
  }

  function pvpAttack(targetId) {
    if (!isCloud() || pvpBusy) return;
    var target = null;
    world.players.forEach(function (player) {
      if (String(player.id) === String(targetId)) target = player;
    });
    if (!target) return;
    pvpBusy = true;
    pvpResult = null;
    renderGame();
    flushCloudSave().then(function () {
      return api("/rest/v1/rpc/attack_rival", {
        method: "POST",
        token: session.token,
        body: { target_id: target.id },
      });
    }).then(function (result) {
      pvpBusy = false;
      if (!result.ok) {
        var message = cloudErrorMessage(result);
        if (message.indexOf("shielded") !== -1) message = "Ese jugador sigue protegido por su escudo inicial.";
        else if (message.indexOf("cooldown") !== -1) message = "Ya atacaste a ese jugador hace menos de 5 minutos.";
        else if (message.indexOf("no troops") !== -1) message = "No tienes tropas para atacar.";
        pvpResult = { ok: false, text: message };
        renderGame();
        return;
      }
      var data = result.data || {};
      pvpResult = {
        ok: true,
        win: !!data.win,
        text:
          (data.win ? "Victoria" : "Derrota") +
          " contra " + (data.target || "el rival") +
          (data.win ? " · botín " + num(data.loot || 0) : "") +
          " · bajas " + num(data.attacker_losses || 0) + "/" + num(data.defender_losses || 0),
      };
      addLog(String(data.text || "Batalla contra " + (data.target || "un rival")), data.win ? "good" : "bad");
      return refreshOwnProfile().then(syncWorld).then(function () {
        renderGame();
      });
    }).catch(function () {
      pvpBusy = false;
      pvpResult = { ok: false, text: "No se pudo completar el ataque." };
      renderGame();
    });
  }

  /* ---------------- world map ---------------- */

  var MAP_IMAGE = "./assets/map.jpg";
  var MAP_W = 450;
  var MAP_H = 318;
  var MAP_DEFAULTS = [
    { x: 0.28, y: 0.3 },
    { x: 0.66, y: 0.24 },
    { x: 0.8, y: 0.5 },
    { x: 0.2, y: 0.6 },
    { x: 0.48, y: 0.78 },
    { x: 0.84, y: 0.8 },
    { x: 0.14, y: 0.4 },
  ];
  var MAP_VILLAGE = { x: 0.5, y: 0.46 };

  var mapTransform = { x: 0, y: 0, scale: 1 };
  var mapFitScale = 1;
  var mapEdit = false;
  var mapSelected = null;
  var mapWrapEl = null;
  var mapStageEl = null;

  function campPosition(index) {
    var saved = state.map && state.map.camps ? state.map.camps[index] : null;
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") return saved;
    return MAP_DEFAULTS[index] || { x: 0.5, y: 0.5 };
  }

  function villagePosition() {
    var saved = state.map ? state.map.village : null;
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") return saved;
    return MAP_VILLAGE;
  }

  function mapView() {
    var power = armyPower(state);
    var markers = campList()
      .map(function (camp) {
        var pos = campPosition(camp.id);
        var odds = Math.round(clamp((power / camp.power) * 100, 1, 99));
        return (
          '<button class="marker ' + camp.tier + '" data-map-camp="' + camp.id + '" ' +
            'title="' + escapeHtml(camp.name) + ' · Poder ' + num(camp.power) + " · " + odds + '%" ' +
            'style="left:' + (pos.x * 100).toFixed(2) + "%;top:" + (pos.y * 100).toFixed(2) + '%">' +
            '<span class="mlabel">' + escapeHtml(camp.name) + "</span>" +
            '<span class="pin"></span>' +
          "</button>"
        );
      })
      .join("");

    var players = [];
    if (isCloud()) {
      players = world.players.filter(function (player) {
        return String(player.id) !== String(session.userId);
      });
    }
    var playerMarkers = players
      .map(function (player) {
        if (typeof player.x !== "number" || typeof player.y !== "number") return "";
        var tag = (player.online ? "" : " offline") + (player.shield ? " shielded" : "");
        return (
          '<button class="marker player ' + player.race + tag + '" data-map-player="' + escapeHtml(player.id) + '" ' +
            'title="' + escapeHtml(player.name) + " · Poder " + num(player.power) + '" ' +
            'style="left:' + (player.x * 100).toFixed(2) + "%;top:" + (player.y * 100).toFixed(2) + '%">' +
            '<span class="mlabel">' + (player.shield ? "⛨ " : "") + escapeHtml(player.name) + "</span>" +
            '<span class="pin"></span>' +
          "</button>"
        );
      })
      .join("");

    var mePos = session && session.village ? session.village : villagePosition();
    var villageMarker =
      '<div class="marker me" data-map-village="1" style="left:' +
        (mePos.x * 100).toFixed(2) + "%;top:" + (mePos.y * 100).toFixed(2) + '%">' +
        '<span class="mlabel">Tu aldea</span><span class="pin"></span>' +
      "</div>";

    var statusText = isCloud()
      ? (world.error
          ? world.error
          : world.at
            ? world.online + " en línea · " + world.players.length + " aldeas en el mundo"
            : "Conectando con el mundo…")
      : "Modo local: solo tú en este mapa.";

    var target = pvpTarget;
    var targetCard = "";
    if (target) {
      targetCard =
        '<div class="pvp-card">' +
          '<div class="pvp-info"><b>' + escapeHtml(target.name || "Rival") + "</b>" +
            '<span>' + (RACES[target.race] ? RACES[target.race].name : target.race) +
            " · Poder " + num(target.power) + " · Victorias " + num(target.wins || 0) + "</span>" +
            (target.shield ? '<span class="pvp-warn">Escudo activo: no se puede atacar.</span>' : "") +
          "</div>" +
          '<div class="pvp-actions">' +
            '<button class="btn-primary" id="pvp-attack-btn"' +
              (target.shield || pvpBusy ? " disabled" : "") + ">" +
              (pvpBusy ? "Atacando…" : "Atacar") +
            "</button>" +
            '<button class="btn" id="pvp-cancel-btn">Cancelar</button>' +
          "</div>" +
        "</div>";
    }
    var resultCard = pvpResult
      ? '<div class="pvp-result ' + (pvpResult.ok && pvpResult.win ? "win" : "lose") + '">' +
          escapeHtml(pvpResult.text) + "</div>"
      : "";

    var feed = world.events.length
      ? '<div class="world-feed"><h3>Actividad del mundo</h3>' +
        world.events
          .map(function (event) {
            return '<div class="feed-row ' + (event.winner === "attacker" ? "win" : "lose") + '">' +
              escapeHtml(event.text) + "</div>";
          })
          .join("") +
        "</div>"
      : "";

    return (
      '<div class="panel map-panel">' +
        '<div class="panel-head"><h2>Mapa del mundo</h2>' +
          '<span class="hint">' + escapeHtml(statusText) + "</span></div>" +
        '<div class="map-tools">' +
          '<button class="btn" data-map-zoom="in" aria-label="Acercar">+</button>' +
          '<button class="btn" data-map-zoom="out" aria-label="Alejar">−</button>' +
          '<button class="btn" data-map-center="1">Centrar</button>' +
          '<button class="btn' + (mapEdit ? " active" : "") + '" id="map-edit-btn">' +
            (mapEdit ? "Terminar ajuste" : "Ajustar mapa") +
          "</button>" +
          '<span class="map-hint" id="map-hint">' +
            (mapEdit
              ? "Toca un campamento y luego el punto del mapa para recolocarlo."
              : "Toca una aldea enemiga para atacarla.") +
          "</span>" +
        "</div>" +
        targetCard +
        resultCard +
        '<div class="worldmap' + (mapEdit ? " editing" : "") + '" id="worldmap">' +
          '<div class="worldmap-stage" id="worldmap-stage">' +
            '<img src="' + MAP_IMAGE + '" alt="Mapa del mundo" draggable="false" />' +
            markers +
            playerMarkers +
            villageMarker +
          "</div>" +
        "</div>" +
        '<div class="map-legend">' +
          '<span><i class="dot easy"></i>Campamento fácil</span>' +
          '<span><i class="dot mid"></i>Medio</span>' +
          '<span><i class="dot hard"></i>Difícil</span>' +
          '<span><i class="dot player"></i>Jugador</span>' +
          '<span class="grow"></span><span class="hint">Tu poder: ' + num(power) + "</span>" +
        "</div>" +
        feed +
      "</div>"
    );
  }

  function clampMapPan() {
    if (!mapWrapEl) return;
    var w = mapWrapEl.clientWidth || 900;
    var h = mapWrapEl.clientHeight || 480;
    var sw = MAP_W * mapTransform.scale;
    var sh = MAP_H * mapTransform.scale;
    var minX = Math.min(0, w - sw);
    var minY = Math.min(0, h - sh);
    mapTransform.x = Math.max(minX, Math.min(0, mapTransform.x));
    mapTransform.y = Math.max(minY, Math.min(0, mapTransform.y));
  }

  function applyMap() {
    if (!mapStageEl || !mapStageEl.style || !mapStageEl.style.setProperty) return;
    mapStageEl.style.transform =
      "translate(" + mapTransform.x + "px," + mapTransform.y + "px) scale(" + mapTransform.scale + ")";
    mapStageEl.style.setProperty("--inv", String(1 / mapTransform.scale));
    if (mapStageEl.classList) {
      mapStageEl.classList.toggle("labels", mapTransform.scale > mapFitScale * 1.6);
    }
  }

  function fitMap() {
    if (!mapWrapEl) return;
    var w = mapWrapEl.clientWidth || 900;
    var h = mapWrapEl.clientHeight || 480;
    mapFitScale = Math.max(w / MAP_W, h / MAP_H);
    mapTransform.scale = mapFitScale;
    mapTransform.x = (w - MAP_W * mapTransform.scale) / 2;
    mapTransform.y = (h - MAP_H * mapTransform.scale) / 2;
    clampMapPan();
    applyMap();
  }

  function zoomMap(factor, clientX, clientY) {
    if (!mapWrapEl) return;
    var w = mapWrapEl.clientWidth || 900;
    var h = mapWrapEl.clientHeight || 480;
    var cx = typeof clientX === "number" ? clientX : w / 2;
    var cy = typeof clientY === "number" ? clientY : h / 2;
    var worldX = (cx - mapTransform.x) / mapTransform.scale;
    var worldY = (cy - mapTransform.y) / mapTransform.scale;
    var maxScale = mapFitScale * 5;
    var next = clamp(mapTransform.scale * factor, mapFitScale, maxScale);
    mapTransform.scale = next;
    mapTransform.x = cx - worldX * next;
    mapTransform.y = cy - worldY * next;
    clampMapPan();
    applyMap();
  }

  function mapImagePoint(clientX, clientY) {
    if (!mapWrapEl) return null;
    var rect = mapWrapEl.getBoundingClientRect
      ? mapWrapEl.getBoundingClientRect()
      : { left: 0, top: 0 };
    var x = (clientX - rect.left - mapTransform.x) / (MAP_W * mapTransform.scale);
    var y = (clientY - rect.top - mapTransform.y) / (MAP_H * mapTransform.scale);
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function saveMapPositions() {
    dirty = true;
    saveGame();
  }

  function selectMapTarget(target) {
    mapSelected = target;
    if (!mapWrapEl) return;
    Array.prototype.forEach.call(mapWrapEl.querySelectorAll("[data-map-camp]"), function (el) {
      if (el.classList) el.classList.toggle("selected", target === "camp:" + el.getAttribute("data-map-camp"));
    });
    var villageEl = mapWrapEl.querySelectorAll("[data-map-village]")[0];
    if (villageEl && villageEl.classList) villageEl.classList.toggle("selected", target === "village");
    var hint = document.getElementById("map-hint");
    if (hint) {
      hint.textContent = target
        ? "Ahora toca el punto del mapa donde quieres moverlo."
        : "Toca un marcador y luego el punto del mapa donde quieres colocarlo.";
    }
  }

  function initMap() {
    mapWrapEl = document.getElementById("worldmap");
    mapStageEl = document.getElementById("worldmap-stage");
    if (!mapWrapEl || !mapStageEl) return;

    var pointers = {};
    var panning = false;
    var moved = false;
    var start = { x: 0, y: 0, tx: 0, ty: 0 };
    var pinchStart = null;

    if (!mapFitted) {
      fitMap();
      mapFitted = true;
    } else {
      applyMap();
    }

    function pointerList() {
      return Object.keys(pointers).map(function (id) {
        return pointers[id];
      });
    }

    mapWrapEl.addEventListener("pointerdown", function (event) {
      if (event.target && event.target.closest && event.target.closest(".marker")) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      if (pointerList().length === 1) {
        panning = true;
        moved = false;
        start = { x: event.clientX, y: event.clientY, tx: mapTransform.x, ty: mapTransform.y };
        mapWrapEl.classList.add("dragging");
      } else if (pointerList().length === 2) {
        var pts = pointerList();
        pinchStart = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          scale: mapTransform.scale,
        };
      }
    });

    mapWrapEl.addEventListener("pointermove", function (event) {
      if (!pointers[event.pointerId]) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var pts = pointerList();
      if (pts.length === 2 && pinchStart) {
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStart.dist > 0) {
          var target = clamp(
            pinchStart.scale * (dist / pinchStart.dist),
            mapFitScale,
            mapFitScale * 5
          );
          var rect = mapWrapEl.getBoundingClientRect();
          var cx = (pts[0].x + pts[1].x) / 2 - rect.left;
          var cy = (pts[0].y + pts[1].y) / 2 - rect.top;
          zoomMap(target / mapTransform.scale, cx, cy);
        }
        moved = true;
        return;
      }
      if (!panning) return;
      var dx = event.clientX - start.x;
      var dy = event.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      mapTransform.x = start.tx + dx;
      mapTransform.y = start.ty + dy;
      clampMapPan();
      applyMap();
    });

    function endPointer(event) {
      if (!pointers[event.pointerId]) return;
      delete pointers[event.pointerId];
      if (pointerList().length < 2) pinchStart = null;
      if (pointerList().length === 0) {
        panning = false;
        mapWrapEl.classList.remove("dragging");
        if (mapEdit && !moved && mapSelected) {
          var point = mapImagePoint(event.clientX, event.clientY);
          if (point) {
            if (mapSelected === "village") state.map.village = point;
            else if (mapSelected.indexOf("camp:") === 0) {
              state.map.camps[mapSelected.slice(5)] = point;
            }
            saveMapPositions();
            renderGame();
            var hint = document.getElementById("map-hint");
            if (hint) hint.textContent = "Marcador movido. Elige otro o pulsa Terminar ajuste.";
          }
        }
      }
    }

    mapWrapEl.addEventListener("pointerup", endPointer);
    mapWrapEl.addEventListener("pointercancel", endPointer);
    mapWrapEl.addEventListener("pointerleave", endPointer);

    mapWrapEl.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
        var rect = mapWrapEl.getBoundingClientRect();
        var factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
        zoomMap(factor, event.clientX - rect.left, event.clientY - rect.top);
      },
      { passive: false }
    );

    Array.prototype.forEach.call(mapWrapEl.querySelectorAll("[data-map-camp]"), function (marker) {
      marker.addEventListener("click", function (event) {
        if (event.stopPropagation) event.stopPropagation();
        var id = marker.getAttribute("data-map-camp");
        if (mapEdit) {
          selectMapTarget("camp:" + id);
          return;
        }
        raid(Number(id));
      });
    });

    Array.prototype.forEach.call(mapWrapEl.querySelectorAll("[data-map-player]"), function (marker) {
      marker.addEventListener("click", function (event) {
        if (event.stopPropagation) event.stopPropagation();
        var id = marker.getAttribute("data-map-player");
        pvpResult = null;
        world.players.forEach(function (player) {
          if (String(player.id) === String(id)) pvpTarget = player;
        });
        renderGame();
      });
    });

    var attackBtn = document.getElementById("pvp-attack-btn");
    if (attackBtn) {
      attackBtn.addEventListener("click", function () {
        if (pvpTarget) pvpAttack(pvpTarget.id);
      });
    }
    var cancelBtn = document.getElementById("pvp-cancel-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        pvpTarget = null;
        pvpResult = null;
        renderGame();
      });
    }

    Array.prototype.forEach.call(app.querySelectorAll("[data-map-zoom]"), function (button) {
      button.addEventListener("click", function () {
        zoomMap(button.getAttribute("data-map-zoom") === "in" ? 1.3 : 1 / 1.3);
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-map-center]"), function (button) {
      button.addEventListener("click", function () {
        fitMap();
      });
    });
    var editBtn = document.getElementById("map-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", function () {
        mapEdit = !mapEdit;
        mapSelected = null;
        renderGame();
      });
    }
  }

  function raceView() {
    var race = RACES[state.race];    return (
      '<div class="panel">' +
        '<div class="panel-head"><h2>Tu raza: ' + race.name + '</h2><span class="hint">' + race.motto + "</span></div>" +
        '<div class="panel-body">' +
          '<p class="race-desc">' + race.desc + "</p>" +
          '<div class="balance-list">' +
            '<div class="balance-row"><span>Ataque de tropas</span><b>x' + race.atk.toFixed(2) + "</b></div>" +
            '<div class="balance-row"><span>Defensa de tropas</span><b>x' + race.def.toFixed(2) + "</b></div>" +
            '<div class="balance-row"><span>Vida de tropas</span><b>x' + race.hp.toFixed(2) + "</b></div>" +
            '<div class="balance-row"><span>Producción de recursos</span><b>x' + race.prod.toFixed(2) + "</b></div>" +
            '<div class="balance-row"><span>Recolección</span><b>x' + race.gather.toFixed(2) + "</b></div>" +
            '<div class="balance-row"><span>Almacenamiento</span><b>' + num(storageLimit(state.buildings)) + "</b></div>" +
          "</div>" +
          '<div class="mini-note">La raza se elige al crear la cuenta y no puede cambiarse. ' +
            "Si quieres probar otro estilo, crea una cuenta nueva.</div>" +
        "</div>" +
      "</div>"
    );
  }

  function renderGame() {
    if (!state) {
      renderAuth();
      return;
    }
    var race = RACES[state.race];
    var tabs = [
      ["aldea", "Aldea"],
      ["cuartel", "Cuartel"],
      ["mapa", "Mapa"],
      ["campamento", "Incursiones"],
      ["raza", "Raza"],
    ];
    var center;
    if (view === "cuartel") center = troopsView();
    else if (view === "mapa") center = mapView();
    else if (view === "campamento") center = campsView();
    else if (view === "raza") center = raceView();
    else center = buildingsView();

    var prod = totalProduction(state);

    app.innerHTML =
      '<div class="topbar">' +
        '<div class="brand">WoW Imperial <span class="dot">|</span> <span style="color:var(--' +
          race.id + ')">' + race.name + "</span></div>" +
        '<div class="topnav">' +
          tabs
            .map(function (tab) {
              return (
                '<button class="tab' + (view === tab[0] ? " active" : "") + '" data-view="' + tab[0] + '">' + tab[1] + "</button>"
              );
            })
            .join("") +
        "</div>" +
        '<div class="userbox">' +
          '<span class="mail">' + escapeHtml(account || "") + "</span>" +
          '<button class="btn" id="logout-btn" style="padding:0.35rem 0.7rem;font-size:0.78rem;">Salir</button>' +
        "</div>" +
      "</div>" +
      '<main class="layout">' +
        resourcePanel() +
        '<section class="col">' +
          '<div class="map">' +
            '<div>' +
              '<div class="map-title">' + race.name + "</div>" +
              '<div class="map-sub">Tu aldea imperial</div>' +
              '<div class="map-stats">' +
                "<div><b>" + num(state.buildings.ayuntamiento) + "</b>Ayuntamiento</div>" +
                "<div><b>" + num(armyCount(state)) + "</b>Unidades</div>" +
                "<div><b>" + num(armyPower(state)) + "</b>Poder</div>" +
                "<div><b>" + num(prod.oro + prod.madera + prod.comida + prod.piedra) + "</b>Recursos/min</div>" +
              "</div>" +
            "</div>" +
          "</div>" +
          center +
        "</section>" +
        villagers() +
      "</main>";

    bindGameEvents();
    refreshNumbers();
    updateTimers();
  }

  function refreshNumbers() {
    if (!state) return;
    var prod = totalProduction(state);
    var limit = storageLimit(state.buildings);
    var maxStored = 0;
    RESOURCES.forEach(function (res) {
      var el = document.getElementById("res-" + res);
      if (el) el.textContent = num(state.res[res]);
      maxStored = Math.max(maxStored, state.res[res]);
    });
    var storageLine = document.getElementById("storage-line");
    if (storageLine) storageLine.textContent = num(Math.floor(maxStored)) + " / " + num(limit);
    var powerEl = document.getElementById("army-power");
    if (powerEl) powerEl.textContent = num(armyPower(state));
  }

  function bindGameEvents() {
    Array.prototype.forEach.call(app.querySelectorAll("[data-view]"), function (button) {
      button.addEventListener("click", function () {
        view = button.getAttribute("data-view");
        if (view === "mapa" && isCloud()) syncWorld();
        renderGame();
      });
    });
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);
    var gatherBtn = document.getElementById("gather-btn");
    if (gatherBtn) gatherBtn.addEventListener("click", gather);
    var dailyBtn = document.getElementById("daily-btn");
    if (dailyBtn) dailyBtn.addEventListener("click", claimDaily);
    Array.prototype.forEach.call(app.querySelectorAll("[data-upgrade]"), function (button) {
      button.addEventListener("click", function () {
        upgradeBuilding(button.getAttribute("data-upgrade"));
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-train]"), function (button) {
      button.addEventListener("click", function () {
        trainTroop(button.getAttribute("data-train"), Number(button.getAttribute("data-amount")));
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-raid]"), function (button) {
      button.addEventListener("click", function () {
        raid(Number(button.getAttribute("data-raid")));
      });
    });
    initMap();
  }

  /* ---------------- boot ---------------- */

  function boot() {
    var savedSession = readJSON(SESSION_KEY, null);
    if (savedSession && savedSession.mode === "cloud" && savedSession.token) {
      resumeCloudSession(savedSession).then(function (resumed) {
        if (!resumed) {
          localStorage.removeItem(SESSION_KEY);
          renderAuth();
        }
      });
      return;
    }
    if (savedSession && savedSession.email) {
      var accounts = getAccounts();
      if (accounts[savedSession.email]) {
        startSession(savedSession.email);
        return;
      }
    }
    renderAuth();
    checkCloud().then(function () {
      if (!session) renderAuth();
    });
  }

  function resumeCloudSession(saved) {
    function loadWithToken(token) {
      return cloudUser(token).then(function (user) {
        if (user.status === 401) return null;
        if (!user.ok) throw new Error("cloud");
        session = {
          mode: "cloud",
          email: saved.email,
          token: token,
          refreshToken: saved.refreshToken,
          userId: (user.data && user.data.id) || saved.userId,
          username: saved.username || saved.email.split("@")[0],
          expiresAt: saved.expiresAt,
        };
        account = saved.email;
        writeJSON(SESSION_KEY, session);
        return cloudLoadProfile(session.token, session.userId).then(function (profile) {
          if (profile.status === 404) {
            setCloudState("missing");
            authError =
              "Faltan las tablas en Supabase. Ejecuta supabase/schema.sql en el SQL Editor del dashboard.";
            pendingRace = null;
            session = null;
            account = null;
            return false;
          }
          var row = Array.isArray(profile.data) ? profile.data[0] : null;
          if (!row) {
            pendingRace = { mode: "cloud", email: saved.email, pass: "", token: session.token };
            renderRaceSelection();
            return true;
          }
          state = migrateState(row.state && row.state.race ? row.state : newState(row.race));
          state.race = row.race || state.race;
          session.username = row.username || session.username;
          if (row.x != null) session.village = { x: Number(row.x), y: Number(row.y) };
          writeJSON(SESSION_KEY, session);
          var offline = applyOffline(state);
          if (offline.minutes >= 1) {
            addLog(
              "Mientras estabas fuera (" + Math.round(offline.minutes) + " min) tu aldea produjo recursos.",
              ""
            );
          }
          mirrorLocal(saved.email, "", state.race, state);
          enterGame();
          return true;
        });
      });
    }

    return loadWithToken(saved.token).then(function (result) {
      if (result !== null) return result;
      if (!saved.refreshToken) return false;
      return cloudRefresh(saved.refreshToken).then(function (refresh) {
        if (!refresh.ok || !refresh.data || !refresh.data.access_token) return false;
        saved.token = refresh.data.access_token;
        saved.refreshToken = refresh.data.refresh_token || saved.refreshToken;
        return loadWithToken(saved.token).then(function (next) {
          return next === null ? false : next;
        });
      });
    }).catch(function () {
      return false;
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveGame();
  });
  window.addEventListener("pagehide", saveGame);
  window.addEventListener("beforeunload", saveGame);

  boot();
})();
