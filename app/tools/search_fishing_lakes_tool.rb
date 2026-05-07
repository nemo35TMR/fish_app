class SearchFishingLakesTool < RubyLLM::Tool
  description "Searches fishing lakes in the database. Use it for any question about lakes, fishing spots, or where to fish."
  param :query, desc: "Search keyword. Can be a lake name, location, fish species, or a general fishing question."

  def execute(query:)
    normalized_query = query.to_s.downcase.strip

    general_question = normalized_query.match?(/lac|lacs|pêche|pecher|pêcher|québec|quebec|spot|endroit/)

    lakes =
      if general_question
        Lake.with_coordinates.order(:name).limit(10)
      else
        Lake.where(
          "name ILIKE :q OR location ILIKE :q OR description ILIKE :q",
          q: "%#{query}%"
        ).limit(10)
      end

    return "Aucun lac trouvé dans la base de données." if lakes.empty?

    lakes.map do |lake|
      {
        id: lake.id,
        name: lake.name,
        location: lake.location,
        description: lake.description
      }
    end
  end
end
