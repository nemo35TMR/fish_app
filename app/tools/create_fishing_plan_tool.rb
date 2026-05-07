class CreateFishingPlanTool < RubyLLM::Tool
  description "Creates and saves a fishing plan for the current user."
  param :lake_name, desc: "The lake name"
  param :fish_name, desc: "The target fish species"
  param :lure_name, desc: "The recommended lure"
  param :notes, desc: "Short notes about the fishing plan"

  def initialize(user:)
    @user = user
  end

  def execute(lake_name:, fish_name:, lure_name:, notes:)
    lake = Lake.find_by("name ILIKE ?", "%#{lake_name}%")
    fish = FishSpecies.find_by("name ILIKE ?", "%#{fish_name}%")
    lure = Lure.find_by("name ILIKE ?", "%#{lure_name}%")

    return { error: "Lake not found: #{lake_name}" } unless lake
    return { error: "Fish not found: #{fish_name}" } unless fish
    return { error: "Lure not found: #{lure_name}" } unless lure

    plan = FishingPlan.create!(
      user: @user,
      lake: lake,
      fish_species: fish,
      lure: lure,
      notes: notes,
      status: "saved"
    )

    {
      status: "created",
      fishing_plan_id: plan.id,
      lake: lake.name,
      fish: fish.name,
      lure: lure.name,
      notes: plan.notes
    }
  rescue ActiveRecord::RecordInvalid => e
    { error: e.message }
  end
end
