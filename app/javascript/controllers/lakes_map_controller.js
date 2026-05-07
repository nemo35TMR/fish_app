import { Controller } from "@hotwired/stimulus"

/**
 * Carte (Leaflet + tuiles OpenStreetMap) + marqueurs pour les lacs.
 *
 * Flux simple (à relire dans l’ordre) :
 * 1. Rails sert la liste des lacs en JSON : GET /lakes.json (voir LakesController#index, format.json).
 * 2. loadLakesFromServer() récupère ce JSON et remplit this.lakes.
 * 3. renderMarkers() lit latitude/longitude de chaque lac et pose un marqueur sur la carte.
 * 4. Au clic sur un marqueur, openLakeFromMap() affiche une petite popup (nom) et remplit le panneau de droite (détails, poissons, leurres).
 */
export default class extends Controller {
  static values = {
    geocodingUrl: { type: String, default: "/geocoding/search" },
    lakesJsonUrl: { type: String, default: "/lakes.json" },
    chatUrlFormat: { type: String, default: "/lakes/%{id}/chats/new" }
  }

  static targets = [
    "mapContainer",
    "searchInput",
    "radiusSelect",
    "errorBox",
    "lakeName",
    "lakeDescription",
    "lakeLocation",
    "fishList",
    "fishLuresSection",
    "fishLuresHeading",
    "luresList",
    "emptyState",
    "details",
    "chatLink",
    "resultsList",
    "resultsEmpty",
    "resultsCount"
  ]

