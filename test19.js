// =====================================================
// CONFIGURACIÓN
// =====================================================
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

// =====================================================
// HELPERS
// =====================================================
function sanitizeInput(raw) {
    if (raw === null || raw === undefined) return "";
    return String(raw).trim();
}

function showResultHtml(html) {
    const result = document.getElementById("result");
    if (result) result.innerHTML = html;
}

function showMessage(msg) {
    showResultHtml(`<p>${msg}</p>`);
}

// =====================================================
// CLAVES DE CACHE
// =====================================================
function pokemonCacheKey(input) {
    return `pokemon-${String(input).trim().toLowerCase()}`;
}

function abilityCacheKey(input) {
    return `ability-${String(input).trim().toLowerCase()}`;
}

// =====================================================
// FETCH CON CACHE
// =====================================================
async function fetchConCache(url, cacheKey, tipo) {
    try {
        const cacheRaw = localStorage.getItem(cacheKey);
        if (cacheRaw) {
            const cacheObj = JSON.parse(cacheRaw);
            if (Date.now() - cacheObj.timestamp < CACHE_TTL) {
                return { ok: true, source: "cache", data: cacheObj.data };
            }
        }
    } catch {
        localStorage.removeItem(cacheKey);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) return { ok: false };
        const data = await response.json();

        let essentialData;
        if (tipo === "pokemon") {
            essentialData = {
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
            const effect = data.effect_entries.find(e => e.language.name === "en");
            essentialData = {
                id: data.id,
                name: data.name,
                description: effect ? effect.effect : "Sin descripción",
                pokemon: data.pokemon
            };
        }

        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: essentialData
        }));

        return { ok: true, source: "api", data: essentialData };

    } catch {
        return { ok: false };
    }
}

// =====================================================
// FETCH DIRECTO
// =====================================================
async function fetchDirect(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return { ok: false };
        return { ok: true, data: await response.json() };
    } catch {
        return { ok: false };
    }
}

// =====================================================
// API
// =====================================================
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

