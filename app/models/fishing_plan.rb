class FishingPlan < ApplicationRecord
  belongs_to :user
  belongs_to :lake
  belongs_to :fish_species
  belongs_to :lure
end
