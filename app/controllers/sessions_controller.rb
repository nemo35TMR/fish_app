# frozen_string_literal: true

class SessionsController < ApplicationController
  def new
  end

  def create
    permitted = params.permit(:email, :password)
    user = User.find_by(email: permitted[:email].to_s.strip.downcase)

    if user&.authenticate(permitted[:password])
      start_session(user)
      redirect_to after_authenticated_url, notice: "Bienvenue !"
    else
      redirect_to new_session_path, alert: "Email ou mot de passe incorrect."
    end
  end

  def destroy
    end_session
    redirect_to root_path, notice: "À bientôt."
  end
end
