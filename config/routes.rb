Rails.application.routes.draw do
  # Accueil = carte des lacs (HTML). GET /lakes.json → même action, format JSON (carte Leaflet).
  root "lakes#index"

  devise_for :users

  resources :lakes, only: [:index, :show] do
    resources :chats, only: [:new, :create]
  end

  get "geocoding/search", to: "geocoding#search", defaults: { format: :json }, as: :geocoding_search

  resources :chats, only: [:show] do
    resources :messages, only: [:create]
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
