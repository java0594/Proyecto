// =====================================================
// test28.js — Base test27 + VS Pokémon
// =====================================================
const CACHE_TTL = 10 * 60 * 1000;

// =====================================================
// HELPERS
// =====================================================
function sanitizeInput(v) {
    return v ? String(v).trim() : "";
}
function showResultHtml(html) {
    const r = document.getElementById("result");
    if (r) r.innerHTML = html;
}
function showMessage(msg) {
    showResultHtml(`<p>${msg}</p>`);
}

// =====================================================
// CACHE KEYS
// =====================================================
const pokemonCacheKey = v => `pokemon-${String(v).trim().toLowerCase()}`;
const abilityCacheKey = v => `ability-${String(v).trim().toLowerCase()}`;

// =====================================================
// FETCH CON CACHE
// =====================================================
async function fetchConCache(url, key, tipo = "pokemon") {
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const obj = JSON.parse(raw);
            if (Date.now() - obj.timestamp < CACHE_TTL) {
                return { ok: true, source: "cache", data: obj.data };
            }
        }
    } catch {
        localStorage.removeItem(key);
    }

    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    const data = await res.json();

    let essential;
    if (tipo === "pokemon") {
        essential = {
            id: data.id,
            name: data.name,
            sprite: data.sprites.front_default,
            types: data.types.map(t => t.type.name),
            abilities: data.abilities.map(a => ({
                name: a.ability.name,
                is_hidden: a.is_hidden
            })),
            stats: data.stats.map(s => ({
                name: s.stat.name,
                base_stat: s.base_stat
            })),
            speciesUrl: data.species.url
        };
    } else if (tipo === "ability") {
        const eff = data.effect_entries.find(e => e.language.name === "en");
        essential = {
            id: data.id,
            name: data.name,
            description: eff ? eff.effect : "Sin descripción",
            pokemon: data.pokemon.map(p => ({
                name: p.pokemon.name,
                url: p.pokemon.url,
                is_hidden: p.is_hidden
            }))
        };
    }

    localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        data: essential
    }));

    return { ok: true, source: "api", data: essential };
}

// =====================================================
// API
// =====================================================
const obtenerPokemon = n =>
    fetchConCache(
        `https://pokeapi.co/api/v2/pokemon/${n.toLowerCase()}`,
        pokemonCacheKey(n),
        "pokemon"
    );

// =====================================================
// HISTÓRICO / FAVORITOS (idéntico a test27)
// =====================================================
const getHistorico = () => JSON.parse(localStorage.getItem("historico") || "[]");
const setHistorico = h => localStorage.setItem("historico", JSON.stringify(h));
const getFavoritos = () => JSON.parse(localStorage.getItem("favoritos") || "[]");
const setFavoritos = f => localStorage.setItem("favoritos", JSON.stringify(f));
const esFavorito = id => getFavoritos().some(f => f.id === id);

function guardarEnHistorico(p) {
    const h = getHistorico();
    if (!h.some(x => x.id === p.id)) {
        h.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
        setHistorico(h);
    }
}
function toggleFavorito(p) {
    const f = getFavoritos();
    const i = f.findIndex(x => x.id === p.id);
    if (i >= 0) f.splice(i, 1);
    else f.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
    setFavoritos(f);
}

// =====================================================
// BUSQUEDA NORMAL (resumen)
// =====================================================
async function mostrarPokemonInterno(n) {
    showMessage("Cargando Pokémon...");
    const r = await obtenerPokemon(n);
    if (!r.ok) return showMessage("Pokémon no encontrado");
    const p = r.data;
    guardarEnHistorico(p);

    showResultHtml(`
    <div class="card">
      <div class="badge">${r.source === "api" ? "⚡ API" : "💾 Cache"}</div>
      <h2>#${p.id} ${p.name.toUpperCase()}</h2>
      <img class="sprite" src="${p.sprite}">
      ${p.types.map(t => `<span class="label">${t}</span>`).join("")}
      <button id="btn-fav" class="btn-white">
        ⭐ ${esFavorito(p.id) ? "Quitar" : "Agregar"} favoritos
      </button>
    </div>
  `);

    document.getElementById("btn-fav").onclick = () => {
        toggleFavorito(p);
        mostrarPokemonInterno(p.name);
    };
}

