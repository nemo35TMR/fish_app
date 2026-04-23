# frozen_string_literal: true

class ChatsController < ApplicationController
  before_action :require_authentication
  before_action :set_lake, only: %i[new create]
  before_action :set_chat, only: [:show]

  def new
    @chat = @lake.chats.build
  end

  def create
    @chat = Current.user.chats.build(chat_params.merge(lake: @lake))

    if @chat.save
      redirect_to chat_path(@chat), notice: "Conversation créée."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @messages = @chat.messages.order(:created_at)
    @message = Message.new
  end

  private

  def set_lake
    @lake = Lake.find(params[:lake_id])
  end

  def set_chat
    @chat = Current.user.chats.find(params[:id])
  end

  def chat_params
    params.require(:chat).permit(:title, :favorite)
  end
end
