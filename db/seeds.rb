# frozen_string_literal: true

# Données de démonstration : lacs canadiens réels + espèces + leurres (associations explicites).
# Relancer : bin/rails db:seed

user = User.find_or_initialize_by(email: "pecheur@example.com")
if user.new_record?
  user.password = "password123"
  user.password_confirmation = "password123"
  user.save!
end

ApplicationRecord.transaction do
  Message.delete_all
  Chat.delete_all
  LakeFish.delete_all
  FishLure.delete_all
  Lake.delete_all
  FishSpecies.delete_all
  Lure.delete_all
end

geo_path = Rails.root.join("db/data/canadian_lakes.geojson")
raise "GeoJSON manquant : #{geo_path}" unless File.exist?(geo_path)

Lakes::GeojsonImporter.import!(geo_path)

SPECIES = [
  "Brochet (Northern Pike)",
  "Doré / Walleye",
  "Truite mouchetée",
  "Truite grise",
  "Achigan smallmouth",
  "Perchaude"
].index_with { |name| FishSpecies.create!(name: name) }.freeze

LURES = [
  ["Spinnerbait", "Animation près des herbiers et obstacles pour brochet et maskinongé."],
  ["Crankbait", "Prospection des talus et bordures pour doré et perchaude."],
  ["Jerkbait", "Postes d’achigan et brochet sur cassures et quais."],
  ["Soft plastic swimbait", "Linéaire et tombés : polyvalent carnassiers."],
  ["Spoon", "Cuiller ondulée ou flutter : truites froides et doré suspendu."],
  ["Topwater lure", "Surface matin/soir : achigan et brochet agressifs."],
  ["Jig", "Tête plombée et leurre souple : doré, perchaude et profondeur."]
].to_h { |(name, desc)| [name, Lure.create!(name: name, description: desc)] }.freeze

# Plusieurs leurres recommandés par espèce (FishLure).
FISH_LURE_NAMES = {
  "Brochet (Northern Pike)" => %w[Spinnerbait Spoon Jerkbait Soft\ plastic\ swimbait Crankbait],
  "Doré / Walleye" => %w[Jig Crankbait Soft\ plastic\ swimbait Spinnerbait Spoon],
  "Truite mouchetée" => %w[Spoon Spinnerbait Jerkbait Jig],
  "Truite grise" => %w[Spoon Jig Crankbait Jerkbait],
  "Achigan smallmouth" => %w[Jerkbait Crankbait Soft\ plastic\ swimbait Topwater\ lure Jig],
  "Perchaude" => %w[Jig Spoon Soft\ plastic\ swimbait Crankbait]
}.freeze

FISH_LURE_NAMES.each do |species_name, lure_names|
  sp = SPECIES[species_name]
  lure_names.each do |lure_name|
    FishLure.create!(fish_species: sp, lure: LURES[lure_name])
  end
end

# Espèces présentes par lac (LakeFish) — noms exacts comme dans le GeoJSON.
LAKE_SPECIES_NAMES = {
  "Lac Saint-Jean" => ["Doré / Walleye", "Truite grise", "Perchaude", "Brochet (Northern Pike)"],
  "Lac Mistassini" => ["Brochet (Northern Pike)", "Doré / Walleye", "Truite grise", "Truite mouchetée"],
  "Lac Memphrémagog" => ["Truite mouchetée", "Brochet (Northern Pike)", "Achigan smallmouth", "Perchaude", "Doré / Walleye"],
  "Lac Champlain" => ["Achigan smallmouth", "Brochet (Northern Pike)", "Doré / Walleye", "Perchaude", "Truite mouchetée"],
  "Great Slave Lake" => ["Truite grise", "Brochet (Northern Pike)", "Doré / Walleye", "Perchaude"],
  "Lake Ontario" => ["Brochet (Northern Pike)", "Doré / Walleye", "Achigan smallmouth", "Truite grise", "Perchaude"],
  "Lac Supérieur" => ["Truite grise", "Brochet (Northern Pike)", "Doré / Walleye", "Perchaude"],
  "Baie Georgienne" => ["Brochet (Northern Pike)", "Doré / Walleye", "Perchaude", "Truite grise"],
  "Lac Simcoe" => ["Perchaude", "Brochet (Northern Pike)", "Doré / Walleye", "Achigan smallmouth"],
  "Lac Érié" => ["Perchaude", "Doré / Walleye", "Brochet (Northern Pike)", "Achigan smallmouth"],
  "Lac Huron" => ["Truite grise", "Brochet (Northern Pike)", "Doré / Walleye", "Perchaude"],
  "Lac Nipigon" => ["Truite grise", "Brochet (Northern Pike)", "Doré / Walleye"],
  "Lac des Bois" => ["Brochet (Northern Pike)", "Doré / Walleye", "Achigan smallmouth", "Perchaude"],
  "Lac Winnipeg" => ["Doré / Walleye", "Brochet (Northern Pike)", "Perchaude", "Truite grise"],
  "Lac Athabasca" => ["Truite grise", "Brochet (Northern Pike)", "Doré / Walleye"],
  "Lac Okanagan" => ["Achigan smallmouth", "Truite mouchetée", "Perchaude", "Doré / Walleye"],
  "Bras d’Or" => ["Brochet (Northern Pike)", "Perchaude", "Achigan smallmouth"],
  "Lac des Deux Montagnes" => ["Brochet (Northern Pike)", "Doré / Walleye", "Perchaude", "Achigan smallmouth"],
  "Lac Taureau" => ["Brochet (Northern Pike)", "Doré / Walleye", "Perchaude"],
  "Lac Kénogami" => ["Doré / Walleye", "Brochet (Northern Pike)", "Truite mouchetée", "Perchaude"]
}.freeze

LAKE_SPECIES_NAMES.each do |lake_name, species_names|
  lake = Lake.find_by!(name: lake_name)
  species_names.each do |sn|
    LakeFish.create!(lake: lake, fish_species: SPECIES[sn])
  end
end

Rails.logger.info { "Seeds Canada : #{Lake.count} lacs, #{FishSpecies.count} espèces, #{Lure.count} leurres, #{FishLure.count} paires poisson–leurre." }
