# frozen_string_literal: true

class FishSpecies < ApplicationRecord
  has_many :lake_fishes, dependent: :destroy
  has_many :lakes, through: :lake_fishes
  has_many :fish_lures, dependent: :destroy
  has_many :lures, through: :fish_lures

  validates :name, presence: true

  # Chemin public `/images/fish/...` — source de vérité pour la carte et le panneau.
  # Doré jaune (walleye) et achigan à petite bouche (smallmouth) sont deux espèces distinctes.
  def public_image_path
    slug = ActiveSupport::Inflector.transliterate(name.to_s).downcase.strip.squeeze(" ")
    file = fish_image_file_from_slug(slug)
    "/images/fish/#{file}"
  end

  private

  def fish_image_file_from_slug(slug)
    return "northern-pike.png" if slug.match?(/brochet|northern.pike|(^| )pike($| )/)
    # Achigan / smallmouth avant doré / walleye.
    return "smallmouth-bass.png" if slug.match?(/smallmouth|small.mouth|dolomieu|achigan.a.petite|achigan a petite/)
    return "walleye.png" if slug.match?(/walleye|dore.jaune|sander|vitreus|yellow.pickerel/)
    return "brook-trout.png" if slug.match?(/brook|mouchet/)
    return "lake-trout.png" if slug.match?(/lake.trout|truite.grise|namaycush/)
    return "smallmouth-bass.png" if slug.match?(/largemouth|grande.bouche|salmoides/)
    return "smallmouth-bass.png" if slug.match?(/achigan/) && slug !~ /walleye|pickerel|dore/
    "walleye.png"
  end
end
