# frozen_string_literal: true

module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :resume_session
  end

  private

  def resume_session
    return if session[:user_id].blank?

    Current.user = User.find_by(id: session[:user_id])
  end

  def require_authentication
    return if Current.user

    session[:return_to_after_authenticating] = request.fullpath
    redirect_to new_session_path, alert: "Connectez-vous pour continuer."
  end

  def start_session(user)
    session[:user_id] = user.id
    Current.user = user
  end

  def end_session
    session.delete(:user_id)
    Current.user = nil
  end

  def after_authenticated_url
    session.delete(:return_to_after_authenticating) || root_path
  end
end
