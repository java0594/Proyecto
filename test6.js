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

    try {
        localStorage.setItem(
            cacheKey,
            JSON.stringify({ timestamp: Date.now(), data })
        );
    } catch (err) {
        if (err.name === "QuotaExceededError") {
            console.warn("Cache llena, eliminando cache antiguo");
            localStorage.clear();
            try {
                localStorage.setItem(
                    cacheKey,
                    JSON.stringify({ timestamp: Date.now(), data })
                );
            } catch (err2) {
                console.error("No se pudo guardar en localStorage incluso después de limpiar:", err2);
            }
        } else {
            console.warn("No se pudo guardar en localStorage:", err);
        }
    }

    return { ok: true, source: "api", data };
}

// -----------------------------------------------------
// OBTENER HABILIDAD
// -----------------------------------------------------
async function obtenerHabilidad(nombre) {
    const clave = sanitizeInput(nombre).toLowerCase();
    const url = `https://pokeapi.co/api/v2/ability/${clave}`;
    const cacheKey = `ability-${clave}`;
    return await fetchConCache(url, cacheKey);
}

// -----------------------------------------------------
// OBTENER POKÉMON (solo sprite y nombre)
// -----------------------------------------------------
async function obtenerPokemon(pokemonUrl) {
    const clave = pokemonUrl.split("/").filter(Boolean).pop(); // último segmento
    const cacheKey = `pokemon-${clave}`;
    const res = await fetchConCache(pokemonUrl, cacheKey);
    if (!res.ok) return { name: clave, sprite: "", fromCache: false };
    return { name: res.data.name, sprite: res.data.sprites.front_default, fromCache: res.source === "cache" };
}

// -----------------------------------------------------
// RENDERIZAR HABILIDAD
// -----------------------------------------------------
async function renderHabilidad(habilidadData) {
    const ability = habilidadData.data;
    const badgeFrom = habilidadData.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache";

    const effectEntry = ability.effect_entries.find(e => e.language.name === 'en');
    const descripcion = effectEntry ? effectEntry.effect : "Sin descripción";

    // Obtener Pokémon con la habilidad
    const pokemonPromises = ability.pokemon.map(async p => {
        const info = await obtenerPokemon(p.pokemon.url);
        return { ...info, isHidden: p.is_hidden };
    });

    const pokemonList = await Promise.all(pokemonPromises);

    const html = `
        <div class="card">
            <div id="badge" class="badge" style="background:${habilidadData.source === "api" ? "#007bff" : "#28a745"}">${badgeFrom}</div>
            <h2>${ability.name.toUpperCase()}</h2>

            <div class="box-description">
                <strong>EFECTO</strong>
                <p>${descripcion}</p>
            </div>

            <h3>POKÉMON CON ESTA HABILIDAD (${pokemonList.length})</h3>
            <div class="pokemon-grid">
                ${pokemonList.map(p => `
                    <div class="poke-card">
                        <img src="${p.sprite}" alt="${p.name}">
                        <span>${p.name.toUpperCase()}</span>
                        ${p.isHidden ? '<small>(oculta 🔒)</small>' : ''}
                        <small style="color:gray">[${p.fromCache ? 'Cache' : 'API'}]</small>
                    </div>
                `).join("")}
            </div>
        </div>
    `;

    showResultHtml(html);
}

// -----------------------------------------------------
// FUNCION PRINCIPAL: mostrarHabilidad
// -----------------------------------------------------
async function mostrarHabilidad() {
    const raw = document.getElementById("search") ? document.getElementById("search").value : "";
    const entrada = sanitizeInput(raw);

    if (!entrada) {
        showMessage("Escribe un nombre de habilidad válido.");
        return;
    }

    showMessage("Cargando...");

    try {
        const resultado = await obtenerHabilidad(entrada);

        if (!resultado.ok) {
            showMessage("Habilidad no encontrada (" + (resultado.error || "error") + ")");
            console.warn("obtenerHabilidad error:", resultado);
            return;
        }

        await renderHabilidad(resultado);
    } catch (err) {
        console.error("mostrarHabilidad fallo:", err);
        showMessage("Ocurrió un error. Revisa la consola.");
    }
}

// -----------------------------------------------------
// CARGA DEL DOM Y ASIGNACIÓN DE EVENTOS
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn");
    const searchInput = document.getElementById("search");

    if (btn) btn.addEventListener("click", mostrarHabilidad);
    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") mostrarHabilidad();
        });
        searchInput.focus();
    }
});
