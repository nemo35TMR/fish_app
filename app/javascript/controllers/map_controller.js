import { Controller } from "@hotwired/stimulus"

/** Polygone approximatif (cercle géodésique) pour source GeoJSON Mapbox. */
function circleFeatureCollection(centerLng, centerLat, radiusKm, steps = 72) {
  const coordinates = []
  const distKm = radiusKm / 6371
  for (let i = 0; i <= steps; i += 1) {
    const brng = ((i * 360) / steps) * (Math.PI / 180)
    const lat1 = (centerLat * Math.PI) / 180
    const lon1 = (centerLng * Math.PI) / 180
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distKm) + Math.cos(lat1) * Math.sin(distKm) * Math.cos(brng))
    let lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(distKm) * Math.cos(lat1),
        Math.cos(distKm) - Math.sin(lat1) * Math.sin(lat2)
      )
    lon2 = ((((lon2 + Math.PI) % (2 * Math.PI)) + Math.PI) % (2 * Math.PI)) - Math.PI
    coordinates.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates]
        }
      }
    ]
  }
}

export default class extends Controller {
  static values = {
    accessToken: String,
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
    "luresList",
    "emptyState",
    "details",
    "chatLink",
    "resultsList",
    "resultsEmpty",
    "resultsCount"
  ]

  connect() {
    this.lakes = []
    this.markersById = new Map()
    this._markerList = []
    this.selectedId = null
    this.searchCenter = null
    this._popup = null

    this._onBeforeCache = () => this.teardownMapForTurbo()
    document.addEventListener("turbo:before-cache", this._onBeforeCache)

    this.prepareMapContainer()

    if (typeof mapboxgl === "undefined") {
      this.showError("Mapbox GL n’est pas chargé. Vérifiez les balises script dans la page carte.")
      return
    }

    if (!this.accessTokenValue?.trim()) {
      this.showError("Clé d’accès Mapbox manquante.")
      return
    }

    this.initMap()
    this.resetDetails()
  }

  disconnect() {
    document.removeEventListener("turbo:before-cache", this._onBeforeCache)
    this.teardownMapForTurbo()
  }

