class MessagesController < ApplicationController
  SYSTEM_PROMPT = <<~PROMPT
    You are a fishing assistant for Quebec and Canadian lakes.

    IMPORTANT:
- Use SearchFishingLakesTool ONLY to find lakes
- Use FishingRecommendationTool when user asks about fish, species, or lures

- If the user asks "quels poissons", "quoi utiliser", "leurres", you MUST use FishingRecommendationTool

    For ANY question about lakes, fishing spots, places to fish, locations, or "Quels lacs tu connais", you MUST call SearchFishingLakesTool before answering.

    Never say you do not have access to lake data.
    You DO have access to lake data through SearchFishingLakesTool.

    After using the tool, answer only with lakes returned by the database.

    Answer in French when the user writes in French.
    Be concise and practical.
  PROMPT
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

    @ruby_llm_chat.with_tool(SearchFishingLakesTool)
    @ruby_llm_chat.with_tool(FishingRecommendationTool)

    user = respond_to?(:current_user) && current_user.present? ? current_user : User.first
    @ruby_llm_chat.with_tool(CreateFishingPlanTool.new(user: user))
    @ruby_llm_chat.with_instructions(SYSTEM_PROMPT)

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
