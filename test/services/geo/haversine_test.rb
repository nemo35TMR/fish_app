# frozen_string_literal: true

require "test_helper"

class Geo::HaversineTest < ActiveSupport::TestCase
  test "distance Paris–Lyon cohérente (ordre de grandeur)" do
    d = Geo::Haversine.distance_km(48.8566, 2.3522, 45.7640, 4.8357)
    assert_in_delta 392, d, 30
  end

  test "nil si coordonnée manquante" do
    assert_nil Geo::Haversine.distance_km(nil, 2.0, 45.0, 5.0)
  end
end
