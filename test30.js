// =====================================================
// test27_vs_final.js
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
const pokemonCacheKey = v => `pokemon-${String(v).trim().toLowerCase()}`;
const abilityCacheKey = v => `ability-${String(v).trim().toLowerCase()}`;

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
function setHistorico(a) {
    localStorage.setItem("historico", JSON.stringify(a));
}
function guardarEnHistorico(p) {
    const h = getHistorico();
    if (!h.some(x => x.id === p.id)) {
        h.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
        setHistorico(h);
    }
}
function eliminarDeHistorico(id) {
    setHistorico(getHistorico().filter(p => p.id !== id));
}
function limpiarHistorico() {
    localStorage.removeItem("historico");
}

// -----------------------------------------------------
// FAVORITOS
// -----------------------------------------------------
function getFavoritos() {
    return JSON.parse(localStorage.getItem("favoritos") || "[]");
}
function setFavoritos(a) {
    localStorage.setItem("favoritos", JSON.stringify(a));
}
function esFavorito(id) {
    return getFavoritos().some(f => f.id === id);
}
function toggleFavorito(p) {
    const f = getFavoritos();
    const i = f.findIndex(x => x.id === p.id);
    if (i >= 0) f.splice(i, 1);
    else f.push({ id: p.id, name: p.name, sprite: p.sprite, types: p.types });
    setFavoritos(f);
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
        const poke = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${n.species.name}`);
        return {
            name: n.species.name,
            sprite: poke.ok ? poke.data.sprites.front_default : "",
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
    return `
      <div class="ev-line">
        ${card(n)}
        <span class="flecha">→</span>
        ${n.children.map(renderEvoluciones).join("")}
      </div>`;
}

// -----------------------------------------------------
// RENDER POKÉMON
// -----------------------------------------------------
async function mostrarPokemonInterno(v) {
    showMessage("Cargando Pokémon...");
    const r = await obtenerPokemon(v);
    if (!r.ok) return showMessage("Pokémon no encontrado");

    const p = r.data;
    guardarEnHistorico(p);

    const evo = await obtenerEvolucionAvanzada(p.speciesUrl);

    showResultHtml(`
      <div class="card">
        <div class="badge">${r.source === "api" ? "⚡ API" : "💾 Cache"}</div>
        <h2>#${p.id} ${p.name.toUpperCase()}</h2>
        <img class="sprite" src="${p.sprite}">
        ${p.types.map(t => `<span class="label">${t}</span>`).join("")}
        <h3>Habilidades</h3>
        ${p.abilities.map(a =>
        `<span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">
              ${a.name}${a.is_hidden ? " (Oculta 🔒)" : ""}
            </span>`).join("")}
        <h3>Estadísticas</h3>
        <ul class="stats-list">
          ${p.stats.map(s =>
            `<li class="stat-row">
              <span class="stat-name">${s.name}</span>
              <div class="stat-bar"><div class="stat-fill" style="width:${s.base_stat / 3}%"></div></div>
              <span>${s.base_stat}</span>
            </li>`).join("")}
        </ul>
        <button id="btn-fav" class="btn-white">
          ⭐ ${esFavorito(p.id) ? "Quitar" : "Agregar"} favoritos
        </button>
        <h3>Evoluciones</h3>
        <div class="evolutions">${renderEvoluciones(evo)}</div>
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
async function mostrarHabilidadInterna(v) {
    showMessage("Cargando Habilidad...");
    const r = await obtenerHabilidad(v);
    if (!r.ok) return showMessage("Habilidad no encontrada");

    const list = await Promise.all(
        r.data.pokemon.map(async p => ({
            name: p.name,
            sprite: await obtenerSpriteSinCache(p.url),
            isHidden: p.is_hidden
        }))
    );

    showResultHtml(`
      <div class="card">
        <div class="badge">${r.source === "api" ? "⚡ API" : "💾 Cache"}</div>
        <h2>${r.data.name.toUpperCase()}</h2>
        <p>${r.data.description}</p>
        <div class="pokemon-grid">
          ${list.map(p =>
        `<div class="poke-card ability-card" data-name="${p.name}">
              <img src="${p.sprite}">
              <span>${p.name.toUpperCase()}</span>
              ${p.isHidden ? "<small>(oculta 🔒)</small>" : ""}
            </div>`).join("")}
        </div>
      </div>
    `);

    document.querySelectorAll(".ability-card").forEach(c => {
        c.onclick = () => {
            document.getElementById("search").value = c.dataset.name;
            document.getElementById("tipoSelect").value = "POKÉMON";
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
    if (!v) return showMessage("Escribe un valor válido");
    if (t === "HABILIDAD") mostrarHabilidadInterna(v);
    else mostrarPokemonInterno(v);
}

window.mostrarDatosDesdeEvolucion = async function (n) {
    document.getElementById("search").value = n;
    document.getElementById("tipoSelect").value = "POKÉMON";
    buscar();
};

// -----------------------------------------------------
// ⚔️ VS MODULE (AISLADO)
// -----------------------------------------------------
let vsLeft = null;
let vsRight = null;

async function buscarPokemonVS(lado) {
    const id = lado === "left" ? "vs-left-input" : "vs-right-input";
    const val = sanitizeInput(document.getElementById(id)?.value);
    if (!val) return;

    const r = await obtenerPokemon(val);
    if (!r.ok) return alert("Pokémon no encontrado");

    if (lado === "left") vsLeft = r;
    else vsRight = r;

    renderVSPreview();
}

function renderVSPreview() {
    const c = document.getElementById("vs-preview");
    if (!c) return;

    const card = r => `
      <div class="card">
        <img class="sprite" src="${r.data.sprite}">
        <strong>${r.data.name.toUpperCase()}</strong>
        ${r.data.types.map(t => `<span class="label">${t}</span>`).join("")}
      </div>`;

    c.innerHTML = `${vsLeft ? card(vsLeft) : ""}${vsRight ? card(vsRight) : ""}`;
}

function iniciarBatalla() {
    if (!vsLeft || !vsRight) return alert("Selecciona ambos Pokémon");

    const sum = p => p.stats.reduce((a, s) => a + s.base_stat, 0);
    const s1 = sum(vsLeft.data);
    const s2 = sum(vsRight.data);

    document.getElementById("vs-result").innerHTML = `
      <div class="card ${s1 > s2 ? "winner" : s1 === s2 ? "draw" : "loser"}">
        ${vsLeft.data.name.toUpperCase()} (${s1})
      </div>
      <div class="card ${s2 > s1 ? "winner" : s1 === s2 ? "draw" : "loser"}">
        ${vsRight.data.name.toUpperCase()} (${s2})
      </div>`;
}

// -----------------------------------------------------
// DOM READY
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn")?.addEventListener("click", buscar);
    document.getElementById("search")?.addEventListener("keydown", e => {
        if (e.key === "Enter") buscar();
    });

    const path = location.pathname;
    if (path.includes("historico.html")) mostrarHistorico?.();
    if (path.includes("favoritos.html")) mostrarFavoritos?.();

    if (path.includes("vs.html")) {
        document.getElementById("vs-left-btn")?.addEventListener("click", () => buscarPokemonVS("left"));
        document.getElementById("vs-right-btn")?.addEventListener("click", () => buscarPokemonVS("right"));
        document.getElementById("vs-battle-btn")?.addEventListener("click", iniciarBatalla);
    }
});
