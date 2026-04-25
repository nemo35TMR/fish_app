# frozen_string_literal: true

class MessagesController < ApplicationController
  before_action :require_authentication
  before_action :set_chat

  def create
    @chat = current_user.chats.find(params[:chat_id])

    # message utilisateur
    @message = Message.new(message_params)
    @message.chat = @chat
    @message.role = "user"

    if @message.save

      ruby_llm_chat = RubyLLM.chat(model: "gpt-4o-mini")

      response = ruby_llm_chat
                 .with_instructions(instructions)
                 .ask(@message.content)

      # réponse IA
      Message.create!(
        role: "assistant",
        content: response.content,
        chat: @chat
      )
      @chat.generate_title_from_first_message

      redirect_to chat_path(@chat)
    else
      render "chats/show", status: :unprocessable_entity
    end
  end

  SYSTEM_PROMPT = <<~PROMPT
    You are a fishing expert.

    You help users improve their fishing skills.

    You give advice about:
    - fishing techniques
    - best lures
    - fish behavior

    Answer clearly and concisely in Markdown.
  PROMPT

  def lake_context
    lake = @chat.lake

    <<~TEXT
      The user is asking about this lake:
      Name: #{lake.name}
      Location: #{lake.location}
      Description: #{lake.description}
    TEXT
  end

  def instructions
    [SYSTEM_PROMPT, lake_context].join("\n\n")
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
