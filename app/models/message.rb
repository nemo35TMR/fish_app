# frozen_string_literal: true

class Message < ApplicationRecord
  belongs_to :chat

  validates :content, presence: true
  validates :role, presence: true
  before_validation :set_default_title
  def set_default_title
  self.title ||= "Chat about #{lake.name}"
end
end
