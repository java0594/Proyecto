// Funciona 
// -----------------------------------------------------
// CONFIGURACIÓN
// -----------------------------------------------------
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
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

// -----------------------------------------------------
// FUNCIÓN PRINCIPAL DE CACHE (robusta)
// -----------------------------------------------------
async function fetchConCache(url, cacheKey) {
    try {
        const cacheRaw = localStorage.getItem(cacheKey);
        if (cacheRaw) {
            const cacheObj = JSON.parse(cacheRaw);
            const now = Date.now();
            if (now - cacheObj.timestamp < CACHE_TTL) {
                return { ok: true, source: "cache", data: cacheObj.data };
            }
        }
    } catch (err) {
        console.warn("Error leyendo cache:", err);
        localStorage.removeItem(cacheKey);
    }

    let response;
    try {
        response = await fetch(url);
    } catch (err) {
        return { ok: false, error: `Network error: ${err.message}` };
    }

    if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
    }

    let data;
    try {
        data = await response.json();
    } catch (err) {
        return { ok: false, error: `JSON parse error: ${err.message}` };
    }

    const minimalData = {
        id: data.id,
        name: data.name,
        sprites: { front_default: data.sprites.front_default },
        types: data.types,
        stats: data.stats,
        abilities: data.abilities,
        species: data.species
    };

    try {
        localStorage.setItem(
            cacheKey,
            JSON.stringify({ timestamp: Date.now(), data: minimalData })
        );
    } catch (err) {
        if (err.name === "QuotaExceededError") {
            console.warn("Cache llena, eliminando cache antiguo");
            localStorage.clear();
            try {
                localStorage.setItem(
                    cacheKey,
                    JSON.stringify({ timestamp: Date.now(), data: minimalData })
                );
            } catch (err2) {
                console.error("No se pudo guardar en localStorage incluso después de limpiar:", err2);
            }
        } else {
            console.warn("No se pudo guardar en localStorage:", err);
        }
    }

    return { ok: true, source: "api", data: minimalData };
}

// -----------------------------------------------------
// OBTENER POKÉMON (por nombre o id)
// -----------------------------------------------------
async function obtenerPokemon(entrada) {
    const clave = /^\d+$/.test(String(entrada).trim()) ? String(entrada).trim() : String(entrada).trim().toLowerCase();
    const url = `https://pokeapi.co/api/v2/pokemon/${clave}`;
    const cacheKey = `pokemon-${clave}`;
    return await fetchConCache(url, cacheKey);
}

// -----------------------------------------------------
// OBTENER EVOLUCIONES (estructura recursiva)
// -----------------------------------------------------
async function obtenerEvolucionAvanzada(speciesUrl) {
    const speciesRes = await fetch(speciesUrl);
    if (!speciesRes.ok) return null;
    const species = await speciesRes.json();

    const evoRes = await fetch(species.evolution_chain.url);
    if (!evoRes.ok) return null;
    const evoData = await evoRes.json();

    async function procesar(node) {
        const nombre = node.species.name;
        const info = await obtenerPokemon(nombre);
        const sprite = info.ok ? info.data.sprites.front_default : "";
        const children = await Promise.all(node.evolves_to.map(e => procesar(e)));
        return { name: nombre, sprite, children };
    }

    return procesar(evoData.chain);
}

