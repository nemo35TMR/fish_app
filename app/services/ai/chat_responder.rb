# frozen_string_literal: true

module Ai
  # Point d’extension pour une réponse automatique (IA) dans les chats.
  # Ne pas appeler d’API tant qu’aucune configuration n’est fournie.
  class ChatResponder
    class << self
      # @return [String, nil] texte à ajouter comme message assistant, ou nil pour ne rien faire
      def reply_after_user_message(_message)
        return nil unless configured?

        nil
      end

      def configured?
        ENV["OPENAI_API_KEY"].present? || ENV["ANTHROPIC_API_KEY"].present?
      end
    end
  end
end
