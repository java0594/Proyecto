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
            return { source: "cache", data: cacheObj.data };
        }
    }

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
// PROCESAR EVOLUCIÓN (LINEAL O RAMIFICADA)
// -----------------------------------------------------
async function obtenerEvolucionAvanzada(speciesUrl) {
    const species = await fetch(speciesUrl).then(r => r.json());
    const evoData = await fetch(species.evolution_chain.url).then(r => r.json());

    // Función recursiva para construir estructura:
    async function procesar(node) {
        const nombre = node.species.name;
        const poke = await obtenerPokemon(nombre);

        const sprite = poke.data.sprites.front_default;

        let children = [];
        for (let evo of node.evolves_to) {
            children.push(await procesar(evo));
        }

        return {
            name: nombre,
            sprite,
            children
        };
    }

    return await procesar(evoData.chain);
}

// -----------------------------------------------------
// RENDERIZAR EVOLUCIONES COMO FLECHAS
// -----------------------------------------------------
function renderEvoluciones(nodo) {

    // Función que renderiza una tarjeta de Pokémon evolutivo
    function card(p) {
        return `
            <div class="ev-card" onclick="mostrarDatosDesdeEvolucion('${p.name}')">
                <img src="${p.sprite}">
                <span>${p.name.toUpperCase()}</span>
            </div>
        `;
    }

    // Si no tiene más evoluciones → tarjeta simple
    if (nodo.children.length === 0) {
        return card(nodo);
    }

    // Si es una evolución lineal (solo 1 hijo)
    if (nodo.children.length === 1) {
        return `
            <div class="ev-line">
                ${card(nodo)}
                <span class="flecha">→</span>
                ${renderEvoluciones(nodo.children[0])}
            </div>
        `;
    }

    // Si es una evolución ramificada (varios hijos)
    return `
        <div class="ev-ramificada">
            ${card(nodo)}
            <span class="flecha">→</span>

            <div class="ev-ramas">
                ${nodo.children.map(ch => card(ch)).join("")}
            </div>
        </div>
    `;
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

    // NUEVO: Obtenemos la evolución completa (lineal o ramificada)
    const evolucionAvanzada = await obtenerEvolucionAvanzada(pokemon.species.url);
    const htmlEvoluciones = renderEvoluciones(evolucionAvanzada);

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
            <div class="evolutions">${htmlEvoluciones}</div>
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

async function mostrarDatosDesdeEvolucion(nombre) {
    document.getElementById("search").value = nombre;
    await mostrarDatos();
}

// -----------------------------------------------------
// EVENTO DEL BOTÓN
// -----------------------------------------------------
document.getElementById("btn").addEventListener("click", mostrarDatos);
