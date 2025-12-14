// =====================================================
// test32.js  (Base test31 estable + VS extendido SIN romper nada)
// =====================================================
const CACHE_TTL = 10 * 60 * 1000 // 10 min

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
function sanitizeInput(v) {
  return v ? String(v).trim() : ''
}
function showResultHtml(html) {
  const r = document.getElementById('result')
  if (r) r.innerHTML = html
}
function showMessage(msg) {
  showResultHtml(`<p>${msg}</p>`)
}
function safeArr(a) {
  return Array.isArray(a) ? a : []
}

// -----------------------------------------------------
// CACHE KEYS
// -----------------------------------------------------
const pokemonCacheKey = v => `pokemon-${String(v).trim().toLowerCase()}`
const abilityCacheKey = v => `ability-${String(v).trim().toLowerCase()}`

// -----------------------------------------------------
// FETCH CON CACHE (para búsquedas reales)
// -----------------------------------------------------
async function fetchConCache(url, key, tipo = 'pokemon') {
  // 1) cache
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const obj = JSON.parse(raw)
      if (Date.now() - obj.timestamp < CACHE_TTL) {
        return {ok: true, source: 'cache', data: obj.data}
      }
    }
  } catch {
    localStorage.removeItem(key)
  }

  // 2) api
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    return {ok: false, error: `Network error: ${e.message}`}
  }
  if (!res.ok) return {ok: false, error: `HTTP ${res.status}`}

  let data
  try {
    data = await res.json()
  } catch (e) {
    return {ok: false, error: `JSON parse error: ${e.message}`}
  }

  // 3) normalizar
  let essential
  if (tipo === 'pokemon') {
    essential = {
      id: data.id,
      name: data.name,
      sprite: data.sprites.front_default,
      types: data.types.map(t => t.type.name),
      abilities: data.abilities.map(a => ({
        name: a.ability.name,
        is_hidden: a.is_hidden,
      })),
      stats: data.stats.map(s => ({
        name: s.stat.name,
        base_stat: s.base_stat,
      })),
      speciesUrl: data.species.url,
    }
  } else if (tipo === 'ability') {
    const effectEntry = data.effect_entries.find(e => e.language.name === 'en')
    essential = {
      id: data.id,
      name: data.name,
      description: effectEntry ? effectEntry.effect : 'Sin descripción',
      pokemon: data.pokemon.map(p => ({
        name: p.pokemon.name,
        url: p.pokemon.url,
        is_hidden: p.is_hidden,
      })),
    }
  } else {
    essential = data
  }

  // 4) guardar cache
  try {
    localStorage.setItem(key, JSON.stringify({timestamp: Date.now(), data: essential}))
  } catch {}

  return {ok: true, source: 'api', data: essential}
}

// -----------------------------------------------------
// FETCH DIRECTO (sin cache)
// -----------------------------------------------------
async function fetchDirect(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return {ok: false, error: `HTTP ${res.status}`}
    const data = await res.json()
    return {ok: true, data}
  } catch (e) {
    return {ok: false, error: `Network error: ${e.message}`}
  }
}

// -----------------------------------------------------
// API
// -----------------------------------------------------
async function obtenerPokemon(input) {
  const key = sanitizeInput(input).toLowerCase()
  const url = `https://pokeapi.co/api/v2/pokemon/${key}`
  return fetchConCache(url, pokemonCacheKey(key), 'pokemon')
}

async function obtenerHabilidad(input) {
  const key = sanitizeInput(input).toLowerCase()
  const url = `https://pokeapi.co/api/v2/ability/${key}`
  return fetchConCache(url, abilityCacheKey(key), 'ability')
}

// Para la lista de habilidad: sprite SIN cache
async function obtenerSpriteSinCache(pokemonUrl) {
  const r = await fetchDirect(pokemonUrl)
  return r.ok ? r.data.sprites?.front_default || '' : ''
}

