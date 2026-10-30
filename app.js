/* WoW Imperial - juego de estrategia por razas */
(function () {
  "use strict";

  var ACCOUNTS_KEY = "wowimperial:accounts";
  var SESSION_KEY = "wowimperial:session";
  var SETTINGS_KEY = "wowimperial:settings";
  var MAX_OFFLINE_MINUTES = 8 * 60;
  var SAVE_EVERY_MS = 8000;

  var SUPABASE_URL = "https://dxsxdswyhdjzykuscqko.supabase.co";
  var SUPABASE_KEY = "sb_publishable_rLhRC2iT7Qv59B7n31hZfg_EbI-q8pd";

  var RESOURCES = ["oro", "madera", "comida", "piedra"];
  var INVASION_FOOD = 60;
  var INVASION_FATIGUE = 0.75;
  var RES_LABEL = { oro: "Oro", madera: "Madera", comida: "Comida", piedra: "Piedra" };
  var MARKET_ASSETS = {
    oro: "Oro", madera: "Madera", comida: "Comida", piedra: "Piedra",
    lanceros: "Lanceros", arqueros: "Arqueros", jinetes: "Jinetes",
    espadachines: "Espadachines", guardianes: "Guardianes",
    jinetes_arqueros: "Jinetes arqueros", catapultas: "Catapultas",
    magos: "Magos", asesinos: "Asesinos",
  };
  var MARKET_TROOPS = {
    lanceros: true, arqueros: true, jinetes: true,
    espadachines: true, guardianes: true, jinetes_arqueros: true,
    catapultas: true, magos: true, asesinos: true,
    ballesteros: true, piqueros: true, lobos_guerra: true,
    elefantes: true, nigromantes: true, dragones: true,
    honderos: true, arquebuseros: true, camellos: true,
    osos_guerra: true, sacerdotes: true, titanes: true,
  };
  var RES_ICON = { oro: "◈", madera: "❖", comida: "❁", piedra: "▲" };

  var RACES = {
    horda: {
      id: "horda",
      name: "Horda",
      motto: "La fuerza no espera",
      desc:
        "Tus tropas golpean más fuerte y resisten más, pero tus trabajadores producen recursos más despacio.",
      prod: 0.8,
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
        return "Desbloquea una tropa nueva por nivel. Capacidad del ejército: " + troopCap(lvl) + " unidades.";
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
      lvl: 2,
      cost: { oro: 40, madera: 20, comida: 10, piedra: 0 },
      atk: 6,
      def: 8,
      hp: 30,
      time: 3,
      desc: "Baratos y defensivos. La base de cualquier ejército.",
    },
    arqueros: {
      name: "Arqueros",
      lvl: 3,
      cost: { oro: 60, madera: 45, comida: 15, piedra: 10 },
      atk: 11,
      def: 4,
      hp: 22,
      time: 5,
      desc: "Gran ataque a distancia, pero frágiles en primera línea.",
    },
    jinetes: {
      name: "Jinetes",
      lvl: 4,
      cost: { oro: 110, madera: 30, comida: 70, piedra: 20 },
      atk: 18,
      def: 10,
      hp: 55,
      time: 9,
      desc: "Unidad de élite. Caros, pero devastadores en incursiones.",
    },
    espadachines: {
      name: "Espadachines",
      lvl: 5,
      cost: { oro: 110, madera: 50, comida: 35, piedra: 25 },
      atk: 15,
      def: 15,
      hp: 50,
      time: 7,
      desc: "Infantería pesada y equilibrada para el choque frontal.",
    },
    guardianes: {
      name: "Guardianes",
      lvl: 11,
      cost: { oro: 160, madera: 80, comida: 50, piedra: 100 },
      atk: 10,
      def: 30,
      hp: 95,
      time: 12,
      desc: "Muro defensivo. Aguantan mucho daño y protegen al ejército.",
    },
    jinetes_arqueros: {
      name: "Jinetes arqueros",
      lvl: 9,
      cost: { oro: 150, madera: 70, comida: 80, piedra: 25 },
      atk: 21,
      def: 7,
      hp: 44,
      time: 10,
      desc: "Hostigadores veloces: gran ataque a distancia y poca defensa.",
    },
    catapultas: {
      name: "Catapultas",
      lvl: 15,
      cost: { oro: 180, madera: 130, comida: 40, piedra: 100 },
      atk: 35,
      def: 3,
      hp: 45,
      time: 16,
      desc: "Asedio demoledor. Ataque altísimo, pero muy frágiles.",
    },
    magos: {
      name: "Magos",
      lvl: 12,
      cost: { oro: 240, madera: 40, comida: 60, piedra: 70 },
      atk: 28,
      def: 12,
      hp: 65,
      time: 18,
      desc: "Élite arcana: mucho daño y buena resistencia.",
    },
    asesinos: {
      name: "Asesinos",
      lvl: 13,
      cost: { oro: 280, madera: 30, comida: 70, piedra: 40 },
      atk: 42,
      def: 5,
      hp: 38,
      time: 20,
      desc: "Golpe letal. El mayor ataque del juego a cambio de fragilidad.",
    },
    ballesteros: {
      name: "Ballesteros",
      lvl: 7,
      cost: { oro: 120, madera: 100, comida: 50, piedra: 30 },
      atk: 24,
      def: 8,
      hp: 40,
      time: 9,
      desc: "Tiradores veteranos: más alcance y daño que los arqueros.",
    },
    piqueros: {
      name: "Piqueros",
      lvl: 6,
      cost: { oro: 120, madera: 70, comida: 55, piedra: 70 },
      atk: 12,
      def: 22,
      hp: 60,
      time: 10,
      desc: "Formación defensiva con picas. Difíciles de romper.",
    },
    lobos_guerra: {
      name: "Lobos de guerra",
      lvl: 8,
      cost: { oro: 150, madera: 40, comida: 100, piedra: 30 },
      atk: 26,
      def: 6,
      hp: 50,
      time: 12,
      desc: "Bestias rápidas y feroces, ideales para hostigar.",
    },
    elefantes: {
      name: "Elefantes",
      lvl: 19,
      cost: { oro: 260, madera: 120, comida: 100, piedra: 180 },
      atk: 30,
      def: 24,
      hp: 140,
      time: 22,
      desc: "Colosos de guerra: mucha vida y defensa, pero caros.",
    },
    nigromantes: {
      name: "Nigromantes",
      lvl: 18,
      cost: { oro: 260, madera: 50, comida: 90, piedra: 80 },
      atk: 34,
      def: 16,
      hp: 80,
      time: 20,
      desc: "Élite oscura con gran daño y resistencia.",
    },
    dragones: {
      name: "Dragones",
      lvl: 20,
      cost: { oro: 500, madera: 100, comida: 150, piedra: 200 },
      atk: 60,
      def: 20,
      hp: 120,
      time: 30,
      desc: "La cima del poder militar. Devastadores y muy costosos.",
    },
    honderos: {
      name: "Honderos",
      lvl: 1,
      cost: { oro: 50, madera: 40, comida: 10, piedra: 0 },
      atk: 9,
      def: 3,
      hp: 20,
      time: 3,
      desc: "Tropa inicial barata para llenar las primeras filas.",
    },
    arquebuseros: {
      name: "Arquebuseros",
      lvl: 16,
      cost: { oro: 220, madera: 140, comida: 60, piedra: 50 },
      atk: 30,
      def: 10,
      hp: 50,
      time: 14,
      desc: "Pólvora y plomo: gran daño a distancia, caros de equipar.",
    },
    camellos: {
      name: "Camellos",
      lvl: 10,
      cost: { oro: 160, madera: 50, comida: 90, piedra: 35 },
      atk: 22,
      def: 12,
      hp: 65,
      time: 11,
      desc: "Caballería del desierto: resistentes y con buen ataque.",
    },
    osos_guerra: {
      name: "Osos de guerra",
      lvl: 17,
      cost: { oro: 220, madera: 100, comida: 120, piedra: 60 },
      atk: 20,
      def: 24,
      hp: 100,
      time: 16,
      desc: "Bestias acorazadas que aguantan la primera línea.",
    },
    sacerdotes: {
      name: "Sacerdotes",
      lvl: 14,
      cost: { oro: 200, madera: 70, comida: 80, piedra: 90 },
      atk: 18,
      def: 20,
      hp: 75,
      time: 15,
      desc: "Élite equilibrada que sostiene el centro de la formación.",
    },
    titanes: {
      name: "Titanes",
      lvl: 21,
      cost: { oro: 850, madera: 200, comida: 250, piedra: 350 },
      atk: 75,
      def: 30,
      hp: 180,
      time: 40,
      desc: "Leyendas vivientes. Poder inmenso a un coste enorme.",
    },
  };

  var TROOP_ART = {
    alianza: {
      arqueros: "./assets/troops/alianza-arqueros.webp?v=20261030l",
    },
    horda: {
      arqueros: "./assets/troops/horda-arqueros.webp?v=20261030k",
    },
    enanos: {
      arqueros: "./assets/troops/enanos-arqueros.webp?v=20261030o",
      ballesteros: "./assets/troops/enanos-ballesteros.webp?v=20261030p",
      honderos: "./assets/troops/enanos-honderos.webp?v=20261030n",
      jinetes: "./assets/troops/enanos-jinetes.webp?v=20261030m",
    },
  };

  function troopArtSrc(raceId, key) {
    return (TROOP_ART[raceId] && TROOP_ART[raceId][key]) || "";
  }

  function troopArt(raceId, key, size) {
    var src = troopArtSrc(raceId, key);
    if (!src) return "";
    var px = size || 52;
    return '<img class="tportrait" src="' + src + '" alt="" width="' + px + '" height="' + px +
      '" loading="lazy" decoding="async">';
  }

  var QUEUE_LIMIT = 4;

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
    var growth = key === "ayuntamiento" || key === "cuartel" ? 1.32 : 1.55;
    var factor = Math.pow(growth, level - 1);
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
      troops: {
        lanceros: 6, arqueros: 2, jinetes: 0,
        espadachines: 0, guardianes: 0, jinetes_arqueros: 0,
        catapultas: 0, magos: 0, asesinos: 0,
        ballesteros: 0, piqueros: 0, lobos_guerra: 0,
        elefantes: 0, nigromantes: 0, dragones: 0,
        honderos: 0, arquebuseros: 0, camellos: 0,
        osos_guerra: 0, sacerdotes: 0, titanes: 0,
      },
      campsCleared: 0,
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
      "/rest/v1/profiles?id=eq." + encodeURIComponent(userId) + "&select=race,state,username,x,y,region_id,is_admin,kb",
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
      kb: 0,
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
      session.kb = Number(row.kb || 0);
      session.region = row.region_id;
      if (row.x != null) session.village = { x: Number(row.x), y: Number(row.y) };
      writeJSON(SESSION_KEY, session);
      if (row.x == null) {
        session = null;
        account = null;
        localStorage.removeItem(SESSION_KEY);
        authError = "No hay plazas libres: todas las regiones abiertas están completas. Pide al administrador que abra otra zona.";
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
                  authError = "No hay plazas libres en las regiones abiertas. Pide al administrador que abra otra zona.";
                  renderAuth();
                  return;
                }
                session.village = { x: Number(row.x), y: Number(row.y) };
                session.isAdmin = !!row.is_admin;
                session.kb = Number(row.kb || 0);
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
    if (!def) return;
    if (state.buildings.cuartel < def.lvl) {
      addLog("Necesitas Cuartel Nv. " + def.lvl + " para entrenar " + def.name + ".", "bad");
      renderGame();
      return;
    }
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
    return (
      '<aside class="col">' +
        '<div class="panel resource-panel">' +
          '<div class="panel-body">' +
            '<div class="res-grid">' +
              RESOURCES.map(function (res) {
                return (
                  '<div class="res">' +
                    '<span class="name">' + RES_ICON[res] + " " + RES_LABEL[res] + "</span>" +
                    '<b class="amount" id="res-' + res + '">' + num(state.res[res]) + "</b>" +
                    '<span class="rate">+' + Math.round(prod[res]) + "/m</span>" +
                  "</div>"
                );
              }).join("") +
            "</div>" +
            '<div class="res-meta">' +
              '<span>Almacén <b id="storage-line">' +
                num(Math.floor(Math.max.apply(null, RESOURCES.map(function (r) { return state.res[r]; })))) +
                "/" + num(limit) + "</b></span>" +
              '<span>KB <b id="kb-line">' + num((session && session.kb) || 0) + "</b></span>" +
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
        var unlocked = state.buildings.cuartel >= def.lvl;
        var artSrc = troopArtSrc(state.race, key);
        var costHtml = RESOURCES.filter(function (res) {
          return (def.cost[res] || 0) > 0;
        })
          .map(function (res) {
            var miss = state.res[res] < def.cost[res];
            return '<span class="' + (miss ? "miss" : "") + '">' + RES_ICON[res] + " " + num(def.cost[res]) + "</span>";
          })
          .join("");
        return (
          '<div class="troop' + (unlocked ? "" : " locked") + '">' +
            (artSrc
              ? '<img class="tart" src="' + artSrc + '" alt="" width="256" height="256" loading="lazy" decoding="async">'
              : "") +
            '<div class="tbody">' +
              '<div class="trow"><span class="tname">' + def.name + '</span><span class="tcount">x' + num(state.troops[key] || 0) + "</span></div>" +
              '<div class="tstats"><span>Nv. ' + def.lvl + '</span><span>Ataque ' + atk.toFixed(1) + "</span><span>Defensa " + dfn.toFixed(1) + "</span><span>Vida " + hp.toFixed(0) + "</span><span>" + def.time + "s /ud</span></div>" +
              '<div class="cost">' + costHtml + "</div>" +
              (unlocked
                ? '<div class="buy">' +
                    '<button class="btn" data-train="' + key + '" data-amount="1">+1</button>' +
                    '<button class="btn" data-train="' + key + '" data-amount="5">+5</button>' +
                    '<button class="btn" data-train="' + key + '" data-amount="25">+25</button>' +
                  "</div>"
                : '<div class="buy"><span class="troop-lock">Requiere Cuartel Nv. ' + def.lvl + "</span></div>") +
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
    players: [], regions: [], events: [], phones: [], npcs: [], castles: [], online: 0,
    roadBends: [], expeditions: [], moveSpeed: 1, settings: {}, maintenance: {}, me: {}, at: 0, error: "",
  };
  var worldTimer = null;
  var market = { orders: [], error: "", at: 0 };
  var marketMsg = null;
  var marketBusy = false;
  var pvpTarget = null;
  var npcTarget = null;
  var castleTarget = null;
  var pvpResult = null;
  var pvpBusy = false;
  var troopDraft = null;
  var mapFitted = false;
  var adminMode = false;
  var itemDrag = null;
  var mapWrapEl = null;
  var mapStageEl = null;
  var mapTransform = { x: 0, y: 0, scale: 1 };
  var mapFitScale = 1;
  var openRegionId = null;
  var mapFocusedRegion = null;
  var currentRoadNetwork = null;
  var currentRoadPoints = null;
  var currentRoadLinks = [];
  var currentRoadBends = {};
  var currentRoadRegionId = null;
  var regionHintId = null;
  var regionPressTimer = null;
  var regionLongPressed = false;
  var maintError = "";
  var maintBusy = false;
  var maintGateState = false;
  var marchTimer = null;
  var marchSyncTimer = null;
  var seenExpeditionResults = {};
  var expeditionRoadCache = {};

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
        world.castles = Array.isArray(data.castles) ? data.castles : [];
        world.roadBends = Array.isArray(data.road_bends) ? data.road_bends : [];
        world.expeditions = Array.isArray(data.expeditions) ? data.expeditions : [];
        expeditionRoadCache = {};
        world.online = Number(data.online || 0);
        world.speed = Number(data.speed || 1);
        world.moveSpeed = Number(data.move_speed || 1);
        if (state) state.speed = world.speed;
        handleExpeditionResults();
        world.settings = data.settings || {};
        world.maintenance = data.maintenance || {};
        world.me = data.me || {};
        world.at = now();
        world.error = "";
        var wasAdmin = !!(session && session.isAdmin);
        if (session) {
          session.isAdmin = !!world.me.admin;
          if (world.me.kb != null) session.kb = Number(world.me.kb);
          session.region = world.me.region;
          if (!session.isAdmin) {
            var self = null;
            world.players.forEach(function (player) {
              if (!self && String(player.id) === String(session.userId)) self = player;
            });
            if (self && typeof self.x === "number" && typeof self.y === "number") {
              session.village = { x: Number(self.x), y: Number(self.y) };
              session.region = self.region;
            }
          }
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

  function syncMarket() {
    if (!isCloud()) return Promise.resolve();
    return api("/rest/v1/rpc/market_list", { method: "POST", token: session.token, body: {} })
      .then(function (result) {
        if (!result.ok) {
          market.error = cloudErrorMessage(result);
          return;
        }
        market.orders = Array.isArray(result.data) ? result.data : [];
        market.error = "";
        market.at = now();
      })
      .catch(function () {
        market.error = "No se pudo cargar el mercado.";
      });
  }

  function marketAssetName(asset) {
    return MARKET_ASSETS[asset] || String(asset);
  }

  function marketAction(fn, body) {
    if (!isCloud() || marketBusy) return;
    marketBusy = true;
    marketMsg = null;
    renderGame();
    flushCloudSave().then(function () {
      return api("/rest/v1/rpc/" + fn, { method: "POST", token: session.token, body: body });
    })
      .then(function (result) {
        marketBusy = false;
        if (!result.ok) {
          var message = cloudErrorMessage(result);
          if (message.indexOf("not enough kb") !== -1) message = "No tienes KB suficientes.";
          else if (message.indexOf("not enough") !== -1) message = "No tienes suficientes unidades de ese bien.";
          else if (message.indexOf("storage full") !== -1) message = "Tu almacén está lleno para ese recurso.";
          else if (message.indexOf("own order") !== -1) message = "No puedes operar con tu propia oferta.";
          else if (message.indexOf("closed") !== -1) message = "Esa oferta ya se agotó.";
          else if (message.indexOf("too many orders") !== -1) message = "Tienes demasiadas ofertas activas (máximo 20).";
          else if (message.indexOf("invalid") !== -1) message = "Cantidad o precio inválido.";
          else if (message.indexOf("not yours") !== -1) message = "Esa oferta no es tuya.";
          marketMsg = { ok: false, text: message };
          renderGame();
          return;
        }
        var data = result.data || {};
        marketMsg = {
          ok: true,
          text:
            fn === "market_post"
              ? "Venta publicada en el mercado."
              : fn === "market_fill"
                ? "Operación completada: " + num(data.qty || 0) + " × " +
                  marketAssetName(data.asset) + " por " + num(data.total || 0) + " KB."
                : "Oferta cancelada y bienes devueltos.",
        };
        return refreshOwnProfile().then(syncMarket).then(function () {
          if (view === "mercado") renderGame();
        });
      })
      .catch(function () {
        marketBusy = false;
        marketMsg = { ok: false, text: "No se pudo completar la operación." };
        renderGame();
      });
  }

  function stopWorldSync() {
    if (worldTimer) clearInterval(worldTimer);
    worldTimer = null;
    world = { players: [], regions: [], events: [], phones: [], npcs: [], castles: [], online: 0, roadBends: [], expeditions: [], moveSpeed: 1, settings: {}, maintenance: {}, me: {}, at: 0, error: "" };
    market = { orders: [], error: "", at: 0 };
    marketMsg = null;
    pvpTarget = null;
    npcTarget = null;
    castleTarget = null;
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
        "&select=race,state,username,x,y,region_id,is_admin,kb",
      { token: session.token }
    ).then(function (result) {
      if (!result.ok || !Array.isArray(result.data) || !result.data[0]) return;
      var row = result.data[0];
      state = migrateState(row.state);
      state.race = row.race || state.race;
      session.username = row.username || session.username;
      session.isAdmin = !!row.is_admin;
      session.kb = Number(row.kb || 0);
      session.region = row.region_id;
      if (row.x != null) session.village = { x: Number(row.x), y: Number(row.y) };
      writeJSON(SESSION_KEY, session);
      refreshNumbers();
      updateTimers();
    });
  }

  function activeExpedition() {
    var found = null;
    (world.expeditions || []).forEach(function (expedition) {
      if (found || !session || String(expedition.attacker) !== String(session.userId)) return;
      if (expedition.status === "outbound" || expedition.status === "returning") found = expedition;
    });
    return found;
  }

  function secondsUntil(value) {
    var at = Date.parse(value);
    if (!isFinite(at)) return 0;
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }

  function marchTargetKey() {
    if (castleTarget) return "castle:" + castleTarget.id;
    if (npcTarget) return "npc:" + npcTarget.id;
    if (pvpTarget) return "player:" + pvpTarget.id;
    return "";
  }

  function ensureDraft(key) {
    var draft = troopDraft;
    if (!draft || draft.key !== key) {
      draft = { key: key, troops: {} };
      Object.keys(TROOPS).forEach(function (k) {
        draft.troops[k] = Math.max(0, Math.floor(Number(state.troops[k]) || 0));
      });
      troopDraft = draft;
    }
    Object.keys(TROOPS).forEach(function (k) {
      var have = Math.max(0, Math.floor(Number(state.troops[k]) || 0));
      var want = Math.floor(Number(draft.troops[k]) || 0);
      draft.troops[k] = clamp(want, 0, have);
    });
    return draft.troops;
  }

  function draftTotal(draft) {
    return armyCount({ race: state.race, troops: draft });
  }

  function draftPower(draft) {
    return armyPower({ race: state.race, troops: draft });
  }

  function troopSummary(t) {
    if (!t) return "";
    var parts = [];
    Object.keys(TROOPS).forEach(function (k) {
      var count = Math.max(0, Math.floor(Number(t[k]) || 0));
      if (count > 0) parts.push(num(count) + " " + TROOPS[k].name.toLowerCase());
    });
    return parts.join(" · ");
  }

  function troopPicker(draft) {
    var rows = Object.keys(TROOPS).map(function (key) {
      var have = Math.max(0, Math.floor(Number(state.troops[key]) || 0));
      return '<label class="troop-row"><span class="troop-label">' + troopArt(state.race, key, 22) + TROOPS[key].name +
        ' <em>(' + num(have) + ')</em></span>' +
        '<input type="number" inputmode="numeric" min="0" max="' + have + '" step="1" value="' +
        Math.floor(Number(draft[key]) || 0) + '" data-send="' + key + '"></label>';
    }).join("");
    return '<div class="troop-picker">' + rows +
      '<div class="troop-total"><span>Enviar: <b>' + num(draftTotal(draft)) +
        '</b> · Poder <b>' + num(draftPower(draft)) + '</b></span>' +
        '<button type="button" class="btn small" data-send-all="1">Todo</button>' +
        '<button type="button" class="btn small" data-send-none="1">Nada</button></div></div>';
  }

  function attackTroops(key) {
    var draft = ensureDraft(key);
    return draftTotal(draft) > 0 ? draft : null;
  }

  function startMarch(targetType, targetId, troops) {
    if (!isCloud() || pvpBusy) return;
    if (!targetId) return;
    pvpBusy = true;
    pvpResult = null;
    renderGame();
    flushCloudSave().then(function () {
      return api("/rest/v1/rpc/start_expedition", {
        method: "POST",
        token: session.token,
        body: {
          p_target_type: targetType,
          p_target_id: targetId,
          p_troops: troops || null,
        },
      });
    }).then(function (result) {
      pvpBusy = false;
      if (!result.ok) {
        var message = cloudErrorMessage(result);
        if (message.indexOf("expedition active") !== -1) message = "Ya tienes un ejército en camino.";
        else if (message.indexOf("locked") !== -1) message = "Esa zona está bloqueada por el administrador.";
        else if (message.indexOf("region too far") !== -1) message = "Esa zona está fuera de alcance.";
        else if (message.indexOf("not enough food") !== -1) message = "No tienes comida suficiente para invadir esa zona.";
        else if (message.indexOf("shielded") !== -1) message = "Ese jugador sigue protegido por su escudo.";
        else if (message.indexOf("cooldown") !== -1) message = "Ese objetivo está en tiempo de espera.";
        else if (message.indexOf("not enough troops") !== -1) message = "No tienes suficientes tropas para ese destacamento.";
        else if (message.indexOf("no troops") !== -1) message = "No tienes tropas para atacar.";
        else if (message.indexOf("already yours") !== -1) message = "Ese castillo ya es tuyo.";
        else if (message.indexOf("cannot attack yourself") !== -1) message = "No puedes atacarte a ti mismo.";
        else if (message.indexOf("no village") !== -1) message = "Tu aldea aún no tiene posición en el mundo.";
        else if (message.indexOf("not found") !== -1) message = "Ese objetivo ya no existe.";
        pvpResult = { ok: false, text: message };
        renderGame();
        return;
      }
      var data = result.data || {};
      troopDraft = null;
      pvpResult = {
        ok: true,
        win: true,
        text:
          "Destacamento en camino a " + (data.target || "el objetivo") +
          (troopSummary(data.troops) ? " · " + troopSummary(data.troops) : "") +
          (Number(data.food_cost) > 0 ? " · -" + num(data.food_cost) + " comida" : "") +
          " · llegada en " + num(data.travel_seconds || 0) + " s. " +
          "Al llegar combatirá y los supervivientes regresarán por la misma ruta.",
      };
      return refreshOwnProfile().then(syncWorld).then(function () {
        renderGame();
      });
    }).catch(function () {
      pvpBusy = false;
      pvpResult = { ok: false, text: "No se pudo iniciar la marcha." };
      renderGame();
    });
  }

  function pvpAttack(targetId) {
    startMarch("player", targetId, attackTroops("player:" + targetId));
  }

  function castleAttack(castleId) {
    startMarch("castle", castleId, attackTroops("castle:" + castleId));
  }

  function npcAttack(npcId) {
    startMarch("npc", npcId, attackTroops("npc:" + npcId));
  }

  function handleExpeditionResults() {
    var latest = null;
    var own = (world.expeditions || []).filter(function (expedition) {
      return session && String(expedition.attacker) === String(session.userId) && expedition.result;
    });
    own.sort(function (a, b) {
      return Date.parse(b.resolved_at || b.return_at || 0) - Date.parse(a.resolved_at || a.return_at || 0);
    });
    latest = own[0] || null;
    if (!latest) return;
    var key = String(latest.id);
    if (seenExpeditionResults[key]) return;
    seenExpeditionResults[key] = true;
    var result = latest.result || {};
    pvpResult = {
      ok: !result.error && !!result.win,
      win: !!result.win,
      text: String(result.text || (result.win ? "Victoria" : "La marcha regresó sin botín.")),
    };
    refreshOwnProfile();
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

  function castleOf(regionId) {
    var found = null;
    world.castles.forEach(function (castle) {
      if (String(castle.region) === String(regionId)) found = castle;
    });
    return found;
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

  function regionHops(fromId, toId) {
    if (fromId == null || toId == null || fromId === "" || toId === "") return 0;
    var from = Number(fromId);
    var to = Number(toId);
    if (!isFinite(from) || !isFinite(to)) return 0;
    if (from === to) return 0;
    if (from < 1 || from > 20 || to < 1 || to > 20) return 99;
    return Math.abs(((from - 1) % 5) - ((to - 1) % 5)) +
      Math.abs(Math.floor((from - 1) / 5) - Math.floor((to - 1) / 5));
  }

  function invasionInfo(regionId) {
    var hops = session && session.region != null ? regionHops(session.region, regionId) : 0;
    var valid = hops > 0 && hops < 99;
    var cost = valid ? INVASION_FOOD * hops : 0;
    var mult = valid ? INVASION_FATIGUE : 1;
    var poor = cost > 0 && (!state || !state.res || Number(state.res.comida) < cost);
    return { hops: hops, cost: cost, mult: mult, far: hops >= 99, poor: poor };
  }

  function invasionLines(inv) {
    var lines = "";
    if (inv.hops > 0 && inv.hops < 99) {
      lines += '<span class="npc-meta">Desplazamiento: <b>' + num(inv.cost) + ' comida</b> · fatiga <b>-' +
        Math.round((1 - inv.mult) * 100) + '% poder</b></span>';
    }
    if (inv.poor) {
      lines += '<span class="pvp-warn">Necesitas ' + num(inv.cost) + ' de comida para invadir.</span>';
    }
    return lines;
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

  function roadDistanceSq(a, b) {
    var dx = (Number(a.x) - Number(b.x)) * MAP_W;
    var dy = (Number(a.y) - Number(b.y)) * MAP_H;
    return dx * dx + dy * dy;
  }

  function roadTour(points) {
    var n = points.length;
    if (n <= 2) return points.slice();
    var pool = points.slice();
    var start = 0;
    for (var i = 1; i < pool.length; i++) {
      if (pool[i].y < pool[start].y - 1e-9 ||
          (Math.abs(pool[i].y - pool[start].y) <= 1e-9 && pool[i].x < pool[start].x)) {
        start = i;
      }
    }
    var tour = [pool.splice(start, 1)[0]];
    while (pool.length) {
      var last = tour[tour.length - 1];
      var pick = 0;
      var best = Infinity;
      for (var j = 0; j < pool.length; j++) {
        var dist = roadDistanceSq(last, pool[j]);
        if (dist < best - 1e-9 ||
            (Math.abs(dist - best) <= 1e-9 && (pool[j].x < pool[pick].x ||
              (pool[j].x === pool[pick].x && pool[j].y < pool[pick].y)))) {
          best = dist;
          pick = j;
        }
      }
      tour.push(pool.splice(pick, 1)[0]);
    }

    var improved = true;
    var guard = 0;
    while (improved && guard++ < 30) {
      improved = false;
      for (var a = 0; a < n - 1; a++) {
        for (var b = a + 2; b < n; b++) {
          if (a === 0 && b === n - 1) continue;
          var before = roadDistanceSq(tour[a], tour[a + 1]) +
            roadDistanceSq(tour[b], tour[(b + 1) % n]);
          var after = roadDistanceSq(tour[a], tour[b]) +
            roadDistanceSq(tour[a + 1], tour[(b + 1) % n]);
          if (after < before - 1e-9) {
            var segment = tour.slice(a + 1, b + 1).reverse();
            for (var k = 0; k < segment.length; k++) tour[a + 1 + k] = segment[k];
            improved = true;
          }
        }
      }
    }
    return tour;
  }

  function roadLoops(points) {
    var n = points.length;
    if (n < 3) return [];
    var k = n >= 20 ? 3 : n >= 10 ? 2 : 1;
    if (k === 1) return [roadTour(points)];

    var cx = 0;
    var cy = 0;
    points.forEach(function (point) {
      cx += point.x;
      cy += point.y;
    });
    cx /= n;
    cy /= n;
    var ordered = points.map(function (point) {
      return { point: point, angle: Math.atan2(point.y - cy, point.x - cx) };
    }).sort(function (a, b) {
      return a.angle - b.angle ||
        a.point.x - b.point.x ||
        a.point.y - b.point.y;
    });
    var cut = 0;
    var widest = -1;
    for (var i = 0; i < n; i++) {
      var gap = ordered[(i + 1) % n].angle - ordered[i].angle;
      if (i === n - 1) gap += Math.PI * 2;
      if (gap > widest + 1e-9) {
        widest = gap;
        cut = (i + 1) % n;
      }
    }
    var rotated = ordered.slice(cut).concat(ordered.slice(0, cut)).map(function (item) {
      return item.point;
    });
    var loops = [];
    var base = Math.floor(n / k);
    var extra = n % k;
    var index = 0;
    for (var group = 0; group < k; group++) {
      var size = base + (group < extra ? 1 : 0);
      var chunk = rotated.slice(index, index + size);
      index += size;
      if (chunk.length >= 3) loops.push(roadTour(chunk));
    }
    return loops;
  }

  function roadPointKey(point) {
    if (point && point.key) return String(point.key);
    return "at:" + Number(point.x).toFixed(5) + ":" + Number(point.y).toFixed(5);
  }

  function roadPairKey(prefix, a, b) {
    var ka = roadPointKey(a);
    var kb = roadPointKey(b);
    return prefix + (ka < kb ? ka + "|" + kb : kb + "|" + ka);
  }

  function roadEdgeKey(a, b) {
    return roadPairKey("e:", a, b);
  }

  function roadLinkKey(a, b) {
    return roadPairKey("x:", a, b);
  }

  function roadStoredT(from, to, t) {
    var value = clamp(Number(t), 0.12, 0.88);
    return roadPointKey(from) > roadPointKey(to) ? 1 - value : value;
  }

  function roadBendAt(bends, key, from, to) {
    var bend = bends && bends[key];
    if (!bend) return null;
    var x = Number(bend.x);
    var y = Number(bend.y);
    var t = Number(bend.t);
    if (!isFinite(x) || !isFinite(y)) return null;
    if (!isFinite(t)) t = 0.5;
    if (roadPointKey(from) > roadPointKey(to)) t = 1 - t;
    return { t: clamp(t, 0.1, 0.9), x: x, y: y };
  }

  function roadControls(points, index) {
    var n = points.length;
    var p0 = points[(index - 1 + n) % n];
    var p1 = points[index];
    var p2 = points[(index + 1) % n];
    var p3 = points[(index + 2) % n];
    return {
      p1: p1,
      p2: p2,
      c1: {
        x: clamp(p1.x + (p2.x - p0.x) / 6, 0, 1),
        y: clamp(p1.y + (p2.y - p0.y) / 6, 0, 1),
      },
      c2: {
        x: clamp(p2.x - (p3.x - p1.x) / 6, 0, 1),
        y: clamp(p2.y - (p3.y - p1.y) / 6, 0, 1),
      },
    };
  }

  function roadApplyBend(a, c1, c2, b, bend) {
    if (!bend) return { c1: c1, c2: c2 };
    var t = bend.t;
    var m = 1 - t;
    var bx = m * m * m * a.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * b.x;
    var by = m * m * m * a.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * b.y;
    var weight = 3 * m * t;
    if (weight < 1e-6) return { c1: c1, c2: c2 };
    var dx = (bend.x - bx) / weight;
    var dy = (bend.y - by) / weight;
    return {
      c1: { x: clamp(c1.x + dx, 0, 1), y: clamp(c1.y + dy, 0, 1) },
      c2: { x: clamp(c2.x + dx, 0, 1), y: clamp(c2.y + dy, 0, 1) },
    };
  }

  function roadCurvePoint(segment, t) {
    var m = 1 - t;
    return {
      x: m * m * m * segment.a.x + 3 * m * m * t * segment.c1.x +
        3 * m * t * t * segment.c2.x + t * t * t * segment.b.x,
      y: m * m * m * segment.a.y + 3 * m * m * t * segment.c1.y +
        3 * m * t * t * segment.c2.y + t * t * t * segment.b.y,
    };
  }

  function roadSegment(a, c1, c2, b, key, bend) {
    var controls = roadApplyBend(a, c1, c2, b, bend);
    var segment = { a: a, b: b, c1: controls.c1, c2: controls.c2, key: key };
    segment.mid = roadCurvePoint(segment, 0.5);
    segment.d =
      "M" + (a.x * 100).toFixed(3) + " " + (a.y * 100).toFixed(3) +
      " C" + (segment.c1.x * 100).toFixed(3) + " " + (segment.c1.y * 100).toFixed(3) +
      " " + (segment.c2.x * 100).toFixed(3) + " " + (segment.c2.y * 100).toFixed(3) +
      " " + (b.x * 100).toFixed(3) + " " + (b.y * 100).toFixed(3);
    return segment;
  }

  function roadLoopGeometry(points, bends) {
    var parts = [];
    var segments = [];
    var mids = [];
    for (var i = 0; i < points.length; i++) {
      var q = roadControls(points, i);
      var key = roadEdgeKey(q.p1, q.p2);
      var segment = roadSegment(q.p1, q.c1, q.c2, q.p2, key, roadBendAt(bends, key, q.p1, q.p2));
      segments.push(segment);
      parts.push(segment.d.slice(segment.d.indexOf("C")));
      mids.push({ x: segment.mid.x, y: segment.mid.y, key: key });
    }
    return {
      d: "M" + (points[0].x * 100).toFixed(3) + " " + (points[0].y * 100).toFixed(3) +
        " " + parts.join(" ") + " Z",
      mids: mids,
      segments: segments,
    };
  }

  function roadLinkGeometry(a, b, seed, bends) {
    var ax = a.x * MAP_W;
    var ay = a.y * MAP_H;
    var bx = b.x * MAP_W;
    var by = b.y * MAP_H;
    var dx = bx - ax;
    var dy = by - ay;
    var len = Math.hypot(dx, dy);
    if (len < 1) return null;
    var nx = -dy / len;
    var ny = dx / len;
    var hashed = Math.sin((seed + 1) * 12.9898) * 43758.5453;
    var sign = hashed - Math.floor(hashed) >= 0.5 ? 1 : -1;
    var bend = Math.min(130, Math.max(12, len * 0.14)) * sign;
    var cx = clamp((ax + bx) / 2 + nx * bend, 0, MAP_W);
    var cy = clamp((ay + by) / 2 + ny * bend, 0, MAP_H);
    var qx = cx / MAP_W;
    var qy = cy / MAP_H;
    var key = roadLinkKey(a, b);
    var segment = roadSegment(
      a,
      { x: a.x + (qx - a.x) * 2 / 3, y: a.y + (qy - a.y) * 2 / 3 },
      { x: b.x + (qx - b.x) * 2 / 3, y: b.y + (qy - b.y) * 2 / 3 },
      b,
      key,
      roadBendAt(bends, key, a, b)
    );
    return { d: segment.d, segments: [segment], mid: segment.mid };
  }

  function roadLinkPairs(loops, geometries) {
    var links = [];
    loops.forEach(function (loop, loopIndex) {
      var n = loop.length;
      var count = Math.min(3, Math.floor(n / 6));
      var used = {};
      for (var c = 0; c < count; c++) {
        var best = null;
        for (var i = 0; i < n; i++) {
          if (used[i]) continue;
          for (var j = i + 2; j < n; j++) {
            if (used[j]) continue;
            if (i === 0 && j === n - 1) continue;
            var separation = Math.min(j - i, n - (j - i));
            if (separation < 2) continue;
            var dist = roadDistanceSq(geometries[loopIndex].mids[i], geometries[loopIndex].mids[j]);
            if (!best || dist > best.dist + 1e-9 ||
                (Math.abs(dist - best.dist) <= 1e-9 &&
                  (i < best.i || (i === best.i && j < best.j)))) {
              best = { i: i, j: j, dist: dist };
            }
          }
        }
        if (best) {
          used[best.i] = true;
          used[best.j] = true;
          links.push({
            a: loop[best.i],
            b: loop[best.j],
            seed: loopIndex * 31 + c * 7 + 1,
          });
        }
      }
    });

    if (loops.length > 1) {
      var pairs = [];
      for (var i = 0; i < loops.length; i++) {
        for (var j = i + 1; j < loops.length; j++) {
          var best = null;
          for (var a = 0; a < loops[i].length; a++) {
            for (var b = 0; b < loops[j].length; b++) {
              var dist = roadDistanceSq(geometries[i].mids[a], geometries[j].mids[b]);
              if (!best || dist < best.dist - 1e-9) {
                best = { a: a, b: b, dist: dist };
              }
            }
          }
          if (best) pairs.push({ from: i, to: j, a: best.a, b: best.b, dist: best.dist });
        }
      }
      pairs.sort(function (a, b) {
        return a.dist - b.dist || a.from - b.from || a.to - b.to;
      });
      var parent = loops.map(function (loop, index) { return index; });
      function findRoot(x) {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      }
      pairs.forEach(function (pair) {
        var rootA = findRoot(pair.from);
        var rootB = findRoot(pair.to);
        if (rootA === rootB) return;
        parent[rootB] = rootA;
        links.push({
          a: loops[pair.from][pair.a],
          b: loops[pair.to][pair.b],
          seed: 100 + pair.from * 17 + pair.to * 13,
        });
      });
    }
    return links;
  }

  function roadNetwork(points, bends, extraLinks) {
    if (!points || !points.length) return { svg: "", segments: [] };
    var loops = points.length >= 3 ? roadLoops(points) : [];
    var geometries = loops.map(function (loop) {
      return roadLoopGeometry(loop, bends);
    });
    var casings = [];
    var surfaces = [];
    var hits = [];
    var segments = [];

    loops.forEach(function (loop, index) {
      var geometry = geometries[index];
      casings.push('<path class="road-casing" d="' + geometry.d + '"></path>');
      surfaces.push(
        '<path class="road" data-road-loop="' + index + '" d="' + geometry.d + '"></path>'
      );
      geometry.segments.forEach(function (segment) {
        segments.push(segment);
        hits.push('<path class="road-hit" data-road-key="' + escapeHtml(segment.key) + '" d="' + segment.d + '"></path>');
      });
    });

    var links = roadLinkPairs(loops, geometries).concat(extraLinks || []);
    links.forEach(function (link) {
      var geometry = roadLinkGeometry(link.a, link.b, link.seed, bends);
      if (!geometry) return;
      casings.push('<path class="road-casing" d="' + geometry.d + '"></path>');
      surfaces.push('<path class="road road-link" d="' + geometry.d + '"></path>');
      geometry.segments.forEach(function (segment) {
        segments.push(segment);
        hits.push('<path class="road-hit" data-road-key="' + escapeHtml(segment.key) + '" d="' + segment.d + '"></path>');
      });
    });

    return {
      segments: segments,
      svg:
        '<svg class="road-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
          casings.join("") + surfaces.join("") + hits.join("") +
        "</svg>",
    };
  }

  function automaticRoadsSvg(points, bends) {
    return roadNetwork(points, bends).svg;
  }

  function regionPortal(region) {
    if (!region) return null;
    var x = Number(region.world_x);
    var y = Number(region.world_y);
    if (!isFinite(x) || !isFinite(y)) {
      var raw = region.bbox || { x0: 0, y0: 0, x1: 1, y1: 1 };
      var bw = Number(raw.x1) - Number(raw.x0);
      var bh = Number(raw.y1) - Number(raw.y0);
      x = (Number(raw.x0) + Number(raw.x1)) / 2 - bw * 0.22;
      y = (Number(raw.y0) + Number(raw.y1)) / 2 + bh * 0.18;
    }
    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      key: "m:" + region.id,
      region: region.id,
    };
  }

  function worldRoadNetwork() {
    var regions = {};
    world.regions.forEach(function (region) {
      regions[String(region.id)] = region;
    });
    var casings = [];
    var surfaces = [];
    world.regions.forEach(function (region) {
      var col = (Number(region.id) - 1) % 5;
      var row = Math.floor((Number(region.id) - 1) / 5);
      var from = regionPortal(region);
      if (!from) return;
      var neighbours = [];
      if (col < 4) neighbours.push(Number(region.id) + 1);
      if (row < 3) neighbours.push(Number(region.id) + 5);
      neighbours.forEach(function (id) {
        var other = regions[String(id)];
        if (!other) return;
        var to = regionPortal(other);
        if (!to) return;
        var geometry = roadLinkGeometry(from, to, Number(region.id) * 19 + id * 7, {});
        if (!geometry) return;
        casings.push('<path class="world-road-casing" d="' + geometry.d + '"></path>');
        surfaces.push('<path class="world-road" d="' + geometry.d + '"></path>');
      });
    });
    if (!surfaces.length) return "";
    return (
      '<svg class="world-road-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
        casings.join("") + surfaces.join("") +
      "</svg>"
    );
  }

  function mundoMarker(region) {
    var portal = regionPortal(region);
    if (!portal) return "";
    return (
      '<div class="mundo-marker" data-mx="' + portal.x.toFixed(5) + '" data-my="' + portal.y.toFixed(5) + '" ' +
        'title="Mundo de ' + escapeHtml(region.name) + '" ' +
        'style="left:' + (portal.x * 100).toFixed(2) + "%;top:" + (portal.y * 100).toFixed(2) + '%">' +
        '<span class="mundo-sigil"></span><span class="mlabel">Mundo</span>' +
      "</div>"
    );
  }

  function regionRouteIds(from, to) {
    var route = [];
    var fromId = Number(from);
    var toId = Number(to);
    if (!isFinite(fromId) || !isFinite(toId)) return route;
    route.push(fromId);
    var col = (fromId - 1) % 5;
    var row = Math.floor((fromId - 1) / 5);
    var targetCol = (toId - 1) % 5;
    var targetRow = Math.floor((toId - 1) / 5);
    var guard = 0;
    while ((col !== targetCol || row !== targetRow) && guard++ < 50) {
      if (col !== targetCol) col += targetCol > col ? 1 : -1;
      else row += targetRow > row ? 1 : -1;
      route.push(row * 5 + col + 1);
    }
    return route;
  }

  function expeditionPointKey(expedition, side) {
    if (!expedition) return "";
    if (side === "origin") {
      var own = session && String(expedition.attacker) === String(session.userId);
      return (own ? "s:" : "p:") + expedition.attacker;
    }
    if (expedition.target_type === "npc") return "n:" + expedition.target_id;
    if (expedition.target_type === "castle") return "c:" + expedition.target_id;
    return "p:" + expedition.target_id;
  }

  function regionRoadPoints(region, extras, includePortal) {
    var points = [];
    if (!region) return points;
    var selfId = session && session.userId ? String(session.userId) : "";
    world.players.forEach(function (player) {
      if (String(player.id) === selfId) return;
      if (String(player.region) !== String(region.id)) return;
      if (typeof player.x !== "number" || typeof player.y !== "number") return;
      points.push({ x: Number(player.x), y: Number(player.y), key: "p:" + player.id });
    });
    world.npcs.forEach(function (npc) {
      if (String(npc.region) !== String(region.id)) return;
      if (typeof npc.x !== "number" || typeof npc.y !== "number") return;
      points.push({ x: Number(npc.x), y: Number(npc.y), key: "n:" + npc.id });
    });
    var castle = castleOf(region.id);
    if (castle && typeof castle.x === "number" && typeof castle.y === "number") {
      points.push({ x: Number(castle.x), y: Number(castle.y), key: "c:" + castle.id });
    }
    var mePos = session && session.village ? session.village : null;
    if (mePos && (String(session.region) === String(region.id) || pointInRegion(region, mePos))) {
      points.push({ x: Number(mePos.x), y: Number(mePos.y), key: "s:" + selfId });
    }
    var portal = includePortal === false ? null : regionPortal(region);
    if (portal) points.push({ x: portal.x, y: portal.y, key: portal.key });
    (extras || []).forEach(function (extra) {
      if (!extra) return;
      var key = roadPointKey(extra);
      var replaced = false;
      for (var i = 0; i < points.length; i++) {
        if (roadPointKey(points[i]) === key) {
          points[i] = extra;
          replaced = true;
          break;
        }
      }
      if (!replaced) points.push(extra);
    });
    return points;
  }

  function regionCityPoints(region, extras) {
    return regionRoadPoints(region, extras, false);
  }

  function nearestRoadPoint(points, target) {
    var best = null;
    var bestDist = Infinity;
    (points || []).forEach(function (point) {
      if (!point || !isFinite(Number(point.x)) || !isFinite(Number(point.y))) return;
      var dist = roadDistanceSq(point, target);
      var key = roadPointKey(point);
      if (dist < bestDist - 1e-9 ||
          (Math.abs(dist - bestDist) <= 1e-9 && best && key < roadPointKey(best))) {
        best = point;
        bestDist = dist;
      }
    });
    return best;
  }

  function regionPortalAnchor(region, extras) {
    var portal = regionPortal(region);
    if (!portal) return null;
    return nearestRoadPoint(regionCityPoints(region, extras), portal);
  }

  function regionRoadSeed(regionId) {
    return Number(regionId) * 31 + 7;
  }

  function regionRoadLinks(region, points) {
    var portal = regionPortal(region);
    if (!portal || !points || !points.length) return [];
    if (points.length < 3) {
      return points.map(function (point, index) {
        return { a: point, b: portal, seed: regionRoadSeed(region.id) + index };
      });
    }
    var anchor = nearestRoadPoint(points, portal);
    if (!anchor) return [];
    return [{ a: anchor, b: portal, seed: regionRoadSeed(region.id) }];
  }

  function appendRoadSegment(out, segment, reverse) {
    if (!segment) return;
    var steps = 18;
    for (var i = 0; i <= steps; i++) {
      var t = reverse ? 1 - i / steps : i / steps;
      var point = roadCurvePoint(segment, t);
      if (out.length) {
        var last = out[out.length - 1];
        if (Math.abs(last.x - point.x) < 1e-7 && Math.abs(last.y - point.y) < 1e-7) continue;
      }
      out.push({ x: point.x, y: point.y });
    }
  }

  function appendPolyline(out, points) {
    (points || []).forEach(function (point) {
      if (!point || !isFinite(Number(point.x)) || !isFinite(Number(point.y))) return;
      var next = { x: Number(point.x), y: Number(point.y) };
      if (out.length) {
        var last = out[out.length - 1];
        if (Math.abs(last.x - next.x) < 1e-7 && Math.abs(last.y - next.y) < 1e-7) return;
      }
      out.push(next);
    });
  }

  function roadGraphPath(regionId, startKey, endKey, extras) {
    var region = regionById(regionId);
    if (!region || !startKey || !endKey || startKey === endKey) return null;
    var points = regionCityPoints(region, extras);
    var net = roadNetwork(points, roadBendsForRegion(regionId), regionRoadLinks(region, points));
    if (!net.segments.length) return null;

    var edges = {};
    net.segments.forEach(function (segment) {
      var a = roadPointKey(segment.a);
      var b = roadPointKey(segment.b);
      if (!edges[a]) edges[a] = [];
      if (!edges[b]) edges[b] = [];
      var cost = Math.hypot(
        (segment.b.x - segment.a.x) * MAP_W,
        (segment.b.y - segment.a.y) * MAP_H
      );
      edges[a].push({ to: b, segment: segment, reverse: false, cost: cost });
      edges[b].push({ to: a, segment: segment, reverse: true, cost: cost });
    });
    if (!edges[startKey] || !edges[endKey]) return null;

    var dist = {};
    var prev = {};
    var used = {};
    dist[startKey] = 0;
    for (;;) {
      var current = null;
      var best = Infinity;
      for (var key in dist) {
        if (used[key] || dist[key] >= best) continue;
        best = dist[key];
        current = key;
      }
      if (!current || current === endKey) break;
      used[current] = true;
      edges[current].forEach(function (edge) {
        if (used[edge.to]) return;
        var next = best + edge.cost;
        if (dist[edge.to] === undefined || next < dist[edge.to]) {
          dist[edge.to] = next;
          prev[edge.to] = { from: current, segment: edge.segment, reverse: edge.reverse };
        }
      });
    }
    if (dist[endKey] === undefined) return null;

    var chain = [];
    var at = endKey;
    while (at !== startKey) {
      var step = prev[at];
      if (!step) return null;
      chain.push(step);
      at = step.from;
    }
    chain.reverse();
    var out = [];
    chain.forEach(function (step) {
      appendRoadSegment(out, step.segment, step.reverse);
    });
    return out.length ? out : null;
  }

  function worldRoadPath(fromId, toId) {
    var low = Math.min(Number(fromId), Number(toId));
    var high = Math.max(Number(fromId), Number(toId));
    var lowPortal = regionPortal(regionById(low));
    var highPortal = regionPortal(regionById(high));
    if (!lowPortal || !highPortal) return null;
    var geometry = roadLinkGeometry(lowPortal, highPortal, low * 19 + high * 7, {});
    if (!geometry) return null;
    var out = [];
    geometry.segments.forEach(function (segment) {
      appendRoadSegment(out, segment, false);
    });
    if (Number(fromId) > Number(toId)) out.reverse();
    return out.length ? out : null;
  }

  function regionSpurGeometry(region, anchor) {
    var portal = regionPortal(region);
    if (!portal || !anchor) return null;
    return roadLinkGeometry(
      anchor,
      portal,
      regionRoadSeed(region.id),
      roadBendsForRegion(region.id)
    );
  }

  function appendRoadGeometry(out, geometry, reverse) {
    if (!geometry || !geometry.segments || !geometry.segments.length) return false;
    if (reverse) {
      for (var i = geometry.segments.length - 1; i >= 0; i--) {
        appendRoadSegment(out, geometry.segments[i], true);
      }
    } else {
      geometry.segments.forEach(function (segment) {
        appendRoadSegment(out, segment, false);
      });
    }
    return true;
  }

  function expeditionRoadPoints(expedition) {
    var cacheKey = expedition && expedition.id ? String(expedition.id) : "";
    if (cacheKey && expeditionRoadCache[cacheKey]) return expeditionRoadCache[cacheKey];
    var fallback = expeditionPathPoints(expedition);
    var fromRegion = Number(expedition && expedition.from_region);
    var toRegion = Number(expedition && expedition.to_region);
    if (!isFinite(fromRegion) || !isFinite(toRegion)) return fallback;
    var fromRegionObj = regionById(fromRegion);
    var toRegionObj = regionById(toRegion);
    if (!fromRegionObj || !toRegionObj) return fallback;
    var origin = {
      x: Number(expedition.from_x),
      y: Number(expedition.from_y),
      key: expeditionPointKey(expedition, "origin"),
    };
    var target = {
      x: Number(expedition.to_x),
      y: Number(expedition.to_y),
      key: expeditionPointKey(expedition, "target"),
    };
    if (!isFinite(origin.x) || !isFinite(origin.y) || !isFinite(target.x) || !isFinite(target.y)) {
      return fallback;
    }

    if (fromRegion === toRegion) {
      var local = roadGraphPath(fromRegion, origin.key, target.key, [origin, target]);
      if (local && local.length >= 2) {
        if (cacheKey) expeditionRoadCache[cacheKey] = local;
        return local;
      }
      var localCurve = [];
      if (!appendRoadGeometry(localCurve, roadLinkGeometry(
        origin, target, regionRoadSeed(fromRegion) + 3, roadBendsForRegion(fromRegion)
      ), false)) return fallback;
      if (cacheKey) expeditionRoadCache[cacheKey] = localCurve;
      return localCurve;
    }

    var route = regionRouteIds(fromRegion, toRegion);
    var fromPortal = regionPortal(fromRegionObj);
    var toPortal = regionPortal(toRegionObj);
    if (!route.length || !fromPortal || !toPortal) return fallback;

    var out = [];
    var head = roadGraphPath(fromRegion, origin.key, fromPortal.key, [origin]);
    if (head && head.length >= 2) {
      appendPolyline(out, head);
    } else if (!appendRoadGeometry(out, roadLinkGeometry(
      origin, fromPortal, regionRoadSeed(fromRegion) + 5, roadBendsForRegion(fromRegion)
    ), false)) {
      return fallback;
    }
    for (var i = 0; i < route.length - 1; i++) {
      var link = worldRoadPath(route[i], route[i + 1]);
      if (!link) return fallback;
      appendPolyline(out, link);
    }
    var tail = roadGraphPath(toRegion, toPortal.key, target.key, [target]);
    if (tail && tail.length >= 2) {
      appendPolyline(out, tail);
    } else if (!appendRoadGeometry(out, roadLinkGeometry(
      toPortal, target, regionRoadSeed(toRegion) + 7, roadBendsForRegion(toRegion)
    ), false)) {
      return fallback;
    }
    if (out.length < 2) return fallback;
    if (cacheKey) expeditionRoadCache[cacheKey] = out;
    return out;
  }

  function expeditionPathPoints(expedition) {
    if (!expedition || !Array.isArray(expedition.path)) return [];
    return expedition.path.filter(function (point) {
      return point && isFinite(Number(point[0])) && isFinite(Number(point[1]));
    }).map(function (point) {
      return { x: Number(point[0]), y: Number(point[1]) };
    });
  }

  function expeditionPathD(points) {
    if (points.length < 2) return "";
    var out = "M" + (points[0].x * 100).toFixed(3) + " " + (points[0].y * 100).toFixed(3);
    for (var i = 1; i < points.length; i++) {
      out += " L" + (points[i].x * 100).toFixed(3) + " " + (points[i].y * 100).toFixed(3);
    }
    return out;
  }

  function expeditionRouteSvg(expedition) {
    var points = expeditionRoadPoints(expedition);
    if (points.length < 2) return "";
    var d = expeditionPathD(points);
    var own = session && String(expedition.attacker) === String(session.userId);
    var cls = "march-route" + (own ? " own" : "") + (expedition.status === "returning" ? " returning" : "");
    return (
      '<svg class="march-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
        '<path class="march-route-casing" d="' + d + '"></path>' +
        '<path class="' + cls + '" d="' + d + '"></path>' +
      "</svg>"
    );
  }

  function marchProgress(expedition, nowMs) {
    var at = isFinite(nowMs) ? nowMs : Date.now();
    var depart = Date.parse(expedition.depart_at);
    var arrive = Date.parse(expedition.arrive_at);
    var back = Date.parse(expedition.return_at);
    if (isFinite(depart) && isFinite(arrive) && at < arrive) {
      return clamp((at - depart) / Math.max(1, arrive - depart), 0, 1);
    }
    if (isFinite(arrive) && isFinite(back) && at < back) {
      return 1 - clamp((at - arrive) / Math.max(1, back - arrive), 0, 1);
    }
    return 1;
  }

  function expeditionMarkers(expedition) {
    var points = expeditionRoadPoints(expedition);
    if (!points.length) return "";
    var first = marchPointAt(points, marchProgress(expedition)) || points[0];
    var own = session && String(expedition.attacker) === String(session.userId);
    var race = expedition.race && RACES[expedition.race] ? expedition.race : "";
    return (
      '<div class="march-marker ' + race + (own ? " own" : "") + '" data-march-id="' +
        escapeHtml(String(expedition.id)) + '" data-mx="' + first.x.toFixed(5) + '" data-my="' +
        first.y.toFixed(5) + '" style="transform:translate(' + (first.x * MAP_W).toFixed(1) +
        "px," + (first.y * MAP_H).toFixed(1) + 'px) translate(-50%,-50%) scale(var(--inv,1))">' +
        '<span class="march-pin" aria-hidden="true">\u2694\ufe0f</span>' +
        '<span class="march-label">' + escapeHtml(expedition.attacker_name || "Marcha") +
          " · " + escapeHtml(expedition.target_name || "objetivo") + "</span>" +
      "</div>"
    );
  }

  function visibleExpeditions(open) {
    return (world.expeditions || []).filter(function (expedition) {
      if (expedition.status !== "outbound" && expedition.status !== "returning") return false;
      if (!open) return true;
      return String(expedition.from_region) === String(open.id) ||
        String(expedition.to_region) === String(open.id) ||
        (expedition.path || []).some(function (point) {
          return pointInRegion(open, { x: Number(point[0]), y: Number(point[1]) });
        });
    });
  }

  function expeditionOverlay(open) {
    var list = visibleExpeditions(open);
    if (!list.length) return "";
    return list.map(expeditionRouteSvg).join("") + list.map(expeditionMarkers).join("");
  }

  function marchPointAt(points, fraction) {
    if (!points.length) return null;
    if (points.length === 1) return { x: points[0].x, y: points[0].y };
    var lengths = [];
    var total = 0;
    for (var i = 0; i < points.length - 1; i++) {
      var dx = (points[i + 1].x - points[i].x) * MAP_W;
      var dy = (points[i + 1].y - points[i].y) * MAP_H;
      var len = Math.hypot(dx, dy);
      lengths.push(len);
      total += len;
    }
    if (total <= 0) return { x: points[0].x, y: points[0].y };
    var target = clamp(fraction, 0, 1) * total;
    for (var j = 0; j < lengths.length; j++) {
      if (target <= lengths[j] || j === lengths.length - 1) {
        var t = lengths[j] > 0 ? clamp(target / lengths[j], 0, 1) : 0;
        return {
          x: points[j].x + (points[j + 1].x - points[j].x) * t,
          y: points[j].y + (points[j + 1].y - points[j].y) * t,
        };
      }
      target -= lengths[j];
    }
    return { x: points[points.length - 1].x, y: points[points.length - 1].y };
  }

  function stopMarchAnimation() {
    if (marchTimer) clearInterval(marchTimer);
    if (marchSyncTimer) clearTimeout(marchSyncTimer);
    marchTimer = null;
    marchSyncTimer = null;
  }

  function startMarchAnimation() {
    stopMarchAnimation();
    if (!mapStageEl || view !== "mapa") return;
    var list = (world.expeditions || []).filter(function (expedition) {
      return expedition.status === "outbound" || expedition.status === "returning";
    });
    var nextEvent = null;
    var nowMs = Date.now();
    list.forEach(function (expedition) {
      var arrive = Date.parse(expedition.arrive_at);
      var back = Date.parse(expedition.return_at);
      [arrive, back].forEach(function (at) {
        if (isFinite(at) && at > nowMs && (!nextEvent || at < nextEvent)) nextEvent = at;
      });
    });
    if (nextEvent) {
      marchSyncTimer = setTimeout(function () {
        syncWorld().then(function () {
          if (view === "mapa") renderGame();
        });
      }, Math.max(800, nextEvent - nowMs + 900));
    }
    if (!list.length) return;

    function tick() {
      if (!mapStageEl || !mapStageEl.querySelectorAll) return;
      var ownMarch = activeExpedition();
      var countdown = document.getElementById("march-countdown");
      if (ownMarch && countdown) {
        countdown.textContent = num(secondsUntil(
          ownMarch.status === "outbound" ? ownMarch.arrive_at : ownMarch.return_at
        ));
      }
      var nodes = mapStageEl.querySelectorAll(".march-marker");
      var now = Date.now();
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var id = node.getAttribute("data-march-id");
        var expedition = null;
        list.forEach(function (candidate) {
          if (!expedition && String(candidate.id) === String(id)) expedition = candidate;
        });
        if (!expedition) {
          if (node.style) node.style.display = "none";
          continue;
        }
        var backAt = Date.parse(expedition.return_at);
        if (isFinite(backAt) && now >= backAt) {
          if (node.style) node.style.display = "none";
          continue;
        }
        var point = marchPointAt(expeditionRoadPoints(expedition), marchProgress(expedition, now));
        if (!point) continue;
        if (node.style) {
          node.style.transform = "translate(" + (point.x * MAP_W).toFixed(1) + "px," +
            (point.y * MAP_H).toFixed(1) + "px) translate(-50%,-50%) scale(var(--inv,1))";
        }
        node.setAttribute("data-mx", point.x.toFixed(5));
        node.setAttribute("data-my", point.y.toFixed(5));
        if (node.classList) {
          if (expedition.status === "returning") node.classList.add("returning");
          else node.classList.remove("returning");
        }
      }
    }
    marchTimer = setInterval(tick, 90);
    tick();
  }

  function roadBendsForRegion(regionId) {
    var bends = {};
    (world.roadBends || []).forEach(function (bend) {
      if (String(bend.region) === String(regionId)) {
        bends[String(bend.key)] = {
          t: Number(bend.t),
          x: Number(bend.x),
          y: Number(bend.y),
        };
      }
    });
    return bends;
  }

  function roadNearestT(segment, point) {
    var best = 0.5;
    var bestDist = Infinity;
    for (var i = 0; i <= 24; i++) {
      var t = i / 24;
      var dist = roadDistanceSq(roadCurvePoint(segment, t), point);
      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    }
    return clamp(best, 0.12, 0.88);
  }

  function copyRoadBends(bends) {
    var copy = {};
    Object.keys(bends || {}).forEach(function (key) {
      copy[key] = { t: bends[key].t, x: bends[key].x, y: bends[key].y };
    });
    return copy;
  }

  function replaceRoadSvg(svg) {
    if (!mapStageEl || !mapStageEl.querySelector) return;
    var current = mapStageEl.querySelector(".road-svg");
    if (current) current.outerHTML = svg;
  }

  function previewRoadDrag(road) {
    if (!currentRoadPoints || !road || !road.target) return;
    var bends = copyRoadBends(currentRoadBends);
    bends[road.key] = { t: road.t, x: road.target.x, y: road.target.y };
    replaceRoadSvg(roadNetwork(currentRoadPoints, bends, currentRoadLinks).svg);
  }

  function mapImageUrl(region) {
    if (region) {
      if (region.map_image) return region.map_image;
      if (region.image) return region.image;
      if (region.background) return region.background;
      if (world.settings && world.settings["map_region_" + region.id]) {
        return world.settings["map_region_" + region.id];
      }
      return "./assets/map.jpg";
    }
    return (world.settings && world.settings.map) || "./assets/map.jpg";
  }

  function saveRoadBend(regionId, key, t, x, y) {
    if (!isCloud() || !session.isAdmin) return Promise.resolve();
    pvpResult = null;
    if (String(regionId) === String(currentRoadRegionId)) {
      currentRoadBends[key] = { t: t, x: x, y: y };
    }
    return api("/rest/v1/rpc/admin_save_road_bend", {
      method: "POST",
      token: session.token,
      body: { p_region: Number(regionId), p_key: key, p_t: t, p_x: x, p_y: y },
    }).then(function (result) {
      if (!result.ok) {
        pvpResult = { ok: false, text: "No se pudo ajustar el camino: " + cloudErrorMessage(result) };
        renderGame();
        return;
      }
      return syncWorld().then(function () { renderGame(); });
    }).catch(function () {
      pvpResult = { ok: false, text: "No se pudo guardar el ajuste del camino." };
      renderGame();
    });
  }

  function clearRoadBends(regionId) {
    if (!isCloud() || !session.isAdmin) return Promise.resolve();
    pvpResult = null;
    return api("/rest/v1/rpc/admin_clear_road_bends", {
      method: "POST",
      token: session.token,
      body: { p_region: Number(regionId) },
    }).then(function (result) {
      if (!result.ok) {
        pvpResult = { ok: false, text: "No se pudieron restaurar los caminos: " + cloudErrorMessage(result) };
        renderGame();
        return;
      }
      return syncWorld().then(function () { renderGame(); });
    }).catch(function () {
      pvpResult = { ok: false, text: "No se pudieron restaurar los caminos." };
      renderGame();
    });
  }

  function adminAction(fn, body) {
    if (!isCloud() || !session.isAdmin) return Promise.resolve();
    return api("/rest/v1/rpc/" + fn, { method: "POST", token: session.token, body: body })
      .then(function (result) {
        if (!result.ok) {
          var adminError = String(cloudErrorMessage(result));
          if (adminError.indexOf("outside region") !== -1) {
            adminError = fn === "admin_move_castle"
              ? "El castillo debe quedar dentro de su propia zona."
              : fn === "admin_move_village"
                ? "La aldea debe quedar dentro de su propia zona."
                : "El NPC debe quedar dentro de su propia zona.";
          } else if (adminError.indexOf("castle not found") !== -1) {
            adminError = "Ese castillo ya no existe.";
          } else if (adminError.indexOf("village not found") !== -1) {
            adminError = "Esa aldea ya no existe.";
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
                : fn === "admin_set_movement_speed"
                  ? "Velocidad de movimientos actualizada."
                  : fn === "admin_grant_kb"
                  ? "KB entregadas al jugador."
                  : fn === "admin_set_region_image"
                    ? "Imagen de la zona actualizada."
                    : "Mapa actualizado.",
      };
        return syncWorld().then(function () {
          mapFocusedRegion = null;
          if (session && session.village && fn === "admin_move_village" &&
              body && String(body.target_id) === String(session.userId)) {
            session.village = {
              x: clamp(Number(body.nx), 0.005, 0.995),
              y: clamp(Number(body.ny), 0.005, 0.995),
            };
            writeJSON(SESSION_KEY, session);
          } else if (session && session.village && fn === "admin_move_region" &&
                     body && String(body.rid) === String(session.region) &&
                     result && result.data && result.data.dx != null) {
            session.village = {
              x: clamp(Number(session.village.x) + Number(result.data.dx), 0.005, 0.995),
              y: clamp(Number(session.village.y) + Number(result.data.dy), 0.005, 0.995),
            };
            writeJSON(SESSION_KEY, session);
          }
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
      "</div>" +
      '<div class="admin-maint"><b>Velocidad de movimientos</b>' +
        '<div class="admin-maint-state">Actual: x' + Number(world.moveSpeed || 1).toFixed(2) +
          ' · afecta a las marchas nuevas</div>' +
        '<div class="admin-speed-row">' +
          '<input id="move-speed-input" type="number" min="0.1" max="10" step="0.1" value="' +
            Number(world.moveSpeed || 1).toFixed(1) + '" />' +
          '<button class="btn" id="move-speed-save">Guardar velocidad</button>' +
        '</div>' +
        '<div class="admin-maint-error" id="move-speed-error"></div>' +
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

  function marketView() {
    var options = Object.keys(MARKET_ASSETS)
      .map(function (asset) {
        return '<option value="' + asset + '">' + MARKET_ASSETS[asset] + "</option>";
      })
      .join("");

    var rows = market.orders
      .filter(function (order) {
        return order.side === "sell";
      })
      .map(function (order) {
        var mine = !!order.mine;
        var total = Number(order.remaining) * Number(order.price);
        return (
          '<div class="market-order' + (mine ? " mine" : "") + '">' +
            '<span class="mo-tag sell">Venta</span>' +
            '<div class="mo-main"><b>' + num(order.remaining) + " " +
              escapeHtml(marketAssetName(order.asset)) + "</b>" +
              (Number(order.qty) !== Number(order.remaining)
                ? ' <span class="hint">de ' + num(order.qty) + "</span>"
                : "") +
              "<span>" + num(order.price) + " KB/u · total " + num(total) + " KB · " +
                (mine ? "tu oferta" : escapeHtml(String(order.name))) + "</span>" +
            "</div>" +
            '<div class="mo-actions">' +
              (mine
                ? '<button class="btn small" data-market-cancel="' + escapeHtml(String(order.id)) + '">Cancelar</button>'
                : '<button class="btn small" data-market-fill="' + escapeHtml(String(order.id)) +
                  '" data-market-left="' + escapeHtml(String(order.remaining)) + '"' +
                  (marketBusy ? " disabled" : "") + ">Comprar</button>") +
            "</div>" +
          "</div>"
        );
      })
      .join("");

    var msg = marketMsg
      ? '<div class="market-msg ' + (marketMsg.ok ? "ok" : "bad") + '">' + escapeHtml(marketMsg.text) + "</div>"
      : "";

    return (
      '<div class="panel market-page">' +
        '<div class="panel-head"><h2>Mercado</h2>' +
          '<span class="hint">Solo ofertas de venta · recursos y tropas por KB</span>' +
        "</div>" +
        '<div class="panel-body">' +
          '<div class="market-top">Tu KB: <b>' + num((session && session.kb) || 0) +
            "</b> · Ofertas activas: <b>" + market.orders.length + "</b></div>" +
          msg +
          '<form id="market-form" class="market-form">' +
            '<label>Bien<select id="market-asset">' + options + "</select></label>" +
            '<label>Cantidad<input id="market-qty" type="number" min="1" step="1" value="100" /></label>' +
            '<label>KB por unidad<input id="market-price" type="number" min="1" step="1" value="1" /></label>' +
            '<button class="btn-primary" type="submit"' + (marketBusy ? " disabled" : "") + ">" +
              (marketBusy ? "Publicando…" : "Publicar venta") +
            "</button>" +
          "</form>" +
          '<div class="market-note">Solo puedes publicar ofertas de venta: el bien queda en custodia ' +
            "hasta que alguien lo compre. Puedes cancelar cuando quieras y recuperas lo que quede.</div>" +
          '<div class="market-list">' +
            (market.error
              ? '<div class="market-msg bad">' + escapeHtml(market.error) + "</div>"
              : rows || '<div class="market-empty">' +
                (market.at ? "No hay ofertas activas. Publica la primera." : "Cargando mercado…") +
                "</div>") +
          "</div>" +
        "</div>" +
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
                      '" data-pass-name="' + escapeHtml(String(row.name)) + '">Clave</button>' +
                      '<button class="btn small" data-grant-kb="' + escapeHtml(String(row.id)) +
                      '" data-kb-name="' + escapeHtml(String(row.name)) + '">KB</button>'
                    : "") +
                  "<b>" + num(row.kb || 0) + " KB</b> · <b>" + num(row.wins || 0) + " V</b></div>"
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
    currentRoadNetwork = null;
    currentRoadPoints = null;
    currentRoadLinks = [];
    currentRoadBends = {};
    currentRoadRegionId = null;
    var power = armyPower(state);
    var pendingKey = marchTargetKey();
    var sendDraft = pendingKey ? ensureDraft(pendingKey) : null;
    var sendPower = sendDraft ? draftPower(sendDraft) : power;
    var sendTotal = sendDraft ? draftTotal(sendDraft) : armyCount(state);
    var myMarch = activeExpedition();
    var picker = sendDraft && !myMarch ? troopPicker(sendDraft) : "";
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
              openCount + "/" + world.regions.length + " zonas abiertas"
            : "Conectando con el mundo…")
      : "Conecta con Supabase para ver el mundo compartido";

    var mePos = session && session.village ? session.village : { x: 0.5, y: 0.5 };
    var myName = (session && session.username) || "Tu aldea";
    var meMarker = !(session && session.village) || (session && session.isAdmin) ? "" :
      '<div class="marker me" data-map-village="1" data-mx="' + mePos.x + '" data-my="' + mePos.y + '" ' +
        'title="Tu aldea" ' +
        'style="left:' + (mePos.x * 100).toFixed(2) + "%;top:" + (mePos.y * 100).toFixed(2) + '%">' +
        '<span class="mlabel">' + escapeHtml(myName) + '</span><span class="pin"></span>' +
      "</div>";

    var regionLocked = function (regionId) {
      var region = regionById(regionId);
      return !!(region && region.locked);
    };
    var visibleInZone = function (regionId) {
      return !regionLocked(regionId) || !!(session && session.isAdmin);
    };

    var zoneStyle = function (region, grow) {
      var bb = region.bbox || { x0: 0, y0: 0, x1: 1, y1: 1 };
      var g = typeof grow === "number" ? grow : 0;
      var x0 = Math.max(0, Number(bb.x0) - g);
      var y0 = Math.max(0, Number(bb.y0) - g);
      var x1 = Math.min(1, Number(bb.x1) + g);
      var y1 = Math.min(1, Number(bb.y1) + g);
      return "left:" + (x0 * 100).toFixed(3) + "%;top:" + (y0 * 100).toFixed(3) +
        "%;width:" + ((x1 - x0) * 100).toFixed(3) + "%;height:" + ((y1 - y0) * 100).toFixed(3) + "%";
    };
    var zoneOutlines = adminMode
      ? world.regions.map(function (region) {
          return '<div class="zone-outline" style="' + zoneStyle(region, 0.004) + '"></div>';
        }).join("")
      : "";
    var zoneLocks = world.regions.map(function (region) {
      if (!region.locked) return "";
      return '<div class="zone-lock" style="' + zoneStyle(region, 0.004) + '">' +
        '<span class="zone-lock-icon">&#128274;</span>' +
        '<span class="zone-lock-name">' + escapeHtml(region.name) + "</span>" +
      "</div>";
    }).join("");

    var roads = worldRoadNetwork();
    world.regions.forEach(function (region) {
      var points = regionCityPoints(region);
      if (!points.length) return;
      if (open && String(open.id) === String(region.id)) {
        currentRoadBends = roadBendsForRegion(region.id);
        currentRoadPoints = points;
        currentRoadLinks = regionRoadLinks(region, points);
        currentRoadRegionId = region.id;
        currentRoadNetwork = roadNetwork(points, currentRoadBends, currentRoadLinks);
        roads += currentRoadNetwork.svg;
        return;
      }
      roads += roadNetwork(points, roadBendsForRegion(region.id), regionRoadLinks(region, points)).svg;
    });

    var players = world.players.filter(function (player) {
      if (player.admin) return false;
      if (String(player.id) === String(session.userId)) return false;
      if (!visibleInZone(player.region)) return false;
      return typeof player.x === "number" && typeof player.y === "number";
    });
    var npcs = world.npcs.filter(function (npc) {
      if (!visibleInZone(npc.region)) return false;
      return typeof npc.x === "number" && typeof npc.y === "number";
    });
    var castles = world.castles.filter(function (castle) {
      return visibleInZone(castle.region);
    });

    var zoneBadges = world.regions.map(function (region) {
      var bb = region.bbox || { x0: 0, y0: 0, x1: 1, y1: 1 };
      var bx = Number(bb.x0) + (Number(bb.x1) - Number(bb.x0)) * 0.12;
      var by = Number(bb.y0) + (Number(bb.y1) - Number(bb.y0)) * 0.12;
      var full = Number(region.villages) >= Number(region.capacity);
      var castle = castleOf(region.id);
      return (
        '<button class="region-point' + (region.locked ? " locked" : "") + (full ? " full" : "") +
          (regionHintId === region.id || adminMode ? " hint" : "") + '" ' +
          'data-region-point="' + region.id + '" data-region-name="' + escapeHtml(region.name) + '" ' +
          'data-mx="' + bx + '" data-my="' + by + '" ' +
          'style="left:' + (bx * 100).toFixed(2) + "%;top:" + (by * 100).toFixed(2) + '%">' +
          '<span class="rp-dot">' + (region.locked ? "&#128274;" : num(region.villages)) + "</span>" +
          '<span class="rp-name">' + escapeHtml(region.name) + "</span>" +
          '<span class="rp-count">' + (region.locked ? "Bloqueada" : num(region.villages) + "/" + num(region.capacity)) + "</span>" +
          (castle && castle.owner ? '<span class="rp-king">Rey: ' + escapeHtml(castle.owner_name) + "</span>" : "") +
        "</button>"
      );
    }).join("");

    var layer = '<img class="map-world-bg" src="./assets/world-terrain.jpg?v=20261030b" alt="" draggable="false" />' +
      zoneOutlines + zoneLocks + roads +
      expeditionOverlay(null) + zoneBadges + castles
      .map(function (castle) {
        return (
          '<button class="marker castle" data-map-castle="' + escapeHtml(castle.id) + '" ' +
            'data-mx="' + castle.x + '" data-my="' + castle.y + '" ' +
            'title="' + escapeHtml(castle.name) + (castle.owner ? " · Rey " + escapeHtml(castle.owner_name) : " · Sin rey") + '" ' +
            'style="left:' + (castle.x * 100).toFixed(2) + "%;top:" + (castle.y * 100).toFixed(2) + '%">' +
            '<span class="mlabel">' + escapeHtml(castle.name) + "</span>" +
            '<span class="pin"></span>' +
          "</button>"
        );
      })
      .join("") + npcs
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
      .join("") + meMarker;

    var adminPanel = "";
    if (session && session.isAdmin) {
      adminPanel =
        '<div class="admin-panel">' +
          '<div class="admin-head"><b>Administración del mapa</b>' +
            '<button class="btn' + (adminMode ? " active" : "") + '" id="admin-mode-btn">' +
              (adminMode ? "Salir del modo mapa" : "Editar mapa") +
            "</button>" +
            '<button class="btn" id="admin-settings-btn">Administrar WoW</button>' +
          "</div>" +
          '<div class="admin-regions">' +
            world.regions
              .map(function (region) {
                return (
                  '<div class="admin-row">' +
                    "<span>" + escapeHtml(region.name) + " · " + num(region.villages) + "/" + num(region.capacity) + "</span>" +
                    '<span class="admin-row-actions">' +
                      '<button class="btn small" data-lock-region="' + region.id + '" data-lock="' + (region.locked ? "0" : "1") + '">' +
                        (region.locked ? "Desbloquear" : "Bloquear") +
                      "</button>" +
                    "</span>" +
                  "</div>"
                );
              })
              .join("") +
          "</div>" +
          (adminMode
            ? '<div class="admin-hint">Arrastra las zonas para recolocarlas y mueve aldeas, NPCs o castillos por el mapa. Toca una zona para editar sus caminos.' +
                (open ? ' <button class="btn small" id="reset-roads-btn">Restaurar caminos</button>' : "") +
              "</div>"
            : "") +
        "</div>";
    }

    var castleCard = "";
    if (castleTarget) {
      world.castles.forEach(function (castle) {
        if (String(castle.id) === String(castleTarget.id)) castleTarget = castle;
      });
      var castleRegion = regionById(castleTarget.region);
      var castleDefense = Number(castleTarget.defense) || Number(castleTarget.power) || 0;
      var castleLoot = Number(castleTarget.loot) || 0;
      var castleShare = Math.round(castleLoot / 4);
      var castleInv = invasionInfo(castleTarget.region);
      var castleOdds = Math.round(clamp((sendPower * castleInv.mult / Math.max(1, castleDefense)) * 100, 1, 99));
      var castleMine = !!castleTarget.owner && String(castleTarget.owner) === String(session && session.userId);
      castleCard =
        '<div class="pvp-card castle-card">' +
          '<div class="pvp-info"><b>' + escapeHtml(castleTarget.name || "Castillo del rey") + "</b>" +
            "<span>Castillo del rey" + (castleRegion ? " · " + escapeHtml(castleRegion.name) : "") + "</span>" +
            "<span>" + (castleTarget.owner
              ? "Rey actual: <b>" + escapeHtml(castleTarget.owner_name) + "</b>"
              : "Sin rey (neutral)") + "</span>" +
            '<span class="npc-meta">Poder de defensa <b>' + num(castleDefense) + "</b></span>" +
            "<span>Botín al conquistarlo: <b>" + num(castleLoot) + "</b> recursos (" +
              num(castleShare) + " de oro, madera, comida y piedra).</span>" +
            "<span>Éxito estimado: <b>" + num(castleOdds) + "%</b></span>" +
            invasionLines(castleInv) +
            (castleMine ? '<span class="pvp-warn">Este castillo es tuyo: eres el rey.</span>' : "") +
            (myMarch ? '<span class="pvp-warn">Ya tienes un ejército en camino.</span>' : "") +
            (armyCount(state) <= 0 && !castleMine ? '<span class="pvp-warn">No tienes tropas: entrena en el Cuartel.</span>' : "") +
            (!castleMine && armyCount(state) > 0 && sendTotal <= 0 ? '<span class="pvp-warn">Selecciona al menos una tropa para enviar.</span>' : "") +
          "</div>" +
          picker +
          '<div class="pvp-actions">' +
            '<button class="btn-primary" id="castle-attack-btn"' + (pvpBusy || castleMine || sendTotal <= 0 || myMarch || castleInv.far || castleInv.poor ? " disabled" : "") + ">" +
              (myMarch ? "Marcha en curso" : pvpBusy ? "Preparando…" : "Enviar ejército") +
            "</button>" +
            '<button class="btn" id="castle-cancel-btn">Cancelar</button>' +
          "</div>" +
        "</div>";
    }
    var npcCard = "";
    if (npcTarget) {
      var npcTierValue = npcTier(npcTarget);
      var npcLootValue = npcLoot(npcTarget);
      var npcShare = Math.round(npcLootValue / 4);
      var npcInv = invasionInfo(npcTarget.region);
      var npcOdds = Math.round(clamp((sendPower * npcInv.mult / Math.max(1, Number(npcTarget.power))) * 100, 1, 99));
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
            invasionLines(npcInv) +
            (myMarch ? '<span class="pvp-warn">Ya tienes un ejército en camino.</span>' : "") +
            (armyCount(state) <= 0 ? '<span class="pvp-warn">No tienes tropas: entrena en el Cuartel.</span>' : "") +
            (armyCount(state) > 0 && sendTotal <= 0 ? '<span class="pvp-warn">Selecciona al menos una tropa para enviar.</span>' : "") +
          "</div>" +
          picker +
          '<div class="pvp-actions">' +
            '<button class="btn-primary" id="npc-attack-btn"' + (pvpBusy || sendTotal <= 0 || myMarch || npcInv.far || npcInv.poor ? " disabled" : "") + ">" +
              (myMarch ? "Marcha en curso" : pvpBusy ? "Preparando…" : "Enviar ejército") +
            "</button>" +
            '<button class="btn" id="npc-cancel-btn">Cancelar</button>' +
          "</div>" +
        "</div>";
    }
    var target = pvpTarget;
    var targetCard = "";
    if (target) {
      var targetRegion = regionById(target.region);
      var targetInv = invasionInfo(target.region);
      targetCard =
        '<div class="pvp-card">' +
          '<div class="pvp-info"><b>' + escapeHtml(target.name || "Rival") + "</b>" +
            "<span>" + (RACES[target.race] ? RACES[target.race].name : target.race) +
            " · Poder " + num(target.power) +
            (targetRegion ? " · " + escapeHtml(targetRegion.name) : "") + "</span>" +
            invasionLines(targetInv) +
            (target.shield ? '<span class="pvp-warn">Escudo activo: no se puede atacar.</span>' : "") +
            (myMarch ? '<span class="pvp-warn">Ya tienes un ejército en camino.</span>' : "") +
            (armyCount(state) <= 0 ? '<span class="pvp-warn">No tienes tropas: entrena en el Cuartel.</span>' : "") +
            (armyCount(state) > 0 && sendTotal <= 0 ? '<span class="pvp-warn">Selecciona al menos una tropa para enviar.</span>' : "") +
          "</div>" +
          picker +
          '<div class="pvp-actions">' +
            '<button class="btn-primary" id="pvp-attack-btn"' + (target.shield || pvpBusy || sendTotal <= 0 || myMarch || targetInv.far || targetInv.poor ? " disabled" : "") + ">" +
              (myMarch ? "Marcha en curso" : pvpBusy ? "Preparando…" : "Enviar ejército") +
            "</button>" +
            '<button class="btn" id="pvp-cancel-btn">Cancelar</button>' +
          "</div>" +
        "</div>";
    }
    var resultCard = pvpResult
      ? '<div class="pvp-result ' + (pvpResult.ok && pvpResult.win ? "win" : "lose") + '">' + escapeHtml(pvpResult.text) + "</div>"
      : "";

    var marchCard = "";
    if (myMarch) {
      var marchRegion = regionById(myMarch.to_region);
      var outboundMarch = myMarch.status === "outbound";
      var eta = secondsUntil(outboundMarch ? myMarch.arrive_at : myMarch.return_at);
      marchCard =
        '<div class="pvp-card march-card">' +
          '<div class="pvp-info"><b>Marcha de tu ejército</b>' +
            "<span>Destino: " + escapeHtml(myMarch.target_name || "objetivo") +
              (marchRegion ? " · " + escapeHtml(marchRegion.name) : "") + "</span>" +
            "<span>" + (outboundMarch ? "En camino; combate al llegar." : "Regresando de la batalla.") +
              " Quedan <b id=\"march-countdown\">" + num(eta) + "</b> s.</span>" +
            (myMarch.troops && troopSummary(myMarch.troops)
              ? "<span>Tropas enviadas: <b>" + escapeHtml(troopSummary(myMarch.troops)) + "</b></span>"
              : "") +
            (myMarch.survivors
              ? "<span>Supervivientes: <b>" + escapeHtml(troopSummary(myMarch.survivors) || "ninguno") + "</b></span>"
              : "") +
            '<span class="npc-meta">Velocidad del reino: <b>x' + Number(world.moveSpeed || 1).toFixed(2) + "</b></span>" +
          "</div>" +
          '<div class="pvp-actions"><span class="hint">Una marcha activa por jugador</span></div>' +
        "</div>";
    }

    var kingBanner = "";
    if (open) {
      var openCastle = castleOf(open.id);
      if (openCastle) {
        kingBanner =
          '<div class="king-banner' + (openCastle.owner ? "" : " empty") + '">' +
            (openCastle.owner
              ? "Rey de " + escapeHtml(open.name) + ": <b>" + escapeHtml(openCastle.owner_name) + "</b>"
              : "Trono de " + escapeHtml(open.name) + ": sin rey") +
          "</div>";
      }
    }

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
          (open ? '<button class="btn" id="map-back-btn">&#8592; Todo el mapa</button>' : "") +
          '<button class="btn" data-map-zoom="in">+</button>' +
          '<button class="btn" data-map-zoom="out">&#8722;</button>' +
          '<button class="btn" data-map-center="1">Centrar</button>' +
          '<span class="map-hint">' +
            (adminMode
              ? "Arrastra para mover."
              : "Toca una zona para acercarte y un castillo, NPC o aldea para atacar.") +
          "</span>" +
        "</div>" +
        adminPanel +
        kingBanner +
        castleCard +
        npcCard +
        targetCard +
        resultCard +
        marchCard +
        '<div class="worldmap' + (adminMode ? " editing" : "") + (open ? " labels" : "") + '" id="worldmap">' +
          '<div class="worldmap-stage' + (open ? " labels" : "") + '" id="worldmap-stage" ' +
            'style="width:' + MAP_W + "px;height:" + MAP_H + 'px">' +
            '<div class="map-bg" aria-hidden="true"></div>' +
            layer +
          "</div>" +
        "</div>" +
        '<div class="map-legend">' +
          '<span><i class="dot open"></i>Zona abierta</span>' +
          '<span><i class="dot locked"></i>Bloqueada</span>' +
          '<span><i class="dot player"></i>Aldea</span>' +
          '<span><i class="dot npc"></i>NPC</span>' +
          '<span><i class="dot castle"></i>Castillo</span>' +
          '<span><i class="dot mundo"></i>Mundo</span>' +
          '<span><i class="dot march"></i>Marcha</span>' +
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
    world.castles.forEach(function (castle) {
      if (String(castle.region) === String(region.id)) grow(castle);
    });
    if (session && !session.isAdmin && session.village &&
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
      nodes = mapWrapEl.querySelectorAll(".marker, .region-point, .mundo-marker");
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
    var next = clamp(mapTransform.scale * factor, mapFitScale, mapFitScale * 6);
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
    itemDrag = null;
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

    function beginItemDrag(kind, id, node, event) {
      itemDrag = {
        kind: kind,
        id: id,
        node: node,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      if (mapWrapEl.setPointerCapture) {
        try { mapWrapEl.setPointerCapture(event.pointerId); } catch (err) {}
      }
    }

    mapWrapEl.addEventListener("pointerdown", function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      if (adminMode && session && session.isAdmin) {
        var target = event.target;
        var point = target && target.closest ? target.closest("[data-region-point]") : null;
        var marker = target && target.closest ? target.closest("[data-map-player]") : null;
        var npc = target && target.closest ? target.closest("[data-map-npc]") : null;
        var castleNode = target && target.closest ? target.closest("[data-map-castle]") : null;
        var ownVillage = target && target.closest ? target.closest("[data-map-village]") : null;
        if (point) {
          beginItemDrag("region", point.getAttribute("data-region-point"), point, event);
          return;
        }
        if (marker) {
          beginItemDrag("village", marker.getAttribute("data-map-player"), marker, event);
          return;
        }
        if (npc) {
          beginItemDrag("npc", npc.getAttribute("data-map-npc"), npc, event);
          return;
        }
        if (castleNode) {
          beginItemDrag("castle", castleNode.getAttribute("data-map-castle"), castleNode, event);
          return;
        }
        if (ownVillage && session.userId) {
          beginItemDrag("village", session.userId, ownVillage, event);
          return;
        }
        var roadHit = target && target.closest ? target.closest("[data-road-key]") : null;
        if (roadHit && currentRoadNetwork && currentRoadRegionId) {
          var roadKey = roadHit.getAttribute("data-road-key");
          var segment = null;
          currentRoadNetwork.segments.forEach(function (candidate) {
            if (!segment && candidate.key === roadKey) segment = candidate;
          });
          var mapPoint = mapFraction(event.clientX, event.clientY);
          beginItemDrag("road", roadKey, null, event);
          itemDrag.road = {
            key: roadKey,
            region: currentRoadRegionId,
            segment: segment,
            t: segment && mapPoint ? roadNearestT(segment, mapPoint) : 0.5,
            target: mapPoint || { x: 0.5, y: 0.5 },
          };
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
        if (event.pointerId !== itemDrag.pointerId) return;
        if (itemDrag.kind === "road" && itemDrag.road) {
          var roadPoint = mapFraction(event.clientX, event.clientY);
          if (roadPoint) {
            itemDrag.road.target = {
              x: clamp(roadPoint.x, 0.005, 0.995),
              y: clamp(roadPoint.y, 0.005, 0.995),
            };
            previewRoadDrag(itemDrag.road);
          }
          return;
        }
        var px = event.clientX - itemDrag.x;
        var py = event.clientY - itemDrag.y;
        if (itemDrag.node && itemDrag.node.style) {
          var yBase = itemDrag.kind === "region" ? "-50%" : "-100%";
          itemDrag.node.style.transform =
            "translate(calc(-50% + " + px + "px), calc(" + yBase + " + " + py + "px)) scale(var(--inv, 1))";
        }
        return;
      }
      if (!pointers[event.pointerId]) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var pts = pointerList();
      if (pts.length === 2 && pinchStart) {
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStart.dist > 0) {
          var target = clamp(pinchStart.scale * (dist / pinchStart.dist), mapFitScale, mapFitScale * 6);
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
        if (event.pointerId !== itemDrag.pointerId) return;
        var drag = itemDrag;
        itemDrag = null;
        if (drag.node && drag.node.style) drag.node.style.transform = "";
        if (mapWrapEl.releasePointerCapture) {
          try { mapWrapEl.releasePointerCapture(event.pointerId); } catch (err) {}
        }
        if (drag.kind === "road" && drag.road) {
          if (event.type === "pointercancel") {
            if (currentRoadNetwork) replaceRoadSvg(currentRoadNetwork.svg);
            return;
          }
          var roadMoved = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
          var releasePoint = mapFraction(event.clientX, event.clientY);
          if (roadMoved <= 4 || !releasePoint) {
            if (currentRoadNetwork) replaceRoadSvg(currentRoadNetwork.svg);
            return;
          }
          var releaseTarget = {
            x: clamp(releasePoint.x, 0.005, 0.995),
            y: clamp(releasePoint.y, 0.005, 0.995),
          };
          drag.road.target = releaseTarget;
          previewRoadDrag(drag.road);
          var storedT = drag.road.segment
            ? roadStoredT(drag.road.segment.a, drag.road.segment.b, drag.road.t)
            : drag.road.t;
          saveRoadBend(
            drag.road.region,
            drag.road.key,
            storedT,
            releaseTarget.x,
            releaseTarget.y
          );
          return;
        }
        if (event.type === "pointercancel") return;
        var dx = (event.clientX - drag.x) / (MAP_W * mapTransform.scale);
        var dy = (event.clientY - drag.y) / (MAP_H * mapTransform.scale);
        if (Math.abs(dx) + Math.abs(dy) > 0.002) {
          if (drag.kind === "region") {
            adminAction("admin_move_region", { rid: Number(drag.id), dx: dx, dy: dy });
          } else {
            var point = mapFraction(event.clientX, event.clientY);
            if (point) {
              var moveFn = drag.kind === "npc" ? "admin_move_npc"
                : drag.kind === "castle" ? "admin_move_castle" : "admin_move_village";
              adminAction(moveFn, { target_id: drag.id, nx: point.x, ny: point.y });
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
        castleTarget = null;
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
        castleTarget = null;
        world.npcs.forEach(function (npc) {
          if (String(npc.id) === String(id)) npcTarget = npc;
        });
        renderGame();
      });
    });

    Array.prototype.forEach.call(mapWrapEl.querySelectorAll("[data-map-castle]"), function (marker) {
      marker.addEventListener("click", function (event) {
        if (event.stopPropagation) event.stopPropagation();
        if (adminMode) return;
        var id = marker.getAttribute("data-map-castle");
        pvpTarget = null;
        npcTarget = null;
        pvpResult = null;
        castleTarget = null;
        world.castles.forEach(function (castle) {
          if (String(castle.id) === String(id)) castleTarget = castle;
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
              renderGame();
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
        if (adminMode) return;
        if (regionLongPressed) {
          regionLongPressed = false;
          return;
        }
        var id = point.getAttribute("data-region-point");
        var region = regionById(id);
        if (!region) return;
        if (region.locked && !(session && session.isAdmin) &&
            String(region.id) !== String(session && session.region)) {
          pvpResult = { ok: false, text: "Esa zona está bloqueada por el administrador." };
          renderGame();
          return;
        }
        openRegionId = id;
        mapFocusedRegion = null;
        regionHintId = null;
        pvpTarget = null;
        npcTarget = null;
        castleTarget = null;
        pvpResult = null;
        if (view !== "mapa") view = "mapa";
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
        if (view !== "mapa") view = "mapa";
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
      castleTarget = null;
      pvpResult = null;
      renderGame();
      fitMap();
    });

    var castleAttackBtn = document.getElementById("castle-attack-btn");
    if (castleAttackBtn) castleAttackBtn.addEventListener("click", function () { if (castleTarget) castleAttack(castleTarget.id); });
    var castleCancelBtn = document.getElementById("castle-cancel-btn");
    if (castleCancelBtn) castleCancelBtn.addEventListener("click", function () {
      castleTarget = null;
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

    Array.prototype.forEach.call(app.querySelectorAll("[data-send]"), function (input) {
      input.addEventListener("change", function () {
        var key = marchTargetKey();
        if (!key) return;
        var draft = ensureDraft(key);
        var tkey = input.getAttribute("data-send");
        var have = Math.max(0, Math.floor(Number(state.troops[tkey]) || 0));
        draft[tkey] = clamp(Math.floor(Number(input.value) || 0), 0, have);
        renderGame();
      });
    });
    function bindSendShortcut(button, all) {
      button.addEventListener("click", function () {
        var key = marchTargetKey();
        if (!key) return;
        var draft = ensureDraft(key);
        Object.keys(TROOPS).forEach(function (k) {
          draft[k] = all ? Math.max(0, Math.floor(Number(state.troops[k]) || 0)) : 0;
        });
        renderGame();
      });
    }
    Array.prototype.forEach.call(app.querySelectorAll("[data-send-all]"), function (button) {
      bindSendShortcut(button, true);
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-send-none]"), function (button) {
      bindSendShortcut(button, false);
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
    var resetRoadsBtn = document.getElementById("reset-roads-btn");
    if (resetRoadsBtn) resetRoadsBtn.addEventListener("click", function () {
      if (openRegionId) clearRoadBends(openRegionId);
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
      ["mercado", "Mercado"],
      ["raza", "Raza"],
    ];
    if (session && session.isAdmin) tabs.push(["admin", "Administrar WoW"]);
    var center;
    if (view === "cuartel") center = troopsView();
    else if (view === "mapa") center = mapView();
    else if (view === "mercado") center = marketView();
    else if (view === "raza") center = raceView();
    else if (view === "admin" && session && session.isAdmin) center = adminView();
    else center = buildingsView();

    var prod = totalProduction(state);

    app.innerHTML =
      '<div class="topbar">' +
        '<div class="brand">WoW Imperial <span class="dot">|</span> <span style="color:var(--' +
          race.id + ')">' + race.name + "</span></div>" +
        '<details class="menu" id="game-menu">' +
          '<summary class="menu-toggle">Menú</summary>' +
          '<div class="menu-panel">' +
            '<div class="menu-nav">' +
              tabs
                .map(function (tab) {
                  return (
                    '<button class="tab' + (view === tab[0] ? " active" : "") + '" data-view="' + tab[0] + '">' + tab[1] + "</button>"
                  );
                })
                .join("") +
            "</div>" +
            '<div class="menu-account">' + escapeHtml(account || "") + "</div>" +
            '<button class="btn menu-logout" id="logout-btn">Salir</button>' +
          "</div>" +
        "</details>" +
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

    if (document && document.body) {
      document.body.classList.remove("race-alianza", "race-horda", "race-enanos");
      document.body.classList.add("race-" + state.race);
    }
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
    var kbLine = document.getElementById("kb-line");
    if (kbLine) kbLine.textContent = num((session && session.kb) || 0);
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

    var moveSpeedSave = document.getElementById("move-speed-save");
    if (moveSpeedSave) {
      moveSpeedSave.addEventListener("click", function () {
        var input = document.getElementById("move-speed-input");
        var errorEl = document.getElementById("move-speed-error");
        var speed = input ? Number(input.value) : NaN;
        if (!isFinite(speed) || speed < 0.1 || speed > 10) {
          if (errorEl) errorEl.textContent = "La velocidad debe estar entre 0.1 y 10.";
          return;
        }
        if (errorEl) errorEl.textContent = "";
        adminAction("admin_set_movement_speed", { p_speed: speed });
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

    Array.prototype.forEach.call(app.querySelectorAll("[data-grant-kb]"), function (button) {
      button.addEventListener("click", function () {
        var who = button.getAttribute("data-kb-name") || "el jugador";
        var raw = window.prompt("KB para " + who + " (positivo entrega, negativo quita)");
        if (raw === null) return;
        var amount = Math.trunc(Number(raw));
        if (!amount || !isFinite(amount)) {
          pvpResult = { ok: false, text: "Escribe una cantidad de KB distinta de cero." };
          renderGame();
          return;
        }
        adminAction("admin_grant_kb", { target_id: button.getAttribute("data-grant-kb"), amount: amount });
      });
    });
  }

  function bindMarketEvents() {
    var form = document.getElementById("market-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        if (event.preventDefault) event.preventDefault();
        if (marketBusy) return;
        var assetEl = document.getElementById("market-asset");
        var qtyEl = document.getElementById("market-qty");
        var priceEl = document.getElementById("market-price");
        var qty = Math.trunc(Number(qtyEl ? qtyEl.value : 0));
        var price = Math.trunc(Number(priceEl ? priceEl.value : 0));
        if (!qty || qty < 1 || !price || price < 1) {
          marketMsg = { ok: false, text: "Cantidad y precio deben ser números enteros mayores que 0." };
          renderGame();
          return;
        }
        marketAction("market_post", {
          p_side: "sell",
          p_asset: (assetEl && assetEl.value) || "oro",
          p_qty: qty,
          p_price: price,
        });
      });
    }

    Array.prototype.forEach.call(app.querySelectorAll("[data-market-fill]"), function (button) {
      button.addEventListener("click", function () {
        var left = Number(button.getAttribute("data-market-left")) || 1;
        var raw = window.prompt("¿Cuántas unidades quieres operar? (quedan " + left + ")");
        if (raw === null) return;
        var qty = Math.trunc(Number(raw));
        if (!qty || qty < 1) {
          marketMsg = { ok: false, text: "Escribe una cantidad válida." };
          renderGame();
          return;
        }
        marketAction("market_fill", {
          p_order_id: button.getAttribute("data-market-fill"),
          p_qty: qty,
        });
      });
    });

    Array.prototype.forEach.call(app.querySelectorAll("[data-market-cancel]"), function (button) {
      button.addEventListener("click", function () {
        marketAction("market_cancel", { p_order_id: button.getAttribute("data-market-cancel") });
      });
    });
  }

  function bindGameEvents() {
    Array.prototype.forEach.call(app.querySelectorAll("[data-view]"), function (button) {
      button.addEventListener("click", function () {
        var wasMap = view === "mapa";
        view = button.getAttribute("data-view");
        if (!wasMap && view === "mapa" && isCloud() && session && !session.isAdmin && !adminMode) {
          var home = session.region ||
            (session.village && (regionAt(session.village.x, session.village.y) || {}).id) || null;
          if (home && regionById(home)) {
            openRegionId = home;
            mapFocusedRegion = null;
          }
        }
      // mapa disponible
      if (view === "mercado" && isCloud()) {
        syncMarket().then(function () {
          if (view === "mercado") renderGame();
        });
      }
      if (view === "admin" && isCloud() && (!world.at || now() - world.at > 5000)) {
        syncWorld().then(function () {
          if (view === "admin") renderGame();
        });
      }
      if (view === "mapa" && isCloud()) {
        syncWorld().then(function () {
          if (view === "mapa") renderGame();
        });
      }
      renderGame();
      });
    });
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);
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
    bindMarketEvents();
    initMap();
    startMarchAnimation();
  }

  /* ---------------- boot ---------------- */

  function bindMenuDismiss() {
    document.addEventListener("click", function (event) {
      var menu = document.getElementById("game-menu");
      if (!menu || !menu.open || !menu.contains) return;
      if (menu.contains(event.target)) return;
      menu.open = false;
    });
  }

  function boot() {
    bindMenuDismiss();
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
          kb: Number(saved.kb || 0),
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
          session.kb = Number(row.kb || 0);
          session.region = row.region_id;
          if (row.x == null) {
            session = null;
            account = null;
            localStorage.removeItem(SESSION_KEY);
            authError = "No hay plazas libres en las regiones abiertas. Pide al administrador que abra otra zona.";
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
