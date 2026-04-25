# frozen_string_literal: true

# Jeton public Mapbox (pk.*) — utilisable côté navigateur. Préférez MAPBOX_ACCESS_TOKEN en prod.
# Restreignez les URLs autorisées dans le tableau de bord Mapbox.
Rails.application.config.mapbox_public_token =
  ENV["MAPBOX_ACCESS_TOKEN"]
