// =====================================================
// test31.js — BASE ESTABLE + VS EXTENDIDO
// =====================================================
const CACHE_TTL = 10 * 60 * 1000;

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

// -----------------------------------------------------
// FETCH DIRECTO
// -----------------------------------------------------
async function fetchDirect(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) return { ok: false };
        return { ok: true, data: await r.json() };
    } catch {
        return { ok: false };
    }
}

// -----------------------------------------------------
// API
// -----------------------------------------------------
async function obtenerPokemon(input) {
    const key = sanitizeInput(input).toLowerCase();
    return fetchConCache(
        `https://pokeapi.co/api/v2/pokemon/${key}`,
        pokemonCacheKey(key),
        "pokemon"
    );
}

async function obtenerHabilidad(input) {
    const key = sanitizeInput(input).toLowerCase();
    return fetchConCache(
        `https://pokeapi.co/api/v2/ability/${key}`,
        abilityCacheKey(key),
        "ability"
    );
}

async function obtenerSpriteSinCache(url) {
    const r = await fetchDirect(url);
    return r.ok ? r.data.sprites.front_default : "";
}

// -----------------------------------------------------
// HISTÓRICO
// -----------------------------------------------------
function getHistorico() {
    return JSON.parse(localStorage.getItem("historico") || "[]");
}
function guardarEnHistorico(p) {
    const h = getHistorico();
    if (!h.some(x => x.id === p.id)) {
        h.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
        localStorage.setItem("historico", JSON.stringify(h));
    }
}
function eliminarDeHistorico(id) {
    localStorage.setItem(
        "historico",
        JSON.stringify(getHistorico().filter(p => p.id !== id))
    );
}

// -----------------------------------------------------
// FAVORITOS
// -----------------------------------------------------
function getFavoritos() {
    return JSON.parse(localStorage.getItem("favoritos") || "[]");
}
function esFavorito(id) {
    return getFavoritos().some(f => f.id === id);
}
function toggleFavorito(p) {
    const favs = getFavoritos();
    const i = favs.findIndex(f => f.id === p.id);
    if (i >= 0) favs.splice(i, 1);
    else favs.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
    localStorage.setItem("favoritos", JSON.stringify(favs));
}

