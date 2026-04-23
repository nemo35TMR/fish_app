# frozen_string_literal: true

class MessagesController < ApplicationController
  before_action :require_authentication
  before_action :set_chat

  def create
    @message = @chat.messages.build(message_params)

    if @message.save
      maybe_append_ai_reply
      redirect_to chat_path(@chat), notice: "Message envoyé."
    else
      @messages = @chat.messages.order(:created_at)
      render "chats/show", status: :unprocessable_entity
    end
  end

  private

  def set_chat
    @chat = Current.user.chats.find(params[:chat_id])
  end

  def message_params
    params.require(:message).permit(:content)
  end

  def maybe_append_ai_reply
    text = Ai::ChatResponder.reply_after_user_message(@message)
    return if text.blank?

    @chat.messages.create!(content: text)
  end
end
