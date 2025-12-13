// =====================================================
// CONFIGURACIÓN
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
const pokemonCacheKey = v => `pokemon-${v.toLowerCase()}`;
const abilityCacheKey = v => `ability-${v.toLowerCase()}`;

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
    }

    if (tipo === "ability") {
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

// =====================================================
// FETCH DIRECTO
// =====================================================
async function fetchDirect(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) return { ok: false };
        return { ok: true, data: await r.json() };
    } catch {
        return { ok: false };
    }
}

// =====================================================
// API
// =====================================================
const obtenerPokemon = n =>
    fetchConCache(`https://pokeapi.co/api/v2/pokemon/${n.toLowerCase()}`,
        pokemonCacheKey(n), "pokemon");

const obtenerHabilidad = n =>
    fetchConCache(`https://pokeapi.co/api/v2/ability/${n.toLowerCase()}`,
        abilityCacheKey(n), "ability");

// =====================================================
// HISTÓRICO
// =====================================================
const getHistorico = () => JSON.parse(localStorage.getItem("historico") || "[]");
const setHistorico = h => localStorage.setItem("historico", JSON.stringify(h));

function guardarHistorico(p) {
    const h = getHistorico();
    if (!h.some(x => x.id === p.id)) {
        h.push({
            id: p.id,
            name: p.name,
            sprite: p.sprite,
            types: p.types
        });
        setHistorico(h);
    }
}

// =====================================================
// FAVORITOS
// =====================================================
const getFavoritos = () => JSON.parse(localStorage.getItem("favoritos") || "[]");
const setFavoritos = f => localStorage.setItem("favoritos", JSON.stringify(f));

const esFavorito = id => getFavoritos().some(f => f.id === id);

function toggleFavorito(p) {
    const f = getFavoritos();
    const idx = f.findIndex(x => x.id === p.id);
    if (idx >= 0) f.splice(idx, 1);
    else f.push({
        id: p.id,
        name: p.name,
        sprite: p.sprite,
        types: p.types
    });
    setFavoritos(f);
}

// =====================================================
// EVOLUCIONES
// =====================================================
async function obtenerEvoluciones(speciesUrl) {
    const s = await fetchDirect(speciesUrl);
    if (!s.ok) return null;
    const e = await fetchDirect(s.data.evolution_chain.url);
    if (!e.ok) return null;

    async function walk(n) {
        const p = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${n.species.name}`);
        return {
            name: n.species.name,
            sprite: p.ok ? p.data.sprites.front_default : "",
            children: await Promise.all(n.evolves_to.map(walk))
        };
    }
    return walk(e.data.chain);
}

function renderEvoluciones(n) {
    if (!n) return "<p>No hay evoluciones</p>";

    const card = p => `
        <div class="ev-card" onclick="buscarDesdeEvolucion('${p.name}')">
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

function buscarDesdeEvolucion(n) {
    document.getElementById("search").value = n;
    document.getElementById("tipoSelect").value = "POKÉMON";
    buscar();
}
window.buscarDesdeEvolucion = buscarDesdeEvolucion;

// =====================================================
// MOSTRAR POKÉMON
// =====================================================
async function mostrarPokemon(n) {
    showMessage("Cargando Pokémon...");
    const r = await obtenerPokemon(n);
    if (!r.ok) return showMessage("Pokémon no encontrado");

    const p = r.data;
    guardarHistorico(p);

    const evo = await obtenerEvoluciones(p.speciesUrl);

    showResultHtml(`
        <div class="card">
            <div class="badge" style="background:${r.source === "api" ? "#007bff" : "#28a745"}">
                ${r.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache"}
            </div>

            <h2>#${p.id} ${p.name.toUpperCase()}</h2>
            <img class="sprite" src="${p.sprite}">

            <h3>Tipos</h3>
            ${p.types.map(t => `<span class="label">${t}</span>`).join("")}

            <h3>Habilidades</h3>
            ${p.abilities.map(a =>
                `<span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">
                    ${a.name}${a.is_hidden ? " (Oculta 🔒)" : ""}
                </span>`).join("")}

            <h3>Estadísticas</h3>
            <ul class="stats-list">
                ${p.stats.map(s => `
                    <li class="stat-row">
                        <span class="stat-name">${s.name}</span>
                        <div class="stat-bar">
                            <div class="stat-fill" style="width:${s.base_stat / 3}%"></div>
                        </div>
                        <span>${s.base_stat}</span>
                    </li>`).join("")}
            </ul>

            <button id="btn-fav" class="btn-white">
                ⭐ ${esFavorito(p.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
            </button>

            <h3>Evoluciones</h3>
            <div class="evolutions">${renderEvoluciones(evo)}</div>
        </div>
    `);

    document.getElementById("btn-fav").onclick = () => {
        toggleFavorito(p);
        mostrarPokemon(p.name);
    };
}

// =====================================================
// MOSTRAR HABILIDAD
// =====================================================
async function mostrarHabilidad(n) {
    showMessage("Cargando Habilidad...");
    const r = await obtenerHabilidad(n);
    if (!r.ok) return showMessage("Habilidad no encontrada");

    const list = await Promise.all(r.data.pokemon.map(async p => {
        const name = p.url.split("/").filter(Boolean).pop();
        const r2 = await obtenerPokemon(name);
        return {
            name,
            sprite: r2.ok ? r2.data.sprite : "",
            isHidden: p.is_hidden
        };
    }));

    showResultHtml(`
        <div class="card">
            <div class="badge" style="background:${r.source === "api" ? "#007bff" : "#28a745"}">
                ${r.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache"}
            </div>

            <h2>${r.data.name.toUpperCase()}</h2>

            <div class="box-description">
                <strong>EFECTO</strong>
                <p>${r.data.description}</p>
            </div>

            <h3>POKÉMON CON ESTA HABILIDAD (${list.length})</h3>

            <div class="pokemon-grid">
                ${list.map(p => `
                    <div class="poke-card ability-card" data-name="${p.name}">
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

// =====================================================
// BUSCAR
// =====================================================
function buscar() {
    const q = sanitizeInput(document.getElementById("search").value);
    const t = document.getElementById("tipoSelect").value;
    if (!q) return showMessage("Escribe un valor válido");
    t === "HABILIDAD" ? mostrarHabilidad(q) : mostrarPokemon(q);
}
window.buscar = buscar;

// =====================================================
// DOM READY
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn");
    const input = document.getElementById("search");
    const select = document.getElementById("tipoSelect");

    btn?.addEventListener("click", buscar);
    input?.addEventListener("keydown", e => e.key === "Enter" && buscar());

    select?.addEventListener("change", () => {
        input.placeholder = select.value === "HABILIDAD"
            ? "NOMBRE DE HABILIDAD..."
            : "NOMBRE O ID...";
    });
});
