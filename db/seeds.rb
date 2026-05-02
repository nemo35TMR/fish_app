# frozen_string_literal: true

# Seed simple et idempotent :
# - ne touche pas au schéma
# - si aucun lac en base (ex. Heroku après migrate), importe db/data/canadian_lakes.geojson
# - sinon réutilise les lacs existants et ajoute espèces / leurres / associations
# Relancer : bin/rails db:seed
# Import manuel des lacs : bin/rails lakes:import_canada

user = User.find_or_initialize_by(email: "pecheur@example.com")
if user.new_record?
  user.password = "password123"
  user.password_confirmation = "password123"
  user.save!
end

# Libellés en français : renomme les anciennes fiches encore en anglais (idempotent).
legacy_fish_en_to_fr = {
  "Northern Pike" => "Brochet",
  "Walleye" => "Doré jaune",
  "Brook Trout" => "Truite mouchetée",
  "Lake Trout" => "Truite grise",
  "Smallmouth Bass" => "Achigan à petite bouche"
}.freeze

legacy_fish_en_to_fr.each do |en, fr|
  next unless (sp = FishSpecies.find_by(name: en))
  next if FishSpecies.where.not(id: sp.id).exists?(name: fr)

  sp.update!(name: fr)
end

fish_names = [
  "Brochet",
  "Doré jaune",
  "Truite mouchetée",
  "Truite grise",
  "Achigan à petite bouche"
].freeze

lure_data = {
  "Spinnerbait" => "Très bon pour pike et bass autour des herbiers.",
  "Crankbait" => "Prospection rapide des bordures et cassures.",
  "Jig" => "Polyvalent en profondeur, excellent pour walleye.",
  "Spoon" => "Efficace sur truites et pike dans l’eau froide.",
  "Jerkbait" => "Très efficace sur poissons actifs en mi-profondeur.",
  "Soft Plastic" => "Souple et naturel, fonctionne presque partout."
}.freeze

species_by_name = fish_names.index_with do |name|
  FishSpecies.find_or_create_by!(name: name)
end

lures_by_name = lure_data.to_h do |name, description|
  lure = Lure.find_or_initialize_by(name: name)
  lure.description = description if lure.description.blank?
  lure.save!
  [name, lure]
end

fish_to_lures = {
  "Brochet" => ["Spinnerbait", "Spoon", "Jerkbait", "Soft Plastic"],
  "Doré jaune" => ["Jig", "Crankbait", "Soft Plastic", "Spoon"],
  "Truite mouchetée" => ["Spoon", "Jerkbait", "Spinnerbait"],
  "Truite grise" => ["Spoon", "Jig", "Crankbait"],
  "Achigan à petite bouche" => ["Jerkbait", "Crankbait", "Soft Plastic", "Spinnerbait"]
}.freeze

fish_to_lures.each do |fish_name, lure_names|
  species = species_by_name[fish_name]
  lure_names.each do |lure_name|
    FishLure.find_or_create_by!(fish_species: species, lure: lures_by_name[lure_name])
  end
end

# Exemple simple : assigne plusieurs espèces à chaque lac existant.
default_fish_mix = ["Doré jaune", "Brochet", "Truite grise"]
if Lake.count.zero?
  geo_path = Rails.root.join("db/data/canadian_lakes.geojson")
  if File.exist?(geo_path)
    n = Lakes::GeojsonImporter.import!(geo_path)
    Rails.logger.info { "Seeds : import de #{n} lac(s) depuis #{geo_path}." }
  else
    Rails.logger.warn { "Seeds : aucun lac et fichier GeoJSON absent (#{geo_path}). Lancez rails lakes:import_canada ou ajoutez des lacs." }
  end
end

all_lakes = Lake.with_coordinates.order(:name)

all_lakes.each_with_index do |lake, idx|
  mix =
    case idx % 3
    when 0 then default_fish_mix
    when 1 then ["Achigan à petite bouche", "Doré jaune", "Brochet"]
    else ["Truite mouchetée", "Truite grise", "Brochet"]
    end

  mix.each do |fish_name|
    LakeFish.find_or_create_by!(lake: lake, fish_species: species_by_name[fish_name])
  end
end

Rails.logger.info do
  "Seeds : #{Lake.count} lacs, #{FishSpecies.count} espèces, #{Lure.count} leurres, #{LakeFish.count} associations lac-poisson, #{FishLure.count} associations poisson-leurre."
end