  teardownMapForTurbo() {
    this.clearMarkers()
    this.removeSearchRadiusLayers()
    if (this._popup) {
      try {
        this._popup.remove()
      } catch {
        /* noop */
      }
      this._popup = null
    }
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

  prepareMapContainer() {
    if (this.hasMapContainerTarget) {
      this.mapContainerTarget.innerHTML = ""
      this.mapContainerTarget.className = "lakes-map-page__map-inner"
    }
  }

  scheduleMapResize() {
    if (!this._map) return
    requestAnimationFrame(() => {
      this._map.resize()
      window.setTimeout(() => this._map?.resize(), 200)
    })
  }

  initMap() {
    mapboxgl.accessToken = this.accessTokenValue.trim()

    this._map = new mapboxgl.Map({
      container: this.mapContainerTarget,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-98.5, 61.3],
      zoom: 3.8,
      minZoom: 2,
      maxPitch: 52,
      attributionControl: true
    })

    this._map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    this._map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120 }), "bottom-left")

    this._popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "340px",
      className: "lake-mapbox-popup"
    })

    this._map.once("load", () => {
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
    if (!this._map?.isStyleLoaded()) return
    ;["search-radius-line", "search-radius-fill"].forEach((id) => {
      if (this._map.getLayer(id)) this._map.removeLayer(id)
    })
    if (this._map.getSource("search-radius")) this._map.removeSource("search-radius")
    this._searchCircleBounds = null
  }

  drawSearchRadiusLayer() {
    if (!this._map?.isStyleLoaded() || !this.searchCenter) return

    const km = parseFloat(this.radiusSelectTarget.value, 10)
    const geo = circleFeatureCollection(this.searchCenter.lon, this.searchCenter.lat, km)
    const ring = geo.features[0].geometry.coordinates[0]
    const b = new mapboxgl.LngLatBounds()
    ring.forEach((c) => b.extend(c))
    this._searchCircleBounds = b

    if (this._map.getSource("search-radius")) {
      this._map.getSource("search-radius").setData(geo)
    } else {
      this._map.addSource("search-radius", { type: "geojson", data: geo })
      this._map.addLayer({
        id: "search-radius-fill",
        type: "fill",
        source: "search-radius",
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.12
        }
      })
      this._map.addLayer({
        id: "search-radius-line",
        type: "line",
        source: "search-radius",
        paint: {
          "line-color": "#2563eb",
          "line-width": 2
        }
      })
    }
  }

  renderMarkers() {
    this.clearMarkers()

    this.lakes.forEach((lake) => {
      const lng = Number(lake.longitude)
      const lat = Number(lake.latitude)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

      const el = document.createElement("button")
      el.type = "button"
      el.className = "mapbox-lake-marker"
      el.dataset.lakeId = String(lake.id)
      el.setAttribute("aria-label", lake.name)
      el.title = lake.name

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(this._map)

      el.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.selectLake(lake.id)
        this._popup.setLngLat([lng, lat]).setHTML(this.popupHtml(lake)).addTo(this._map)
      })

      this.markersById.set(lake.id, { lake, marker, element: el })
      this._markerList.push(marker)
    })
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
      this._map.easeTo({ center: [-98.5, 61.3], zoom: 3.8, duration: 0 })
      return
    }

    const bounds = new mapboxgl.LngLatBounds()
    pts.forEach(([la, lo]) => bounds.extend([lo, la]))
    this._map.fitBounds(bounds, { padding: 56, maxZoom: 5, duration: 900 })
  }

  flyToSearchArea() {
    if (!this._map || !this._searchCircleBounds) return
    this._map.fitBounds(this._searchCircleBounds, { padding: 64, maxZoom: 9, duration: 1000 })
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
        this.selectLake(lake.id)
        const lng = Number(lake.longitude)
        const lat = Number(lake.latitude)
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          this._popup.setLngLat([lng, lat]).setHTML(this.popupHtml(lake)).addTo(this._map)
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
      element.classList.toggle("mapbox-lake-marker--selected", selected)
    })
  }

  selectLake(id) {
    const lake = this.lakes.find((l) => l.id === id) || this.markersById.get(id)?.lake
    if (!lake || !this._map) return

    this.selectedId = id
    this.updateMarkerHighlighting()
    this.updateResultsListSelection()

    const lng = Number(lake.longitude)
    const lat = Number(lake.latitude)
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      this._map.easeTo({ center: [lng, lat], zoom: Math.max(this._map.getZoom(), 8), duration: 650 })
    }

    this.emptyStateTarget.classList.add("d-none")
    this.detailsTarget.classList.remove("d-none")

    this.lakeNameTarget.textContent = lake.name
    this.lakeDescriptionTarget.textContent = lake.description || "—"
    this.lakeLocationTarget.textContent = lake.location_label || "—"

    this.fishListTarget.innerHTML = ""
    ;(lake.fish_species || []).forEach((fs) => {
      const pill = document.createElement("span")
      pill.className = "fish-pill"
      pill.textContent = fs.name
      this.fishListTarget.appendChild(pill)
    })

    this.luresListTarget.innerHTML = ""
    const species = lake.fish_species || []
    let anyLure = false
    species.forEach((fs) => {
      const lures = fs.lures || []
      if (lures.length === 0) return
      anyLure = true
      const head = document.createElement("li")
      head.className = "list-group-item bg-light py-2 small fw-semibold text-uppercase text-muted border-0"
      head.textContent = fs.name
      this.luresListTarget.appendChild(head)
      lures.forEach((lure) => {
        const li = document.createElement("li")
        li.className = "list-group-item lure-item py-2"
        li.innerHTML = `<div class="fw-semibold">${this.escapeHtml(lure.name)}</div><div class="small text-muted">${this.escapeHtml(lure.description || "")}</div>`
        this.luresListTarget.appendChild(li)
      })
    })
    if (!anyLure) {
      const li = document.createElement("li")
      li.className = "list-group-item text-muted"
      li.textContent = "Aucun leurre recommandé pour l’instant."
      this.luresListTarget.appendChild(li)
    }

  if (this.hasChatLinkTarget) {
  this.chatLinkTarget.href = this.chatUrlFormatValue.replace("%{id}", String(lake.id))
  this.chatLinkTarget.classList.remove("d-none") // 👈 affiche le bouton
}
  }

  resetDetails() {
    this.selectedId = null
    this.emptyStateTarget.classList.remove("d-none")
    this.detailsTarget.classList.add("d-none")
    this.updateMarkerHighlighting()
    this.updateResultsListSelection()
    if (this._popup) this._popup.remove()
  }

  clearSearch() {
    this.searchCenter = null
    this.removeSearchRadiusLayers()
    this.searchInputTarget.value = ""
    this.clearError()
    if (this._popup) this._popup.remove()
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

  popupHtml(lake) {
    const loc = lake.location_label
      ? `<p class="small text-muted mb-2">${this.escapeHtml(lake.location_label)}</p>`
      : ""
    const desc = lake.description
      ? `<p class="small mb-2">${this.escapeHtml(lake.description)}</p>`
      : ""
    const species = lake.fish_species || []
    const fishBlock =
      species.length > 0
        ? `<div class="mb-2"><div class="fw-semibold small text-uppercase text-muted mb-1">Espèces</div><ul class="mb-0 ps-3">${species
            .map((fs) => `<li>${this.escapeHtml(fs.name)}</li>`)
            .join("")}</ul></div>`
        : ""
    const lureBlocks = species
      .map((fs) => {
        const items = (fs.lures || []).map(
          (l) =>
            `<li><span class="fw-semibold">${this.escapeHtml(l.name)}</span> <span class="text-muted">${this.escapeHtml(l.description || "")}</span></li>`
        )
        if (items.length === 0) return ""
        return `<div class="mb-2"><div class="fw-semibold small text-uppercase text-muted mb-1">${this.escapeHtml(fs.name)} — leurres</div><ul class="mb-0 ps-3">${items.join("")}</ul></div>`
      })
      .join("")
    return `<div class="lake-popup-mapbox"><h3 class="h6 mb-1">${this.escapeHtml(lake.name)}</h3>${loc}${desc}${fishBlock}${lureBlocks || '<p class="text-muted small mb-0">Pas de détail supplémentaire.</p>'}</div>`
  }
}
