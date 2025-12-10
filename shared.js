// document.getElementById("btn").addEventListener("click", async () => {
//     const value = document.getElementById("search").value.toLowerCase();

//     if (!value) return;

//     // 1. Petición principal del Pokémon
//     const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${value}`);
//     if (!response.ok) {
//         document.getElementById("result").innerHTML = "Pokémon no encontrado";
//         return;
//     }

//     const pokemon = await response.json();

//     // Obtener datos
//     const id = pokemon.id;
//     const name = pokemon.name;
//     const sprite = pokemon.sprites.front_default;

//     const types = pokemon.types.map(t => t.type.name);
//     const abilities = pokemon.abilities.map(a => a.ability.name);
//     const stats = pokemon.stats.map(s => `${s.stat.name}: ${s.base_stat}`);

//     // 2. Obtener cadena evolutiva
//     const speciesRes = await fetch(pokemon.species.url);
//     const species = await speciesRes.json();

//     const evoRes = await fetch(species.evolution_chain.url);
//     const evoData = await evoRes.json();

//     const evolutionSprites = await getEvolutionSprites(evoData.chain);

//     // 3. Mostrar en el HTML
//     document.getElementById("result").innerHTML = `
//         <h2>${name.toUpperCase()} (#${id})</h2>
//         <img src="${sprite}" />

//         <p><strong>Tipos:</strong> ${types.join(", ")}</p>
//         <p><strong>Habilidades:</strong> ${abilities.join(", ")}</p>

//         <h3>Estadísticas:</h3>
//         <ul>
//             ${stats.map(s => `<li>${s}</li>`).join("")}
//         </ul>

//         <h3>Evoluciones:</h3>
//         ${evolutionSprites.map(img => `<img src="${img}" />`).join("")}
//     `;
// });

// // Función para recorrer cadena evolutiva
// async function getEvolutionSprites(chain) {
//     let evoList = [];

//     async function traverse(node) {
//         const name = node.species.name;

//         const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
//         const pokeData = await res.json();

//         evoList.push(pokeData.sprites.front_default);

//         if (node.evolves_to.length > 0) {
//             for (let evo of node.evolves_to) {
//                 await traverse(evo);
//             }
//         }
//     }

//     await traverse(chain);
//     return evoList;
// }

//ejemplo de como aplicar las class 

// document.getElementById("btn").addEventListener("click", async () => {
//     const value = document.getElementById("search").value.toLowerCase();

//     if (!value) return;

//     const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${value}`);
//     if (!response.ok) {
//         document.getElementById("result").innerHTML = "<p>No encontrado</p>";
//         return;
//     }

//     const pokemon = await response.json();

//     const id = pokemon.id;
//     const name = pokemon.name;
//     const sprite = pokemon.sprites.front_default;

//     const types = pokemon.types.map(t => t.type.name);
//     const abilities = pokemon.abilities.map(a => a.ability.name);
//     const stats = pokemon.stats.map(s => `${s.stat.name}: ${s.base_stat}`);

//     // Evoluciones
//     const speciesRes = await fetch(pokemon.species.url);
//     const species = await speciesRes.json();

//     const evoRes = await fetch(species.evolution_chain.url);
//     const evoData = await evoRes.json();

//     const evolutionSprites = await getEvolutionSprites(evoData.chain);

//     document.getElementById("result").innerHTML = `
//         <div class="card">
//             <h2>${name.toUpperCase()} (#${id})</h2>
//             <img class="sprite" src="${sprite}" />

//             <h3>Tipos</h3>
//             ${types.map(t => `<span class="label">${t}</span>`).join("")}

//             <h3>Habilidades</h3>
//             ${abilities.map(a => `<span class="label">${a}</span>`).join("")}

//             <h3>Estadísticas</h3>
//             <ul>${stats.map(s => `<li>${s}</li>`).join("")}</ul>

