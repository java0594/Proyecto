// Mejora de cache 
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
// CLAVES DE CACHE NORMALIZADAS
// -----------------------------------------------------
function pokemonCacheKey(input) {
    return `pokemon-${String(input).trim().toLowerCase()}`;
}

function abilityCacheKey(input) {
    return `ability-${String(input).trim().toLowerCase()}`;
}

// -----------------------------------------------------
// FETCH CON CACHE (solo para búsquedas desde barra)
// -----------------------------------------------------
async function fetchConCache(url, cacheKey, tipo="pokemon") {
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

    if (!response.ok) return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };

    let data;
    try { data = await response.json(); } 
    catch (err) { return { ok: false, error: `JSON parse error: ${err.message}` }; }

    // Guardar solo datos esenciales
    let essentialData;
    if (tipo === "pokemon") {
        essentialData = {
            id: data.id,
            name: data.name,
            types: data.types.map(t => t.type.name),
            stats: data.stats.map(s => ({ name: s.stat.name, base_stat: s.base_stat })),
            abilities: data.abilities.map(a => ({ name: a.ability.name, is_hidden: a.is_hidden })),
            sprite: data.sprites.front_default,
            speciesUrl: data.species.url
        };
    } else if (tipo === "ability") {
        const effectEntry = data.effect_entries.find(e => e.language.name === "en");
        essentialData = {
            id: data.id,
            name: data.name,
            description: effectEntry ? effectEntry.effect : "Sin descripción",
            pokemon: data.pokemon.map(p => ({
                name: p.pokemon.name,
                url: p.pokemon.url,
                is_hidden: p.is_hidden
            }))
        };
    } else {
        essentialData = data;
    }

    try { localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: essentialData })); }
    catch (err) { console.warn("No se pudo guardar en localStorage:", err); }

    return { ok: true, source: "api", data: essentialData };
}

// -----------------------------------------------------
// FETCH DIRECTO (sin cache, para evoluciones)
// -----------------------------------------------------
async function fetchDesdeApi(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
        const data = await response.json();
        return { ok: true, data };
    } catch (err) {
        return { ok: false, error: `Network error: ${err.message}` };
    }
}

// -----------------------------------------------------
// OBTENER POKÉMON / HABILIDAD
// -----------------------------------------------------
async function obtenerPokemon(entrada) {
    const clave = sanitizeInput(entrada).toLowerCase();
    const url = `https://pokeapi.co/api/v2/pokemon/${clave}`;
    return await fetchConCache(url, pokemonCacheKey(clave), "pokemon");
}

async function obtenerHabilidad(nombre) {
    const clave = sanitizeInput(nombre).toLowerCase();
    const url = `https://pokeapi.co/api/v2/ability/${clave}`;
    return await fetchConCache(url, abilityCacheKey(clave), "ability");
}

// -----------------------------------------------------
// OBTENER EVOLUCIONES (solo trae sprite desde API, no cache)
// -----------------------------------------------------
async function obtenerEvolucionAvanzada(speciesUrl) {
    const speciesRes = await fetchDesdeApi(speciesUrl);
    if (!speciesRes.ok) return null;
    const species = speciesRes.data;

    const evoRes = await fetchDesdeApi(species.evolution_chain.url);
    if (!evoRes.ok) return null;
    const evoData = evoRes.data;

    async function procesar(node) {
        const nombre = node.species.name;
        const res = await fetchDesdeApi(`https://pokeapi.co/api/v2/pokemon/${nombre}`);
        const sprite = res.ok ? res.data.sprites.front_default : "";
        const children = await Promise.all(node.evolves_to.map(e => procesar(e)));
        return { name: nombre, sprite, children };
    }

    return procesar(evoData.chain);
}

