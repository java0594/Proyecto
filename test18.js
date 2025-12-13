// -----------------------------------------------------
// CONFIGURACIÓN
// -----------------------------------------------------
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos
const CACHE = new Map();

function setCache(key, data) {
    CACHE.set(key, { data, timestamp: Date.now() });
}

function getCache(key) {
    const cached = CACHE.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        CACHE.delete(key);
        return null;
    }
    return cached.data;
}

// -----------------------------------------------------
// FAVORITOS (localStorage)
// -----------------------------------------------------
function getFavoritos() {
    return JSON.parse(localStorage.getItem("favoritos") || "[]");
}

function guardarFavorito(pokemon) {
    const favs = getFavoritos();
    if (!favs.some(f => f.id === pokemon.id)) {
        favs.push(pokemon);
        localStorage.setItem("favoritos", JSON.stringify(favs));
    }
}

function eliminarFavorito(id) {
    const favs = getFavoritos().filter(f => f.id !== id);
    localStorage.setItem("favoritos", JSON.stringify(favs));
    mostrarFavoritos();
}

function limpiarFavoritos() {
    localStorage.setItem("favoritos", "[]");
    mostrarFavoritos();
}

// -----------------------------------------------------
// FUNCIÓN PARA OBTENER POKEMON (con cache SOLO búsquedas)
// -----------------------------------------------------
async function fetchPokemon(nombre, useCache = true) {
    const key = nombre.toLowerCase();

    if (useCache) {
        const cached = getCache(key);
        if (cached) {
            console.log("✔ Desde CACHE:", key);
            return cached;
        }
    }

    console.log("✔ Desde API:", key);

    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${key}`);
    if (!res.ok) throw new Error("Pokémon no encontrado");

    const data = await res.json();

    if (useCache) setCache(key, data);

    return data;
}

// -----------------------------------------------------
// MOSTRAR FAVORITOS
// -----------------------------------------------------
function mostrarFavoritos() {
    const cont = document.getElementById("result");
    if (!cont) return;

    const favoritos = getFavoritos();

    if (favoritos.length === 0) {
        cont.innerHTML = `
            <div class="no-favs">
                <p>No hay Pokémon favoritos aún.</p>
            </div>
        `;
        return;
    }

    cont.innerHTML = `
        <button id="borrarTodo" class="btn-delete-all">Borrar todos</button>
    `;

    cont.innerHTML += favoritos.map(p => `
        <div class="card-fav">
            <img src="${p.sprite}" class="sprite">
            <h3>${p.name} (ID: ${p.id})</h3>

            <p><strong>Tipos:</strong> 
                ${Array.isArray(p.types)
                    ? p.types.map(t => `<span class="type">${t}</span>`).join("")
                    : ""}
            </p>

            <button class="btn-delete" onclick="eliminarFavorito(${p.id})">
                Eliminar
            </button>
        </div>
    `).join("");

    document.getElementById("borrarTodo").addEventListener("click", limpiarFavoritos);
}

// -----------------------------------------------------
// MOSTRAR POKEMON NORMAL (BUSQUEDA)
// -----------------------------------------------------
async function buscarPokemon() {
    const input = document.getElementById("search");
    const name = input.value.trim().toLowerCase();
    if (!name) return;

    try {
        const data = await fetchPokemon(name, true); // BUSQUEDA → USA CACHE

        const cont = document.getElementById("result");
        cont.innerHTML = renderPokemonCard(data);

    } catch (e) {
        alert("Pokémon no encontrado.");
    }
}

// -----------------------------------------------------
// TARJETA NORMAL
// -----------------------------------------------------
function renderPokemonCard(p) {
    return `
        <div class="card">
            <img src="${p.sprites.front_default}" class="sprite">
            <h2>${p.name} (ID: ${p.id})</h2>

            <p><strong>Tipos:</strong> 
                ${p.types.map(t => `<span class="type">${t.type.name}</span>`).join("")}
            </p>

            <button onclick='guardarFavorito({
                id: ${p.id},
                name: "${p.name}",
                sprite: "${p.sprites.front_default}",
                types: [${p.types.map(t => `"${t.type.name}"`).join(",")}]
            })'>Agregar a Favoritos</button>
        </div>
    `;
}

// -----------------------------------------------------
// CLICK EN EVOLUCIONES → NO CACHE
// -----------------------------------------------------
async function cargarEvolucion(nombre) {
    const data = await fetchPokemon(nombre, false); // → NO CACHE
    const cont = document.getElementById("result");
    cont.innerHTML = renderPokemonCard(data);
}

// -----------------------------------------------------
// INICIO
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    if (window.location.pathname.includes("favoritos.html")) {
        mostrarFavoritos();
    }

    const btn = document.getElementById("btnSearch");
    if (btn) btn.addEventListener("click", buscarPokemon);
});
