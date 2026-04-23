# frozen_string_literal: true

class FishLure < ApplicationRecord
  belongs_to :fish_species
  belongs_to :lure

  validates :fish_species_id, uniqueness: { scope: :lure_id }
end
