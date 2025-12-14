// =====================================================
// test31.js — BASE ESTABLE (Buscar + Habilidades + Histórico + Favoritos + VS)
// =====================================================
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
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
function safeArr(a) {
    return Array.isArray(a) ? a : [];
}

// -----------------------------------------------------
// CACHE KEYS
// -----------------------------------------------------
const pokemonCacheKey = (v) => `pokemon-${String(v).trim().toLowerCase()}`;
const abilityCacheKey = (v) => `ability-${String(v).trim().toLowerCase()}`;

// -----------------------------------------------------
// FETCH CON CACHE
// -----------------------------------------------------
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

    let res;
    try {
        res = await fetch(url);
    } catch (e) {
        return { ok: false, error: e.message };
    }
    if (!res.ok) return { ok: false, error: res.status };

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
    } else {
        const effect = data.effect_entries.find(e => e.language.name === "en");
        essential = {
            id: data.id,
            name: data.name,
            description: effect ? effect.effect : "Sin descripción",
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

// -----------------------------------------------------
// FETCH DIRECTO (sin cache)
// -----------------------------------------------------
async function fetchDirect(url) {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
}

// -----------------------------------------------------
// API
// -----------------------------------------------------
const obtenerPokemon = (v) =>
    fetchConCache(`https://pokeapi.co/api/v2/pokemon/${sanitizeInput(v).toLowerCase()}`,
        pokemonCacheKey(v), "pokemon");

const obtenerHabilidad = (v) =>
    fetchConCache(`https://pokeapi.co/api/v2/ability/${sanitizeInput(v).toLowerCase()}`,
        abilityCacheKey(v), "ability");

// -----------------------------------------------------
// HISTÓRICO
// -----------------------------------------------------
const getHistorico = () => JSON.parse(localStorage.getItem("historico") || "[]");
const setHistorico = (h) => localStorage.setItem("historico", JSON.stringify(h));

function guardarEnHistorico(p) {
    const h = getHistorico();
    if (!h.some(x => x.id === p.id)) {
        h.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
        setHistorico(h);
    }
}

// -----------------------------------------------------
// FAVORITOS
// -----------------------------------------------------
const getFavoritos = () => JSON.parse(localStorage.getItem("favoritos") || "[]");
const setFavoritos = (f) => localStorage.setItem("favoritos", JSON.stringify(f));
const esFavorito = (id) => getFavoritos().some(f => f.id === id);

function toggleFavorito(p) {
    const favs = getFavoritos();
    const idx = favs.findIndex(f => f.id === p.id);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
    setFavoritos(favs);
}

// -----------------------------------------------------
// EVOLUCIONES
// -----------------------------------------------------
async function obtenerEvolucionAvanzada(speciesUrl) {
    const sp = await fetchDirect(speciesUrl);
    if (!sp.ok) return null;
    const ev = await fetchDirect(sp.data.evolution_chain.url);
    if (!ev.ok) return null;

    async function walk(n) {
        const p = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${n.species.name}`);
        return {
            name: n.species.name,
            sprite: p.ok ? p.data.sprites.front_default : "",
            children: await Promise.all(n.evolves_to.map(walk))
        };
    }
    return walk(ev.data.chain);
}

// -----------------------------------------------------
// RENDER POKÉMON
// -----------------------------------------------------
async function mostrarPokemonInterno(v) {
    showMessage("Cargando Pokémon...");
    const r = await obtenerPokemon(v);
    if (!r.ok) return showMessage("No encontrado");

    const p = r.data;
    guardarEnHistorico(p);

    showResultHtml(`
        <div class="card">
            <div class="badge">${r.source === "api" ? "⚡ API" : "💾 CACHE"}</div>
            <h2>#${p.id} ${p.name.toUpperCase()}</h2>
            <img class="sprite" src="${p.sprite}">
            <h3>Tipos</h3>
            ${p.types.map(t => `<span class="label">${t}</span>`).join("")}
            <h3>Habilidades</h3>
            ${p.abilities.map(a =>
                `<span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">
                    ${a.name}${a.is_hidden ? " 🔒" : ""}
                </span>`).join("")}
            <h3>Stats</h3>
            ${p.stats.map(s => `<p>${s.name}: ${s.base_stat}</p>`).join("")}
            <button class="btn-white" id="btn-fav">
                ⭐ ${esFavorito(p.id) ? "Quitar" : "Agregar"}
            </button>
        </div>
    `);

    document.getElementById("btn-fav").onclick = () => {
        toggleFavorito(p);
        mostrarPokemonInterno(p.name);
    };
}

// -----------------------------------------------------
// HABILIDAD
// -----------------------------------------------------
async function mostrarHabilidadInterna(v) {
    showMessage("Cargando Habilidad...");
    const r = await obtenerHabilidad(v);
    if (!r.ok) return showMessage("No encontrada");

    const list = await Promise.all(r.data.pokemon.map(async p => {
        const s = await fetchDirect(p.url);
        return {
            name: p.name,
            sprite: s.ok ? s.data.sprites.front_default : "",
            hidden: p.is_hidden
        };
    }));

    showResultHtml(`
        <div class="card">
            <h2>${r.data.name.toUpperCase()}</h2>
            <p>${r.data.description}</p>
            <div class="pokemon-grid">
                ${list.map(p => `
                    <div class="poke-card ability-card" data-name="${p.name}">
                        <img src="${p.sprite}">
                        <span>${p.name}</span>
                        ${p.hidden ? "<small>🔒</small>" : ""}
                    </div>`).join("")}
            </div>
        </div>
    `);

    document.querySelectorAll(".ability-card").forEach(c => {
        c.onclick = () => {
            document.getElementById("tipoSelect").value = "POKÉMON";
            document.getElementById("search").value = c.dataset.name;
            buscar();
        };
    });
}

// -----------------------------------------------------
// BUSCAR
// -----------------------------------------------------
async function buscar() {
    const v = sanitizeInput(document.getElementById("search")?.value);
    const t = document.getElementById("tipoSelect")?.value;
    if (!v) return;
    if (t === "HABILIDAD") mostrarHabilidadInterna(v);
    else mostrarPokemonInterno(v);
}

// -----------------------------------------------------
// ⚔️ VS — MÓDULO AISLADO
// -----------------------------------------------------
let vsLeft = null;
let vsRight = null;

function vsHasDom() {
    return document.getElementById("vs-battle-btn");
}

async function vsBuscar(lado) {
    const id = lado === "left" ? "vs-left-input" : "vs-right-input";
    const val = sanitizeInput(document.getElementById(id).value);
    const r = await obtenerPokemon(val);
    if (!r.ok) return alert("No encontrado");
    lado === "left" ? vsLeft = r : vsRight = r;
}

function vsBatallar() {
    if (!vsLeft || !vsRight) return alert("Selecciona ambos Pokémon");

    const sum = p => p.stats.reduce((a, s) => a + s.base_stat, 0);
    const t1 = sum(vsLeft.data);
    const t2 = sum(vsRight.data);

    const win = t1 === t2 ? "EMPATE" : t1 > t2 ? vsLeft.data.name : vsRight.data.name;

    document.getElementById("vs-result").innerHTML = `
        <div class="card">
            <h2>🏆 ${win.toUpperCase()}</h2>
            <p>${vsLeft.data.name}: ${t1}</p>
            <p>${vsRight.data.name}: ${t2}</p>
        </div>`;
}

// -----------------------------------------------------
// DOM READY
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn")?.addEventListener("click", buscar);
    document.getElementById("search")?.addEventListener("keydown", e => e.key === "Enter" && buscar());

    if (vsHasDom()) {
        document.getElementById("vs-left-btn")?.addEventListener("click", () => vsBuscar("left"));
        document.getElementById("vs-right-btn")?.addEventListener("click", () => vsBuscar("right"));
        document.getElementById("vs-battle-btn")?.addEventListener("click", vsBatallar);
    }
});
