# frozen_string_literal: true

class LakesController < ApplicationController
  skip_before_action :authenticate_user!, only: %i[index show]
  def index
    lakes = Lake.with_coordinates.includes(fish_species: :lures).order(:name)

    if radius_search_requested?
      triplet = radius_search_triplet
      if triplet
        lakes = lakes.within_radius_km_of(*triplet)
      elsif request.format.json?
        render json: {
          error: "invalid_search",
          message: "latitude, longitude et radius_km doivent être numériques (rayon 1–500 km)."
        }, status: :unprocessable_entity
        return
      end
    end

    respond_to do |format|
      format.html
      # Le JavaScript de la carte appelle cette URL (data-lakes-map-lakes-json-url) pour placer les marqueurs.
      format.json { render json: lakes.map { |lake| lake_map_payload(lake) } }
    end
  end

  def show
    @lake = Lake.includes(fish_species: :lures).find(params[:id])
  end

  private

  def radius_search_requested?
    params[:latitude].present? && params[:longitude].present? && params[:radius_km].present?
  end

  def radius_search_triplet
    lat = begin
      Float(params[:latitude])
    rescue StandardError
      nil
    end
    lon = begin
      Float(params[:longitude])
    rescue StandardError
      nil
    end
    km = begin
      Float(params[:radius_km])
    rescue StandardError
      nil
    end
    return nil unless lat && lon && km
    return nil unless lat.between?(-90, 90) && lon.between?(-180, 180)
    return nil unless km.between?(1, 500)

    [lat, lon, km]
  end

  def lake_map_payload(lake)
    fish_rows = lake.fish_species.map do |fs|
      {
        id: fs.id,
        name: fs.name,
        image_url: fs.public_image_path,
        lures: fs.lures.map { |l| { id: l.id, name: l.name, description: l.description } }
      }
    end

    {
      id: lake.id,
      name: lake.name,
      description: lake.description,
      location_label: lake.location,
      latitude: lake.latitude.to_f,
      longitude: lake.longitude.to_f,
      fish_species: fish_rows,
      lures: fish_rows.flat_map { |row| row[:lures] }.uniq { |l| l[:id] }
    }
  end
end
