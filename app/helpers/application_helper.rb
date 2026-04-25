# frozen_string_literal: true

module ApplicationHelper
  # Modèle d’URL pour Stimulus (`%{id}` remplacé par l’identifiant du lac).
  def lake_chat_new_path_template
    "/lakes/%{id}/chats/new"
  end

  # Jeton public Mapbox pour la carte GL (pk.*).
  def mapbox_public_token
    Rails.application.config.mapbox_public_token.to_s
  end
end