// -----------------------------------------------------
// HISTÓRICO
// -----------------------------------------------------
function getHistorico() {
  try {
    return JSON.parse(localStorage.getItem('historico') || '[]')
  } catch {
    return []
  }
}
function setHistorico(arr) {
  localStorage.setItem('historico', JSON.stringify(arr))
}
function guardarEnHistorico(p) {
  const h = getHistorico()
  if (!h.some(x => x.id === p.id)) {
    h.push({id: p.id, name: p.name, sprite: p.sprite, types: p.types})
    setHistorico(h)
  }
}
function eliminarDeHistorico(id) {
  setHistorico(getHistorico().filter(p => p.id !== id))
}
function limpiarHistorico() {
  localStorage.removeItem('historico')
}

// -----------------------------------------------------
// FAVORITOS
// -----------------------------------------------------
function getFavoritos() {
  try {
    return JSON.parse(localStorage.getItem('favoritos') || '[]')
  } catch {
    return []
  }
}
function setFavoritos(arr) {
  localStorage.setItem('favoritos', JSON.stringify(arr))
}
function esFavorito(id) {
  return getFavoritos().some(f => f.id === id)
}
function toggleFavorito(p) {
  const favs = getFavoritos()
  const idx = favs.findIndex(x => x.id === p.id)
  if (idx >= 0) favs.splice(idx, 1)
  else favs.push({id: p.id, name: p.name, sprite: p.sprite, types: p.types})
  setFavoritos(favs)
}

// -----------------------------------------------------
// EVOLUCIONES
// -----------------------------------------------------
async function obtenerEvolucionAvanzada(speciesUrl) {
  const speciesRes = await fetchDirect(speciesUrl)
  if (!speciesRes.ok) return null

  const evoRes = await fetchDirect(speciesRes.data.evolution_chain.url)
  if (!evoRes.ok) return null

  async function procesar(node) {
    const nombre = node.species.name
    const pokeRes = await fetchDirect(`https://pokeapi.co/api/v2/pokemon/${nombre}`)
    const sprite = pokeRes.ok ? pokeRes.data.sprites.front_default : ''
    const children = await Promise.all(node.evolves_to.map(e => procesar(e)))
    return {name: nombre, sprite, children}
  }

  return procesar(evoRes.data.chain)
}

