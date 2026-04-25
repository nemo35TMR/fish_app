# frozen_string_literal: true

require "cgi"

module Geocoding
  # Géocodage Mapbox Places API (forward). Nécessite MAPBOX_ACCESS_TOKEN.
  class MapboxClient
    HOST = "api.mapbox.com"

    class << self
      def search(query)
        q = query.to_s.strip
        return [] if q.blank?

        token = mapbox_token
        return [] if token.blank?

        encoded = CGI.escape(q)
        uri = URI("https://#{HOST}/geocoding/v5/mapbox.places/#{encoded}.json")
        uri.query = URI.encode_www_form(
          access_token: token,
          country: "CA",
          limit: 5,
          language: "fr"
        )

        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = 5
        http.read_timeout = 10

        request = Net::HTTP::Get.new(uri.request_uri)
        request["Accept"] = "application/json"

        response = http.request(request)
        return [] unless response.is_a?(Net::HTTPSuccess)

        doc = JSON.parse(response.body)
        Array(doc["features"]).filter_map do |feat|
          center = feat["center"]
          next unless center.is_a?(Array) && center.size >= 2

          lon = center[0].to_f
          lat = center[1].to_f

          {
            label: feat["place_name"].to_s,
            latitude: lat,
            longitude: lon
          }
        end
      rescue JSON::ParserError, Net::OpenTimeout, Net::ReadTimeout, SocketError
        []
      end

      def mapbox_token
        ENV["MAPBOX_ACCESS_TOKEN"].presence ||
          Rails.application.config.try(:mapbox_public_token).to_s.strip
      end
    end
  end
end
