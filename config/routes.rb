Rails.application.routes.draw do
  root "lakes#index"

  get "geocoding/search", to: "geocoding#search", defaults: { format: :json }, as: :geocoding_search

  resource :session, only: %i[new create destroy]
  resources :users, only: %i[new create]

  resources :lakes, only: %i[index show] do
    resources :chats, only: %i[new create]
  end

  resources :chats, only: [:show] do
    resources :messages, only: [:create]
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