//             <h3>Evoluciones</h3>
//             <div class="evolutions">
//                 ${evolutionSprites.map(img => `<img src="${img}" />`).join("")}
//             </div>
//         </div>
//     `;
// });

// // Recorrer cadena evolutiva
// async function getEvolutionSprites(chain) {
//     let evoList = [];

//     async function traverse(node) {
//         const name = node.species.name;

//         const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
//         const pokeData = await res.json();

//         evoList.push(pokeData.sprites.front_default);

//         if (node.evolves_to.length > 0) {
//             for (let evo of node.evolves_to) {
//                 await traverse(evo);
//             }
//         }
//     }

//     await traverse(chain);
//     return evoList;
// }

// ---------------------------
// 1. Función para obtener datos de la API
// ---------------------------
async function obtenerPokemon(pokemon) {
    try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon}`);

        if (!response.ok) {
            throw new Error("Pokémon no encontrado");
        }

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Error al obtener Pokémon:", error);
        return null;
    }
}

// ---------------------------
// 2. Obtener cadena evolutiva
// ---------------------------
async function obtenerEvoluciones(pokemonSpeciesUrl) {
    try {
        const speciesResponse = await fetch(pokemonSpeciesUrl);

        if (!speciesResponse.ok) {
            throw new Error("No se pudo obtener species");
        }

        const speciesData = await speciesResponse.json();

        const evoResponse = await fetch(speciesData.evolution_chain.url);
        const evoData = await evoResponse.json();

        let evoluciones = [];

        async function recorrer(chain) {
            const nombre = chain.species.name;
            const poke = await obtenerPokemon(nombre);
            evoluciones.push(poke.sprites.front_default);

            if (chain.evolves_to.length > 0) {
                for (let evo of chain.evolves_to) {
                    await recorrer(evo);
                }
            }
        }

        await recorrer(evoData.chain);
        return evoluciones;

    } catch (error) {
        console.error("Error obteniendo evoluciones:", error);
        return [];
    }
}

// ---------------------------
// 3. Mostrar Pokémon en el HTML
// ---------------------------
async function mostrarDatos() {
    const busqueda = document.getElementById("search").value.toLowerCase();
    const result = document.getElementById("result");

    // Llamamos a nuestra función principal
    const pokemon = await obtenerPokemon(busqueda);

    if (!pokemon) {
        result.innerHTML = "<p>Pokémon no encontrado</p>";
        return;
    }

    // Obtenemos evoluciones
    const evoluciones = await obtenerEvoluciones(pokemon.species.url);

    // Construimos HTML
    result.innerHTML = `
        <div class="card">
            <h2>#${pokemon.id} ${pokemon.name.toUpperCase()} </h2>

           <div class="box"><img class="sprite" src="${pokemon.sprites.front_default}"></div>

            <h3>Tipos</h3>
            ${pokemon.types
            .map(t => `<span class="label">${t.type.name}</span>`)
            .join("")}

            <h3>Habilidades</h3>
            ${pokemon.abilities
            .map(a => `<span class="label-habilidades ${a.is_hidden ? "label-habilidades-oculta" : ""}">${a.ability.name} ${a.is_hidden ? "(Oculta 🔒​)" : ""} </span>`)
            .join("")}

            <h3>Estadísticas</h3>
            <ul class="stats-list">
            ${pokemon.stats
            .map(
                s => `
                <li class="stat-row">
                    <span class="stat-name">${s.stat.name}</span>
                    <div class="stat-bar">
                        <div class="stat-fill" style="width: ${s.base_stat / 3}%;"></div>
                    </div>
                    <span class="stat-value">${s.base_stat}</span>
                </li>
            `
            )
            .join("")}
</ul>


            <h3>Evoluciones</h3>
            <div class="evolutions">
                ${evoluciones.map(img => `<img src="${img}">`).join("")}
            </div>
        </div>
    `;
}

// ---------------------------
// 4. Evento del botón
// ---------------------------
document.getElementById("btn").addEventListener("click", mostrarDatos);