function renderEvoluciones(nodo) {
  function card(p) {
    const safeName = String(p.name).replace(/'/g, "\\'")
    return `
      <div class="ev-card" onclick="mostrarDatosDesdeEvolucion('${safeName}'); event.stopPropagation();">
        <img src="${p.sprite || ''}" alt="${p.name}">
        <span>${p.name.toUpperCase()}</span>
      </div>
    `
  }

  if (!nodo) return '<p>No hay evoluciones</p>'
  if (!nodo.children || nodo.children.length === 0)
    return `<div class="ev-single">${card(nodo)}</div>`

  if (nodo.children.length === 1) {
    return `
      <div class="ev-lineal" ">
        ${card(nodo)}
        <span class="flecha">→</span>
        ${renderEvoluciones(nodo.children[0])}
      </div>
    `
  }

  return `
    <div class="ev-ramificada">
      ${card(nodo)}
      <span class="flecha">→</span>
      <div class="ev-ramas" ;">
        ${nodo.children.map(ch => card(ch)).join('')}
      </div>
    </div>
  `
}

// -----------------------------------------------------
// RENDER POKÉMON (detalle)
// -----------------------------------------------------
async function mostrarPokemonInterno(entrada) {
  showMessage('Cargando Pokémon...')

  const resultado = await obtenerPokemon(entrada)
  if (!resultado.ok) {
    showMessage('Pokémon no encontrado (' + (resultado.error || 'error') + ')')
    return
  }

  const pokemon = resultado.data
  guardarEnHistorico(pokemon)

  let evolucion = null
  try {
    evolucion = await obtenerEvolucionAvanzada(pokemon.speciesUrl)
  } catch {}

  const htmlEvo = evolucion ? renderEvoluciones(evolucion) : '<p>No hay evoluciones</p>'

  showResultHtml(`
    <div class="card">
      <div id="badge" class="badge" style="background:${
        resultado.source === 'api' ? '#007bff' : '#28a745'
      }">
        ${resultado.source === 'api' ? '⚡ Datos desde API' : '💾 Desde Cache'}
      </div>
      <div class="sprite-container">
        <div class="sprite-box">
    <div class="box">
        <img class="sprite" src="${pokemon.sprite}" alt="${pokemon.name}">
    </div>
      </div>
      </div>
      <div class="pokemon-header">
      <h2 class="pokemon-title">#${pokemon.id} ${pokemon.name.toUpperCase()}</h2>
      <hr class="separator">
        <!-- <h3>Tipos</h3> -->
       <div class="pokemon-types"> 
            ${pokemon.types.map(t => `<span class="label">${t}</span>`).join('')}
        </div>
      <div class="pokemon-abilities">
      <h3 style="margin-left:10px">Habilidades</h3>
      ${pokemon.abilities
        .map(
          a => `
        <span class="label-habilidades ${a.is_hidden ? 'label-habilidades-oculta' : ''}">
          ${a.name}${a.is_hidden ? ' (Oculta 🔒)' : ''}
        </span>
      `
        )
        .join('')}
         </div>
 </div>
      <!--<h3>Estadísticas</h3>-->
      <ul class="stats-list">
        ${pokemon.stats
          .map(
            s => `
          <li class="stat-row">
            <span class="stat-name">${s.name}</span>
            <div class="stat-bar"><div class="stat-fill" style="width:${
              s.base_stat / 3
            }%;"></div></div>
            <!-- <span class="stat-value">${s.base_stat}</span>-->
          </li>
        `
          )
          .join('')}
      </ul>

      <!--<h3>Favoritos</h3>-->
      <div class="fav-section">
      <button 
    id="btn-fav" 
    class="btn-fav-heart ${esFavorito(pokemon.id) ? 'active' : ''}"
    aria-label="Favorito">
    ❤️
  </button>
  </div>
      <div class="section-separator"></div>

      <h3>Evoluciones</h3>
      <div class="evolutions">${htmlEvo}</div>
    </div>
  `)

  document.getElementById('btn-fav').onclick = () => {
    toggleFavorito(pokemon)
    mostrarPokemonInterno(pokemon.name)
  }
}

