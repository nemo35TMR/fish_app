import { Controller } from "@hotwired/stimulus"
import {
  map as createMap,
  tileLayer,
  circleMarker,
  circle,
  latLngBounds
} from "leaflet"

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
    this.selectedId = null
    this.searchCenter = null
    this.searchCircle = null
    this._markerGroup = []

    this._onBeforeCache = () => this.teardownMapForTurbo()
    document.addEventListener("turbo:before-cache", this._onBeforeCache)

    this.prepareMapContainer()
    this.initMap()
    this.resetDetails()
    this.loadLakesFromServer()
  }

  disconnect() {
    document.removeEventListener("turbo:before-cache", this._onBeforeCache)
    this.teardownMapForTurbo()
  }

  /** Turbo met en cache la page : il faut détruire Leaflet sinon la carte réapparaît cassée (tuiles / marqueurs). */
  teardownMapForTurbo() {
    this.clearMarkers()
    if (this.searchCircle && this._map) {
      try {
        this._map.removeLayer(this.searchCircle)
      } catch {
        /* noop */
      }
      this.searchCircle = null
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

  scheduleInvalidateSize() {
    if (!this._map) return
    requestAnimationFrame(() => {
      this._map.invalidateSize(true)
      window.setTimeout(() => this._map?.invalidateSize(true), 150)
    })
  }

  initMap() {
    // Centre approximatif du Canada (prairies / bouclier canadien) avant chargement des lacs
    const start = [61.3, -98.5]

    this._map = createMap(this.mapContainerTarget, {
      center: start,
      zoom: 4,
      scrollWheelZoom: true,
      minZoom: 3
    })

    tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this._map)

    this.scheduleInvalidateSize()
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
        this.showError("Réponse invalide du serveur (attendu du JSON). Lancez bin/rails db:seed si la base est vide.")
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

      if (this.searchCenter && this.searchCircle) {
        this.flyToSearchArea()
      } else {
        this.fitInitialBounds()
      }

      this.scheduleInvalidateSize()
    } catch {
      this.showError("Erreur réseau lors du chargement des lacs.")
    }
  }

  renderMarkers() {
    this.clearMarkers()

    this.lakes.forEach((lake) => {
      const latlng = [lake.latitude, lake.longitude]
      const marker = circleMarker(latlng, {
        radius: 11,
        weight: 2,
        color: "#0d6efd",
        fillColor: "#0d6efd",
        fillOpacity: 0.9
      })
      marker.bindPopup(this.popupHtml(lake), { maxWidth: 300, className: "lake-popup-wrap" })
      marker.addTo(this._map)
      marker.on("click", (e) => {
        e.originalEvent?.stopPropagation?.()
        this.selectLake(lake.id)
      })
      this.markersById.set(lake.id, { lake, marker })
      this._markerGroup.push(marker)
    })
  }

  clearMarkers() {
    this._markerGroup?.forEach((m) => m.remove())
    this._markerGroup = []
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

    const bounds = latLngBounds(pts)
    this._map.fitBounds(bounds, { padding: [48, 48], maxZoom: 5, animate: true })
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
      li.addEventListener("click", () => this.selectLake(lake.id))
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          this.selectLake(lake.id)
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
    this.drawSearchCircle()
    this.loadLakesFromServer()
  }

  applySearchCenter(lat, lon) {
    this.searchCenter = { lat: Number(lat), lon: Number(lon) }
    this.drawSearchCircle()
    this.loadLakesFromServer()
  }

  flyToSearchArea() {
    if (!this._map || !this.searchCircle) return
    this._map.flyToBounds(this.searchCircle.getBounds(), {
      padding: [52, 52],
      maxZoom: 11,
      duration: 1.05
    })
  }

  drawSearchCircle() {
    if (!this._map || !this.searchCenter) return

    const km = parseFloat(this.radiusSelectTarget.value, 10)
    if (this.searchCircle) {
      this._map.removeLayer(this.searchCircle)
      this.searchCircle = null
    }

    this.searchCircle = circle([this.searchCenter.lat, this.searchCenter.lon], {
      radius: km * 1000,
      color: "#0d6efd",
      weight: 2,
      fillColor: "#0d6efd",
      fillOpacity: 0.06
    }).addTo(this._map)
  }

  updateMarkerHighlighting() {
    this.markersById.forEach(({ lake, marker }) => {
      const selected = lake.id === this.selectedId
      marker.setStyle({
        opacity: 1,
        fillOpacity: selected ? 0.95 : 0.85,
        color: selected ? "#198754" : "#0d6efd",
        fillColor: selected ? "#198754" : "#0d6efd",
        weight: selected ? 3 : 2
      })
    })
  }

  selectLake(id) {
    const lake = this.lakes.find((l) => l.id === id) || this.markersById.get(id)?.lake
    if (!lake) return

    this.selectedId = id
    this.updateMarkerHighlighting()
    this.updateResultsListSelection()

    this._map.panTo([lake.latitude, lake.longitude])

    this.emptyStateTarget.classList.add("d-none")
    this.detailsTarget.classList.remove("d-none")

    this.lakeNameTarget.textContent = lake.name
    this.lakeDescriptionTarget.textContent = lake.description || "—"
    this.lakeLocationTarget.textContent = lake.location_label || "—"

    this.fishListTarget.innerHTML = ""
    lake.fish_species.forEach((fs) => {
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
    }
  }

  resetDetails() {
    this.selectedId = null
    this.emptyStateTarget.classList.remove("d-none")
    this.detailsTarget.classList.add("d-none")
    this.updateMarkerHighlighting()
    this.updateResultsListSelection()
  }

  clearSearch() {
    this.searchCenter = null
    if (this.searchCircle && this._map) {
      this._map.removeLayer(this.searchCircle)
      this.searchCircle = null
    }
    this.searchInputTarget.value = ""
    this.clearError()
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
    const loc = lake.location_label ? `<p class="small text-muted mb-2">${this.escapeHtml(lake.location_label)}</p>` : ""
    const species = lake.fish_species || []
    const blocks = species
      .map((fs) => {
        const items = (fs.lures || []).map(
          (l) =>
            `<li class="lake-popup__lure"><span class="fw-semibold">${this.escapeHtml(l.name)}</span> — <span class="text-muted">${this.escapeHtml(l.description || "")}</span></li>`
        )
        if (items.length === 0) return ""
        const lures = items.join("")
        return `<section class="lake-popup__species mb-2"><div class="fw-semibold small mb-1">${this.escapeHtml(fs.name)}</div><ul class="lake-popup__lure-list mb-0">${lures}</ul></section>`
      })
      .join("")
    return `<div class="lake-popup"><h3 class="h6 mb-1">${this.escapeHtml(lake.name)}</h3>${loc}<div class="small">${blocks || "<p class=\"text-muted mb-0\">Aucune donnée.</p>"}</div></div>`
  }
}