// =====================================================
// ===================== VS ==============================
// =====================================================
let vsLeft = null;
let vsRight = null;

// Tabla simple de ventajas
const typeChart = {
    fire: { grass: 2, water: 0.5 },
    grass: { water: 2, fire: 0.5 },
    water: { fire: 2, grass: 0.5 }
};

function getBaseStatsTotal(p) {
    return p.stats.reduce((a, s) => a + s.base_stat, 0);
}

function getTypeMultiplier(attacker, defender) {
    let mult = 1;
    attacker.types.forEach(a => {
        defender.types.forEach(d => {
            if (typeChart[a] && typeChart[a][d]) {
                mult *= typeChart[a][d];
            }
        });
    });
    return mult;
}

async function buscarPokemonVS(lado) {
    const input = document.getElementById(
        lado === "left" ? "vs-left-input" : "vs-right-input"
    );
    const val = sanitizeInput(input.value);
    if (!val) return;

    const r = await obtenerPokemon(val);
    if (!r.ok) return alert("Pokémon no encontrado");

    if (lado === "left") vsLeft = r;
    else vsRight = r;

    renderVSPreview();
}

function renderVSPreview() {
    const box = document.getElementById("vs-preview");
    if (!box) return;

    const card = r => `
    <div class="card">
      <div class="badge">${r.source === "api" ? "API" : "Cache"}</div>
      <img class="sprite" src="${r.data.sprite}">
      <strong>#${r.data.id} ${r.data.name.toUpperCase()}</strong>
      ${r.data.types.map(t => `<span class="label">${t}</span>`).join("")}
    </div>
  `;

    box.innerHTML = `
    ${vsLeft ? card(vsLeft) : ""}
    ${vsRight ? card(vsRight) : ""}
  `;
}

function iniciarBatalla() {
    if (!vsLeft || !vsRight) {
        alert("Selecciona ambos Pokémon");
        return;
    }

    const p1 = vsLeft.data;
    const p2 = vsRight.data;

    const base1 = getBaseStatsTotal(p1);
    const base2 = getBaseStatsTotal(p2);

    const m1 = getTypeMultiplier(p1, p2);
    const m2 = getTypeMultiplier(p2, p1);

    const score1 = base1 * m1;
    const score2 = base2 * m2;

    let estado1 = "", estado2 = "", titulo = "";
    if (score1 > score2) {
        estado1 = "winner"; estado2 = "loser"; titulo = "🏆 GANADOR";
    } else if (score2 > score1) {
        estado2 = "winner"; estado1 = "loser"; titulo = "🏆 GANADOR";
    } else {
        estado1 = estado2 = "draw"; titulo = "🤝 EMPATE";
    }

    document.getElementById("vs-result").innerHTML = `
    <div class="card ${estado1}">
      <strong>${p1.name.toUpperCase()}</strong>
      <p>${score1.toFixed(1)} pts</p>
    </div>

    <div class="vs-center">${titulo}</div>

    <div class="card ${estado2}">
      <strong>${p2.name.toUpperCase()}</strong>
      <p>${score2.toFixed(1)} pts</p>
    </div>
  `;
}

// =====================================================
// DOM READY
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    // VS
    if (location.pathname.includes("vs.html")) {
        document.getElementById("vs-left-btn")?.addEventListener("click", () => buscarPokemonVS("left"));
        document.getElementById("vs-right-btn")?.addEventListener("click", () => buscarPokemonVS("right"));
        document.getElementById("vs-battle-btn")?.addEventListener("click", iniciarBatalla);
        return;
    }

    // Búsqueda normal
    document.getElementById("btn")?.addEventListener("click", () => {
        const v = sanitizeInput(document.getElementById("search").value);
        if (v) mostrarPokemonInterno(v);
    });
});