// -----------------------------------------------------
// RENDER HABILIDAD (lista sin cache + click)
// -----------------------------------------------------
async function mostrarHabilidadInterna(entrada) {
  showMessage('Cargando Habilidad...')

  const resultado = await obtenerHabilidad(entrada)
  if (!resultado.ok) {
    showMessage('Habilidad no encontrada (' + (resultado.error || 'error') + ')')
    return
  }

  const ability = resultado.data

  const pokemonList = await Promise.all(
    ability.pokemon.map(async p => {
      const sprite = await obtenerSpriteSinCache(p.url)
      return {name: p.name, sprite, isHidden: p.is_hidden}
    })
  )

  showResultHtml(`
    <div class="card">
      <div id="badge" class="badge" style="background:${
        resultado.source === 'api' ? '#007bff' : '#28a745'
      }">
        ${resultado.source === 'api' ? '⚡ Datos desde API' : '💾 Desde Cache'}
      </div>

      <h2>${ability.name.toUpperCase()}</h2>

      <div class="box-description">
        <strong>EFECTO</strong>
        <p>${ability.description}</p>
      </div>

      <h3>POKÉMON CON ESTA HABILIDAD (${pokemonList.length})</h3>

      <div class="pokemon-grid">
        ${pokemonList
          .map(
            p => `
          <div class="poke-card ability-card" data-name="${p.name}">
            <img src="${p.sprite}" alt="${p.name}">
            <span>${p.name.toUpperCase()}</span>
            ${p.isHidden ? '<small>(oculta 🔒)</small>' : ''}
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `)

  document.querySelectorAll('.ability-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.name
      const input = document.getElementById('search')
      const select = document.getElementById('tipoSelect')

      if (select) select.value = 'POKÉMON'
      if (input) input.value = name

      buscar()
    })
  })
}

// -----------------------------------------------------
// LANDING HISTÓRICO (con toggle favoritos)
// -----------------------------------------------------
function mostrarHistorico() {
  const h = getHistorico()
  const r = document.getElementById('result')
  if (!r) return

  const clearBtn =
    document.getElementById('clearHistorico') ||
    document.getElementById('clearAll') ||
    document.getElementById('clearHistory')

  if (h.length === 0) {
    r.innerHTML = `<div class="card no-favs-card">📜 No hay histórico</div>`
    if (clearBtn) clearBtn.style.display = 'none'
    return
  }

  if (clearBtn) clearBtn.style.display = 'block'

  r.innerHTML = `
    <div class="pokemon-grid">
      ${h
        .slice()
        .reverse()
        .map(
          p => `
        <div class="poke-card">
          <img src="${p.sprite}" alt="${p.name}">
          <strong>#${p.id} ${p.name.toUpperCase()}</strong>
          ${safeArr(p.types)
            .map(t => `<span class="label">${t}</span>`)
            .join('')}

          <button class="btn-white btn-toggle" data-id="${p.id}">
            ⭐ ${esFavorito(p.id) ? 'Quitar' : 'Agregar'}
          </button>

          <button class="btn-red btn-del" data-id="${p.id}">🗑</button>
        </div>
      `
        )
        .join('')}
    </div>
  `

  r.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id)
      const poke = h.find(x => x.id === id)
      if (!poke) return
      toggleFavorito(poke)
      mostrarHistorico()
    }
  })

  r.querySelectorAll('.btn-del').forEach(btn => {
    btn.onclick = () => {
      eliminarDeHistorico(Number(btn.dataset.id))
      mostrarHistorico()
    }
  })

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('¿Eliminar todo el histórico?')) {
        limpiarHistorico()
        mostrarHistorico()
      }
    }
  }
}

// -----------------------------------------------------
// LANDING FAVORITOS
// -----------------------------------------------------
function mostrarFavoritos() {
  const favs = getFavoritos()
  const r = document.getElementById('result')
  if (!r) return

  const clearBtn = document.getElementById('clearAll') || document.getElementById('clearFavoritos')

  if (favs.length === 0) {
    r.innerHTML = `<div class="card no-favs-card">❤️ No hay favoritos</div>`
    if (clearBtn) clearBtn.style.display = 'none'
    return
  }

  if (clearBtn) clearBtn.style.display = 'block'

  r.innerHTML = `
    <div class="pokemon-grid">
      ${favs
        .slice()
        .reverse()
        .map(
          p => `
        <div class="poke-card">
          <img src="${p.sprite}" alt="${p.name}">
          <strong>#${p.id} ${p.name.toUpperCase()}</strong>
          ${safeArr(p.types)
            .map(t => `<span class="label">${t}</span>`)
            .join('')}
          <button class="btn-red btn-del-fav" data-id="${p.id}">🗑</button>
        </div>
      `
        )
        .join('')}
    </div>
  `

  r.querySelectorAll('.btn-del-fav').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id)
      setFavoritos(getFavoritos().filter(x => x.id !== id))
      mostrarFavoritos()
    }
  })

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('¿Eliminar todos los favoritos?')) {
        localStorage.removeItem('favoritos')
        mostrarFavoritos()
      }
    }
  }
}

// -----------------------------------------------------
// BUSCAR (unificado)
// -----------------------------------------------------
async function buscar() {
  const entrada = sanitizeInput(document.getElementById('search')?.value)
  const tipo = document.getElementById('tipoSelect')?.value

  if (!entrada) {
    showMessage('Escribe un valor válido.')
    return
  }

  if (tipo === 'HABILIDAD') await mostrarHabilidadInterna(entrada)
  else await mostrarPokemonInterno(entrada)
}

// Click en evoluciones
async function mostrarDatosDesdeEvolucion(nombre) {
  const inp = document.getElementById('search')
  const sel = document.getElementById('tipoSelect')
  if (sel) sel.value = 'POKÉMON'
  if (inp) inp.value = nombre
  await buscar()
}
window.mostrarDatosDesdeEvolucion = mostrarDatosDesdeEvolucion

// =====================================================
// ⚔️ VS MODULE (AISLADO) — EXTENDIDO
// =====================================================
let vsLeft = null
let vsRight = null

function vsHasDom() {
  return (
    document.getElementById('vs-left-input') ||
    document.getElementById('vs-right-input') ||
    document.getElementById('vs-preview') ||
    document.getElementById('vs-result')
  )
}

async function vsBuscar(lado) {
  const inputId = lado === 'left' ? 'vs-left-input' : 'vs-right-input'
  const val = sanitizeInput(document.getElementById(inputId)?.value)
  if (!val) return

  const r = await obtenerPokemon(val)
  if (!r.ok) return alert('Pokémon no encontrado')

  if (lado === 'left') vsLeft = r
  else vsRight = r

  vsRenderPreview()
  vsRenderStatus()
}

function vsRenderPreview() {
  const cont = document.getElementById('vs-preview')
  if (!cont) return

  const card = r => `
    <div class="card">
      <div class="badge" style="background:${r.source === 'api' ? '#007bff' : '#28a745'}">
        ${r.source === 'api' ? '⚡ API' : '💾 Cache'}
      </div>
      <div class="box">
        <img class="sprite" src="${r.data.sprite}" alt="${r.data.name}">
      </div>
      <h3>#${r.data.id} ${r.data.name.toUpperCase()}</h3>
      ${safeArr(r.data.types)
        .map(t => `<span class="label">${t}</span>`)
        .join('')}
    </div>
  `

  cont.innerHTML = `
    <div style="display:flex; gap:20px; justify-content:center; flex-wrap:wrap;">
      ${vsLeft ? card(vsLeft) : ''}
      ${vsRight ? card(vsRight) : ''}
    </div>
  `
}

function vsSumStats(poke) {
  return safeArr(poke.stats).reduce((acc, s) => acc + (Number(s.base_stat) || 0), 0)
}

function vsCompareStats(p1, p2) {
  // Mapeo por nombre para evitar depender del orden exacto
  const map2 = new Map(safeArr(p2.stats).map(s => [s.name, Number(s.base_stat) || 0]))
  return safeArr(p1.stats).map(s => {
    const a = Number(s.base_stat) || 0
    const b = map2.get(s.name) ?? 0
    let winner = 'tie'
    if (a > b) winner = 'left'
    else if (b > a) winner = 'right'
    return {name: s.name, left: a, right: b, winner}
  })
}

function vsRenderStatus() {
  const out = document.getElementById('vs-result')
  if (!out) return

  out.innerHTML = `
    <div class="card" style="max-width:900px;">
      <h2>⚔️ RESULTADO DE LA BATALLA</h2>
      <p>Selecciona 2 Pokémon y presiona <strong>BATALLAR</strong>.</p>
    </div>
  `
}

function vsBatallar() {
  if (!vsLeft || !vsRight) {
    alert('Selecciona ambos Pokémon')
    return
  }

  const p1 = vsLeft.data
  const p2 = vsRight.data

  // -------------------------
  // 1. SUMA DE STATS BASE
  // -------------------------
  const total1 = vsSumStats(p1)
  const total2 = vsSumStats(p2)

  // -------------------------
  // 2. TABLA DE TIPOS (simplificada)
  // -------------------------
  const TYPE_CHART = {
    fire: {grass: 2, water: 0.5, fire: 0.5},
    grass: {water: 2, fire: 0.5, grass: 0.5},
    water: {fire: 2, grass: 0.5, water: 0.5},
  }

  function getMultiplier(attackerTypes, defenderTypes) {
    let mult = 1
    attackerTypes.forEach(atk => {
      defenderTypes.forEach(def => {
        if (TYPE_CHART[atk] && TYPE_CHART[atk][def]) {
          mult *= TYPE_CHART[atk][def]
        }
      })
    })
    return mult
  }

  const mult1 = getMultiplier(p1.types, p2.types)
  const mult2 = getMultiplier(p2.types, p1.types)

  // -------------------------
  // 3. PUNTAJE FINAL
  // -------------------------
  const final1 = +(total1 * mult1).toFixed(1)
  const final2 = +(total2 * mult2).toFixed(1)

  // -------------------------
  // 4. GANADOR
  // -------------------------
  let winner = 'EMPATE'
  if (final1 > final2) winner = p1.name.toUpperCase()
  else if (final2 > final1) winner = p2.name.toUpperCase()

  // -------------------------
  // 5. COMPARACIÓN DE STATS (BARRAS)
  // -------------------------
  const rows = vsCompareStats(p1, p2)

  const statsHtml = rows
    .map(r => {
      const max = Math.max(r.left, r.right)
      const leftW = (r.left / max) * 100
      const rightW = (r.right / max) * 100

      return `
        <div style="margin:8px 0;">
            <strong>${r.name.toUpperCase()}</strong>
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="flex:1; background:#ddd;">
                    <div style="width:${leftW}%; background:#4caf50; height:10px;"></div>
                </div>
                <span>${r.left}</span>

                <div style="flex:1; background:#ddd;">
                    <div style="width:${rightW}%; background:#2196f3; height:10px;"></div>
                </div>
                <span>${r.right}</span>
            </div>
        </div>
        `
    })
    .join('')

  // -------------------------
  // 6. RENDER FINAL
  // -------------------------
  const out = document.getElementById('vs-result')
  if (!out) return

  out.innerHTML = `
    <div class="card" style="max-width:900px;">
        <h2>⚔️ RESULTADO DE LA BATALLA</h2>
        <p><strong>${winner === 'EMPATE' ? '🤝 EMPATE' : '🏆 GANADOR: ' + winner}</strong></p>

        <div class="card" style="background:#eee;">
            <h3>⚡ Ventajas de Tipo</h3>
            <div style="background:#ff4d4d; padding:10px; margin-bottom:8px;">
                ${p1.name} vs ${p2.name}: x${mult1.toFixed(2)}<br>
                ${mult1 < 1 ? 'poco efectivo' : mult1 > 1 ? 'súper efectivo' : 'neutral'}
            </div>
            <div style="background:#7CFF7C; padding:10px;">
                ${p2.name} vs ${p1.name}: x${mult2.toFixed(2)}<br>
                ${mult2 < 1 ? 'poco efectivo' : mult2 > 1 ? 'súper efectivo' : 'neutral'}
            </div>
        </div>

        <div class="card" style="background:#eee;">
            <h3>📊 Comparación de Stats</h3>
            ${statsHtml}
        </div>

        <div class="card" style="background:#eee;">
            <h3>🧮 Cálculo del Puntaje</h3>
            <p><strong>Stats Base Total:</strong> ${p1.name}: ${total1} | ${p2.name}: ${total2}</p>
            <p><strong>Multiplicador de Tipo:</strong> ${p1.name}: x${mult1.toFixed(2)} | ${
    p2.name
  }: x${mult2.toFixed(2)}</p>
            <p><strong>Puntaje Final:</strong> ${p1.name}: ${final1} | ${p2.name}: ${final2}</p>
        </div>
    </div>
    `
}

// -----------------------------------------------------
// DOM READY
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn')
  const searchInput = document.getElementById('search')
  const tipoSelect = document.getElementById('tipoSelect')

  if (tipoSelect && searchInput) {
    tipoSelect.addEventListener('change', () => {
      searchInput.placeholder =
        tipoSelect.value === 'HABILIDAD' ? 'NOMBRE DE HABILIDAD...' : 'NOMBRE O ID...'
    })
  }

  btn?.addEventListener('click', buscar)
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') buscar()
  })

  // Landings
  const path = window.location.pathname
  if (path.includes('historico.html')) mostrarHistorico()
  if (path.includes('favoritos.html')) mostrarFavoritos()

  // VS
  if (vsHasDom()) {
    document.getElementById('vs-left-btn')?.addEventListener('click', () => vsBuscar('left'))
    document.getElementById('vs-right-btn')?.addEventListener('click', () => vsBuscar('right'))
    document.getElementById('vs-battle-btn')?.addEventListener('click', vsBatallar)
    vsRenderStatus()
  }
})