// -----------------------------------------------------
// EVOLUCIONES
// -----------------------------------------------------
async function obtenerEvolucionAvanzada(speciesUrl) {
    const s = await fetchDirect(speciesUrl);
    if (!s.ok) return null;
    const e = await fetchDirect(s.data.evolution_chain.url);
    if (!e.ok) return null;

    async function walk(n) {
        const r = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${n.species.name}`);
        return {
            name: n.species.name,
            sprite: r.ok ? r.data.sprites.front_default : "",
            children: await Promise.all(n.evolves_to.map(walk))
        };
    }
    return walk(e.data.chain);
}

function renderEvoluciones(n) {
    if (!n) return "<p>No hay evoluciones</p>";
    const card = p => `
        <div class="ev-card" onclick="mostrarDatosDesdeEvolucion('${p.name}')">
            <img src="${p.sprite}">
            <span>${p.name.toUpperCase()}</span>
        </div>`;
    if (!n.children.length) return card(n);
    return card(n) + n.children.map(renderEvoluciones).join("");
}

// -----------------------------------------------------
// RENDER POKÉMON
// -----------------------------------------------------
async function mostrarPokemonInterno(val) {
    showMessage("Cargando Pokémon...");
    const r = await obtenerPokemon(val);
    if (!r.ok) return showMessage("Pokémon no encontrado");

    const p = r.data;
    guardarEnHistorico(p);

    const evo = await obtenerEvolucionAvanzada(p.speciesUrl);

    showResultHtml(`
        <div class="card">
            <h2>#${p.id} ${p.name.toUpperCase()}</h2>
            <img class="sprite" src="${p.sprite}">
            <h3>Tipos</h3>
            ${p.types.map(t => `<span class="label">${t}</span>`).join("")}
            <h3>Habilidades</h3>
            ${p.abilities.map(a =>
                `<span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">
                ${a.name}${a.is_hidden ? " 🔒" : ""}
                </span>`).join("")}
            <h3>Estadísticas</h3>
            ${p.stats.map(s => `<p>${s.name}: ${s.base_stat}</p>`).join("")}
            <button id="btn-fav" class="btn-white">
                ⭐ ${esFavorito(p.id) ? "Quitar" : "Agregar"}
            </button>
            <h3>Evoluciones</h3>
            ${renderEvoluciones(evo)}
        </div>
    `);

    document.getElementById("btn-fav").onclick = () => {
        toggleFavorito(p);
        mostrarPokemonInterno(p.name);
    };
}

// -----------------------------------------------------
// RENDER HABILIDAD
// -----------------------------------------------------
async function mostrarHabilidadInterna(val) {
    showMessage("Cargando habilidad...");
    const r = await obtenerHabilidad(val);
    if (!r.ok) return showMessage("Habilidad no encontrada");

    const list = await Promise.all(
        r.data.pokemon.map(async p => ({
            name: p.name,
            sprite: await obtenerSpriteSinCache(p.url),
            hidden: p.is_hidden
        }))
    );

    showResultHtml(`
        <div class="card">
            <h2>${r.data.name.toUpperCase()}</h2>
            <p>${r.data.description}</p>
            <div class="pokemon-grid">
                ${list.map(p => `
                    <div class="poke-card ability-card" data-name="${p.name}">
                        <img src="${p.sprite}">
                        <span>${p.name}</span>
                        ${p.hidden ? "<small>Oculta</small>" : ""}
                    </div>`).join("")}
            </div>
        </div>
    `);

    document.querySelectorAll(".ability-card").forEach(c =>
        c.onclick = () => {
            document.getElementById("tipoSelect").value = "POKÉMON";
            document.getElementById("search").value = c.dataset.name;
            buscar();
        }
    );
}

// -----------------------------------------------------
// BUSCAR
// -----------------------------------------------------
async function buscar() {
    const v = sanitizeInput(document.getElementById("search").value);
    const t = document.getElementById("tipoSelect").value;
    if (!v) return;
    t === "HABILIDAD" ? mostrarHabilidadInterna(v) : mostrarPokemonInterno(v);
}

function mostrarDatosDesdeEvolucion(n) {
    document.getElementById("search").value = n;
    buscar();
}
window.mostrarDatosDesdeEvolucion = mostrarDatosDesdeEvolucion;

// =====================================================
// ⚔️ VS EXTENDIDO (NO ROMPE NADA)
// =====================================================
let vsLeft = null;
let vsRight = null;

function vsTotal(p) {
    return p.stats.reduce((a, s) => a + s.base_stat, 0);
}

function vsComparar(p1, p2) {
    return p1.stats.map((s, i) => ({
        name: s.name,
        a: s.base_stat,
        b: p2.stats[i].base_stat,
        win: s.base_stat > p2.stats[i].base_stat ? "a"
            : s.base_stat < p2.stats[i].base_stat ? "b" : "tie"
    }));
}

async function vsBuscar(lado) {
    const id = lado === "left" ? "vs-left-input" : "vs-right-input";
    const v = sanitizeInput(document.getElementById(id).value);
    const r = await obtenerPokemon(v);
    if (!r.ok) return alert("No encontrado");
    lado === "left" ? vsLeft = r : vsRight = r;
}

function vsBatallar() {
    if (!vsLeft || !vsRight) return alert("Selecciona ambos");

    const a = vsLeft.data;
    const b = vsRight.data;

    const ta = vsTotal(a);
    const tb = vsTotal(b);

    const ganador = ta > tb ? a.name : tb > ta ? b.name : "EMPATE";

    document.getElementById("vs-result").innerHTML = `
        <div class="card">
            <h2>⚔️ RESULTADO</h2>
            <h3>${ganador}</h3>
            ${vsComparar(a, b).map(s => `
                <p>${s.name}: ${s.a} vs ${s.b}</p>
            `).join("")}
        </div>
    `;
}

// -----------------------------------------------------
// DOM READY
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn")?.addEventListener("click", buscar);
    document.getElementById("search")?.addEventListener("keydown", e => {
        if (e.key === "Enter") buscar();
    });

    if (location.pathname.includes("vs.html")) {
        document.getElementById("vs-left-btn")?.addEventListener("click", () => vsBuscar("left"));
        document.getElementById("vs-right-btn")?.addEventListener("click", () => vsBuscar("right"));
        document.getElementById("vs-battle-btn")?.addEventListener("click", vsBatallar);
    }
});
