// =====================================================
// CONFIG
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
const pokemonCacheKey = k => `pokemon-${k.toLowerCase()}`;
const abilityCacheKey = k => `ability-${k.toLowerCase()}`;

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
        const res = await fetch(url);
        if (!res.ok) return { ok: false };
        return { ok: true, data: await res.json() };
    } catch {
        return { ok: false };
    }
}

// =====================================================
// API
// =====================================================
async function obtenerPokemon(name) {
    return fetchConCache(
        `https://pokeapi.co/api/v2/pokemon/${name.toLowerCase()}`,
        pokemonCacheKey(name),
        "pokemon"
    );
}

async function obtenerHabilidad(name) {
    return fetchConCache(
        `https://pokeapi.co/api/v2/ability/${name.toLowerCase()}`,
        abilityCacheKey(name),
        "ability"
    );
}

// =====================================================
// HISTÓRICO
// =====================================================
function getHistorico() {
    return JSON.parse(localStorage.getItem("historico") || "[]");
}

function setHistorico(arr) {
    localStorage.setItem("historico", JSON.stringify(arr));
}

function guardarEnHistorico(p) {
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
function getFavoritos() {
    return JSON.parse(localStorage.getItem("favoritos") || "[]");
}

function setFavoritos(arr) {
    localStorage.setItem("favoritos", JSON.stringify(arr));
}

function esFavorito(id) {
    return getFavoritos().some(f => f.id === id);
}

function toggleFavorito(p) {
    const favs = getFavoritos();
    const idx = favs.findIndex(f => f.id === p.id);

    if (idx >= 0) favs.splice(idx, 1);
    else favs.push({
        id: p.id,
        name: p.name,
        sprite: p.sprite,
        types: p.types
    });

    setFavoritos(favs);
}

// =====================================================
// EVOLUCIONES
// =====================================================
async function obtenerEvoluciones(speciesUrl) {
    const s = await fetchDirect(speciesUrl);
    if (!s.ok) return null;

    const e = await fetchDirect(s.data.evolution_chain.url);
    if (!e.ok) return null;

    async function procesar(node) {
        const p = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${node.species.name}`);
        return {
            name: node.species.name,
            sprite: p.ok ? p.data.sprites.front_default : "",
            children: await Promise.all(node.evolves_to.map(procesar))
        };
    }

    return procesar(e.data.chain);
}

function renderEvoluciones(nodo) {
    if (!nodo) return "<p>No hay evoluciones</p>";

    function card(p) {
        return `
            <div class="ev-card" onclick="buscarDesdeEvolucion('${p.name}')">
                <img src="${p.sprite}">
                <span>${p.name.toUpperCase()}</span>
            </div>
        `;
    }

    if (!nodo.children.length) return card(nodo);

    return `
        <div class="ev-line">
            ${card(nodo)}
            <span class="flecha">→</span>
            ${nodo.children.map(renderEvoluciones).join("")}
        </div>
    `;
}

function buscarDesdeEvolucion(name) {
    const input = document.getElementById("search");
    const select = document.getElementById("tipoSelect");

    if (select) select.value = "POKÉMON";
    if (input) input.value = name;

    buscar();
}
window.buscarDesdeEvolucion = buscarDesdeEvolucion;

// =====================================================
// DETALLE POKÉMON
// =====================================================
async function mostrarPokemon(name) {
    showMessage("Cargando Pokémon...");
    const r = await obtenerPokemon(name);
    if (!r.ok) return showMessage("No encontrado");

    const p = r.data;
    guardarEnHistorico(p);
    const evo = await obtenerEvoluciones(p.speciesUrl);

    showResultHtml(`
        <div class="card">
            <div class="badge" style="background:${r.source === "api" ? "var(--color-api)" : "var(--color-cache)"}">
                ${r.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache"}
            </div>

            <h2>#${p.id} ${p.name.toUpperCase()}</h2>
            <img class="sprite" src="${p.sprite}">

            ${p.types.map(t => `<span class="label">${t}</span>`).join("")}

            <h3>Estadísticas</h3>
            <ul class="stats-list">
                ${p.stats.map(s => `
                    <li class="stat-row">
                        <span class="stat-name">${s.name}</span>
                        <div class="stat-bar">
                            <div class="stat-fill" style="width:${s.base_stat / 3}%"></div>
                        </div>
                        <span>${s.base_stat}</span>
                    </li>
                `).join("")}
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
// HABILIDAD (como tu diseño)
// =====================================================
async function mostrarHabilidad(name) {
    showMessage("Cargando Habilidad...");
    const r = await obtenerHabilidad(name);
    if (!r.ok) return showMessage("Habilidad no encontrada");

    const ability = r.data;

    const pokemonList = await Promise.all(
        ability.pokemon.map(async p => {
            const parts = p.url.split("/").filter(Boolean);
            const pokeName = parts[parts.length - 1];
            const r2 = await obtenerPokemon(pokeName);
            return {
                name: pokeName,
                sprite: r2.ok ? r2.data.sprite : "",
                isHidden: p.is_hidden
            };
        })
    );

    showResultHtml(`
        <div class="card">
            <div class="badge" style="background:${r.source === "api" ? "var(--color-api)" : "var(--color-cache)"}">
                ${r.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache"}
            </div>

            <h2>${ability.name.toUpperCase()}</h2>

            <div class="box-description">
                <strong>EFECTO</strong>
                <p>${ability.description}</p>
            </div>

            <h3>POKÉMON CON ESTA HABILIDAD (${pokemonList.length})</h3>

            <div class="pokemon-grid">
                ${pokemonList.map(p => `
                    <div class="poke-card ability-card" data-name="${p.name}">
                        <img src="${p.sprite}">
                        <span>${p.name.toUpperCase()}</span>
                        ${p.isHidden ? `<small>(oculta 🔒)</small>` : ""}
                    </div>
                `).join("")}
            </div>
        </div>
    `);

    document.querySelectorAll(".ability-card").forEach(card => {
        card.onclick = () => {
            const name = card.dataset.name;
            const input = document.getElementById("search");
            const select = document.getElementById("tipoSelect");

            if (select) select.value = "POKÉMON";
            if (input) input.value = name;

            buscar();
        };
    });
}

// =====================================================
// BUSCAR (UNIFICADO)
// =====================================================
function buscar() {
    const entrada = sanitizeInput(document.getElementById("search")?.value);
    const tipo = document.getElementById("tipoSelect")?.value;

    if (!entrada) return showMessage("Escribe un valor válido.");

    if (tipo === "HABILIDAD") {
        mostrarHabilidad(entrada);
    } else {
        mostrarPokemon(entrada);
    }
}
window.buscar = buscar;

// =====================================================
// DOM READY
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn");
    const search = document.getElementById("search");
    const select = document.getElementById("tipoSelect");

    if (select && search) {
        select.addEventListener("change", () => {
            search.placeholder =
                select.value === "HABILIDAD"
                    ? "NOMBRE DE HABILIDAD..."
                    : "NOMBRE O ID...";
        });
    }

    btn?.addEventListener("click", buscar);
    search?.addEventListener("keydown", e => {
        if (e.key === "Enter") buscar();
    });

    if (location.pathname.includes("historico.html")) mostrarHistorico();
    if (location.pathname.includes("favoritos.html")) mostrarFavoritosHistorico();
});
