// =====================================================
// test35.js (TEST34 + VS con barras, ventaja de tipo y puntaje final)
// =====================================================
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
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
function safeArr(a) {
    return Array.isArray(a) ? a : [];
}

// -----------------------------------------------------
// CACHE KEYS
// -----------------------------------------------------
const pokemonCacheKey = (v) => `pokemon-${String(v).trim().toLowerCase()}`;
const abilityCacheKey = (v) => `ability-${String(v).trim().toLowerCase()}`;

// -----------------------------------------------------
// FETCH CON CACHE
// -----------------------------------------------------
async function fetchConCache(url, key, tipo = "pokemon") {
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

    let essential;
    if (tipo === "pokemon") {
        essential = {
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
    } else {
        essential = data;
    }

    localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        data: essential
    }));

    return { ok: true, source: "api", data: essential };
}

// -----------------------------------------------------
// API
// -----------------------------------------------------
async function obtenerPokemon(input) {
    const key = sanitizeInput(input).toLowerCase();
    return fetchConCache(
        `https://pokeapi.co/api/v2/pokemon/${key}`,
        pokemonCacheKey(key),
        "pokemon"
    );
}

// -----------------------------------------------------
// VS MODULE
// -----------------------------------------------------
let vsLeft = null;
let vsRight = null;

function vsHasDom() {
    return document.getElementById("vs-left-input");
}

async function vsBuscar(lado) {
    const input = document.getElementById(
        lado === "left" ? "vs-left-input" : "vs-right-input"
    );
    if (!input?.value) return;

    const r = await obtenerPokemon(input.value);
    if (!r.ok) return alert("Pokémon no encontrado");

    lado === "left" ? vsLeft = r : vsRight = r;
    vsRenderPreview();
}

function vsRenderPreview() {
    const cont = document.getElementById("vs-preview");
    if (!cont) return;

    const card = (r) => `
        <div class="card">
            <img class="sprite" src="${r.data.sprite}">
            <h3>${r.data.name.toUpperCase()}</h3>
        </div>
    `;

    cont.innerHTML = `
        <div style="display:flex;gap:20px;">
            ${vsLeft ? card(vsLeft) : ""}
            ${vsRight ? card(vsRight) : ""}
        </div>
    `;
}

// -----------------------------------------------------
// 🧠 VS BATALLAR (ÚNICO CAMBIO)
// -----------------------------------------------------
function vsBatallar() {
    if (!vsLeft || !vsRight) {
        alert("Selecciona ambos Pokémon");
        return;
    }

    const p1 = vsLeft.data;
    const p2 = vsRight.data;

    // 1️⃣ Totales
    const total1 = p1.stats.reduce((a, s) => a + s.base_stat, 0);
    const total2 = p2.stats.reduce((a, s) => a + s.base_stat, 0);

    // 2️⃣ Ventaja de tipo (simple)
    const TYPE_CHART = {
        fire: { grass: 2, water: 0.5 },
        water: { fire: 2, grass: 0.5 },
        grass: { water: 2, fire: 0.5 }
    };

    function typeMultiplier(attacker, defender) {
        let mult = 1;
        attacker.types.forEach(a => {
            defender.types.forEach(d => {
                mult *= TYPE_CHART[a]?.[d] || 1;
            });
        });
        return mult;
    }

    const mult1 = typeMultiplier(p1, p2);
    const mult2 = typeMultiplier(p2, p1);

    // 3️⃣ Puntaje final
    const score1 = Math.round(total1 * mult1);
    const score2 = Math.round(total2 * mult2);

    // 4️⃣ Ganador
    let winner = "EMPATE";
    if (score1 > score2) winner = p1.name.toUpperCase();
    if (score2 > score1) winner = p2.name.toUpperCase();

    // 5️⃣ Comparación de stats con barras
    const rows = p1.stats.map(s => {
        const right = p2.stats.find(x => x.name === s.name)?.base_stat || 0;
        return {
            name: s.name,
            left: s.base_stat,
            right
        };
    });

    const out = document.getElementById("vs-result");

    out.innerHTML = `
        <div class="card">
            <h2>⚔️ RESULTADO</h2>
            <h3>${winner === "EMPATE" ? "🤝 EMPATE" : "🏆 GANADOR: " + winner}</h3>

            <p><strong>${p1.name.toUpperCase()}</strong> → ${score1} pts (x${mult1})</p>
            <p><strong>${p2.name.toUpperCase()}</strong> → ${score2} pts (x${mult2})</p>

            <h3>📊 Comparación de Stats</h3>

            ${rows.map(r => `
                <div style="margin:8px 0;">
                    <strong>${r.name.toUpperCase()}</strong>
                    <div style="display:flex;gap:10px;">
                        <div style="width:${r.left / 255 * 100}%;background:#4caf50;height:8px;"></div>
                        <div style="width:${r.right / 255 * 100}%;background:#f44336;height:8px;"></div>
                    </div>
                    <small>${r.left} vs ${r.right}</small>
                </div>
            `).join("")}
        </div>
    `;
}

// -----------------------------------------------------
// DOM READY
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    if (!vsHasDom()) return;

    document.getElementById("vs-left-btn")?.addEventListener("click", () => vsBuscar("left"));
    document.getElementById("vs-right-btn")?.addEventListener("click", () => vsBuscar("right"));
    document.getElementById("vs-battle-btn")?.addEventListener("click", vsBatallar);
});
