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
// CACHE
// =====================================================
const pokemonCacheKey = k => `pokemon-${k.toLowerCase()}`;

// =====================================================
// FETCH CON CACHE
// =====================================================
async function fetchConCache(url, key) {
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

    const essential = {
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

    localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        data: essential
    }));

    return { ok: true, source: "api", data: essential };
}

// =====================================================
// FETCH DIRECTO (EVOLUCIONES)
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
        pokemonCacheKey(name)
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

function eliminarDeHistorico(id) {
    setHistorico(getHistorico().filter(p => p.id !== id));
}

function limpiarHistorico() {
    localStorage.removeItem("historico");
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
// EVOLUCIONES
// =====================================================
async function obtenerEvoluciones(speciesUrl) {
    const s = await fetchDirect(speciesUrl);
    if (!s.ok) return null;

    const e = await fetchDirect(s.data.evolution_chain.url);
    if (!e.ok) return null;

    async function procesar(node) {
        const poke = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${node.species.name}`);
        return {
            name: node.species.name,
            sprite: poke.ok ? poke.data.sprites.front_default : "",
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
    if (input) input.value = name;
    buscar();
}

// =====================================================
// DETALLE (🔥 STATS + EVOLUCIONES RESTAURADAS)
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
            <div class="evolutions">
                ${renderEvoluciones(evo)}
            </div>
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
        if (clearBtn) clearBtn.style.display = "none";
        return;
    }

    if (clearBtn) clearBtn.style.display = "block";

    r.innerHTML = `
        <div class="pokemon-grid">
            ${h.slice().reverse().map(p => `
                <div class="poke-card">
                    <img src="${p.sprite}">
                    <strong>#${p.id} ${p.name.toUpperCase()}</strong>
                    ${safeTypes(p.types).map(t => `<span class="label">${t}</span>`).join("")}

                    <button class="btn-white btn-toggle" data-id="${p.id}">
                        ⭐ ${esFavorito(p.id) ? "Quitar" : "Agregar"}
                    </button>

                    <button class="btn-red btn-del" data-id="${p.id}">🗑</button>
                </div>
            `).join("")}
        </div>
    `;

    r.querySelectorAll(".btn-toggle").forEach(btn => {
        btn.onclick = () => {
            const id = Number(btn.dataset.id);
            const p = h.find(x => x.id === id);
            toggleFavorito(p);
            mostrarHistorico();
        };
    });

    r.querySelectorAll(".btn-del").forEach(btn => {
        btn.onclick = () => {
            eliminarDeHistorico(Number(btn.dataset.id));
            mostrarHistorico();
        };
    });
}

// =====================================================
// FAVORITOS LANDING
// =====================================================
function mostrarFavoritosHistorico() {
    const f = getFavoritos();
    const r = document.getElementById("result");
    const clearBtn = document.getElementById("clearAll");

    if (!r) return;

    if (f.length === 0) {
        r.innerHTML = `<div class="card no-favs-card">❤️ No hay favoritos</div>`;
        if (clearBtn) clearBtn.style.display = "none";
        return;
    }

    if (clearBtn) clearBtn.style.display = "block";

    r.innerHTML = `
        <div class="pokemon-grid">
            ${f.slice().reverse().map(p => `
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
            setFavoritos(getFavoritos().filter(f => f.id !== Number(btn.dataset.id)));
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
// BUSCAR
// =====================================================
function buscar() {
    const v = sanitizeInput(document.getElementById("search")?.value);
    if (v) mostrarPokemon(v);
}

// =====================================================
// DOM READY
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn")?.addEventListener("click", buscar);
    document.getElementById("search")?.addEventListener("keydown", e => {
        if (e.key === "Enter") buscar();
    });

    if (location.pathname.includes("historico.html")) mostrarHistorico();
    if (location.pathname.includes("favoritos.html")) mostrarFavoritosHistorico();
});