// =====================================================
// EVOLUCIONES
// =====================================================
async function obtenerEvolucion(speciesUrl) {
    const speciesRes = await fetchDirect(speciesUrl);
    if (!speciesRes.ok) return null;

    const evoRes = await fetchDirect(speciesRes.data.evolution_chain.url);
    if (!evoRes.ok) return null;

    async function procesar(node) {
        const pokeRes = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${node.species.name}`);
        return {
            name: node.species.name,
            sprite: pokeRes.ok ? pokeRes.data.sprites.front_default : "",
            children: await Promise.all(node.evolves_to.map(procesar))
        };
    }

    return procesar(evoRes.data.chain);
}

function renderEvoluciones(nodo) {
    if (!nodo) return "<p>No hay evoluciones</p>";

    function card(p) {
        return `
            <div class="ev-card" onclick="mostrarDesdeEvolucion('${p.name}')">
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

function mostrarDesdeEvolucion(nombre) {
    const input = document.getElementById("search");
    if (input) input.value = nombre;
    buscar();
}

// =====================================================
// FAVORITOS
// =====================================================
function getFavoritos() {
    try {
        return JSON.parse(localStorage.getItem("favoritos")) || [];
    } catch {
        return [];
    }
}

function esFavorito(id) {
    return getFavoritos().some(f => f.id === id);
}

function guardarFavorito(pokemon) {
    const favs = getFavoritos();
    const index = favs.findIndex(f => f.id === pokemon.id);

    if (index >= 0) {
        favs.splice(index, 1);
    } else {
        favs.push({
            id: pokemon.id,
            name: pokemon.name,
            sprite: pokemon.sprite
        });
    }

    localStorage.setItem("favoritos", JSON.stringify(favs));
    return index < 0;
}

// =====================================================
// RENDER POKÉMON
// =====================================================
async function mostrarPokemon(entrada) {
    showMessage("Cargando Pokémon...");
    const resultado = await obtenerPokemon(entrada);

    if (!resultado.ok) {
        showMessage("Pokémon no encontrado");
        return;
    }

    const p = resultado.data;
    const evoluciones = await obtenerEvolucion(p.speciesUrl);

    showResultHtml(`
        <div class="card">
            <div id="badge" class="badge">
                ${resultado.source === "api" ? "⚡ API" : "💾 Cache"}
            </div>

            <h2>#${p.id} ${p.name.toUpperCase()}</h2>

            <img class="sprite" src="${p.sprite}">

            <h3>Tipos</h3>
            ${p.types.map(t => `<span class="label">${t}</span>`).join("")}

            <h3>Habilidades</h3>
            ${p.abilities.map(a =>
                `<span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">
                    ${a.name}${a.is_hidden ? " (Oculta 🔒)" : ""}
                </span>`
            ).join("")}

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
                ⭐ ${esFavorito(p.id) ? "Eliminar de favoritos" : "Agregar a favoritos"}
            </button>

            <h3>Evoluciones</h3>
            <div class="evolutions">
                ${renderEvoluciones(evoluciones)}
            </div>
        </div>
    `);

    document.getElementById("btn-fav").addEventListener("click", () => {
        guardarFavorito(p);
        mostrarPokemon(p.name);
    });
}

// =====================================================
// FAVORITOS / HISTÓRICO LANDING
// =====================================================
function mostrarFavoritosHistorico() {
    const favs = getFavoritos();
    const result = document.getElementById("result");
    const clearBtn = document.getElementById("clearAll");

    if (!result) return;

    if (favs.length === 0) {
        result.innerHTML = `
            <div class="card no-favs-card">
                ⭐ No tienes Pokémon favoritos aún
            </div>
        `;
        if (clearBtn) clearBtn.style.display = "none";
        return;
    }

    if (clearBtn) clearBtn.style.display = "block";

    const html = favs.slice().reverse().map(p => `
        <div class="poke-card fav-historico-card" data-name="${p.name}">
            <img src="${p.sprite}">
            <strong>#${p.id} ${p.name.toUpperCase()}</strong>

            <div class="fav-historico-actions">
                <button class="btn-historico-fav">❤️</button>
                <button class="btn-historico-delete" data-id="${p.id}">🗑</button>
            </div>
        </div>
    `).join("");

    result.innerHTML = `<div class="pokemon-grid">${html}</div>`;

    result.querySelectorAll(".fav-historico-card").forEach(card => {
        card.addEventListener("click", () => {
            const name = card.dataset.name;
            window.location.href = `index.html?pokemon=${name}`;
        });
    });

    result.querySelectorAll(".btn-historico-delete").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = Number(btn.dataset.id);
            const nuevos = getFavoritos().filter(f => f.id !== id);
            localStorage.setItem("favoritos", JSON.stringify(nuevos));
            mostrarFavoritosHistorico();
        });
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
async function buscar() {
    const entrada = sanitizeInput(document.getElementById("search")?.value);
    const tipo = document.getElementById("tipoSelect")?.value;

    if (!entrada) {
        showMessage("Escribe un valor válido");
        return;
    }

    if (tipo === "HABILIDAD") {
        const r = await obtenerHabilidad(entrada);
        if (!r.ok) {
            showMessage("Habilidad no encontrada");
            return;
        }
        showResultHtml(`
            <div class="card">
                <h2>${r.data.name.toUpperCase()}</h2>
                <p>${r.data.description}</p>
            </div>
        `);
    } else {
        mostrarPokemon(entrada);
    }
}

// =====================================================
// DOM READY
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn")?.addEventListener("click", buscar);
    document.getElementById("search")?.addEventListener("keydown", e => {
        if (e.key === "Enter") buscar();
    });

    // Carga desde URL
    const param = new URLSearchParams(window.location.search).get("pokemon");
    if (param) {
        const input = document.getElementById("search");
        if (input) input.value = param;
        buscar();
    }

    // Favoritos landing
    if (window.location.pathname.includes("favoritos.html")) {
        mostrarFavoritosHistorico();
    }
});
