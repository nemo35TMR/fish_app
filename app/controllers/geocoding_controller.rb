# frozen_string_literal: true

class GeocodingController < ApplicationController
  def search
    results = Geocoding::Providers.search(params[:q])
    render json: results
  end
end
