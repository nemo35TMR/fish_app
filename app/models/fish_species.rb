# frozen_string_literal: true

class FishSpecies < ApplicationRecord
  has_many :lake_fishes, dependent: :destroy
  has_many :lakes, through: :lake_fishes
  has_many :fish_lures, dependent: :destroy
  has_many :lures, through: :fish_lures

  validates :name, presence: true
end
