# frozen_string_literal: true

class Chat < ApplicationRecord
  belongs_to :user
  belongs_to :lake
  has_many :messages, dependent: :destroy

  validates :title, presence: true

  DEFAULT_TITLE = "Untitled"

  TITLE_PROMPT = <<~PROMPT
    Generate a short title (3 to 6 words) summarizing this fishing question.
  PROMPT

  def generate_title_from_first_message
    return unless title == DEFAULT_TITLE

    first_message = messages.where(role: "user").order(:created_at).first
    return if first_message.nil?

    response = RubyLLM.chat
                      .with_instructions(TITLE_PROMPT)
                      .ask(first_message.content)

    update(title: response.content)
  end
end
