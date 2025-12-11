// -----------------------------------------------------
// CONFIGURACIÓN
// -----------------------------------------------------
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

// -----------------------------------------------------
// FUNCIÓN PRINCIPAL DE CACHE
// -----------------------------------------------------
async function fetchConCache(url, cacheKey) {
    const cacheRaw = localStorage.getItem(cacheKey);

    if (cacheRaw) {
        const cacheObj = JSON.parse(cacheRaw);
        const now = Date.now();

        if (now - cacheObj.timestamp < CACHE_TTL) {
            // Cache válido
            return { source: "cache", data: cacheObj.data };
        }
    }

    // Si no hay cache o expiró, llamamos a la API
    const response = await fetch(url);
    const data = await response.json();

    localStorage.setItem(
        cacheKey,
        JSON.stringify({
            timestamp: Date.now(),
            data
        })
    );

    return { source: "api", data };
}

// -----------------------------------------------------
// OBTENER POKÉMON
// -----------------------------------------------------
async function obtenerPokemon(nombre) {
    const url = `https://pokeapi.co/api/v2/pokemon/${nombre}`;
    const cacheKey = `pokemon-${nombre}`;

    return await fetchConCache(url, cacheKey);
}

// -----------------------------------------------------
// OBTENER EVOLUCIONES
// -----------------------------------------------------
async function obtenerEvoluciones(speciesUrl) {
    const species = await fetch(speciesUrl).then(r => r.json());
    const evoData = await fetch(species.evolution_chain.url).then(r => r.json());

    let evoluciones = [];

    async function recorrer(node) {
        const nombre = node.species.name;

        const resultado = await obtenerPokemon(nombre);
        evoluciones.push(resultado.data.sprites.front_default);

        if (node.evolves_to.length > 0) {
            for (let evo of node.evolves_to) {
                await recorrer(evo);
            }
        }
    }

    await recorrer(evoData.chain);
    return evoluciones;
}

// -----------------------------------------------------
// MOSTRAR RESULTADO EN HTML
// -----------------------------------------------------
async function mostrarDatos() {
    const busqueda = document.getElementById("search").value.toLowerCase();
    const result = document.getElementById("result");

    const resultado = await obtenerPokemon(busqueda);

    if (!resultado.data) {
        result.innerHTML = "<p>Pokémon no encontrado</p>";
        return;
    }

    const pokemon = resultado.data;

    // Evoluciones
    const evoluciones = await obtenerEvoluciones(pokemon.species.url);

    // Render HTML
    result.innerHTML = `
        <div class="card">

            <div id="badge"></div>

            <h2>#${pokemon.id} ${pokemon.name.toUpperCase()}</h2>

            <div class="box">
                <img class="sprite" src="${pokemon.sprites.front_default}">
            </div>

            <h3>Tipos</h3>
            ${pokemon.types
                .map(t => `<span class="label">${t.type.name}</span>`)
                .join("")}

            <h3>Habilidades</h3>
            ${pokemon.abilities
                .map(a => `
                    <span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">
                        ${a.ability.name} ${a.is_hidden ? "(Oculta 🔒)" : ""}
                    </span>
                `)
                .join("")}

            <h3>Estadísticas</h3>
            <ul class="stats-list">
                ${pokemon.stats
                    .map(s => `
                        <li class="stat-row">
                            <span class="stat-name">${s.stat.name}</span>
                            <div class="stat-bar">
                                <div class="stat-fill" style="width: ${s.base_stat / 3}%;"></div>
                            </div>
                            <span class="stat-value">${s.base_stat}</span>
                        </li>
                    `)
                    .join("")}
            </ul>

            <h3>Evoluciones</h3>
            <div class="evolutions">
                ${evoluciones.map(img => `<img src="${img}">`).join("")}
            </div>
        </div>
    `;

    // -----------------------------------------------------
    // MOSTRAR BADGE (API o CACHE)
    // -----------------------------------------------------
    const badge = document.getElementById("badge");

    badge.classList.add("badge");

    if (resultado.source === "api") {
        badge.textContent = "⚡ Datos desde API";
        badge.style.background = "#007bff";
    } else {
        badge.textContent = "💾 Desde Cache";
        badge.style.background = "#28a745";
    }
}

// -----------------------------------------------------
// EVENTO DEL BOTÓN
// -----------------------------------------------------
document.getElementById("btn").addEventListener("click", mostrarDatos);
