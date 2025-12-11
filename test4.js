// -----------------------------------------------------
// INICIALIZAR EVENTOS CUANDO EL DOM ESTÉ LISTO
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM cargado, asignando evento al botón...");

    const btn = document.getElementById("btn");

    if (!btn) {
        console.error("❌ No se encontró el botón con id='btn'");
        return;
    }

    btn.addEventListener("click", async () => {
        const search = document.getElementById("search").value.trim();

        if (!search) {
            alert("Ingresa un nombre o ID");
            return;
        }

        console.log("🔎 Buscando:", search);
        mostrarDatos(); // tu función principal
    });
});


// ===============================
// Cache
// ===============================
function saveCache(name, data) {
    const record = {
        data,
        time: Date.now()
    };
    localStorage.setItem("poke_" + name, JSON.stringify(record));
}

function loadCache(name, maxMinutes = 60) {
    const raw = localStorage.getItem("poke_" + name);
    if (!raw) return null;

    const record = JSON.parse(raw);
    const age = (Date.now() - record.time) / 1000 / 60;

    if (age > maxMinutes) return { expired: true, data: record.data };
    return { expired: false, data: record.data };
}

// ===============================
// API
// ===============================
async function getPokemon(name) {
    name = name.toLowerCase().trim();

    const cache = loadCache(name);
    if (cache && !cache.expired) {
        return { from: "cache", data: cache.data };
    }

    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
    if (!res.ok) throw new Error("Pokémon no encontrado");

    const data = await res.json();
    saveCache(name, data);

    return { from: cache && cache.expired ? "expiredCache" : "api", data };
}

// ===============================
// Obtener cadena de evolución
// ===============================
async function getEvolutionChain(pokemonData) {
    const speciesRes = await fetch(pokemonData.species.url);
    const species = await speciesRes.json();

    const evoRes = await fetch(species.evolution_chain.url);
    const chain = await evoRes.json();

    return chain.chain;
}

// Aplanar cadena de evoluciones a formato simple
function flattenChain(chain) {
    const result = [];

    function traverse(node) {
        result.push({
            name: node.species.name,
            url: node.species.url
        });

        node.evolves_to.forEach(evo => traverse(evo));
    }

    traverse(chain);
    return result;
}

// ===============================
// Render evoluciones
// ===============================
async function renderEvolutions(chainList, current) {
    const container = document.getElementById("evolutions");
    container.innerHTML = "";

    const base = chainList[0].name;

    const title = document.createElement("h3");
    title.textContent = "Evoluciones";
    container.appendChild(title);

    // [Eevee] →
    const baseLine = document.createElement("div");
    baseLine.className = "ev-line";
    baseLine.innerHTML = `
        <span class="ev-card" data-poke="${base}">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${await getId(base)}.png" />
            <small>${capitalize(base)}</small>
        </span>
        <span class="flecha">→</span>
    `;
    container.appendChild(baseLine);

    // Lista de evoluciones (saltos cada 4)
    const evolutionsDiv = document.createElement("div");
    evolutionsDiv.className = "ev-ramas";

    let count = 0;
    for (let evo of chainList.slice(1)) {
        const id = await getId(evo.name);

        const card = document.createElement("div");
        card.className = "ev-card";
        card.dataset.poke = evo.name;
        card.innerHTML = `
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png" />
            <small>${capitalize(evo.name)}</small>
        `;
        evolutionsDiv.appendChild(card);

        count++;

        if (count % 4 === 0) {
            evolutionsDiv.appendChild(document.createElement("br"));
        }
    }

    container.appendChild(evolutionsDiv);

    // clic
    document.querySelectorAll(".ev-card").forEach(el => {
        el.addEventListener("click", () => searchPokemon(el.dataset.poke));
    });
}

// Obtener ID desde species
async function getId(name) {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
    const data = await res.json();
    return data.id;
}

// Capitalizar
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===============================
// Render principal
// ===============================
async function searchPokemon(name) {
    try {
        const result = await getPokemon(name);

        const pokemon = result.data;
        document.getElementById("name").textContent = capitalize(pokemon.name);
        document.getElementById("sprite").src = pokemon.sprites.front_default;

        // stats
        const statsDiv = document.getElementById("stats");
        statsDiv.innerHTML = "";
        pokemon.stats.forEach(s => {
            statsDiv.innerHTML += `
                <div class="stat-row">
                    <span class="stat-name">${s.stat.name}</span>
                    <div class="stat-bar">
                        <div class="stat-fill" style="width:${s.base_stat / 2}%"></div>
                    </div>
                </div>
            `;
        });

        // evoluciones
        const chain = await getEvolutionChain(pokemon);
        const flat = flattenChain(chain);
        await renderEvolutions(flat, pokemon.name);

    } catch (err) {
        alert("Pokémon no encontrado");
    }
}
