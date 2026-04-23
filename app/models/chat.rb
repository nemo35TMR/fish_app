# frozen_string_literal: true

class Chat < ApplicationRecord
  belongs_to :user
  belongs_to :lake
  has_many :messages, dependent: :destroy

  validates :title, presence: true
end
