class FishingRecommendationTool < RubyLLM::Tool
  description "Finds fish species in a lake and recommends lures for each fish."
  param :lake_name, desc: "The name of the lake"

  def execute(lake_name:)
    lake = Lake.find_by("name ILIKE ?", "%#{lake_name}%")
    return { error: "Lake not found: #{lake_name}" } unless lake

    fish_species = lake.fish_species.includes(:lures)

    return { lake: lake.name, message: "No fish found for this lake." } if fish_species.empty?

    {
      lake: lake.name,
      location: lake.location,
      fish: fish_species.map do |fish|
        {
          name: fish.name,
          recommended_lures: fish.lures.map(&:name)
        }
      end
    }
  end
end
