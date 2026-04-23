# frozen_string_literal: true

class LakeFish < ApplicationRecord
  belongs_to :lake
  belongs_to :fish_species

  validates :lake_id, uniqueness: { scope: :fish_species_id }
end