  connect() {
    this._connectGen = (this._connectGen || 0) + 1
    const gen = this._connectGen

    this.lakes = []
    this.markersById = new Map()
    this._markerList = []
    this.selectedId = null
    this.searchCenter = null
    this._popup = null
    this._searchCircle = null
    this._searchCircleBounds = null

    this.prepareMapContainer()
    this.ensureLeafletCssLink()

    this._handleFishCardActivation = this._handleFishCardActivation.bind(this)
    if (this.hasDetailsTarget) {
      this.detailsTarget.addEventListener("click", this._handleFishCardActivation)
      this.detailsTarget.addEventListener("keydown", this._handleFishCardActivation)
    }

    this.loadLeafletIfNeeded()
      .then(() => {
        if (gen !== this._connectGen) return
        const L = window.L
        if (!L || typeof L.map !== "function") {
          this.showError("Leaflet incomplet après chargement (window.L.map manquant).")
          return
        }
        this.L = L
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (gen !== this._connectGen) return
            try {
              this.initMap()
              this.resetDetails()
            } catch (err) {
              console.error(err)
              this.showError(err?.message || "Erreur à l’initialisation de la carte.")
            }
          })
        })
      })
      .catch((err) => {
        if (gen !== this._connectGen) return
        console.error(err)
        this.showError(err?.message || "Chargement de la bibliothèque de carte impossible.")
      })
  }

  disconnect() {
    this._connectGen += 1
    if (this._handleFishCardActivation && this.hasDetailsTarget) {
      this.detailsTarget.removeEventListener("click", this._handleFishCardActivation)
      this.detailsTarget.removeEventListener("keydown", this._handleFishCardActivation)
    }
    this._handleFishCardActivation = null
    this.teardownMap()
  }

  teardownMap() {
    this.clearMarkers()
    this.removeSearchRadiusLayers()
    if (this._map && this._boundLakeFichePopupOpen) {
      this._map.off("popupopen", this._boundLakeFichePopupOpen)
      this._map.off("popupclose", this._boundLakeFichePopupClose)
    }
    this._boundLakeFichePopupOpen = null
    this._boundLakeFichePopupClose = null
    this._popupLake = null
    this._fishPickAbort?.abort()
    this._fishPickAbort = null
    if (this._popup && this._map) {
      try {
        this._map.closePopup(this._popup)
      } catch {
        /* noop */
      }
    }
    this._popup = null
    if (this._map) {
      try {
        this._map.remove()
      } catch {
        /* noop */
      }
      this._map = null
    }
    this.prepareMapContainer()
  }

  ensureLeafletCssLink() {
    if (document.querySelector('link[href="/leaflet/leaflet.css"]')) return
    const l = document.createElement("link")
    l.rel = "stylesheet"
    l.href = "/leaflet/leaflet.css"
    l.dataset.turboTrack = "reload"
    document.head.appendChild(l)
  }

  loadLeafletIfNeeded() {
    if (typeof window.L !== "undefined" && typeof window.L.map === "function") {
      return Promise.resolve()
    }
    const existing = document.querySelector('script[src="/leaflet/leaflet.js"]')
    if (existing) {
      return this._pollLeafletReady()
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script")
      s.src = "/leaflet/leaflet.js"
      s.async = false
      s.onload = () => {
        if (window.L?.map) resolve()
        else this._pollLeafletReady().then(resolve).catch(reject)
      }
      s.onerror = () =>
        reject(new Error("Impossible de charger /leaflet/leaflet.js (404, réseau ou droits)."))
      document.head.appendChild(s)
    })
  }

  _pollLeafletReady() {
    return new Promise((resolve, reject) => {
      let n = 0
      const id = window.setInterval(() => {
        if (typeof window.L !== "undefined" && typeof window.L.map === "function") {
          window.clearInterval(id)
          resolve()
        } else if (++n > 120) {
          window.clearInterval(id)
          reject(new Error("Leaflet ne s’est pas initialisé (window.L absent après le script)."))
        }
      }, 50)
    })
  }

  prepareMapContainer() {
    if (this.hasMapContainerTarget) {
      this.mapContainerTarget.innerHTML = ""
      this.mapContainerTarget.className = "lakes-map-page__map-inner"
    }
  }

  scheduleMapResize() {
    if (!this._map) return
    requestAnimationFrame(() => {
      this._map.invalidateSize()
      window.setTimeout(() => this._map?.invalidateSize(), 200)
    })
  }

  initMap() {
    const L = this.L
    this._map = L.map(this.mapContainerTarget, {
      center: [61.3, -98.5],
      zoom: 4,
      minZoom: 2,
      maxZoom: 18,
      worldCopyJump: true
    })

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxNativeZoom: 19
    }).addTo(this._map)

    L.control.scale({ maxWidth: 120, imperial: false, metric: true }).addTo(this._map)

    this._popup = L.popup({
      closeButton: true,
      className: "lake-leaflet-popup lake-leaflet-popup--fiche",
      maxWidth: 320,
      minWidth: 240,
      /* Pas de déplacement de la carte : la bulle reste ancrée au lac (Leaflet défaut : au-dessus du point). */
      autoPan: false,
      keepInView: false,
      /* Légère élévation au-dessus du point (défaut Leaflet [0,7]) pour dégager le marqueur. */
      offset: this.L.point(0, 12)
    })

    this._popupLake = null
    this._boundLakeFichePopupOpen = (e) => {
      if (e.popup !== this._popup) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          /* Pas de this._popup.update() : _updateContent réécrit innerHTML et casse les listeners. */
          this.applyFichePopupLayoutLock()
          /* Poissons du popup : liaison ici (événement Leaflet) pour que le DOM soit toujours prêt. */
          this.bindLakeFichePopupInteractions()
          window.setTimeout(() => this.applyFichePopupLayoutLock(), 0)
        })
      })
    }
    this._boundLakeFichePopupClose = (e) => {
      if (e.popup === this._popup) this._popupLake = null
    }
    this._map.on("popupopen", this._boundLakeFichePopupOpen)
    this._map.on("popupclose", this._boundLakeFichePopupClose)

    this._map.whenReady(() => {
      this.scheduleMapResize()
      this.loadLakesFromServer()
    })
  }

  lakesUrl() {
    const url = new URL(this.lakesJsonUrlValue, window.location.origin)
    if (this.searchCenter) {
      url.searchParams.set("latitude", String(this.searchCenter.lat))
      url.searchParams.set("longitude", String(this.searchCenter.lon))
      url.searchParams.set("radius_km", this.radiusSelectTarget.value)
    }
    return url.toString()
  }

  async loadLakesFromServer() {
    if (!this._map) return
    this.clearError()

    try {
      const response = await fetch(this.lakesUrl(), {
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "same-origin"
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        this.showError(body.message || "Impossible de charger les lacs.")
        return
      }

      const raw = await response.text()
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        this.showError("Réponse invalide du serveur (JSON attendu). Lancez bin/rails db:seed si besoin.")
        return
      }
      if (!Array.isArray(parsed)) {
        this.showError("Format des lacs inattendu.")
        return
      }

      this.lakes = parsed
      this.clearMarkers()
      this.renderMarkers()
      this.renderResultsList()
      this.updateMarkerHighlighting()
      this.updateResultsListSelection()

      if (this.selectedId && !this.lakes.some((l) => l.id === this.selectedId)) {
        this.resetDetails()
      }

      if (this.searchCenter) {
        this.drawSearchRadiusLayer()
        this.flyToSearchArea()
      } else {
        this.removeSearchRadiusLayers()
        this.fitInitialBounds()
      }

      this.scheduleMapResize()
    } catch {
      this.showError("Erreur réseau lors du chargement des lacs.")
    }
  }

  removeSearchRadiusLayers() {
    if (this._searchCircle && this._map) {
      try {
        this._map.removeLayer(this._searchCircle)
      } catch {
        /* noop */
      }
    }
    this._searchCircle = null
    this._searchCircleBounds = null
  }

  drawSearchRadiusLayer() {
    if (!this._map || !this.searchCenter) return

    const km = parseFloat(this.radiusSelectTarget.value, 10)
    const lat = this.searchCenter.lat
    const lon = this.searchCenter.lon
    const meters = km * 1000

    if (this._searchCircle) {
      this._searchCircle.setLatLng([lat, lon])
      this._searchCircle.setRadius(meters)
    } else {
      this._searchCircle = this.L.circle([lat, lon], {
        radius: meters,
        color: "#2563eb",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 0.12
      }).addTo(this._map)
    }
    this._searchCircleBounds = this._searchCircle.getBounds()
  }

  renderMarkers() {
    this.clearMarkers()
    const L = this.L

    this.lakes.forEach((lake) => {
      const lng = Number(lake.longitude)
      const lat = Number(lake.latitude)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

      const el = this.buildLakeMarkerElement(lake)

      const ic = L.divIcon({
        html: el,
        className: "lake-map-marker-wrap",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -18]
      })

      const m = L.marker([lat, lng], { icon: ic }).addTo(this._map)

      const openLake = (domEvent) => {
        if (domEvent?.preventDefault) domEvent.preventDefault()
        if (domEvent?.stopPropagation) domEvent.stopPropagation()
        this.openLakeFromMap(lake, lat, lng)
      }

      m.on("click", openLake)
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          openLake(e)
        }
      })

      this.markersById.set(lake.id, { lake, marker: m, element: el })
      this._markerList.push(m)
    })
  }

  /** Petite icône pêche, cliquable (simple et lisible). */
  buildLakeMarkerElement(lake) {
    const el = document.createElement("div")
    el.className = "lake-map-marker"
    el.dataset.lakeId = String(lake.id)
    el.setAttribute("role", "button")
    el.tabIndex = 0
    el.title = lake.name
    el.setAttribute("aria-label", `${lake.name} — afficher poissons, leurres et détails`)
    el.innerHTML = `<span class="lake-map-marker__inner" aria-hidden="true">🎣</span>`
    return el
  }

  /** Clic sur la carte : panneau latéral + popup avec poissons / leurres. */
  openLakeFromMap(lake, lat, lng) {
    this.selectLake(lake.id, { skipMapFly: true })
    if (this._popup && this._map) {
      this._popupLake = lake
      this._popup.setLatLng([lat, lng]).setContent(this.markerPopupHtml(lake)).openOn(this._map)
      /* Complète popupopen + rAF : garantit le DOM puis la liaison clic poisson → leurres. */
      window.setTimeout(() => {
        this.applyFichePopupLayoutLock()
        this.bindLakeFichePopupInteractions()
      }, 0)
    }
  }

  /** Boîtier `.leaflet-popup` du popup fiche (même instance que `this._popup`). */
  lakeFichePopupShell() {
    if (!this._popup) return null
    const el = typeof this._popup.getElement === "function" ? this._popup.getElement() : null
    if (el) return el
    return this._map?.getContainer?.()?.querySelector?.(".leaflet-popup.lake-leaflet-popup--fiche") ?? null
  }

  /** Nœud racine de la fiche (contenu métier) à l’intérieur du popup Leaflet. */
  lakeFichePopupRoot() {
    const shell = this.lakeFichePopupShell()
    if (!shell) return null
    return shell.querySelector("[data-lake-fiche-root]") || shell.querySelector(".lake-fiche-popup")
  }

  /** Conteneur `.leaflet-popup-content` de notre popup (hauteur / overflow forcés : pas de scroll Leaflet). */
  lakeFichePopupContentEl() {
    const shell = this.lakeFichePopupShell()
    return shell?.querySelector?.(".leaflet-popup-content") ?? null
  }

  /** Empêche Leaflet d’ajouter un scroll interne (classe `leaflet-popup-scrolled`) + borne la hauteur. */
  applyFichePopupLayoutLock() {
    const wrap = this.lakeFichePopupShell()
    const content = this.lakeFichePopupContentEl()
    if (wrap) {
      wrap.classList.remove("leaflet-popup-scrolled")
    }
    if (content) {
      content.style.setProperty("max-height", "min(620px, calc(100dvh - 96px))", "important")
      content.style.setProperty("overflow", "hidden", "important")
      content.style.setProperty("padding", "0", "important")
      content.style.setProperty("display", "flex", "important")
      content.style.setProperty("flex-direction", "column", "important")
    }
  }

  /** Après ouverture : poissons (grille comme panneau droit), sélection → leurres + conseils. */
  bindLakeFichePopupInteractions() {
    const lake = this._popupLake
    const shell = this.lakeFichePopupShell()
    const root = this.lakeFichePopupRoot()
    if (!lake || !shell || !root) return

    this._fishPickAbort?.abort()
    this._fishPickAbort = new AbortController()

    const track = root.querySelector(".lake-fiche-popup__carousel-track")
    const prev = root.querySelector(".lake-fiche-popup__carousel-btn--prev")
    const next = root.querySelector(".lake-fiche-popup__carousel-btn--next")
    const scrollAmount = () => Math.min(160, Math.max(96, (track?.clientWidth || 160) * 0.75))

    const syncCarouselNav = () => {
      if (!track || !prev || !next) return
      const overflow = track.scrollWidth > track.clientWidth + 4
      const atStart = track.scrollLeft <= 4
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4
      prev.classList.toggle("lake-fiche-popup__carousel-btn--hidden", !overflow || atStart)
      next.classList.toggle("lake-fiche-popup__carousel-btn--hidden", !overflow || atEnd)
      prev.disabled = !overflow || atStart
      next.disabled = !overflow || atEnd
    }

    const sig = { signal: this._fishPickAbort.signal }
    prev?.addEventListener(
      "click",
      () => {
        track?.scrollBy({ left: -scrollAmount(), behavior: "smooth" })
      },
      sig
    )
    next?.addEventListener(
      "click",
      () => {
        track?.scrollBy({ left: scrollAmount(), behavior: "smooth" })
      },
      sig
    )
    track?.addEventListener("scroll", syncCarouselNav, { passive: true, signal: this._fishPickAbort.signal })
    requestAnimationFrame(syncCarouselNav)

    const applyFishSelection = (fishId) => {
      const sid = String(fishId).trim()
      if (!sid) return

      const lakeLive = this._popupLake
      const liveRoot = this.lakeFichePopupRoot() || root
      if (!lakeLive || !liveRoot) return

      liveRoot.classList.add("lake-fiche-popup--lures-revealed")

      liveRoot.querySelectorAll(".lake-panel__fish-card[data-fish-id]").forEach((b) => {
        const active = String(b.dataset.fishId) === sid
        b.classList.toggle("lake-panel__fish-card--selected", active)
        b.setAttribute("aria-pressed", String(active))
      })

      const fs = (lakeLive.fish_species || []).find((s) => String(s.id) === sid)
      const slot = liveRoot.querySelector("[data-lures-grid-slot]")
      const headingLive = liveRoot.querySelector("[data-lures-heading]")
      const traitsLive = liveRoot.querySelector(".lake-fiche-popup__traits")
      if (slot) {
        slot.removeAttribute("hidden")
        slot.innerHTML = this.lurePanelListHtml(fs?.lures)
      }
      if (headingLive && fs) headingLive.textContent = `Leurres — ${fs.name}`
      const idNum = Number(sid)
      if (traitsLive && Number.isFinite(idNum)) {
        const full = this.lakeCharacteristicsBlurbForFish(lakeLive, idNum)
        traitsLive.textContent = full.length > 380 ? `${full.slice(0, 377).trim()}…` : full
      }

      requestAnimationFrame(() => {
        /* Ne pas appeler this._popup.update() ici : Leaflet réinjecte tout le HTML
         * depuis la chaîne initiale (_updateContent → innerHTML), ce qui efface
         * la sélection / les leurres et détruit les listeners posés sur la racine. */
        this.applyFichePopupLayoutLock()
        syncCarouselNav()
        slot?.scrollIntoView?.({ block: "nearest", behavior: "smooth" })
      })
    }

    const fishTargetFromEvent = (ev) => {
      const t = ev.target
      if (!(t instanceof Element)) return null
      const r = this.lakeFichePopupRoot() || root
      if (!r) return null
      const btn = t.closest(".lake-panel__fish-card[data-fish-id]")
      if (!btn || !r.contains(btn)) return null
      return { btn, r }
    }

    /* Délégation sur le boîtier Leaflet, phase bubble : évite les conflits avec la capture
     * et les images « draggable » qui avalent le clic (glisser-déposer natif). */
    const onFishPickClick = (ev) => {
      if (ev.type === "click" && ev.button !== 0) return
      const hit = fishTargetFromEvent(ev)
      if (!hit) return
      ev.preventDefault()
      ev.stopPropagation()
      applyFishSelection(hit.btn.getAttribute("data-fish-id"))
    }
    shell.addEventListener("click", onFishPickClick, { signal: sig })

    const onFishPickKey = (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return
      const hit = fishTargetFromEvent(ev)
      if (!hit) return
      if (ev.key === " ") ev.preventDefault()
      ev.stopPropagation()
      applyFishSelection(hit.btn.getAttribute("data-fish-id"))
    }
    shell.addEventListener("keydown", onFishPickKey, { signal: sig })
  }

  scrollLakeDetailsIntoView() {
    const panel = this.element.querySelector(".lakes-map-page__panel")
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  clearMarkers() {
    this._markerList.forEach((m) => {
      try {
        m.remove()
      } catch {
        /* noop */
      }
    })
    this._markerList = []
    this.markersById.clear()
  }

  fitInitialBounds() {
    if (!this._map) return

    const pts = this.lakes
      .map((l) => [Number(l.latitude), Number(l.longitude)])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180)

    if (pts.length === 0) {
      this._map.setView([61.3, -98.5], 4, { animate: false })
      return
    }

    if (pts.length === 1) {
      this._map.setView(pts[0], 7, { animate: true, duration: 0.5 })
      return
    }

    const bounds = this.L.latLngBounds(pts)
    this._map.fitBounds(bounds, { padding: [56, 56], maxZoom: 5, animate: true, duration: 0.9 })
  }

  flyToSearchArea() {
    if (!this._map || !this._searchCircleBounds) return
    this._map.fitBounds(this._searchCircleBounds, { padding: [64, 64], maxZoom: 9, animate: true, duration: 1 })
  }

  renderResultsList() {
    if (!this.hasResultsListTarget) return

    this.resultsListTarget.innerHTML = ""

    if (this.hasResultsCountTarget) {
      this.resultsCountTarget.textContent = String(this.lakes.length)
    }

    if (this.lakes.length === 0) {
      if (this.hasResultsEmptyTarget) this.resultsEmptyTarget.classList.remove("d-none")
      return
    }

    if (this.hasResultsEmptyTarget) this.resultsEmptyTarget.classList.add("d-none")

    this.lakes.forEach((lake) => {
      const li = document.createElement("li")
      li.className = "list-group-item list-group-item-action lake-results__item py-2"
      li.setAttribute("role", "button")
      li.tabIndex = 0
      li.dataset.lakeId = String(lake.id)
      li.innerHTML = `
        <div class="fw-semibold">${this.escapeHtml(lake.name)}</div>
        <div class="small text-muted text-truncate">${this.escapeHtml(lake.location_label || "")}</div>
      `
      li.addEventListener("click", () => {
        const lng = Number(lake.longitude)
        const lat = Number(lake.latitude)
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          this.openLakeFromMap(lake, lat, lng)
        } else {
          this.selectLake(lake.id)
        }
      })
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          li.click()
        }
      })
      this.resultsListTarget.appendChild(li)
    })
  }

  updateResultsListSelection() {
    if (!this.hasResultsListTarget) return
    this.resultsListTarget.querySelectorAll("[data-lake-id]").forEach((el) => {
      const id = Number(el.dataset.lakeId)
      el.classList.toggle("lake-results__item--active", id === this.selectedId)
    })
  }

  searchAddress(event) {
    event.preventDefault()
    this.clearError()

    const q = this.searchInputTarget.value.trim()
    if (!q) return

    const url = `${this.geocodingUrlValue}?${new URLSearchParams({ q })}`

    fetch(url, {
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin"
    })
      .then((r) => r.json())
      .then((results) => {
        if (!results.length) {
          this.showError("Aucun résultat pour cette recherche.")
          return
        }
        const hit = results[0]
        this.applySearchCenter(hit.latitude, hit.longitude)
      })
      .catch(() => this.showError("Impossible de contacter le service de géocodage."))
  }

  useMyLocation() {
    this.clearError()
    if (!navigator.geolocation) {
      this.showError("La géolocalisation n’est pas disponible sur ce navigateur.")
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.applySearchCenter(pos.coords.latitude, pos.coords.longitude)
      },
      () => this.showError("Impossible d’obtenir votre position (permission refusée ou indisponible)."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 }
    )
  }

  radiusChanged() {
    if (!this.searchCenter) return
    this.loadLakesFromServer()
  }

  applySearchCenter(lat, lon) {
    this.searchCenter = { lat: Number(lat), lon: Number(lon) }
    this.loadLakesFromServer()
  }

  updateMarkerHighlighting() {
    this.markersById.forEach(({ element, lake }) => {
      const selected = lake.id === this.selectedId
      element.classList.toggle("lake-map-marker--selected", selected)
    })
  }

  /** @param {{ skipMapFly?: boolean }} [opts] — si skipMapFly, ne pas flyTo (ex. clic carte / liste avec popup). */
  selectLake(id, opts = {}) {
    const lake = this.lakes.find((l) => l.id === id) || this.markersById.get(id)?.lake
    if (!lake || !this._map) return

    this.selectedId = id
    this.updateMarkerHighlighting()
    this.updateResultsListSelection()

    const lng = Number(lake.longitude)
    const lat = Number(lake.latitude)
    if (!opts.skipMapFly && Number.isFinite(lng) && Number.isFinite(lat)) {
      const z = Math.max(this._map.getZoom(), 8)
      this._map.flyTo([lat, lng], z, { duration: 0.65 })
    }

    this.emptyStateTarget.classList.add("d-none")
    this.detailsTarget.classList.remove("d-none")

    this.lakeNameTarget.textContent = lake.name
    this.lakeDescriptionTarget.textContent = lake.description || "—"
    this.lakeLocationTarget.textContent = lake.location_label || "—"

    this.hideFishLuresPanel()

    this.fishListTarget.innerHTML = ""
    ;(lake.fish_species || []).forEach((fs) => {
      const card = document.createElement("button")
      card.type = "button"
      card.className = "lake-panel__fish-card"
      card.dataset.fishId = String(fs.id)
      card.setAttribute("aria-pressed", "false")
      const fishSrc = this.fishSpeciesImageUrl(fs)
      card.innerHTML = `
        <div class="lake-panel__fish-thumb">
          <img src="${fishSrc}" alt="" width="48" height="48" loading="lazy" decoding="async" draggable="false" />
        </div>
        <span class="lake-panel__fish-name">${this.escapeHtml(fs.name)}</span>
      `
      this.fishListTarget.appendChild(card)
    })

    if (this.hasChatLinkTarget) {
      this.chatLinkTarget.href = this.chatUrlFormatValue.replace("%{id}", String(lake.id))
      this.chatLinkTarget.classList.remove("d-none") // 👈 affiche le bouton
    }

    this.scrollLakeDetailsIntoView()
  }

  hideFishLuresPanel() {
    if (this.hasFishLuresSectionTarget) this.fishLuresSectionTarget.classList.add("d-none")
    if (this.hasFishLuresHeadingTarget) this.fishLuresHeadingTarget.textContent = "Leurres"
    if (this.hasLuresListTarget) this.luresListTarget.innerHTML = ""
    if (this.hasFishListTarget) {
      this.fishListTarget.querySelectorAll(".lake-panel__fish-card").forEach((el) => {
        el.classList.remove("lake-panel__fish-card--selected")
        el.setAttribute("aria-pressed", "false")
      })
    }
  }

  /** @param {string} fishSpeciesId */
  showLuresPanelForFishSpecies(fishSpeciesId) {
    const lake = this.lakes.find((l) => l.id === this.selectedId)
    if (!lake || !this.hasFishLuresSectionTarget || !this.hasLuresListTarget || !this.hasFishLuresHeadingTarget)
      return

    const sid = String(fishSpeciesId)
    const fs = (lake.fish_species || []).find((s) => String(s.id) === sid)
    if (!fs) return

    this.fishListTarget.querySelectorAll(".lake-panel__fish-card").forEach((el) => {
      const active = el.dataset.fishId === sid
      el.classList.toggle("lake-panel__fish-card--selected", active)
      el.setAttribute("aria-pressed", active ? "true" : "false")
    })

    this.fishLuresHeadingTarget.textContent = `Leurres — ${fs.name}`
    this.luresListTarget.innerHTML = ""

    const lures = fs.lures || []
    if (lures.length === 0) {
      const li = document.createElement("li")
      li.className = "list-group-item text-muted"
      li.textContent = "Aucun leurre recommandé pour cette espèce."
      this.luresListTarget.appendChild(li)
    } else {
      lures.forEach((lure) => {
        const li = document.createElement("li")
        li.className = "list-group-item lure-item lake-panel__lure-item py-2"
        const lureSrc = this.lureImageUrl(lure.name)
        li.innerHTML = `
          <div class="lake-panel__lure-row">
            <div class="lake-panel__lure-thumb">
              <img src="${lureSrc}" alt="" width="40" height="40" loading="lazy" decoding="async" />
            </div>
            <div class="lake-panel__lure-body">
              <div class="fw-semibold">${this.escapeHtml(lure.name)}</div>
              <div class="small text-muted">${this.escapeHtml(lure.description || "")}</div>
            </div>
          </div>
        `
        this.luresListTarget.appendChild(li)
      })
    }

    this.fishLuresSectionTarget.classList.remove("d-none")
  }

  _handleFishCardActivation(e) {
    if (e.type === "click" && e.button !== 0) return
    if (e.type === "keydown") {
      if (e.key !== "Enter" && e.key !== " ") return
      if (e.key === " ") e.preventDefault()
    }
    const t = e.target
    if (!(t instanceof Element)) return
    const card = t.closest(".lake-panel__fish-card")
    if (!card || !this.detailsTarget.contains(card)) return
    const fishId = card.dataset.fishId
    if (!fishId) return
    this.showLuresPanelForFishSpecies(fishId)
  }

  resetDetails() {
    this.selectedId = null
    this.hideFishLuresPanel()
    this.emptyStateTarget.classList.remove("d-none")
    this.detailsTarget.classList.add("d-none")
    this.updateMarkerHighlighting()
    this.updateResultsListSelection()
    if (this._popup && this._map) this._map.closePopup(this._popup)
  }

  clearSearch() {
    this.searchCenter = null
    this.removeSearchRadiusLayers()
    this.searchInputTarget.value = ""
    this.clearError()
    if (this._popup && this._map) this._map.closePopup(this._popup)
    this.loadLakesFromServer()
  }

  clearError() {
    if (this.hasErrorBoxTarget) {
      this.errorBoxTarget.textContent = ""
      this.errorBoxTarget.classList.add("d-none")
    }
  }

  showError(message) {
    if (!this.hasErrorBoxTarget) return
    this.errorBoxTarget.textContent = message
    this.errorBoxTarget.classList.remove("d-none")
  }

  escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
  }

  /** URL vignette poisson : préfère `image_url` du JSON (serveur), sinon heuristique locale. */
  fishSpeciesImageUrl(fs) {
    if (fs && fs.image_url) return fs.image_url
    return this.fishImageUrl(fs && fs.name)
  }

  fishImageUrl(name) {
    const n = String(name || "").toLowerCase()
    if (n.includes("pike") || n.includes("brochet")) return "/images/fish/northern-pike.png"
    // Achigan / smallmouth avant doré / walleye (deux espèces différentes).
    if (
      n.includes("smallmouth") ||
      n.includes("small mouth") ||
      n.includes("dolomieu") ||
      n.includes("achigan à petite") ||
      n.includes("achigan a petite")
    ) {
      return "/images/fish/smallmouth-bass.png"
    }
    if (n.includes("walleye") || n.includes("doré jaune") || n.includes("dore jaune")) return "/images/fish/walleye.png"
    if (n.includes("brook trout") || n.includes("truite mouchet")) return "/images/fish/brook-trout.png"
    if (n.includes("lake trout") || n.includes("truite grise")) return "/images/fish/lake-trout.png"
    if (n.includes("doré") || n.includes("dore")) return "/images/fish/walleye.png"
    if (n.includes("achigan")) return "/images/fish/smallmouth-bass.png"
    return "/images/fish/walleye.png"
  }

  lureImageUrl(name) {
    const n = String(name || "").toLowerCase()
    if (n.includes("spinnerbait")) return "/images/lures/spinnerbait.png"
    if (n.includes("crankbait")) return "/images/lures/crankbait.png"
    if (n.includes("jig")) return "/images/lures/jig.png"
    if (n.includes("spoon")) return "/images/lures/spoon.png"
    if (n.includes("jerkbait")) return "/images/lures/jerkbait.png"
    if (n.includes("soft plastic")) return "/images/lures/soft-plastic.png"
    return "/images/lures/crankbait.png"
  }

  /** Leurres uniques (par id) à partir des espèces du lac. */
  uniqueLuresFromLake(lake) {
    const out = []
    const seen = new Set()
    ;(lake.fish_species || []).forEach((fs) => {
      ;(fs.lures || []).forEach((l) => {
        if (!seen.has(l.id)) {
          seen.add(l.id)
          out.push(l)
        }
      })
    })
    return out
  }

  /** Texte synthèse pour la zone « Caractéristiques » (données JSON + conseils génériques). */
  lakeCharacteristicsBlurb(lake) {
    const species = lake.fish_species || []
    const fishNames = species.map((s) => s.name).filter(Boolean)
    const lures = this.uniqueLuresFromLake(lake)
    const parts = []

    if (fishNames.length) {
      parts.push(`Poissons présents sur ce lac : ${fishNames.join(", ")}.`)
    } else {
      parts.push("Les espèces de poissons ne sont pas encore renseignées pour ce lac.")
    }

    parts.push(
      "Comportement et période : les créneaux tôt le matin et en fin de journée sont souvent les plus actifs ; adaptez la profondeur à la saison et à la clarté de l’eau."
    )

    if (lures.length) {
      const lureBits = lures.slice(0, 6).map((l) => {
        const d = String(l.description || "").trim()
        return d ? `${l.name} — ${d}` : l.name
      })
      parts.push(`Leurres adaptés car ils couvrent plusieurs styles de prospection : ${lureBits.join(" ")}`)
    } else {
      parts.push("Aucun leurre recommandé n’est encore associé à ces espèces.")
    }

    parts.push(
      "Conseils rapides : prospectez rives, herbiers et cassures de fond ; variez vitesses d’animation et privilégiez des contrastes de couleur par temps couvert."
    )

    return parts.join(" ")
  }

  /** Texte « Caractéristiques » pour l’espèce sélectionnée (leurres liés + conseils). */
  lakeCharacteristicsBlurbForFish(lake, fishId) {
    const id = Number(fishId)
    const fs = (lake.fish_species || []).find((s) => Number(s.id) === id)
    if (!fs) return this.lakeCharacteristicsBlurb(lake)
    const lures = fs.lures || []
    const parts = []
    parts.push(
      `Espèce sélectionnée : ${fs.name}. Adaptez profondeur, structure (herbiers, cassures, eau libre) et vitesse d’animation à ses habitudes.`
    )
    if (lures.length) {
      const bits = lures.map((l) => {
        const d = String(l.description || "").trim()
        return d ? `${l.name} : ${d}` : l.name
      })
      parts.push(`Leurres conseillés pour ${fs.name} sur ce lac : ${bits.join(" ")}`)
    } else {
      parts.push(`Aucun leurre ciblé n’est encore enregistré pour ${fs.name} sur ce lac.`)
    }
    parts.push(
      "Conseil : variez les animations et testez plusieurs angles de lancer le long des bordures, surtout à l’aube et au crépuscule."
    )
    return parts.join(" ")
  }

  /** Liste leurres (même marqueur que le panneau droit : `ul` + lignes bordure bleue). */
  lurePanelListHtml(lures) {
    const list = lures || []
    if (!list.length) {
      return `<ul class="list-group list-group-flush small lake-panel__lures-list lake-fiche-popup__lures-list"><li class="list-group-item text-muted">Aucun leurre recommandé pour cette espèce.</li></ul>`
    }
    const items = list
      .map((lure) => {
        const lureSrc = this.lureImageUrl(lure.name)
        return `<li class="list-group-item lure-item lake-panel__lure-item py-2">
          <div class="lake-panel__lure-row">
            <div class="lake-panel__lure-thumb">
              <img src="${lureSrc}" alt="" width="40" height="40" loading="lazy" decoding="async" draggable="false" />
            </div>
            <div class="lake-panel__lure-body">
              <div class="fw-semibold">${this.escapeHtml(lure.name)}</div>
              <div class="small text-muted">${this.escapeHtml(lure.description || "")}</div>
            </div>
          </div>
        </li>`
      })
      .join("")
    return `<ul class="list-group list-group-flush small lake-panel__lures-list lake-fiche-popup__lures-list">${items}</ul>`
  }

  /** Fiche lac : poissons + leurres (même présentation que le panneau droit), conseils dynamiques. */
  markerPopupHtml(lake) {
    const species = lake.fish_species || []
    const rawDesc = String(lake.description || "").trim()
    const teaser =
      rawDesc.length > 160 ? `${rawDesc.slice(0, 157).trim()}…` : rawDesc || "Aucune description pour ce lac."

    const where = String(lake.location_label || "").trim()
    const whereHtml = where
      ? `<p class="lake-fiche-popup__where lake-fiche-popup__where--profile"><span class="lake-fiche-popup__where-icon" aria-hidden="true">📍</span><span class="lake-fiche-popup__where-text">${this.escapeHtml(where)}</span></p>`
      : ""

    const lureList = lake.lures || []
    const lureCount = lureList.length
    const speciesCount = species.length
    const regionStat =
      where.length > 12 ? `${this.escapeHtml(where.slice(0, 10))}…` : where ? this.escapeHtml(where) : "—"

    const firstFish = species[0]
    const avatarInner = firstFish
      ? `<img src="${this.fishSpeciesImageUrl(firstFish)}" alt="" width="56" height="56" loading="lazy" decoding="async" draggable="false" />`
      : `<span class="lake-fiche-popup__avatar-emoji" aria-hidden="true">🌊</span>`

    const lureHeading = this.escapeHtml("Leurres recommandés")

    const fishCarousel = species.length
      ? `<div class="lake-panel__fish-grid lake-fiche-popup__fish-grid" role="group" aria-label="Poissons disponibles">
              ${species
                .map((fs) => {
                  const img = this.fishSpeciesImageUrl(fs)
                  return `<button type="button" class="lake-panel__fish-card lake-fiche-popup__fish-pick" data-fish-id="${fs.id}" aria-pressed="false" aria-label="Afficher les leurres pour ${this.escapeHtml(fs.name)}">
              <div class="lake-panel__fish-thumb">
                <img src="${img}" alt="" width="48" height="48" loading="lazy" decoding="async" draggable="false" />
              </div>
              <span class="lake-panel__fish-name">${this.escapeHtml(fs.name)}</span>
            </button>`
                })
                .join("")}
        </div>`
      : `<p class="lake-fiche-popup__empty">Aucun poisson renseigné.</p>`

    const traitsIntro = this.escapeHtml(
      "Sélectionnez un poisson ci-dessus pour afficher ses leurres recommandés et un descriptif adapté."
    )

    const luresSectionBody =
      species.length > 0
        ? `<div class="lake-panel__lures-section lake-fiche-popup__panel-lures">
          <h4 class="lake-panel__section-title">
            <span class="lake-panel__section-title-icon" aria-hidden="true">🎣</span>
            <span data-lures-heading>${lureHeading}</span>
          </h4>
          <div class="lake-fiche-popup__lures-below-title">
            <div class="lake-fiche-popup__lures-callout" data-lures-hint role="note">
              <span class="lake-fiche-popup__lures-callout__icon" aria-hidden="true">👆</span>
              <span class="lake-fiche-popup__lures-callout__text">Cliquez sur une espèce ci-dessus pour afficher ses leurres.</span>
            </div>
            <div class="lake-fiche-popup__lures-dynamic" data-lures-grid-slot hidden></div>
          </div>
        </div>`
        : `<p class="lake-fiche-popup__empty">Aucune espèce : les leurres par poisson ne sont pas disponibles.</p>`

    return `<div class="lake-fiche-popup lake-fiche-popup--profile" data-lake-fiche-root role="region" aria-label="Fiche lac">
      <div class="lake-fiche-popup__top">
        <div class="lake-fiche-popup__hero" aria-hidden="true">
          <div class="lake-fiche-popup__hero-sky"></div>
        </div>
        <div class="lake-fiche-popup__avatar-stage">
          <div class="lake-fiche-popup__avatar-ring">
            <div class="lake-fiche-popup__avatar">${avatarInner}</div>
          </div>
        </div>
      </div>
      <div class="lake-fiche-popup__scroll">
        <div class="lake-fiche-popup__body">
          <span class="lake-fiche-popup__eyebrow lake-fiche-popup__eyebrow--profile">Lac</span>
          <h3 class="lake-fiche-popup__title lake-fiche-popup__title--profile">${this.escapeHtml(lake.name)}</h3>
          ${whereHtml}
          <p class="lake-fiche-popup__teaser lake-fiche-popup__teaser--profile">${this.escapeHtml(teaser)}</p>
          <div class="lake-fiche-popup__stats" role="group" aria-label="En chiffres">
            <div class="lake-fiche-popup__stat">
              <strong class="lake-fiche-popup__stat-value">${speciesCount}</strong>
              <span class="lake-fiche-popup__stat-label">Espèces</span>
            </div>
            <div class="lake-fiche-popup__stat">
              <strong class="lake-fiche-popup__stat-value">${lureCount}</strong>
              <span class="lake-fiche-popup__stat-label">Leurres</span>
            </div>
            <div class="lake-fiche-popup__stat">
              <strong class="lake-fiche-popup__stat-value lake-fiche-popup__stat-value--region">${regionStat}</strong>
              <span class="lake-fiche-popup__stat-label">Lieu</span>
            </div>
          </div>
        </div>
        <section class="lake-fiche-popup__section lake-fiche-popup__section--fish lake-fiche-popup__section--profile lake-fiche-popup__section--fish-panel" aria-label="Poissons disponibles">
          <h4 class="lake-panel__section-title lake-fiche-popup__fish-section-title">
            <span class="lake-panel__section-title-icon" aria-hidden="true">🐟</span>
            <span>Poissons</span>
          </h4>
          <p class="small text-muted mb-2 lake-panel__fish-hint">Sélectionnez un poisson pour afficher les leurres recommandés.</p>
          ${fishCarousel}
        </section>
        <section class="lake-fiche-popup__section lake-fiche-popup__section--lures lake-fiche-popup__section--profile lake-fiche-popup__section--lures-panel" aria-label="Leurres pour l’espèce sélectionnée">
          ${luresSectionBody}
        </section>
        <section class="lake-fiche-popup__section lake-fiche-popup__section--traits lake-fiche-popup__section--profile" aria-label="Conseils">
          <h4 class="lake-fiche-popup__h lake-fiche-popup__h--profile">Conseils</h4>
          <p class="lake-fiche-popup__traits lake-fiche-popup__traits--profile">${traitsIntro}</p>
        </section>
        <div class="lake-fiche-popup__footer-icons" aria-hidden="true">
          <span class="lake-fiche-popup__footer-ico" title="Carte">🗺️</span>
          <span class="lake-fiche-popup__footer-ico" title="Poissons">🐟</span>
          <span class="lake-fiche-popup__footer-ico" title="Leurres">🎣</span>
        </div>
      </div>
    </div>`
  }
}
