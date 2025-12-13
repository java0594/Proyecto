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

function safeTypes(types) {
    return Array.isArray(types) ? types : [];
}

// =====================================================
// CACHE KEYS
// =====================================================
const pokemonCacheKey = k => `pokemon-${k.toLowerCase()}`;
const abilityCacheKey = k => `ability-${k.toLowerCase()}`;

// =====================================================
// FETCH CACHE
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
            stats: data.stats.map(s => ({ name: s.stat.name, base_stat: s.base_stat })),
            abilities: data.abilities.map(a => ({
                name: a.ability.name,
                is_hidden: a.is_hidden
            })),
            speciesUrl: data.species.url
        };
    } else {
        const eff = data.effect_entries.find(e => e.language.name === "en");
        essential = {
            id: data.id,
            name: data.name,
            description: eff ? eff.effect : "Sin descripción",
            pokemon: data.pokemon
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
async function obtenerPokemon(name) {
    return fetchConCache(
        `https://pokeapi.co/api/v2/pokemon/${name.toLowerCase()}`,
        pokemonCacheKey(name),
        "pokemon"
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
// FAVORITOS (MISMO MODELO)
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

    if (idx >= 0) {
        favs.splice(idx, 1);
    } else {
        favs.push({
            id: p.id,
            name: p.name,
            sprite: p.sprite,
            types: p.types
        });
    }
    setFavoritos(favs);
}

// =====================================================
// DETALLE
// =====================================================
async function mostrarPokemon(name) {
    showMessage("Cargando Pokémon...");
    const r = await obtenerPokemon(name);
    if (!r.ok) return showMessage("No encontrado");

    const p = r.data;
    guardarEnHistorico(p);

    showResultHtml(`
        <div class="card">
            <div class="badge" style="background:${r.source === "api" ? "var(--color-api)" : "var(--color-cache)"}">
                ${r.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache"}
            </div>

            <h2>#${p.id} ${p.name.toUpperCase()}</h2>
            <img class="sprite" src="${p.sprite}">

            ${p.types.map(t => `<span class="label">${t}</span>`).join("")}

            <button id="btn-fav" class="btn-white">
                ⭐ ${esFavorito(p.id) ? "Quitar de favoritos" : "Agregar a favoritos"}
            </button>
        </div>
    `);

    document.getElementById("btn-fav").onclick = () => {
        toggleFavorito(p);
        mostrarPokemon(p.name);
    };
}

// =====================================================
// HISTÓRICO LANDING
// =====================================================
function mostrarHistorico() {
    const h = getHistorico();
    const r = document.getElementById("result");
    const clearBtn = document.getElementById("clearHistorico");

    if (!r) return;

    if (h.length === 0) {
        r.innerHTML = `<div class="card no-favs-card">📜 No hay histórico</div>`;
        return;
    }

    r.innerHTML = `
        <div class="pokemon-grid">
            ${h.slice().reverse().map(p => `
                <div class="poke-card">
                    <img src="${p.sprite}">
                    <strong>#${p.id} ${p.name.toUpperCase()}</strong>
                    ${safeTypes(p.types).map(t => `<span class="label">${t}</span>`).join("")}
                </div>
            `).join("")}
        </div>
    `;
}

// =====================================================
// FAVORITOS LANDING (🔥 CORREGIDO)
// =====================================================
function mostrarFavoritosHistorico() {
    const favs = getFavoritos();
    const r = document.getElementById("result");
    const clearBtn = document.getElementById("clearAll");

    if (!r) return;

    if (favs.length === 0) {
        r.innerHTML = `<div class="card no-favs-card">❤️ No hay favoritos</div>`;
        if (clearBtn) clearBtn.style.display = "none";
        return;
    }

    if (clearBtn) clearBtn.style.display = "block";

    r.innerHTML = `
        <div class="pokemon-grid">
            ${favs.slice().reverse().map(p => `
                <div class="poke-card">
                    <img src="${p.sprite}">
                    <strong>#${p.id} ${p.name.toUpperCase()}</strong>
                    ${safeTypes(p.types).map(t => `<span class="label">${t}</span>`).join("")}
                    <button class="btn-red" data-id="${p.id}">🗑</button>
                </div>
            `).join("")}
        </div>
    `;

    r.querySelectorAll("button[data-id]").forEach(btn => {
        btn.onclick = () => {
            const id = Number(btn.dataset.id);
            setFavoritos(getFavoritos().filter(f => f.id !== id));
            mostrarFavoritosHistorico();
        };
    });

    if (clearBtn) {
        clearBtn.onclick = () => {
            if (confirm("¿Eliminar todos los favoritos?")) {
                localStorage.removeItem("favoritos");
                mostrarFavoritosHistorico();
            }
        };
    }
}

// =====================================================
// DOM READY
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn")?.addEventListener("click", () => {
        const v = document.getElementById("search")?.value;
        mostrarPokemon(v);
    });

    if (location.pathname.includes("historico.html")) mostrarHistorico();
    if (location.pathname.includes("favoritos.html")) mostrarFavoritosHistorico();
});
