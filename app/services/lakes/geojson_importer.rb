# frozen_string_literal: true

module Lakes
  # Importe ou met à jour des lacs à partir d’un fichier GeoJSON ( géométries Point, [lon, lat] ).
  class GeojsonImporter
    class << self
      def import!(path)
        raw = File.read(path)
        data = JSON.parse(raw)
        raise ArgumentError, "FeatureCollection attendu" unless data["type"] == "FeatureCollection"

        count = 0
        Array(data["features"]).each do |feature|
          next unless feature.is_a?(Hash)
          next unless feature.dig("geometry", "type") == "Point"

          coords = feature.dig("geometry", "coordinates")
          next unless coords.is_a?(Array) && coords.size >= 2

          lon = coords[0].to_f
          lat = coords[1].to_f
          props = feature["properties"] || {}
          name = props["name"].presence || props["name_en"].presence || props["name_fr"].presence
          next if name.blank?

          lake = Lake.find_or_initialize_by(name: name)
          region = [props["province"], props["region"]].compact_blank.join(", ").presence
          location_label = region.present? ? "#{region}, Canada" : "Canada"

          lake.assign_attributes(
            latitude: lat,
            longitude: lon,
            location: location_label,
            description: props["description"].to_s.presence || "Lac canadien — données importées (GeoJSON)."
          )
          lake.save!
          count += 1
        end
        count
      end
    end
  end
end