// -----------------------------------------------------
// RENDERIZADO EVOLUCIONES (clicable)
// -----------------------------------------------------
function renderEvoluciones(nodo) {
    function card(p) {
        const safeName = p.name.replace(/'/g, "\\'");
        return `
            <div class="ev-card" onclick="mostrarDatosDesdeEvolucion('${safeName}')">
                <img src="${p.sprite || ''}" alt="${p.name}">
                <span>${p.name.toUpperCase()}</span>
            </div>
        `;
    }

    if (!nodo) return "<p>No hay evolución</p>";

    if (!nodo.children || nodo.children.length === 0) {
        return `<div class="ev-single">${card(nodo)}</div>`;
    }

    if (nodo.children.length === 1) {
        return `
            <div class="ev-line" style="display:flex;align-items:center;gap:12px;">
                ${card(nodo)}
                <span class="flecha">→</span>
                ${renderEvoluciones(nodo.children[0])}
            </div>
        `;
    }

    return `
        <div class="ev-ramificada" style="display:flex;align-items:flex-start;gap:12px;">
            ${card(nodo)}
            <span class="flecha">→</span>
            <div class="ev-ramas" style="display:flex;flex-wrap:wrap;gap:10px;">
                ${nodo.children.map(ch => card(ch)).join("")}
            </div>
        </div>
    `;
}

// -----------------------------------------------------
// FUNCIÓN PRINCIPAL: mostrarDatos
// -----------------------------------------------------
async function mostrarDatos() {
    const raw = document.getElementById("search") ? document.getElementById("search").value : "";
    const entrada = sanitizeInput(raw);

    if (!entrada) {
        showMessage("Escribe un nombre o id válido.");
        return;
    }

    showMessage("Cargando...");

    try {
        const resultado = await obtenerPokemon(entrada);

        if (!resultado.ok) {
            showMessage("Pokémon no encontrado (" + (resultado.error || "error") + ")");
            console.warn("obtenerPokemon error:", resultado);
            return;
        }

        const pokemon = resultado.data;

        let evolucionAvanzada = null;
        try {
            evolucionAvanzada = await obtenerEvolucionAvanzada(pokemon.species.url);
        } catch (err) {
            console.warn("Error al obtener evolución:", err);
        }

        const htmlEvoluciones = evolucionAvanzada ? renderEvoluciones(evolucionAvanzada) : "<p>No hay evoluciones</p>";

        const resultHtml = `
            <div class="card">
                <div id="badge"></div>

                <h2>#${pokemon.id} ${pokemon.name.toUpperCase()}</h2>

                <div class="box">
                    <img class="sprite" src="${pokemon.sprites.front_default}" alt="${pokemon.name}">
                </div>

                <h3>Tipos</h3>
                ${pokemon.types.map(t => `<span class="label">${t.type.name}</span>`).join("")}

                <h3>Habilidades</h3>
                ${pokemon.abilities.map(a => `<span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">${a.ability.name}${a.is_hidden ? " (Oculta 🔒)" : ""}</span>`).join("")}

                <h3>Estadísticas</h3>
                <ul class="stats-list">
                    ${pokemon.stats.map(s => `
                        <li class="stat-row">
                            <span class="stat-name">${s.stat.name}</span>
                            <div class="stat-bar"><div class="stat-fill" style="width:${s.base_stat / 3}%;"></div></div>
                            <span class="stat-value">${s.base_stat}</span>
                        </li>
                    `).join("")}
                </ul>

                <h3>Evoluciones</h3>
                <div class="evolutions">${htmlEvoluciones}</div>
            </div>
        `;

        showResultHtml(resultHtml);

        const badge = document.getElementById("badge");
        if (badge) {
            badge.className = "badge";
            badge.textContent = resultado.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache";
            badge.style.background = resultado.source === "api" ? "#007bff" : "#28a745";
        }

    } catch (err) {
        console.error("mostrarDatos fallo:", err);
        showMessage("Ocurrió un error. Revisa la consola.");
    }
}

// -----------------------------------------------------
// CARGA DEL DOM Y ASIGNACIÓN DE EVENTOS
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn");
    const searchInput = document.getElementById("search");

    if (btn) btn.addEventListener("click", mostrarDatos);
    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") mostrarDatos();
        });
        searchInput.focus();
    }
});

// -----------------------------------------------------
// FUNCION PARA CLIC EN EVOLUCIONES (global)
// -----------------------------------------------------
async function mostrarDatosDesdeEvolucion(nombre) {
    const inp = document.getElementById("search");
    if (inp) inp.value = nombre;
    await mostrarDatos();
}
