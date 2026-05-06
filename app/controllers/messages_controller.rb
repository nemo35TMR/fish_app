class MessagesController < ApplicationController
  def create
    @chat = Chat.find(params[:chat_id])

    @message = @chat.messages.create!(
      role: "user",
      content: params[:message][:content]
    )

    @assistant_message = @chat.messages.create!(
      role: "assistant",
      content: ""
    )

    ask_llm

    respond_to do |format|
      format.turbo_stream
      format.html { redirect_to chat_path(@chat) }
    end
  end

  private

  def ask_llm
    @ruby_llm_chat = RubyLLM.chat

    build_conversation_history

    @ruby_llm_chat.ask(@message.content) do |chunk|
      next if chunk.content.blank?

      # 🔥 IMPORTANT
      @assistant_message.update!(
        content: @assistant_message.content + chunk.content
      )

      broadcast_replace(@assistant_message)
    end
  end

  def build_conversation_history
    @chat.messages.each do |message|
      next if message.content.blank?
      @ruby_llm_chat.add_message(message)
    end
  end

  def broadcast_replace(message)
    Turbo::StreamsChannel.broadcast_replace_to(
      @chat,
      target: helpers.dom_id(message),
      partial: "messages/message",
      locals: { message: message }
    )
  end
end
