# frozen_string_literal: true

module Geocoding
  # Choisit Mapbox si MAPBOX_ACCESS_TOKEN est défini, sinon Nominatim (biais Canada).
  module Providers
    class << self
      def search(query)
        if MapboxClient.mapbox_token.present?
          MapboxClient.search(query)
        else
          NominatimClient.search(query)
        end
      end
    end
  end
end