// -----------------------------------------------------
// RENDER EVOLUCIONES
// -----------------------------------------------------
function renderEvoluciones(nodo) {
    function card(p) {
        const safeName = p.name.replace(/'/g, "\\'");
        return `
            <div class="ev-card" onclick="mostrarDatosDesdeEvolucion('${safeName}'); event.stopPropagation();">
                <img src="${p.sprite || ''}" alt="${p.name}">
                <span>${p.name.toUpperCase()}</span>
            </div>
        `;
    }

    if (!nodo) return "<p>No hay evolución</p>";
    if (!nodo.children || nodo.children.length === 0) return `<div class="ev-single">${card(nodo)}</div>`;
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
// OBTENER SPRITE SIMPLE
// -----------------------------------------------------
async function obtenerPokemonSimple(url) {
    const parts = url.split("/").filter(Boolean);
    const nombre = parts[parts.length - 2];
    const res = await fetchConCache(url, pokemonCacheKey(nombre), "pokemon");
    if (!res.ok) return { name: nombre, sprite: "", fromCache: false };
    return { name: res.data.name, sprite: res.data.sprite, fromCache: res.source === "cache" };
}

// -----------------------------------------------------
// FAVORITOS
// -----------------------------------------------------
// -----------------------------------------------------
// FAVORITOS COMPLETOS
// -----------------------------------------------------

function getFavoritos() {
    try {
        const data = localStorage.getItem("favoritos");
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function esFavorito(id) {
    return getFavoritos().some(f => f.id === id);
}

function guardarFavorito(pokemon) {
    const favs = getFavoritos();
    const existe = favs.find(f => f.id === pokemon.id);

    if (existe) {
        const nuevos = favs.filter(f => f.id !== pokemon.id);
        localStorage.setItem("favoritos", JSON.stringify(nuevos));
        return false;
    } else {
        favs.push({
            id: pokemon.id,
            name: pokemon.name,
            sprite: pokemon.sprite,
            types: pokemon.types
        });
        localStorage.setItem("favoritos", JSON.stringify(favs));
        return true;
    }
}

function eliminarFavorito(id) {
    const favs = getFavoritos().filter(f => f.id !== id);
    localStorage.setItem("favoritos", JSON.stringify(favs));
    mostrarFavoritos(); // refresca la vista
}

function eliminarTodosFavoritos() {
    localStorage.removeItem("favoritos");
    mostrarFavoritos();
}

function mostrarFavoritos() {
    const favs = getFavoritos();
    const result = document.getElementById("result");
    if (!result) return;

    if (favs.length === 0) {
        result.innerHTML = `
            <div class="no-favs-card">
                <p>No hay Pokémon favoritos aún.</p>
            </div>
        `;
        return;
    }

    const cards = favs.map(p => `
        <div class="fav-card">
            <img src="${p.sprite}" alt="${p.name}">
            <h3>${p.name.toUpperCase()} (#${p.id})</h3>
            <div class="types">
                ${p.types.map(t => `<span class="label">${t}</span>`).join("")}
            </div>

            <button class="btn-remove" onclick="eliminarFavorito(${p.id})">
                ❌ Eliminar
            </button>
        </div>
    `).join("");

    result.innerHTML = `
        <button class="btn-remove-all" onclick="eliminarTodosFavoritos()">
            🗑️ Eliminar Todos
        </button>
        <div class="pokemon-grid">${cards}</div>
    `;
}


// -----------------------------------------------------
// RENDER POKÉMON
// -----------------------------------------------------
async function mostrarDatosInterna(entrada) {
    showMessage("Cargando Pokémon...");
    try {
        const resultado = await obtenerPokemon(entrada);
        if (!resultado.ok) {
            showMessage("Pokémon no encontrado (" + (resultado.error || "error") + ")");
            return;
        }
        const pokemon = resultado.data;

        let evolucionAvanzada = null;
        try { evolucionAvanzada = await obtenerEvolucionAvanzada(pokemon.speciesUrl); }
        catch (err) { console.warn("Error evoluciones:", err); }

        const htmlEvoluciones = evolucionAvanzada ? renderEvoluciones(evolucionAvanzada) : "<p>No hay evoluciones</p>";

        const resultHtml = `
            <div class="card">
                <div id="badge" class="badge" style="background:${resultado.source==="api"?"#007bff":"#28a745"}">
                    ${resultado.source==="api"?"⚡ Datos desde API":"💾 Desde Cache"}
                </div>
                <h2>#${pokemon.id} ${pokemon.name.toUpperCase()}</h2>
                <div class="box">
                    <img class="sprite" src="${pokemon.sprite}" alt="${pokemon.name}">
                </div>
                <h3>Tipos</h3>
                ${pokemon.types.map(t=>`<span class="label">${t}</span>`).join("")}
                <h3>Habilidades</h3>
                ${pokemon.abilities.map(a=>`<span class="label-habilidades ${a.is_hidden?"label-habilidades-oculta":""}">${a.name}${a.is_hidden?" (Oculta 🔒)":""}</span>`).join("")}
                <h3>Estadísticas</h3>
                <ul class="stats-list">
                    ${pokemon.stats.map(s=>`
                        <li class="stat-row">
                            <span class="stat-name">${s.name}</span>
                            <div class="stat-bar"><div class="stat-fill" style="width:${s.base_stat/3}%;"></div></div>
                            <span class="stat-value">${s.base_stat}</span>
                        </li>
                    `).join("")}
                </ul>
                <h3>Favoritos</h3>
                <button id="btn-fav" class="btn-fav">
                    ⭐ ${esFavorito(pokemon.id) ? "Eliminar de favoritos" : "Agregar a favoritos"}
                </button>
                <h3>Evoluciones</h3>
                <div class="evolutions">${htmlEvoluciones}</div>
            </div>
        `;

        showResultHtml(resultHtml);

        // Listener botón favoritos
        document.getElementById("btn-fav").addEventListener("click", () => {
            const agregado = guardarFavorito(pokemon);
            const btn = document.getElementById("btn-fav");
            btn.textContent = agregado ? "⭐ Eliminar de favoritos" : "⭐ Agregar a favoritos";
        });

    } catch (err) {
        console.error("Error mostrarDatosInterna:", err);
        showMessage("Ocurrió un error. Revisa la consola.");
    }
}

// -----------------------------------------------------
// RENDER HABILIDAD
// -----------------------------------------------------
async function mostrarHabilidadInterna(entrada) {
    showMessage("Cargando Habilidad...");
    try {
        const resultado = await obtenerHabilidad(entrada);
        if (!resultado.ok) { showMessage("Habilidad no encontrada (" + (resultado.error || "error") + ")"); return; }

        const ability = resultado.data;
        const badgeFrom = resultado.source === "api" ? "⚡ Datos desde API" : "💾 Desde Cache";

        const pokemonList = await Promise.all(ability.pokemon.map(async p => {
            const info = await obtenerPokemonSimple(p.url);
            return { ...info, isHidden: p.is_hidden };
        }));

        const html = `
            <div class="card">
                <div id="badge" class="badge" style="background:${resultado.source==="api"?"#007bff":"#28a745"}">
                    ${badgeFrom}
                </div>
                <h2>${ability.name.toUpperCase()}</h2>
                <div class="box-description">
                    <strong>EFECTO</strong>
                    <p>${ability.description}</p>
                </div>
                <h3>POKÉMON CON ESTA HABILIDAD (${pokemonList.length})</h3>
                <div class="pokemon-grid">
                    ${pokemonList.map(p => `
                        <div class="poke-card">
                            <img src="${p.sprite}" alt="${p.name}">
                            <span>${p.name.toUpperCase()}</span>
                            ${p.isHidden ? '<small>(oculta 🔒)</small>' : ""}
                            <small style="color:gray">[${p.fromCache ? "Cache" : "API"}]</small>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
        showResultHtml(html);

    } catch (err) { console.error("Error mostrarHabilidadInterna:", err); showMessage("Ocurrió un error. Revisa la consola."); }
}

// -----------------------------------------------------
// FUNCIÓN UNIFICADA
// -----------------------------------------------------
async function buscar() {
    const entrada = sanitizeInput(document.getElementById("search")?.value);
    const tipo = document.getElementById("tipoSelect")?.value;

    if (!entrada) { showMessage("Escribe un valor válido."); return; }

    if (tipo === "POKÉMON") await mostrarDatosInterna(entrada);
    else if (tipo === "HABILIDAD") await mostrarHabilidadInterna(entrada);
    else showMessage("Selecciona POKÉMON o HABILIDAD.");
}

// -----------------------------------------------------
// CLIC EN EVOLUCIONES
// -----------------------------------------------------
async function mostrarDatosDesdeEvolucion(nombre){
    const inp = document.getElementById("search");
    if (inp) inp.value = nombre;
    await buscar();
}

// -----------------------------------------------------
// EVENTOS DOM
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn");
    const searchInput = document.getElementById("search");
    const tipoSelect = document.getElementById("tipoSelect");

    if (tipoSelect) tipoSelect.addEventListener("change", () => {
        if (tipoSelect.value==="POKÉMON") searchInput.placeholder="NOMBRE O ID...";
        else if (tipoSelect.value==="HABILIDAD") searchInput.placeholder="NOMBRE DE HABILIDAD...";
    });

    if (btn) btn.addEventListener("click", buscar);
    if (searchInput) searchInput.addEventListener("keydown", e => { if(e.key==="Enter") buscar(); });

    // Si estamos en favoritos.html
    if (window.location.pathname.includes("favoritos.html")) mostrarFavoritos();
});

// -----------------------------------------------------
// EXPOSE GLOBAL FUNCTIONS FOR FAVORITOS.HTML
// -----------------------------------------------------
window.mostrarFavoritos = mostrarFavoritos;
window.eliminarFavorito = eliminarFavorito;
window.eliminarTodosFavoritos = eliminarTodosFavoritos;
