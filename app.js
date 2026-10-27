/* WoW Imperial - juego de estrategia por razas */
(function () {
  "use strict";

  var ACCOUNTS_KEY = "wowimperial:accounts";
  var SESSION_KEY = "wowimperial:session";
  var SETTINGS_KEY = "wowimperial:settings";
  var MAX_OFFLINE_MINUTES = 8 * 60;
  var GATHER_COOLDOWN_MS = 30 * 1000;
  var SAVE_EVERY_MS = 8000;

  var SUPABASE_URL = "https://dxsxdswyhdjzykuscqko.supabase.co";
  var SUPABASE_KEY = "sb_publishable_rLhRC2iT7Qv59B7n31hZfg_EbI-q8pd";

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

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function loginToEmail(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (raw === "admin") return "admin@reinos.local";
    var phone = normalizePhone(raw);
    return phone ? phone + "@reinos.local" : "";
  }

  function phoneFromEmail(value) {
    var match = /^(\d{6,15})@reinos\.local$/.exec(String(value || ""));
    return match ? match[1] : "";
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

  function resourceSpeed() {
    var value = Number(state && state.speed);
    if (!isFinite(value) || value <= 0) value = Number(world && world.speed);
    return isFinite(value) && value > 0 ? value : 1;
  }

  function productionPerMinute(s, key) {
    var def = BUILDINGS[key];
    if (!def.res) return 0;
    var level = s.buildings[key] || 0;
    var race = RACES[s.race];
    return def.rate * level * race.prod * prodBonus(s.buildings.ayuntamiento) * resourceSpeed();
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
    scheduleCloudSave();
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
      "/rest/v1/profiles?id=eq." + encodeURIComponent(userId) + "&select=race,state,username,x,y,region_id,is_admin",
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
          email: (session && session.email) || null,
          phone: (session && session.phone) || phoneFromEmail((session && session.email) || "") || null,
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

  function startCloudSession(auth, email, password, phone, name) {
    maintReset();
    session = {
      mode: "cloud",
      email: email,
      phone: phone || phoneFromEmail(email),
      token: auth.access_token,
      refreshToken: auth.refresh_token,
      userId: auth.user.id,
      username: name || (email === "admin@reinos.local" ? "admin" : "") || phone ||
        (auth.user.user_metadata && auth.user.user_metadata.username) || email.split("@")[0],
      expiresAt: now() + (auth.expires_in || 3600) * 1000,
    };
    account = session.phone || (email === "admin@reinos.local" ? "admin" : email);
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
        pendingRace = {
          mode: "cloud", email: email, phone: session.phone,
          pass: password || "", token: session.token,
        };
        renderRaceSelection();
        return;
      }
      state = migrateState(row.state && row.state.race ? row.state : newState(row.race));
      state.race = row.race || state.race;
      session.username = row.username || session.username;
      session.isAdmin = !!row.is_admin;
      session.region = row.region_id;
      if (row.x != null) session.village = { x: Number(row.x), y: Number(row.y) };
      writeJSON(SESSION_KEY, session);
      if (row.x == null) {
        session = null;
        account = null;
        localStorage.removeItem(SESSION_KEY);
        authError = "No hay plazas libres: todas las regiones abiertas están completas. Pide al administrador que abra otra región.";
        renderAuth();
        return;
      }
      var offline = applyOffline(state);
      if (offline.minutes >= 1) {
        addLog(
          "Mientras estabas fuera (" + Math.round(offline.minutes) + " min) tu aldea produjo recursos.",
          ""
        );
      }
      enterGame();
    });
  }

  /* ---------------- auth screens ---------------- */

  function translateCloudError(result) {
    var message = cloudErrorMessage(result);
    var lower = String(message).toLowerCase();
    if (lower.indexOf("invalid login credentials") !== -1) return "Teléfono o contraseña incorrectos.";
    if (lower.indexOf("email not confirmed") !== -1)
      return "La cuenta aún no está confirmada. Pide al administrador que active las cuentas (o desactiva la confirmación por correo en Supabase).";
    if (lower.indexOf("user already registered") !== -1)
      return "Ya existe una cuenta con ese teléfono. Inicia sesión.";
    if (lower.indexOf("password should be") !== -1) return "La contraseña es demasiado débil (mínimo 6 caracteres).";
    if (lower.indexOf("rate limit") !== -1 || lower.indexOf("too many") !== -1)
      return "Demasiados intentos. Espera un minuto y vuelve a probar.";
    if (lower.indexOf("unable to validate email") !== -1 || lower.indexOf("invalid email") !== -1)
      return "Ese teléfono no es válido. Usa solo números (7 a 15 dígitos).";
    return message;
  }

  function renderAuth() {
    var isLogin = authMode === "login";
    var networkNote = "";
    if (cloudState === "missing") {
      networkNote =
        '<div class="msg error">Falta el esquema en Supabase. Abre el SQL Editor del dashboard, ejecuta el archivo ' +
        "<b>supabase/schema.sql</b> y recarga esta página.</div>";
    } else if (cloudState === "offline") {
      networkNote = '<div class="msg error">No se pudo conectar con Supabase. Revisa tu conexión.</div>';
    } else {
      networkNote = '<div class="msg ok">Juego en línea. Tu partida se guarda en la nube.</div>';
    }
    app.innerHTML =
      '<div class="auth-screen">' +
        '<div class="auth-card">' +
          '<div class="auth-head">' +
            "<h1>WoW Imperial</h1>" +
            "<p>Forja tu imperio. Elige tu raza y domina.</p>" +
          "</div>" +
          '<form class="auth-form" id="auth-form" novalidate>' +
            networkNote +
            (authError ? '<div class="msg error">' + escapeHtml(authError) + "</div>" : "") +
            (authInfo ? '<div class="msg ok">' + escapeHtml(authInfo) + "</div>" : "") +
            (isLogin
              ? ""
              : '<label class="field">Nombre de tu señor' +
                  '<input type="text" name="name" autocomplete="nickname" maxlength="24" placeholder="Ej: Kael" required />' +
                "</label>") +
            '<label class="field">Teléfono' +
              '<input type="tel" name="phone" inputmode="numeric" autocomplete="tel" placeholder="Solo números" required />' +
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

    document.getElementById("toggle-mode").addEventListener("click", function () {
      authMode = isLogin ? "register" : "login";
      authError = "";
      authInfo = "";
      renderAuth();
    });

    document.getElementById("auth-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var typed = String(form.elements.phone.value || "").trim();
      var password = String(form.elements.password.value || "");
      var name = form.elements.name ? String(form.elements.name.value || "").trim() : "";
      authError = "";
      authInfo = "";

      if (!isLogin && !/^[A-Za-zÀ-ÿ0-9 _.-]{3,24}$/.test(name)) {
        authError = "Escribe un nombre de 3 a 24 letras.";
        renderAuth();
        return;
      }

      var isAdminLogin = isLogin && typed.toLowerCase() === "admin";
      var phone = normalizePhone(typed);
      if (!isAdminLogin && !/^\d{7,15}$/.test(phone)) {
        authError = "Introduce tu número de teléfono (solo números, 7 a 15 dígitos).";
        renderAuth();
        return;
      }
      if (password.length < 6) {
        authError = "La contraseña debe tener al menos 6 caracteres.";
        renderAuth();
        return;
      }

      cloudAuthFlow(loginToEmail(typed), password, isLogin, isAdminLogin ? "" : phone, name);
    });
  }

  var authBusy = false;

  function cloudAuthFlow(email, password, isLogin, phone, name) {
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
        startCloudSession(data, email, password, phone, name).catch(function () {
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
          startCloudSession(signIn.data, email, password, phone, name).catch(function () {
            authBusy = false;
            authError = "No se pudo cargar tu perfil. Inténtalo de nuevo.";
            renderAuth();
          });
          return;
        }
        done();
        authMode = "login";
        authInfo =
          "Cuenta creada, pero Supabase pide confirmación. Pide al administrador que la active.";
        renderAuth();
      });
    }

    if (isLogin) {
      cloudSignIn(email, password).then(function (result) {
        if (!result.ok) return fail(result);
        done();
        startCloudSession(result.data, email, password, phone, name).catch(function () {
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

  function logout() {
    maintReset();
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
              session.phone = cloudPending.phone || session.phone;
              session.username = session.username || cloudPending.phone || cloudPending.email.split("@")[0];
              return cloudLoadProfile(session.token, session.userId).then(function (profile) {
                var row = profile.ok && Array.isArray(profile.data) ? profile.data[0] : null;
                if (!row || row.x == null) {
                  session = null;
                  account = null;
                  localStorage.removeItem(SESSION_KEY);
                  authError = "No hay plazas libres en las regiones abiertas. Pide al administrador que abra otra región.";
                  renderAuth();
                  return;
                }
                session.village = { x: Number(row.x), y: Number(row.y) };
                session.isAdmin = !!row.is_admin;
                session.region = row.region_id;
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
            '<div class="mini-note">Velocidad de recursos del reino: <b>x' + resourceSpeed().toFixed(2) +
              "</b>. Recolectar da <b>" + Math.round(30 * race.gather) +
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
    return (
      '<aside class="col">' +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Ejército</h2></div>' +
          '<div class="panel-body">' +
            '<div class="info-line"><span>Poder de combate</span><b id="army-power">' + num(power) + "</b></div>" +
            '<div class="info-line"><span>Unidades</span><b>' + num(armyCount(state)) + " / " + num(troopCap(state.buildings.cuartel)) + "</b></div>" +
            '<div class="info-line"><span>Victorias PvP</span><b>' + num(world.me ? world.me.wins || 0 : 0) + "</b></div>" +
            '<div class="mini-note">La ' + RACES[state.race].name + " aplica x" + RACES[state.race].atk.toFixed(2) +
              " a ataque, x" + RACES[state.race].def.toFixed(2) + " a defensa y x" + RACES[state.race].hp.toFixed(2) + " a vida.</div>" +
          "</div>" +
        "</div>" +
        '<div class="panel">' +
          '<div class="panel-head"><h2>Rivales</h2><span class="hint">' + num(world.players.length) + " en el mundo</span></div>" +
          '<div class="panel-body">' +
            (world.players.length
              ? world.players
                  .slice(0, 4)
                  .map(function (player) {
                    var dif = armyPower(state) / Math.max(1, player.power);
                    return '<div class="info-line"><span>' + escapeHtml(player.name) + "</span><b>" +
                      (dif >= 1.1 ? "Ventaja" : dif >= 0.85 ? "Parejo" : "Peligroso") + " · " + num(player.power) + "</b></div>";
                  })
                  .join("")
              : '<div class="mini-note">Conecta con la nube para ver a otros jugadores y atacarlos desde el mapa.</div>') +
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

  /* ---------------- mundo compartido ---------------- */

  var world = {
    players: [], regions: [], events: [], phones: [], npcs: [], online: 0,
    settings: {}, maintenance: {}, me: {}, at: 0, error: "",
  };
  var worldTimer = null;
  var pvpTarget = null;
  var npcTarget = null;
  var pvpResult = null;
  var pvpBusy = false;
  var mapFitted = false;
  var adminMode = false;
  var itemDrag = null;
  var mapWrapEl = null;
  var mapStageEl = null;
  var mapTransform = { x: 0, y: 0, scale: 1 };
  var mapFitScale = 1;
  var openRegionId = null;
  var mapFocusedRegion = null;
  var regionHintId = null;
  var regionPressTimer = null;
  var regionLongPressed = false;
  var maintError = "";
  var maintBusy = false;
  var maintGateState = false;

  function isCloud() {
    return !!(session && session.mode === "cloud" && session.token);
  }

  function syncWorld() {
    if (!isCloud()) return Promise.resolve();
    return api("/rest/v1/rpc/world_state", { method: "POST", token: session.token, body: {} })
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
        world.players = (Array.isArray(data.players) ? data.players : []).filter(function (player) {
          return !player.admin;
        });
        world.regions = Array.isArray(data.regions) ? data.regions : [];
        world.events = Array.isArray(data.events) ? data.events : [];
        world.phones = Array.isArray(data.phones) ? data.phones : [];
        world.npcs = Array.isArray(data.npcs) ? data.npcs : [];
        world.online = Number(data.online || 0);
        world.speed = Number(data.speed || 1);
        if (state) state.speed = world.speed;
        world.settings = data.settings || {};
        world.maintenance = data.maintenance || {};
        world.me = data.me || {};
        world.at = now();
        world.error = "";
        var wasAdmin = !!(session && session.isAdmin);
        if (session) {
          session.isAdmin = !!world.me.admin;
          session.region = world.me.region;
          writeJSON(SESSION_KEY, session);
        }
        if (session && !!session.isAdmin !== wasAdmin) renderGame();
        var gate = maintenanceLocked();
        if (gate !== maintGateState) {
          maintGateState = gate;
          if (session) renderGame();
        }
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
    world = { players: [], regions: [], events: [], phones: [], npcs: [], online: 0, settings: {}, maintenance: {}, me: {}, at: 0, error: "" };
    pvpTarget = null;
    npcTarget = null;
    pvpResult = null;
    adminMode = false;
    openRegionId = null;
    mapFocusedRegion = null;
    regionHintId = null;
  }

  function refreshOwnProfile() {
    if (!isCloud()) return Promise.resolve();
    return api(
      "/rest/v1/profiles?id=eq." + encodeURIComponent(session.userId) +
        "&select=race,state,username,x,y,region_id,is_admin",
      { token: session.token }
    ).then(function (result) {
      if (!result.ok || !Array.isArray(result.data) || !result.data[0]) return;
      var row = result.data[0];
      state = migrateState(row.state);
      state.race = row.race || state.race;
      session.username = row.username || session.username;
      session.isAdmin = !!row.is_admin;
      session.region = row.region_id;
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
        if (message.indexOf("locked") !== -1) message = "Esa región está bloqueada por el administrador.";
        else if (message.indexOf("shielded") !== -1) message = "Ese jugador sigue protegido por su escudo inicial.";
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
          (data.win ? "Victoria" : "Derrota") + " contra " + (data.target || "el rival") +
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

  function npcAttack(npcId) {
    if (!isCloud() || pvpBusy) return;
    var npc = null;
    world.npcs.forEach(function (item) {
      if (String(item.id) === String(npcId)) npc = item;
    });
    if (!npc) return;
    pvpBusy = true;
    pvpResult = null;
    renderGame();
    flushCloudSave().then(function () {
      return api("/rest/v1/rpc/attack_npc", {
        method: "POST",
        token: session.token,
        body: { npc_id: npc.id },
      });
    }).then(function (result) {
      pvpBusy = false;
      if (!result.ok) {
        var message = cloudErrorMessage(result);
        if (message.indexOf("locked") !== -1) message = "Esa región está bloqueada por el administrador.";
        else if (message.indexOf("cooldown") !== -1) message = "Ya saqueaste esa aldea hace menos de 5 minutos.";
        else if (message.indexOf("no troops") !== -1) message = "No tienes tropas para atacar.";
        else if (message.indexOf("not found") !== -1) message = "Esa aldea NPC ya no existe.";
        pvpResult = { ok: false, text: message };
        renderGame();
        return;
      }
      var data = result.data || {};
      pvpResult = {
        ok: true,
        win: !!data.win,
        text:
          (data.win ? "Victoria" : "Derrota") + " contra " + (data.target || "la aldea NPC") +
          (data.win ? " · botín " + num(data.loot || 0) : "") +
          " · bajas " + num(data.attacker_losses || 0),
      };
      addLog(String(data.text || "Incursión contra " + (data.target || "una aldea NPC")), data.win ? "good" : "bad");
      return refreshOwnProfile().then(syncWorld).then(function () {
        renderGame();
      });
    }).catch(function () {
      pvpBusy = false;
      pvpResult = { ok: false, text: "No se pudo completar la incursión." };
      renderGame();
    });
  }

  /* ---------------- mapa por regiones ---------------- */

  var MAP_W = 3182;
  var MAP_H = 2249;

  function regionById(id) {
    var found = null;
    world.regions.forEach(function (region) {
      if (String(region.id) === String(id)) found = region;
    });
    return found;
  }

  function npcTier(npc) {
    var power = Number(npc && npc.power) || 0;
    return power < 80 ? "easy" : power < 120 ? "mid" : "hard";
  }

  function npcTierName(tier) {
    return tier === "easy" ? "Fácil" : tier === "mid" ? "Media" : "Difícil";
  }

  function npcLoot(npc) {
    return Math.round((Number(npc && npc.power) || 0) * 1.5 + 150);
  }

  function pointInRegion(region, pos) {
    if (!region || !pos || !region.bbox) return false;
    var b = region.bbox;
    var x = Number(pos.x);
    var y = Number(pos.y);
    return (
      x >= Number(b.x0) && x <= Number(b.x1) &&
      y >= Number(b.y0) && y <= Number(b.y1)
    );
  }

  function regionAt(x, y) {
    var found = null;
    world.regions.forEach(function (region) {
      if (found) return;
      var bb = region.bbox || {};
      if (x >= bb.x0 && x <= bb.x1 && y >= bb.y0 && y <= bb.y1) found = region;
    });
    return found;
  }

  function polygonPoints(region) {
    return (region.points || [])
      .map(function (pt) {
        return (Number(pt[0]) * 100).toFixed(3) + "," + (Number(pt[1]) * 100).toFixed(3);
      })
      .join(" ");
  }

  function polygonCentroid(region) {
    var pts = region.points || [];
    if (!pts.length) return { x: 0.5, y: 0.5 };
    var x = 0;
    var y = 0;
    pts.forEach(function (pt) {
      x += Number(pt[0]);
      y += Number(pt[1]);
    });
    return { x: x / pts.length, y: y / pts.length };
  }

  function roadsSvg(points) {
    if (!points || points.length < 2) return "";
    var inTree = [0];
    var used = { 0: true };
    var edges = [];

    while (inTree.length < points.length) {
      var best = null;
      for (var i = 0; i < inTree.length; i++) {
        var a = points[inTree[i]];
        for (var j = 0; j < points.length; j++) {
          if (used[j]) continue;
          var b = points[j];
          var dx = (Number(a.x) - Number(b.x)) * MAP_W;
          var dy = (Number(a.y) - Number(b.y)) * MAP_H;
          var dist = dx * dx + dy * dy;
          if (!best || dist < best.dist) best = { from: inTree[i], to: j, dist: dist };
        }
      }
      if (!best) break;
      edges.push(best);
      used[best.to] = true;
      inTree.push(best.to);
    }

    return (
      '<svg class="road-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
        edges
          .map(function (edge) {
            var a = points[edge.from];
            var b = points[edge.to];
            return (
              '<line class="road" x1="' + (a.x * 100).toFixed(3) + '" y1="' + (a.y * 100).toFixed(3) +
                '" x2="' + (b.x * 100).toFixed(3) + '" y2="' + (b.y * 100).toFixed(3) + '"></line>'
            );
          })
          .join("") +
      "</svg>"
    );
  }

  function mapImageUrl() {
    return (world.settings && world.settings.map) || "./assets/map.jpg";
  }

  function adminAction(fn, body) {
    if (!isCloud() || !session.isAdmin) return Promise.resolve();
    return api("/rest/v1/rpc/" + fn, { method: "POST", token: session.token, body: body })
      .then(function (result) {
        if (!result.ok) {
          var adminError = String(cloudErrorMessage(result));
          if (adminError.indexOf("region locked") !== -1) {
            adminError = "Esa región está bloqueada: desbloquéala antes de mover aldeas allí.";
          } else if (adminError.indexOf("password required") !== -1) {
            adminError = "Escribe una contraseña para activar el mantenimiento.";
          }
          pvpResult = { ok: false, text: adminError };
          renderGame();
          return;
        }
        pvpResult = {
        ok: true,
        win: true,
        text:
          fn === "admin_set_password"
            ? "Contraseña del jugador actualizada."
            : fn === "admin_set_maintenance"
              ? "Portal de mantenimiento actualizado."
              : fn === "admin_set_resource_speed"
                ? "Velocidad de recursos actualizada."
                : "Mapa actualizado.",
      };
        return syncWorld().then(function () {
          renderGame();
        });
      });
  }

  function adminSpeedHtml() {
    return (
      '<div class="admin-maint"><b>Velocidad de recursos</b>' +
        '<div class="admin-maint-state">Actual: x' + resourceSpeed().toFixed(2) + '</div>' +
        '<div class="admin-speed-row">' +
          '<input id="speed-input" type="number" min="0.1" max="10" step="0.1" value="' +
            resourceSpeed().toFixed(1) + '" />' +
          '<button class="btn" id="speed-save">Guardar velocidad</button>' +
        '</div>' +
        '<div class="admin-maint-error" id="speed-error"></div>' +
      "</div>"
    );
  }

  function adminMaintHtml() {
    return (
      '<div class="admin-maint"><b>Portal de mantenimiento</b>' +
        '<div class="admin-maint-state">' +
          (world.maintenance && world.maintenance.active ? "Activo ahora" : "Inactivo") +
        "</div>" +
        '<textarea id="maint-message-input" rows="2" placeholder="Mensaje para los jugadores">' +
          escapeHtml((world.maintenance && world.maintenance.message) || "") +
        "</textarea>" +
        '<input id="maint-password-input" type="password" autocomplete="new-password" ' +
          'placeholder="Contraseña de acceso (vacío = sin contraseña)" />' +
        '<button class="btn" id="maint-toggle">' +
          (world.maintenance && world.maintenance.active ? "Desactivar mantenimiento" : "Activar mantenimiento") +
        "</button>" +
        '<div class="admin-maint-error" id="maint-error"></div>' +
      "</div>"
    );
  }

  function adminPlayersHtml() {
    return (
      '<div class="admin-phones"><b>Jugadores registrados (' + world.phones.length + ")</b>" +
        (world.phones.length
          ? world.phones
              .map(function (row) {
                return (
                  '<div class="admin-row"><span><b class="pname">' + escapeHtml(String(row.name)) +
                    '</b> · ' + escapeHtml(String(row.phone)) +
                    (row.region != null ? " · R" + escapeHtml(String(row.region)) : "") +
                  "</span>" +
                  (row.id
                    ? '<button class="btn small" data-set-pass="' + escapeHtml(String(row.id)) +
                      '" data-pass-name="' + escapeHtml(String(row.name)) + '">Clave</button>'
                    : "") +
                  "<b>" + num(row.wins || 0) + " V</b></div>"
                );
              })
              .join("")
          : '<div class="admin-hint">Aún no hay jugadores registrados.</div>') +
        '<div class="admin-hint">Las contraseñas no se pueden mostrar: Supabase las guarda cifradas. ' +
          "Si un jugador la olvida, restablécala desde aquí o desde el panel de Supabase (Authentication → Users).</div>" +
      "</div>"
    );
  }

  function adminView() {
    return (
      '<div class="panel admin-page">' +
        '<div class="panel-head"><h2>Administrar WoW</h2>' +
          '<span class="hint">Opciones generales del reino</span>' +
        "</div>" +
        '<div class="panel-body">' +
          adminSpeedHtml() +
          adminMaintHtml() +
          adminPlayersHtml() +
        "</div>" +
      "</div>"
    );
  }

  function mapView() {
    var power = armyPower(state);
    var open = openRegionId ? regionById(openRegionId) : null;
    if (openRegionId && !open) openRegionId = null;

    var openCount = world.regions.filter(function (region) {
      return !region.locked;
    }).length;

    var statusText = isCloud()
      ? (world.error
          ? world.error
          : world.at
            ? world.online + " en línea · " + world.players.length + " aldeas · " +
              openCount + "/" + world.regions.length + " regiones abiertas"
            : "Conectando con el mundo…")
      : "Conecta con Supabase para ver el mundo compartido";

    var mePos = session && session.village ? session.village : { x: 0.5, y: 0.5 };
    var myName = (session && session.username) || "Tu aldea";
    var meMarker = !(session && session.village) || session.isAdmin ? "" :
      '<div class="marker me" data-map-village="1" data-mx="' + mePos.x + '" data-my="' + mePos.y + '" ' +
        'title="Tu aldea" ' +
        'style="left:' + (mePos.x * 100).toFixed(2) + "%;top:" + (mePos.y * 100).toFixed(2) + '%">' +
        '<span class="mlabel">' + escapeHtml(myName) + '</span><span class="pin"></span>' +
      "</div>";

    var layer = "";
    if (!world.regions.length) {
      layer =
        '<div class="map-empty-note">' +
          (world.error ? escapeHtml(world.error) : "Cargando regiones del mundo…") +
        "</div>" + meMarker;
    } else if (!open) {
      layer = world.regions
        .map(function (region) {
          var c = polygonCentroid(region);
          var full = Number(region.villages) >= Number(region.capacity);
          return (
            '<button class="region-point' + (region.locked ? " locked" : "") + (full ? " full" : "") +
              (regionHintId === region.id || adminMode ? " hint" : "") + '" ' +
              'data-region-point="' + region.id + '" data-region-name="' + escapeHtml(region.name) + '" ' +
              'data-mx="' + c.x + '" data-my="' + c.y + '" ' +
              'style="left:' + (c.x * 100).toFixed(2) + "%;top:" + (c.y * 100).toFixed(2) + '%">' +
              '<span class="rp-dot">' + (region.locked ? "&#128274;" : num(region.villages)) + "</span>" +
              '<span class="rp-name">' + escapeHtml(region.name) + "</span>" +
              '<span class="rp-count">' + (region.locked ? "Bloqueada" : num(region.villages) + "/" + num(region.capacity)) + "</span>" +
            "</button>"
          );
        })
        .join("") + meMarker;
    } else {
      var players = world.players.filter(function (player) {
        if (player.admin) return false;
        if (String(player.id) === String(session.userId)) return false;
        return String(player.region) === String(open.id) &&
          typeof player.x === "number" && typeof player.y === "number";
      });
      var npcs = world.npcs.filter(function (npc) {
        return String(npc.region) === String(open.id) &&
          typeof npc.x === "number" && typeof npc.y === "number";
      });
      var points = players.map(function (player) {
        return { x: Number(player.x), y: Number(player.y) };
      });
      npcs.forEach(function (npc) {
        points.push({ x: Number(npc.x), y: Number(npc.y) });
      });
      var mineHere =
        !!meMarker &&
        (String(session.region) === String(open.id) || pointInRegion(open, mePos));
      if (mineHere) points.push({ x: Number(mePos.x), y: Number(mePos.y) });

      layer = roadsSvg(points) + npcs
        .map(function (npc) {
          return (
            '<button class="marker npc ' + npcTier(npc) + '" data-map-npc="' + escapeHtml(npc.id) + '" ' +
              'data-mx="' + npc.x + '" data-my="' + npc.y + '" ' +
              'title="' + escapeHtml(npc.name) + " · Poder " + num(npc.power) + '" ' +
              'style="left:' + (npc.x * 100).toFixed(2) + "%;top:" + (npc.y * 100).toFixed(2) + '%">' +
              '<span class="mlabel">' + escapeHtml(npc.name) + "</span>" +
              '<span class="pin"></span>' +
            "</button>"
          );
        })
        .join("") + players
        .map(function (player) {
          var tag = (player.online ? "" : " offline") + (player.shield ? " shielded" : "");
          return (
            '<button class="marker player ' + player.race + tag + '" data-map-player="' + escapeHtml(player.id) + '" ' +
              'data-mx="' + player.x + '" data-my="' + player.y + '" ' +
              'title="' + escapeHtml(player.name) + " · Poder " + num(player.power) + '" ' +
              'style="left:' + (player.x * 100).toFixed(2) + "%;top:" + (player.y * 100).toFixed(2) + '%">' +
              '<span class="mlabel">' + (player.shield ? "&#9930; " : "") + escapeHtml(player.name) + "</span>" +
              '<span class="pin"></span>' +
            "</button>"
          );
        })
        .join("") + (mineHere ? meMarker : "");
    }

    var adminPanel = "";
    if (session && session.isAdmin) {
      adminPanel =
        '<div class="admin-panel">' +
          '<div class="admin-head"><b>Administración del mapa</b>' +
            '<button class="btn' + (adminMode ? " active" : "") + '" id="admin-mode-btn">' +
              (adminMode ? "Salir del modo mapa" : "Mover regiones/aldeas") +
            "</button>" +
            '<button class="btn" id="admin-image-btn">Cambiar imagen</button>' +
            '<button class="btn" id="admin-settings-btn">Administrar WoW</button>' +
          "</div>" +
          '<div class="admin-regions">' +
            world.regions
              .map(function (region) {
                return (
                  '<div class="admin-row">' +
                    "<span>" + escapeHtml(region.name) + " · " + num(region.villages) + "/" + num(region.capacity) + "</span>" +
                    '<button class="btn small" data-lock-region="' + region.id + '" data-lock="' + (region.locked ? "0" : "1") + '">' +
                      (region.locked ? "Desbloquear" : "Bloquear") +
                    "</button>" +
                  "</div>"
                );
              })
              .join("") +
          "</div>" +
          (adminMode ? '<div class="admin-hint">Arrastra un punto de región en el mundo o una aldea dentro de su región.</div>' : "") +
        "</div>";
    }

    var npcCard = "";
    if (npcTarget) {
      var npcTierValue = npcTier(npcTarget);
      var npcLootValue = npcLoot(npcTarget);
      var npcShare = Math.round(npcLootValue / 4);
      var npcOdds = Math.round(clamp((power / Math.max(1, Number(npcTarget.power))) * 100, 1, 99));
      var npcRegion = regionById(npcTarget.region);
      npcCard =
        '<div class="pvp-card npc-card">' +
          '<div class="pvp-info"><b>' + escapeHtml(npcTarget.name || "Aldea NPC") + "</b>" +
            "<span>Aldea NPC" + (npcRegion ? " · " + escapeHtml(npcRegion.name) : "") + "</span>" +
            '<span class="npc-meta">Dificultad <b class="tag ' + npcTierValue + '">' +
              npcTierName(npcTierValue) + '</b> · Poder <b>' + num(npcTarget.power) + "</b></span>" +
            "<span>Botín si la derrotas: <b>" + num(npcLootValue) + "</b> recursos (" +
              num(npcShare) + " de oro, madera, comida y piedra).</span>" +
            "<span>Éxito estimado: <b>" + num(npcOdds) + "%</b></span>" +
            (power <= 0 ? '<span class="pvp-warn">No tienes tropas: entrena en el Cuartel.</span>' : "") +
          "</div>" +
          '<div class="pvp-actions">' +
            '<button class="btn-primary" id="npc-attack-btn"' + (pvpBusy || power <= 0 ? " disabled" : "") + ">" +
              (pvpBusy ? "Atacando…" : "Atacar") +
            "</button>" +
            '<button class="btn" id="npc-cancel-btn">Cancelar</button>' +
          "</div>" +
        "</div>";
    }
    var target = pvpTarget;
    var targetCard = "";
    if (target) {
      var targetRegion = regionById(target.region);
      targetCard =
        '<div class="pvp-card">' +
          '<div class="pvp-info"><b>' + escapeHtml(target.name || "Rival") + "</b>" +
            "<span>" + (RACES[target.race] ? RACES[target.race].name : target.race) +
            " · Poder " + num(target.power) +
            (targetRegion ? " · " + escapeHtml(targetRegion.name) : "") + "</span>" +
            (target.shield ? '<span class="pvp-warn">Escudo activo: no se puede atacar.</span>' : "") +
          "</div>" +
          '<div class="pvp-actions">' +
            '<button class="btn-primary" id="pvp-attack-btn"' + (target.shield || pvpBusy ? " disabled" : "") + ">" +
              (pvpBusy ? "Atacando…" : "Atacar") +
            "</button>" +
            '<button class="btn" id="pvp-cancel-btn">Cancelar</button>' +
          "</div>" +
        "</div>";
    }
    var resultCard = pvpResult
      ? '<div class="pvp-result ' + (pvpResult.ok && pvpResult.win ? "win" : "lose") + '">' + escapeHtml(pvpResult.text) + "</div>"
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
        '<div class="panel-head"><h2>' + (open ? escapeHtml(open.name) : "Mapa del mundo") + "</h2>" +
          '<span class="hint">' + escapeHtml(open
            ? num(open.villages) + "/" + num(open.capacity) + " aldeas · " + (open.locked ? "bloqueada" : "abierta")
            : statusText) + "</span></div>" +
        '<div class="map-tools">' +
          (open ? '<button class="btn" id="map-back-btn">&#8592; Mundo</button>' : "") +
          '<button class="btn" data-map-zoom="in">+</button>' +
          '<button class="btn" data-map-zoom="out">&#8722;</button>' +
          '<button class="btn" data-map-center="1">Centrar</button>' +
          '<span class="map-hint">' +
            (adminMode
              ? "Arrastra para mover."
              : open
                ? "Toca una aldea para atacarla."
                : "Toca una región para entrar. Mantén presionada para ver su nombre.") +
          "</span>" +
        "</div>" +
        adminPanel +
        npcCard +
        targetCard +
        resultCard +
        '<div class="worldmap' + (adminMode ? " editing" : "") + (open ? " labels" : "") + '" id="worldmap">' +
          '<div class="worldmap-stage' + (open ? " labels" : "") + '" id="worldmap-stage" ' +
            'style="width:' + MAP_W + "px;height:" + MAP_H + 'px">' +
            '<div class="map-bg" aria-hidden="true"></div>' +
            '<img class="map-image" src="' + escapeHtml(mapImageUrl()) + '" alt="" draggable="false" ' +
              'onerror="this.style.display=\'none\'" />' +
            layer +
          "</div>" +
        "</div>" +
        '<div class="map-legend">' +
          '<span><i class="dot open"></i>Región abierta</span>' +
          '<span><i class="dot locked"></i>Bloqueada</span>' +
          '<span><i class="dot player"></i>Aldea</span>' +
          '<span><i class="dot npc"></i>NPC</span>' +
          '<span class="grow"></span><span class="hint">Tu poder: ' + num(power) + "</span>" +
        "</div>" +
        feed +
      "</div>"
    );
  }

  function focusRegion(region) {
    if (!mapWrapEl || !region) return;
    var w = mapWrapEl.clientWidth || 900;
    var h = mapWrapEl.clientHeight || 480;
    var raw = region.bbox || { x0: 0, y0: 0, x1: 1, y1: 1 };
    var bb = {
      x0: Number(raw.x0), y0: Number(raw.y0),
      x1: Number(raw.x1), y1: Number(raw.y1)
    };
    var grow = function (pos) {
      var x = Number(pos.x);
      var y = Number(pos.y);
      if (!isFinite(x) || !isFinite(y)) return;
      bb.x0 = Math.min(bb.x0, x);
      bb.y0 = Math.min(bb.y0, y);
      bb.x1 = Math.max(bb.x1, x);
      bb.y1 = Math.max(bb.y1, y);
    };
    world.players.forEach(function (player) {
      if (String(player.region) === String(region.id)) grow(player);
    });
    world.npcs.forEach(function (npc) {
      if (String(npc.region) === String(region.id)) grow(npc);
    });
    if (session && session.village &&
        (String(session.region) === String(region.id) || pointInRegion(region, session.village))) {
      grow(session.village);
    }
    var padX = (bb.x1 - bb.x0) * 0.12 + 0.012;
    var padY = (bb.y1 - bb.y0) * 0.12 + 0.012;
    bb.x0 = Math.max(0, bb.x0 - padX);
    bb.y0 = Math.max(0, bb.y0 - padY);
    bb.x1 = Math.min(1, bb.x1 + padX);
    bb.y1 = Math.min(1, bb.y1 + padY);
    var bw = Math.max(0.02, bb.x1 - bb.x0);
    var bh = Math.max(0.02, bb.y1 - bb.y0);
    mapFitScale = Math.max(w / MAP_W, h / MAP_H);
    var scale = Math.min(w / (bw * MAP_W * 1.35), h / (bh * MAP_H * 1.5));
    mapTransform.scale = Math.max(mapFitScale * 1.4, scale);
    mapTransform.x = w / 2 - ((Number(bb.x0) + Number(bb.x1)) / 2) * MAP_W * mapTransform.scale;
    mapTransform.y = h / 2 - ((Number(bb.y0) + Number(bb.y1)) / 2) * MAP_H * mapTransform.scale;
    clampMapPan();
    applyMap();
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
    cullMarkers();
  }

  function cullMarkers() {
    if (!mapWrapEl || !mapWrapEl.querySelectorAll) return;
    var w = mapWrapEl.clientWidth || 900;
    var h = mapWrapEl.clientHeight || 480;
    var nodes;
    try {
      nodes = mapWrapEl.querySelectorAll(".marker, .region-point");
    } catch (err) {
      return;
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var mx = parseFloat(el.getAttribute("data-mx"));
      var my = parseFloat(el.getAttribute("data-my"));
      if (!isFinite(mx) || !isFinite(my)) continue;
      var sx = mx * MAP_W * mapTransform.scale + mapTransform.x;
      var sy = my * MAP_H * mapTransform.scale + mapTransform.y;
      var visible = sx > -90 && sx < w + 90 && sy > -90 && sy < h + 90;
      if (el.style) el.style.display = visible ? "" : "none";
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
    var next = clamp(mapTransform.scale * factor, mapFitScale, mapFitScale * 5);
    mapTransform.scale = next;
    mapTransform.x = cx - worldX * next;
    mapTransform.y = cy - worldY * next;
    clampPanAndDraw();
  }

  function clampPanAndDraw() {
    clampMapPan();
    applyMap();
  }

  function mapFraction(clientX, clientY) {
    if (!mapWrapEl) return null;
    var rect = mapWrapEl.getBoundingClientRect ? mapWrapEl.getBoundingClientRect() : { left: 0, top: 0 };
    var x = (clientX - rect.left - mapTransform.x) / (MAP_W * mapTransform.scale);
    var y = (clientY - rect.top - mapTransform.y) / (MAP_H * mapTransform.scale);
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
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

    var focusRegionObj = openRegionId ? regionById(openRegionId) : null;
    if (focusRegionObj && mapFocusedRegion !== openRegionId) {
      focusRegion(focusRegionObj);
      mapFocusedRegion = openRegionId;
    } else if (!focusRegionObj && mapFocusedRegion) {
      fitMap();
      mapFocusedRegion = null;
    }

    function pointerList() {
      return Object.keys(pointers).map(function (id) {
        return pointers[id];
      });
    }

    mapWrapEl.addEventListener("pointerdown", function (event) {
      if (adminMode && session && session.isAdmin) {
        var target = event.target;
        var point = target && target.closest ? target.closest("[data-region-point]") : null;
        var marker = target && target.closest ? target.closest("[data-map-player]") : null;
        var npc = target && target.closest ? target.closest("[data-map-npc]") : null;
        if (point) {
          itemDrag = { kind: "region", id: point.getAttribute("data-region-point"), x: event.clientX, y: event.clientY };
          return;
        }
        if (marker) {
          itemDrag = { kind: "village", id: marker.getAttribute("data-map-player"), x: event.clientX, y: event.clientY };
          return;
        }
        if (npc) {
          itemDrag = { kind: "npc", id: npc.getAttribute("data-map-npc"), x: event.clientX, y: event.clientY };
          return;
        }
      }
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      if (pointerList().length === 1) {
        panning = true;
        moved = false;
        start = { x: event.clientX, y: event.clientY, tx: mapTransform.x, ty: mapTransform.y };
        if (mapWrapEl.classList) mapWrapEl.classList.add("dragging");
      } else if (pointerList().length === 2) {
        var pts = pointerList();
        pinchStart = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          scale: mapTransform.scale,
        };
      }
    });

    mapWrapEl.addEventListener("pointermove", function (event) {
      if (itemDrag) {
        if (itemDrag.kind === "region") {
          var px = event.clientX - itemDrag.x;
          var py = event.clientY - itemDrag.y;
          var pointEl = mapWrapEl.querySelectorAll('[data-region-point="' + itemDrag.id + '"]')[0];
          if (pointEl && pointEl.style) {
            pointEl.style.transform =
              "translate(calc(-50% + " + px + "px), calc(-50% + " + py + "px)) scale(var(--inv, 1))";
          }
        }
        return;
      }
      if (!pointers[event.pointerId]) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var pts = pointerList();
      if (pts.length === 2 && pinchStart) {
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStart.dist > 0) {
          var target = clamp(pinchStart.scale * (dist / pinchStart.dist), mapFitScale, mapFitScale * 5);
          var rect = mapWrapEl.getBoundingClientRect();
          var cx = (pts[0].x + pts[1].x) / 2 - rect.left;
          var cy = (pts[0].y + pts[1].y) / 2 - rect.top;
          zoomMap(target / mapTransform.scale, cx, cy);
        }
        moved = true;
        return;
      }
      if (!panning) return;
      var mdx = event.clientX - start.x;
      var mdy = event.clientY - start.y;
      if (Math.abs(mdx) + Math.abs(mdy) > 6) moved = true;
      mapTransform.x = start.tx + mdx;
      mapTransform.y = start.ty + mdy;
      clampPanAndDraw();
    });

    function endPointer(event) {
      if (itemDrag) {
        var drag = itemDrag;
        itemDrag = null;
        var dx = (event.clientX - drag.x) / (MAP_W * mapTransform.scale);
        var dy = (event.clientY - drag.y) / (MAP_H * mapTransform.scale);
        var pointEl = mapWrapEl.querySelectorAll('[data-region-point="' + drag.id + '"]')[0];
        if (pointEl && pointEl.style) pointEl.style.transform = "";
        if (Math.abs(dx) + Math.abs(dy) > 0.002) {
          if (drag.kind === "region") {
            adminAction("admin_move_region", { rid: Number(drag.id), dx: dx, dy: dy });
          } else {
            var point = mapFraction(event.clientX, event.clientY);
            if (point) {
              adminAction(drag.kind === "npc" ? "admin_move_npc" : "admin_move_village",
                { target_id: drag.id, nx: point.x, ny: point.y });
            }
          }
        }
        return;
      }
      if (!pointers[event.pointerId]) return;
      delete pointers[event.pointerId];
      if (pointerList().length < 2) pinchStart = null;
      if (pointerList().length === 0) {
        panning = false;
        if (mapWrapEl.classList) mapWrapEl.classList.remove("dragging");
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
        zoomMap(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
      },
      { passive: false }
    );

    Array.prototype.forEach.call(mapWrapEl.querySelectorAll("[data-map-player]"), function (marker) {
      marker.addEventListener("click", function (event) {
        if (event.stopPropagation) event.stopPropagation();
        if (adminMode) return;
        var id = marker.getAttribute("data-map-player");
        pvpResult = null;
        npcTarget = null;
        world.players.forEach(function (player) {
          if (String(player.id) === String(id)) pvpTarget = player;
        });
        renderGame();
      });
    });

    Array.prototype.forEach.call(mapWrapEl.querySelectorAll("[data-map-npc]"), function (marker) {
      marker.addEventListener("click", function (event) {
        if (event.stopPropagation) event.stopPropagation();
        if (adminMode) return;
        var id = marker.getAttribute("data-map-npc");
        pvpTarget = null;
        pvpResult = null;
        npcTarget = null;
        world.npcs.forEach(function (npc) {
          if (String(npc.id) === String(id)) npcTarget = npc;
        });
        renderGame();
      });
    });

    Array.prototype.forEach.call(app.querySelectorAll("[data-region-point]"), function (point) {
      point.addEventListener("pointerdown", function () {
        if (adminMode) return;
        regionLongPressed = false;
        if (regionPressTimer) clearTimeout(regionPressTimer);
        var id = point.getAttribute("data-region-point");
        regionPressTimer = setTimeout(function () {
          regionLongPressed = true;
          regionHintId = id;
          renderGame();
          setTimeout(function () {
            if (regionHintId === id) {
              regionHintId = null;
              if (view === "mapa") renderGame();
            }
          }, 1600);
        }, 500);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) {
        point.addEventListener(type, function () {
          if (regionPressTimer) clearTimeout(regionPressTimer);
          regionPressTimer = null;
        });
      });
      point.addEventListener("click", function () {
        if (regionLongPressed) {
          regionLongPressed = false;
          return;
        }
        var id = point.getAttribute("data-region-point");
        var region = regionById(id);
        if (!region) return;
        if (region.locked && !(session && session.isAdmin)) {
          pvpResult = { ok: false, text: "Esa región está bloqueada por el administrador." };
          renderGame();
          return;
        }
        openRegionId = id;
        mapFocusedRegion = null;
        regionHintId = null;
        pvpTarget = null;
        npcTarget = null;
        pvpResult = null;
        renderGame();
      });
    });

    Array.prototype.forEach.call(app.querySelectorAll("[data-map-village]"), function (mine) {
      mine.addEventListener("click", function () {
        if (adminMode || openRegionId) return;
        var region = session && (session.region || (regionAt(session.village.x, session.village.y) || {}).id);
        if (!region) return;
        openRegionId = region;
        mapFocusedRegion = null;
        renderGame();
      });
    });

    var backBtn = document.getElementById("map-back-btn");
    if (backBtn) backBtn.addEventListener("click", function () {
      openRegionId = null;
      mapFocusedRegion = null;
      regionHintId = null;
      pvpTarget = null;
      npcTarget = null;
      pvpResult = null;
      renderGame();
    });

    var npcAttackBtn = document.getElementById("npc-attack-btn");
    if (npcAttackBtn) npcAttackBtn.addEventListener("click", function () { if (npcTarget) npcAttack(npcTarget.id); });
    var npcCancelBtn = document.getElementById("npc-cancel-btn");
    if (npcCancelBtn) npcCancelBtn.addEventListener("click", function () {
      npcTarget = null;
      pvpResult = null;
      renderGame();
    });

    var attackBtn = document.getElementById("pvp-attack-btn");
    if (attackBtn) attackBtn.addEventListener("click", function () { if (pvpTarget) pvpAttack(pvpTarget.id); });
    var cancelBtn = document.getElementById("pvp-cancel-btn");
    if (cancelBtn) cancelBtn.addEventListener("click", function () {
      pvpTarget = null;
      pvpResult = null;
      renderGame();
    });

    Array.prototype.forEach.call(app.querySelectorAll("[data-map-zoom]"), function (button) {
      button.addEventListener("click", function () {
        zoomMap(button.getAttribute("data-map-zoom") === "in" ? 1.3 : 1 / 1.3);
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-map-center]"), function (button) {
      button.addEventListener("click", function () {
        if (openRegionId) {
          focusRegion(regionById(openRegionId));
          mapFocusedRegion = openRegionId;
        } else {
          fitMap();
        }
      });
    });

    var settingsBtn = document.getElementById("admin-settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", function () {
      view = "admin";
      renderGame();
    });

    var adminBtn = document.getElementById("admin-mode-btn");
    if (adminBtn) adminBtn.addEventListener("click", function () {
      adminMode = !adminMode;
      renderGame();
    });
    var imageBtn = document.getElementById("admin-image-btn");
    if (imageBtn) imageBtn.addEventListener("click", function () {
      var url = window.prompt("URL de la nueva imagen del mapa (vacío = imagen por defecto)", mapImageUrl());
      if (url === null) return;
      adminAction("admin_set_map_image", { url: url });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-lock-region]"), function (button) {
      button.addEventListener("click", function () {
        var lock = button.getAttribute("data-lock") === "1";
        adminAction("admin_set_region_locked", { rid: Number(button.getAttribute("data-lock-region")), is_locked: lock });
      });
    });
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

  function maintApproved(m) {
    try {
      return sessionStorage.getItem("reinos:maint") === String((m && m.version) || 0);
    } catch (error) {
      return false;
    }
  }

  function maintMark(m) {
    try {
      sessionStorage.setItem("reinos:maint", String((m && m.version) || 0));
    } catch (error) {}
  }

  function maintReset() {
    try {
      sessionStorage.removeItem("reinos:maint");
    } catch (error) {}
  }

  function maintenanceLocked() {
    if (!isCloud() || !session) return false;
    if (session.isAdmin) return false;
    var m = world.maintenance;
    if (!m || !m.active) return false;
    return !maintApproved(m);
  }

  function renderMaintenance() {
    var m = world.maintenance || {};
    var msg = m.message || "Estamos trabajando en el reino. Vuelve pronto.";

    app.innerHTML =
      '<div class="maint-screen"><div class="maint-card">' +
        '<div class="maint-icon">&#128736;</div>' +
        "<h1>Mantenimiento</h1>" +
        '<p class="maint-msg">' + escapeHtml(msg) + "</p>" +
        (m.locked
          ? '<form id="maint-form" autocomplete="off">' +
              '<input id="maint-pass" name="maintpass" type="password" placeholder="Contraseña de acceso" autocomplete="current-password" />' +
              '<button class="btn btn-primary" type="submit">Entrar</button>' +
            "</form>"
          : '<button class="btn btn-primary" id="maint-enter">Entrar</button>') +
        '<div class="maint-error">' + escapeHtml(maintError) + "</div>" +
        '<button class="btn small" id="maint-logout">Cerrar sesión</button>' +
      "</div></div>";

    function approve() {
      maintError = "";
      maintMark(m);
      maintGateState = false;
      renderGame();
    }

    function fail(text) {
      maintError = text;
      renderMaintenance();
    }

    if (m.locked) {
      var form = document.getElementById("maint-form");
      if (form) {
        form.addEventListener("submit", function (event) {
          if (event.preventDefault) event.preventDefault();
          var input = document.getElementById("maint-pass");
          var pass = input ? String(input.value || "") : "";
          if (!pass) {
            fail("Escribe la contraseña de acceso.");
            return;
          }
          if (maintBusy) return;
          maintBusy = true;
          api("/rest/v1/rpc/maintenance_enter", {
            method: "POST",
            token: session.token,
            body: { p_password: pass },
          })
            .then(function (result) {
              maintBusy = false;
              if (result.ok && result.data === true) approve();
              else if (result.ok) fail("Contraseña incorrecta.");
              else fail(cloudErrorMessage(result));
            })
            .catch(function () {
              maintBusy = false;
              fail("No se pudo conectar. Inténtalo de nuevo.");
            });
        });
      }
    } else {
      var enter = document.getElementById("maint-enter");
      if (enter) enter.addEventListener("click", approve);
    }

    var out = document.getElementById("maint-logout");
    if (out) out.addEventListener("click", logout);
  }

  function renderGame() {
    if (!state) {
      renderAuth();
      return;
    }
    if (maintenanceLocked()) {
      renderMaintenance();
      return;
    }
    var race = RACES[state.race];
    var tabs = [
      ["aldea", "Aldea"],
      ["cuartel", "Cuartel"],
      ["mapa", "Mapa"],
      ["raza", "Raza"],
    ];
    if (session && session.isAdmin) tabs.push(["admin", "Administrar WoW"]);
    var center;
    if (view === "cuartel") center = troopsView();
    else if (view === "mapa") center = mapView();
    else if (view === "raza") center = raceView();
    else if (view === "admin" && session && session.isAdmin) center = adminView();
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

  function bindAdminSettings() {
    var speedSave = document.getElementById("speed-save");
    if (speedSave) {
      speedSave.addEventListener("click", function () {
        var input = document.getElementById("speed-input");
        var errorEl = document.getElementById("speed-error");
        var speed = input ? Number(input.value) : NaN;
        if (!isFinite(speed) || speed < 0.1 || speed > 10) {
          if (errorEl) errorEl.textContent = "La velocidad debe estar entre 0.1 y 10.";
          return;
        }
        if (errorEl) errorEl.textContent = "";
        adminAction("admin_set_resource_speed", { p_speed: speed });
      });
    }

    var maintToggle = document.getElementById("maint-toggle");
    if (maintToggle) {
      maintToggle.addEventListener("click", function () {
        var messageEl = document.getElementById("maint-message-input");
        var passwordEl = document.getElementById("maint-password-input");
        var errorEl = document.getElementById("maint-error");
        var active = !(world.maintenance && world.maintenance.active);
        var password = passwordEl ? String(passwordEl.value || "") : "";
        if (active && !password.trim()) {
          if (errorEl) errorEl.textContent = "Escribe una contraseña para activar el mantenimiento.";
          return;
        }
        if (errorEl) errorEl.textContent = "";
        adminAction("admin_set_maintenance", {
          p_active: active,
          p_message: messageEl ? messageEl.value : "",
          p_password: password,
        });
      });
    }

    Array.prototype.forEach.call(app.querySelectorAll("[data-set-pass]"), function (button) {
      button.addEventListener("click", function () {
        var who = button.getAttribute("data-pass-name") || "el jugador";
        var pass = window.prompt("Nueva contraseña para " + who + " (mínimo 6 caracteres)");
        if (pass === null) return;
        if (String(pass).length < 6) {
          pvpResult = { ok: false, text: "La contraseña debe tener al menos 6 caracteres." };
          renderGame();
          return;
        }
        adminAction("admin_set_password", { target_id: button.getAttribute("data-set-pass"), new_password: pass });
      });
    });
  }

  function bindGameEvents() {
    Array.prototype.forEach.call(app.querySelectorAll("[data-view]"), function (button) {
      button.addEventListener("click", function () {
        view = button.getAttribute("data-view");
        if (view === "mapa" && isCloud()) syncWorld();
        if (view === "admin" && isCloud() && (!world.at || now() - world.at > 5000)) {
          syncWorld().then(function () {
            if (view === "admin") renderGame();
          });
        }
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
    bindAdminSettings();
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
          phone: saved.phone || phoneFromEmail(saved.email),
          token: token,
          refreshToken: saved.refreshToken,
          userId: (user.data && user.data.id) || saved.userId,
          username: saved.username || saved.phone || saved.email.split("@")[0],
          isAdmin: saved.isAdmin,
          expiresAt: saved.expiresAt,
        };
        account = session.phone || (saved.email === "admin@reinos.local" ? "admin" : saved.email);
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
            pendingRace = {
              mode: "cloud", email: saved.email, phone: session.phone,
              pass: "", token: session.token,
            };
            renderRaceSelection();
            return true;
          }
          state = migrateState(row.state && row.state.race ? row.state : newState(row.race));
          state.race = row.race || state.race;
          session.username = row.username || session.username;
          session.isAdmin = !!row.is_admin;
          session.region = row.region_id;
          if (row.x == null) {
            session = null;
            account = null;
            localStorage.removeItem(SESSION_KEY);
            authError = "No hay plazas libres en las regiones abiertas. Pide al administrador que abra otra región.";
            renderAuth();
            return true;
          }
          session.village = { x: Number(row.x), y: Number(row.y) };
          writeJSON(SESSION_KEY, session);
          var offline = applyOffline(state);
          if (offline.minutes >= 1) {
            addLog(
              "Mientras estabas fuera (" + Math.round(offline.minutes) + " min) tu aldea produjo recursos.",
              ""
            );
          }
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
