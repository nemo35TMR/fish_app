# frozen_string_literal: true

class Lake < ApplicationRecord
  has_many :lake_fishes, dependent: :destroy
  has_many :fish_species, through: :lake_fishes
  has_many :chats, dependent: :destroy

  validates :name, presence: true

  scope :with_coordinates, -> { where.not(latitude: nil).where.not(longitude: nil) }

  # Rayon Haversine côté SQL (km). Paramètres : latitude, longitude du centre, rayon max.
  scope :within_radius_km_of, lambda { |center_lat, center_lon, radius_km|
    lat = center_lat.to_f
    lon = center_lon.to_f
    km = radius_km.to_f

    with_coordinates.where(
      [
        "(6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(?)) * cos(radians(lakes.latitude::double precision)) * cos(radians(lakes.longitude::double precision) - radians(?)) + sin(radians(?)) * sin(radians(lakes.latitude::double precision)))))) <= ?",
        lat, lon, lat, km
      ]
    )
  }

  def distance_km_from(lat, lon)
    return nil if latitude.blank? || longitude.blank?

    Geo::Haversine.distance_km(latitude.to_f, longitude.to_f, lat.to_f, lon.to_f)
  end

  def recommended_lures
    fish_species.includes(:lures).flat_map(&:lures).uniq(&:id)
  end
end
