# frozen_string_literal: true

module Geo
  # Distance sphérique entre deux points WGS84 (degrés), résultat en kilomètres.
  class Haversine
    EARTH_RADIUS_KM = 6371.0

    class << self
      def distance_km(lat1, lon1, lat2, lon2)
        return nil if [lat1, lon1, lat2, lon2].any?(&:nil?)

        phi1 = radians(lat1)
        phi2 = radians(lat2)
        dphi = radians(lat2 - lat1)
        dlambda = radians(lon2 - lon1)

        a = Math.sin(dphi / 2)**2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2)**2
        c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

        EARTH_RADIUS_KM * c
      end

      private

      def radians(degrees)
        degrees.to_f * Math::PI / 180.0
      end
    end
  end
end
