# frozen_string_literal: true

class Lure < ApplicationRecord
  has_many :fish_lures, dependent: :destroy
  has_many :fish_species, through: :fish_lures

  validates :name, presence: true
  validates :role, inclusion: { in: ["user", "assistant"] }
end
