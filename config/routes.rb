Rails.application.routes.draw do
  root "lakes#index"
  devise_for :users
  get "geocoding/search", to: "geocoding#search", defaults: { format: :json }, as: :geocoding_search

  resources :lakes, only: %i[index show] do
    resources :chats, only: %i[new create]
  end

  resources :chats, only: [:show] do
    resources :messages, only: [:create]
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
