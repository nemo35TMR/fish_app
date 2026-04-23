# frozen_string_literal: true

module Geocoding
  # Client HTTP minimal pour Nominatim (usage policy : User-Agent identifiable).
  class NominatimClient
    BASE_URI = URI("https://nominatim.openstreetmap.org/search")

    class << self
      def search(query)
        q = query.to_s.strip
        return [] if q.blank?

        uri = BASE_URI.dup
        uri.query = URI.encode_www_form(
          q: q,
          format: "json",
          limit: 5,
          addressdetails: 0,
          countrycodes: "ca"
        )

        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = 5
        http.read_timeout = 8

        request = Net::HTTP::Get.new(uri)
        request["User-Agent"] = user_agent
        request["Accept"] = "application/json"
        request["Accept-Language"] = "fr"

        response = http.request(request)
        return [] unless response.is_a?(Net::HTTPSuccess)

        Array(JSON.parse(response.body)).filter_map do |row|
          lat = row["lat"]&.to_f
          lon = row["lon"]&.to_f
          next if lat.nil? || lon.nil?

          {
            label: row["display_name"].to_s,
            latitude: lat,
            longitude: lon
          }
        end
      rescue JSON::ParserError, Net::OpenTimeout, Net::ReadTimeout, SocketError
        []
      end

      private

      def user_agent
        ENV.fetch("NOMINATIM_USER_AGENT", "FishApp/1.0 (https://example.com; contact@example.com)")
      end
    end
  end
end
