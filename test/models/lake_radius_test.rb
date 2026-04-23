# frozen_string_literal: true

require "test_helper"

class LakeRadiusTest < ActiveSupport::TestCase
  test "within_radius_km_of retient les lacs proches du centre" do
    mont_l = -73.5673
    mont_lat = 45.5019
    token = SecureRandom.hex(4)

    proche = Lake.create!(
      name: "Test proche #{token}",
      latitude: 45.52,
      longitude: -73.58,
      location: "QC",
      description: "x"
    )
    loin = Lake.create!(
      name: "Test loin #{token}",
      latitude: 49.8951,
      longitude: -97.1384,
      location: "MB",
      description: "y"
    )

    scope = Lake.with_coordinates.within_radius_km_of(mont_lat, mont_l, 80)
    assert_includes scope, proche
    assert_not_includes scope, loin
  ensure
    proche&.destroy
    loin&.destroy
  end
end
